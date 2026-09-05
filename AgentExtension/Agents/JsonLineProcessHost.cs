// 真实子进程的按行 stdio 宿主

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

namespace AgentExtension.Agents
{
    /// <summary>启动子进程并按行收发文本。</summary>
    public class JsonLineProcessHost : IJsonLineProcessHost
    {
        #region 字段

        private Process? _process;
        private Thread? _readerThread;
        private Thread? _errorReaderThread;
        private StreamWriter? _stdin;
        private bool _disposed;

        /// <summary>stdin 用的 UTF-8 编码器，**不带 BOM**。</summary>
        private static readonly Encoding StdinEncoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

        #endregion

        #region 属性与事件

        public bool IsRunning
        {
            get
            {
                bool running = _process != null && !_process.HasExited;
                return running;
            }
        }

        public event EventHandler<string>? LineReceived;

        public event EventHandler<string>? ErrorLineReceived;

        public event EventHandler<int>? Exited;

        #endregion

        #region 启动与收发

        public void Start(string fileName, string arguments, string workingDirectory, IDictionary<string, string> environment)
        {
            if (_process != null)
            {
                throw new InvalidOperationException("进程已经启动。");
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = workingDirectory,
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

            _process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
            _process.Exited += OnProcessExited;
            _process.Start();

            _stdin = new StreamWriter(_process.StandardInput.BaseStream, StdinEncoding)
            {
                AutoFlush = true
            };

            _readerThread = new Thread(ReadLoop)
            {
                IsBackground = true,
                Name = "AgentExtension.StdoutReader"
            };
            _readerThread.Start();

            // stderr 同样必须有人一直读。
            _errorReaderThread = new Thread(ErrorReadLoop)
            {
                IsBackground = true,
                Name = "AgentExtension.StderrReader"
            };
            _errorReaderThread.Start();
        }

        public void WriteLine(string line)
        {
            if (_process == null || _process.HasExited || _stdin == null)
            {
                return;
            }

            // 走自己那个 UTF-8 writer，不要用 _process.StandardInput——后者是系统默认编码。
            _stdin.WriteLine(line);
            _stdin.Flush();
        }

        /// <summary>终结进程并**等待它真正退出**。</summary>
        public void Kill()
        {
            if (_process == null)
            {
                return;
            }

            try
            {
                if (_process.HasExited)
                {
                    return;
                }

                _process.Kill();

                if (!_process.WaitForExit(3000))
                {
                    System.Diagnostics.Debug.WriteLine(
                        $"[AgentExtension] CLI 进程 {_process.Id} 在 Kill 后 3 秒仍未退出。");
                }
            }
            catch (InvalidOperationException)
            {
            }
            catch (System.ComponentModel.Win32Exception)
            {
                // 无权终止（极少见），同样不该让调用方崩掉。
            }
        }

        #endregion

        #region 内部

        private static IDictionary<string, string> Snapshot(System.Collections.Specialized.StringDictionary variables)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            foreach (System.Collections.DictionaryEntry entry in variables)
            {
                string key = Convert.ToString(entry.Key) ?? string.Empty;

                if (key.Length > 0)
                {
                    result[key] = Convert.ToString(entry.Value) ?? string.Empty;
                }
            }

            return result;
        }

        private void ReadLoop()
        {
            try
            {
                Process? process = _process;

                if (process == null)
                {
                    return;
                }

                string? line;

                while ((line = process.StandardOutput.ReadLine()) != null)
                {
                    LineReceived?.Invoke(this, line);
                }
            }
            catch (ObjectDisposedException)
            {
            }
            catch (InvalidOperationException)
            {
            }
        }

        private void ErrorReadLoop()
        {
            try
            {
                Process? process = _process;

                if (process == null)
                {
                    return;
                }

                string? line;

                while ((line = process.StandardError.ReadLine()) != null)
                {
                    ErrorLineReceived?.Invoke(this, line);
                }
            }
            catch (ObjectDisposedException)
            {
            }
            catch (InvalidOperationException)
            {
            }
        }

        private void OnProcessExited(object sender, EventArgs e)
        {
            int exitCode = -1;

            try
            {
                if (_process != null)
                {
                    exitCode = _process.ExitCode;
                }
            }
            catch (InvalidOperationException)
            {
                exitCode = -1;
            }

            Exited?.Invoke(this, exitCode);
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;

            if (_process != null)
            {
                _process.Exited -= OnProcessExited;
                Kill();
                _process.Dispose();
                _process = null;
            }
        }

        #endregion
    }
}
