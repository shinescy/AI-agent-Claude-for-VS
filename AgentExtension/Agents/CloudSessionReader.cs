// 起一个短命 CLI，问它「账号下有哪些网页会话」

using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 由 CLI 用它自己的登录去读云端会话：本扩展不碰登录凭据，也不直接调 claude.ai 的接口。
    /// </summary>
    /// <remarks>
    /// 只发控制请求、不发用户消息，不进模型不计费；带 <c>--no-session-persistence</c>，不留转录。
    /// **不摘会话标记环境变量**：VS 若是从某个 Claude 会话里起的，CLI 会拒绝读（started_by_session），
    /// 那是它防会话内代理读账号数据的保护，这里照单全收、把它的话原样给用户看。
    /// </remarks>
    public static class CloudSessionReader
    {
        #region 常量

        /// <summary>这条控制请求的 id。</summary>
        public const string RequestId = "agentext-cloud-list";

        /// <summary>等回包的上限；CLI 自己的读取上限是 25 秒，再加启动时间。</summary>
        public const int DefaultTimeoutMs = 45000;

        /// <summary>短进程的启动参数，全字面量。</summary>
        public const string Arguments =
            "--print --input-format stream-json --output-format stream-json --verbose --no-session-persistence";

        #endregion

        #region 请求

        /// <summary>写进 stdin 的两行：握手 + 列会话。</summary>
        public static string[] BuildRequestLines()
        {
            string[] lines =
            {
                "{\"type\":\"control_request\",\"request_id\":\"agentext-cloud-init\",\"request\":{\"subtype\":\"initialize\"}}",
                "{\"type\":\"control_request\",\"request_id\":\"" + RequestId
                    + "\",\"request\":{\"subtype\":\"list_cloud_sessions\",\"user_initiated\":true}}"
            };

            return lines;
        }

        /// <summary>短进程的工作目录：临时目录，免得 CLI 把它当成项目去读设置。</summary>
        public static string WorkingDirectory()
        {
            string path = Path.Combine(Path.GetTempPath(), "AgentExtension", "cloud-sessions");
            return path;
        }

        #endregion

        #region 取数

        /// <summary>列一次；起不来、超时都返回「读不了」，绝不抛。会阻塞，别在 UI 线程上调。</summary>
        public static CloudSessionListResult List(string executablePath, int timeoutMs)
        {
            if (string.IsNullOrWhiteSpace(executablePath))
            {
                return CloudSessionListResult.Unavailable("no_cli", string.Empty);
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

                CloudSessionListResult? found = null;

                using (var done = new ManualResetEventSlim(false))
                using (var job = new ChildProcessJob())
                using (var process = new Process { StartInfo = startInfo })
                {
                    process.OutputDataReceived += (sender, e) =>
                    {
                        if (e.Data == null || found != null)
                        {
                            return;
                        }

                        CloudSessionListResult? parsed = CloudSessionListParser.Parse(e.Data, RequestId);

                        if (parsed != null)
                        {
                            found = parsed;
                            Signal(done);
                        }
                    };

                    // 两个管道都得有人读，写满了子进程会卡死
                    process.ErrorDataReceived += (sender, e) => { };
                    process.Exited += (sender, e) => Signal(done);
                    process.EnableRaisingEvents = true;

                    process.Start();
                    job.Assign(process);
                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();

                    // 不带 BOM：带了的话第一行 JSON 解析不了
                    var writer = new StreamWriter(process.StandardInput.BaseStream, new UTF8Encoding(false));

                    foreach (string line in BuildRequestLines())
                    {
                        writer.Write(line + "\n");
                    }

                    writer.Flush();

                    // stdin 不关：关了 CLI 当成输入结束直接退出，来不及回话
                    done.Wait(timeoutMs);
                    TryKill(process);
                }

                CloudSessionListResult result = found ?? CloudSessionListResult.Unavailable("timeout", string.Empty);
                return result;
            }
            catch (Exception ex)
            {
                return CloudSessionListResult.Unavailable("start_failed", ex.Message);
            }
        }

        /// <summary>收尸后事件还可能晚到一拍，那时信号量已经释放。</summary>
        private static void Signal(ManualResetEventSlim done)
        {
            try
            {
                done.Set();
            }
            catch (ObjectDisposedException)
            {
            }
        }

        private static void TryKill(Process process)
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill();
                }
            }
            catch (Exception)
            {
            }
        }

        #endregion
    }
}
