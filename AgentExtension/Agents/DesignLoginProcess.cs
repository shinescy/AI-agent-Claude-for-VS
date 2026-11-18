// Claude Design 登录：常驻的 claude design-login --json 子进程，按行交换 JSON

using System;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace AgentExtension.Agents
{
    /// <summary>一次 Design 登录流程。stdout 每行一个事件，授权码按行写进 stdin。</summary>
    public sealed class DesignLoginProcess : IDisposable
    {
        #region 字段

        /// <summary>整个流程的上限，与 VS Code 版一致（6 分钟）。</summary>
        private static readonly TimeSpan OverallTimeout = TimeSpan.FromMinutes(6);

        private readonly Process _process;
        private readonly ChildProcessJob _job;
        private readonly object _writeLock = new object();
        private int _finished;

        /// <summary>释放过没有，0 为没有。</summary>
        private int _disposed;

        #endregion

        #region 构造

        private DesignLoginProcess(Process process, ChildProcessJob job)
        {
            _process = process;
            _job = job;
        }

        #endregion

        #region 事件

        /// <summary>拿到登录网址：url、manualUrl、是否先给手动网址。</summary>
        public event Action<string, string, bool>? PagesReady;

        /// <summary>流程结束：是否成功、说明。只触发一次。</summary>
        public event Action<bool, string>? Finished;

        #endregion

        #region 启动与交互

        /// <summary>起 claude design-login --json 并开始读事件。</summary>
        public static DesignLoginProcess Start(string executablePath, string workingDirectory)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = executablePath,
                Arguments = "design-login --json",
                WorkingDirectory = workingDirectory,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            ClaudeSubcommandRunner.RemoveNestedSessionMarkers(startInfo);

            var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
            var job = new ChildProcessJob();

            process.Start();
            job.Assign(process);

            var login = new DesignLoginProcess(process, job);
            login.BeginReading();
            return login;
        }

        /// <summary>写入手动粘贴的授权码；必须形如 code#state。</summary>
        public void SubmitCode(string code)
        {
            string text = (code ?? string.Empty).Trim();

            if (text.Length == 0 || text.Length > 4096 || text.IndexOf('#') < 0)
            {
                throw new InvalidOperationException("授权码格式不对：应形如 xxxx#yyyy。");
            }

            string line = JsonSerializer.Serialize(new { code = text });
            byte[] bytes = new UTF8Encoding(false).GetBytes(line + "\n");

            lock (_writeLock)
            {
                _process.StandardInput.BaseStream.Write(bytes, 0, bytes.Length);
                _process.StandardInput.BaseStream.Flush();
            }
        }

        /// <summary>放弃登录：关掉输入并结束子进程。</summary>
        public void Cancel()
        {
            Finish(false, "已取消。");
        }

        #endregion

        #region 读事件

        private void BeginReading()
        {
            Task.Run(ReadLoop);

            Task.Delay(OverallTimeout).ContinueWith(_ => Finish(false, "登录超时，请重试。"), TaskScheduler.Default);
        }

        private void ReadLoop()
        {
            string errorTail = string.Empty;

            try
            {
                Task<string> errors = _process.StandardError.ReadToEndAsync();
                string? line;

                while ((line = _process.StandardOutput.ReadLine()) != null)
                {
                    HandleLine(line);
                }

                if (errors.Wait(TimeSpan.FromSeconds(2)))
                {
                    errorTail = errors.Result.Trim();
                }
            }
            catch (Exception ex)
            {
                errorTail = ex.Message;
            }

            Finish(false, errorTail.Length > 0 ? errorTail : "登录进程没有给出结果就退出了。");
        }

        /// <summary>处理一行事件：pages 给网址，done 给结果。</summary>
        private void HandleLine(string line)
        {
            try
            {
                using (JsonDocument document = JsonDocument.Parse(line))
                {
                    JsonElement root = document.RootElement;

                    if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("event", out JsonElement kind))
                    {
                        return;
                    }

                    string name = kind.GetString() ?? string.Empty;

                    if (name == "pages")
                    {
                        PagesReady?.Invoke(Read(root, "url"), Read(root, "manual_url"),
                            root.TryGetProperty("manual_first", out JsonElement first) && first.ValueKind == JsonValueKind.True);
                    }
                    else if (name == "done")
                    {
                        bool ok = root.TryGetProperty("ok", out JsonElement okElement) && okElement.ValueKind == JsonValueKind.True;
                        Finish(ok, Read(root, "message"));
                    }
                }
            }
            catch (JsonException)
            {
                // 不是事件的行（日志等）直接跳过
            }
        }

        private static string Read(JsonElement root, string name)
        {
            string value = root.TryGetProperty(name, out JsonElement element) && element.ValueKind == JsonValueKind.String
                ? element.GetString() ?? string.Empty
                : string.Empty;
            return value;
        }

        #endregion

        #region 收尾

        /// <summary>只收一次尾：报结果并结束子进程。</summary>
        private void Finish(bool ok, string message)
        {
            if (Interlocked.Exchange(ref _finished, 1) != 0)
            {
                return;
            }

            Finished?.Invoke(ok, message);
            Dispose();
        }

        public void Dispose()
        {
            Interlocked.Exchange(ref _finished, 1);

            if (Interlocked.Exchange(ref _disposed, 1) != 0)
            {
                return;
            }

            try
            {
                _process.StandardInput.Close();
            }
            catch (Exception)
            {
            }

            try
            {
                if (!_process.HasExited)
                {
                    _process.Kill();
                }
            }
            catch (Exception)
            {
            }

            _job.Dispose();
            _process.Dispose();
        }

        #endregion
    }
}
