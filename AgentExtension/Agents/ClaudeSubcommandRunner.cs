// 执行白名单内的 CLI 子命令并取回输出

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace AgentExtension.Agents
{
    /// <summary>一次性执行 CLI 子命令并取回全部输出。</summary>
    public class ClaudeSubcommandRunner
    {
        #region 常量

        /// <summary>默认执行超时。</summary>
        public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(60);

        private static readonly TimeSpan MinimumRemainingWait = TimeSpan.FromMilliseconds(500);

        private static readonly TimeSpan CancelPollInterval = TimeSpan.FromMilliseconds(200);

        #endregion

        #region 构造

        private readonly TimeSpan Timeout;

        /// <summary>默认构造：沿用 60 秒超时。</summary>
        public ClaudeSubcommandRunner()
            : this(DefaultTimeout)
        {
        }

        /// <summary>指定超时的构造：仅供测试注入短超时，验证超时分支。</summary>
        public ClaudeSubcommandRunner(TimeSpan timeout)
        {
            Timeout = timeout;
        }

        #endregion

        #region 执行

        private static bool WaitForExitOrCancel(Process process, TimeSpan timeout, CancellationToken cancellationToken)
        {
            var stopwatch = Stopwatch.StartNew();

            while (true)
            {
                TimeSpan left = timeout - stopwatch.Elapsed;

                if (left <= TimeSpan.Zero)
                {
                    KillQuietly(process);
                    return false;
                }

                TimeSpan slice = left < CancelPollInterval ? left : CancelPollInterval;

                if (process.WaitForExit((int)slice.TotalMilliseconds))
                {
                    return true;
                }

                if (cancellationToken.IsCancellationRequested)
                {
                    KillQuietly(process);
                    return false;
                }
            }
        }

        /// <summary>杀进程，杀不掉也不抛——已经退了、句柄失效都算「不用再杀」。</summary>
        private static void KillQuietly(Process process)
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


        /// <summary>执行一条白名单子命令，返回已整理好的文本。</summary>
        public Task<string> RunAsync(
            string executablePath,
            ClaudeSubcommand subcommand,
            string workingDirectory,
            CancellationToken cancellationToken = default)
        {
            if (subcommand == null)
            {
                throw new ArgumentNullException(nameof(subcommand));
            }

            if (!subcommand.CanRunInPanel)
            {
                return Task.FromResult(subcommand.Guidance);
            }

            return Task.Run(() => Run(executablePath, subcommand, workingDirectory, cancellationToken));
        }

        private string Run(
            string executablePath,
            ClaudeSubcommand subcommand,
            string workingDirectory,
            CancellationToken cancellationToken)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = executablePath,
                Arguments = subcommand.Arguments,
                WorkingDirectory = workingDirectory,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            try
            {
                using (var process = new Process { StartInfo = startInfo })
                {
                    var stopwatch = Stopwatch.StartNew();

                    process.Start();

                    // stdout 与 stderr 必须并发读走。
                    Task<string> outTask = process.StandardOutput.ReadToEndAsync();
                    Task<string> errTask = process.StandardError.ReadToEndAsync();

                    process.StandardInput.Close();

                    if (!WaitForExitOrCancel(process, Timeout, cancellationToken))
                    {
                        return $"{subcommand.Label}：执行超过 {Timeout.TotalSeconds:0} 秒仍未结束，或已被取消，进程已终止。";
                    }

                    // 与 RunRaw 同一个坑：进程本身退出不代表管道也跟着关闭——如果它启动过子孙进程，
                    TimeSpan remaining = Timeout - stopwatch.Elapsed;
                    if (remaining < MinimumRemainingWait)
                    {
                        remaining = MinimumRemainingWait;
                    }

                    if (!Task.WhenAll(outTask, errTask).Wait(remaining))
                    {
                        return $"{subcommand.Label}：执行超过 {Timeout.TotalSeconds:0} 秒仍未结束，已终止。";
                    }

                    string formatted = SubcommandOutputFormatter.Format(
                        subcommand.Label,
                        outTask.Result,
                        errTask.Result,
                        process.ExitCode);

                    return formatted;
                }
            }
            catch (Exception ex)
            {
                // 起不来也必须让用户看见原因，否则又是一次无声失败。
                return $"{subcommand.Label}：无法执行——{ex.Message}\n可执行文件：{executablePath}";
            }
        }

        /// <summary>用调用方给定的参数执行。</summary>
        public Task<SubcommandOutcome> RunAsync(
            string executablePath,
            IReadOnlyList<string> arguments,
            string workingDirectory,
            CancellationToken cancellationToken = default)
        {
            if (arguments == null)
            {
                throw new ArgumentNullException(nameof(arguments));
            }

            return Task.Run(() => RunRaw(executablePath, arguments, workingDirectory, cancellationToken));
        }

        private SubcommandOutcome RunRaw(
            string executablePath,
            IReadOnlyList<string> arguments,
            string workingDirectory,
            CancellationToken cancellationToken)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = executablePath,
                Arguments = CommandLineBuilder.Join(arguments),
                WorkingDirectory = workingDirectory,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            try
            {
                using (var process = new Process { StartInfo = startInfo })
                {
                    var stopwatch = Stopwatch.StartNew();

                    process.Start();

                    // stdout 与 stderr 必须并发读走，顺序读会在对方管道写满时死锁。
                    Task<string> outTask = process.StandardOutput.ReadToEndAsync();
                    Task<string> errTask = process.StandardError.ReadToEndAsync();

                    process.StandardInput.Close();

                    if (!WaitForExitOrCancel(process, Timeout, cancellationToken))
                    {

                        try
                        {
                            Task.WhenAll(outTask, errTask).Wait(MinimumRemainingWait);
                        }
                        catch (Exception)
                        {
                        }

                        // 地板等完之后不再继续观察这两个任务，是**有意为之**（勿再当成泄漏来"修"）：
                        return new SubcommandOutcome
                        {
                            TimedOut = true,
                            StandardOutput = PartialResult(outTask),
                            StandardError = PartialResult(errTask)
                        };
                    }

                    TimeSpan remaining = Timeout - stopwatch.Elapsed;
                    if (remaining < MinimumRemainingWait)
                    {
                        remaining = MinimumRemainingWait;
                    }

                    if (!Task.WhenAll(outTask, errTask).Wait(remaining))
                    {
                        return new SubcommandOutcome
                        {
                            TimedOut = true,
                            StandardOutput = PartialResult(outTask),
                            StandardError = PartialResult(errTask)
                        };
                    }

                    return new SubcommandOutcome
                    {
                        StandardOutput = outTask.Result,
                        StandardError = errTask.Result,
                        ExitCode = process.ExitCode
                    };
                }
            }
            catch (Exception ex)
            {
                return new SubcommandOutcome { StartFailure = $"{ex.Message}（可执行文件：{executablePath}）" };
            }
        }

        private static string PartialResult(Task<string> task)
        {
            return task.Status == TaskStatus.RanToCompletion ? task.Result : string.Empty;
        }

        #endregion
    }
}
