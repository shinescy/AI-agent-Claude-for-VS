// 独立进程探额度，不写进用户会话

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 用一个短进程跑 <c>/usage</c> 取额度。
    ///
    /// 不发进会话：那是一条真实用户消息，CLI 会原样记进转录。跑一天多攒下两千多条，
    /// 把真实对话挤出回放窗口；终端接回时历史由 CLI 自己渲染，面板的过滤管不到，
    /// 首屏就是一屏 <c>/usage</c>（见 docs/memory/usage-probe-pollutes-transcript.md）。
    ///
    /// 工作目录**必须避开解决方案目录**：短进程照样会留下转录，落在本仓库里就会污染
    /// 会话历史面板。额度是账号级的，跟 cwd 无关，所以放临时目录。
    /// </summary>
    public static class UsageProbeProcess
    {
        #region 参数与落点

        /// <summary>不进模型：实测 <c>num_turns=0</c>、<c>total_cost_usd=0</c>，只走本地命令。</summary>
        public const string Arguments = "--print --output-format json \"/usage\"";

        /// <summary>短进程的工作目录。</summary>
        public static string WorkingDirectory()
        {
            string path = Path.Combine(Path.GetTempPath(), "AgentExtension", "usage-probe");
            return path;
        }

        #endregion

        #region 取数

        /// <summary>跑一次探测，返回 <c>/usage</c> 的原文；失败一律返回空串，**绝不抛**。</summary>
        public static string Run(
            string executablePath, IDictionary<string, string>? environment, int timeoutMs)
        {
            if (string.IsNullOrWhiteSpace(executablePath))
            {
                return string.Empty;
            }

            try
            {
                string directory = WorkingDirectory();
                Directory.CreateDirectory(directory);

                var startInfo = new ProcessStartInfo
                {
                    FileName = executablePath,
                    Arguments = Arguments,
                    WorkingDirectory = directory,
                    RedirectStandardInput = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };

                if (environment != null)
                {
                    foreach (KeyValuePair<string, string> pair in environment)
                    {
                        startInfo.EnvironmentVariables[pair.Key] = pair.Value;
                    }
                }

                foreach (string key in ClaudeChildEnvironment.KeysToDrop(Snapshot(startInfo.EnvironmentVariables)))
                {
                    startInfo.EnvironmentVariables.Remove(key);
                }

                var stdout = new StringBuilder();

                using (var process = new Process { StartInfo = startInfo })
                {
                    // 两个管道都必须有人一直读：任何一个写满，子进程就卡在写上不再退出，
                    // 而 ReadToEnd 没有超时，等来的是永久挂住而不是超时返回。
                    process.OutputDataReceived += (sender, e) =>
                    {
                        if (e.Data != null)
                        {
                            lock (stdout)
                            {
                                stdout.AppendLine(e.Data);
                            }
                        }
                    };

                    process.ErrorDataReceived += (sender, e) => { };

                    process.Start();
                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();

                    // 让子进程读到 EOF：--print 下若它去读 stdin，不关就是死等。
                    process.StandardInput.Close();

                    if (!process.WaitForExit(timeoutMs))
                    {
                        TryKill(process);
                        return string.Empty;
                    }

                    string output;

                    lock (stdout)
                    {
                        output = stdout.ToString();
                    }

                    string text = ExtractResultText(output);
                    return text;
                }
            }
            catch (Exception)
            {
                // 取不到额度只是状态栏少一块，绝不能让它掀翻会话。
                return string.Empty;
            }
        }

        /// <summary>从 <c>--output-format json</c> 的回包里取出 <c>result</c> 那段原文。</summary>
        public static string ExtractResultText(string? output)
        {
            string text = (output ?? string.Empty).Trim();

            if (text.Length == 0)
            {
                return string.Empty;
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(text))
                {
                    JsonElement root = document.RootElement;

                    if (root.ValueKind != JsonValueKind.Object)
                    {
                        return string.Empty;
                    }

                    JsonElement result;

                    if (!root.TryGetProperty("result", out result)
                        || result.ValueKind != JsonValueKind.String)
                    {
                        return string.Empty;
                    }

                    string value = result.GetString() ?? string.Empty;
                    return value;
                }
            }
            catch (JsonException)
            {
                return string.Empty;
            }
        }

        #endregion

        #region 内部

        /// <summary>把进程的环境变量表抄成字典。</summary>
        private static IDictionary<string, string> Snapshot(
            System.Collections.Specialized.StringDictionary variables)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            foreach (System.Collections.DictionaryEntry entry in variables)
            {
                map[(string)entry.Key] = (string)(entry.Value ?? string.Empty);
            }

            return map;
        }

        /// <summary>超时后收尸，杀不掉也不抛。</summary>
        private static void TryKill(Process process)
        {
            try
            {
                process.Kill();
            }
            catch (Exception)
            {
            }
        }

        #endregion
    }
}
