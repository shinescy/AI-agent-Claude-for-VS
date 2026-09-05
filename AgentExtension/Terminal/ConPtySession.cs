// 在伪控制台里托管一个交互式子进程，把 VT 字节流双向转出来

using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace AgentExtension.Terminal
{
    /// <summary>一个跑在 ConPTY 里的子进程。</summary>
    public sealed class ConPtySession : IDisposable
    {
        #region 字段

        private readonly object _sync = new object();

        private IntPtr _pseudoConsole = IntPtr.Zero;
        private IntPtr _processHandle = IntPtr.Zero;
        private IntPtr _threadHandle = IntPtr.Zero;
        private IntPtr _attributeList = IntPtr.Zero;

        private FileStream? _input;
        private FileStream? _output;
        private Thread? _reader;
        private Thread? _waiter;

        private short _columns;
        private short _rows;
        private int _exitRaised;
        private volatile bool _disposed;

        #endregion

        #region 事件

        /// <summary>子进程吐出的原始字节。</summary>
        public event EventHandler<byte[]>? OutputReceived;

        /// <summary>子进程退出。</summary>
        public event EventHandler<int>? Exited;

        #endregion

        #region 属性

        /// <summary>是否还在运行。</summary>
        public bool IsRunning
        {
            get
            {
                lock (_sync)
                {
                    return !_disposed && _processHandle != IntPtr.Zero;
                }
            }
        }

        /// <summary>当前列数。</summary>
        public short Columns
        {
            get { return _columns; }
        }

        /// <summary>当前行数。</summary>
        public short Rows
        {
            get { return _rows; }
        }

        #endregion

        #region 启动

        /// <summary>起一个伪控制台并在里面跑起子进程。</summary>
        public void Start(
            string commandLine, string? workingDirectory, int columns, int rows, string? environmentBlock = null)
        {
            if (string.IsNullOrWhiteSpace(commandLine))
            {
                throw new ArgumentException("命令行不能为空。", nameof(commandLine));
            }

            lock (_sync)
            {
                if (_processHandle != IntPtr.Zero)
                {
                    throw new InvalidOperationException("这个会话已经启动过了。");
                }

                TerminalSizePolicy.Normalize(columns, rows, out _columns, out _rows);

                IntPtr ptyInput = IntPtr.Zero;
                IntPtr ptyOutput = IntPtr.Zero;
                IntPtr ourWrite = IntPtr.Zero;
                IntPtr ourRead = IntPtr.Zero;

                try
                {
                    if (!ConPtyNativeMethods.CreatePipe(out ptyInput, out ourWrite, IntPtr.Zero, 0)
                        || !ConPtyNativeMethods.CreatePipe(out ourRead, out ptyOutput, IntPtr.Zero, 0))
                    {
                        throw new IOException("创建管道失败。");
                    }

                    var size = new ConPtyNativeMethods.Coord { X = _columns, Y = _rows };
                    int hr = ConPtyNativeMethods.CreatePseudoConsole(size, ptyInput, ptyOutput, 0, out _pseudoConsole);

                    if (hr != 0)
                    {
                        throw new IOException(
                            "创建伪控制台失败（HRESULT 0x" + hr.ToString("X8") + "）。"
                            + "ConPTY 需要 Windows 10 1809 或更新的版本。");
                    }

                    // 伪控制台已经把这两个句柄复制走了，这边必须立刻关掉。
                    ConPtyNativeMethods.CloseHandle(ptyInput);
                    ConPtyNativeMethods.CloseHandle(ptyOutput);
                    ptyInput = IntPtr.Zero;
                    ptyOutput = IntPtr.Zero;

                    StartProcess(commandLine, workingDirectory, environmentBlock);

                    _input = new FileStream(new SafeFileHandle(ourWrite, ownsHandle: true), FileAccess.Write);
                    _output = new FileStream(new SafeFileHandle(ourRead, ownsHandle: true), FileAccess.Read);
                    ourWrite = IntPtr.Zero;
                    ourRead = IntPtr.Zero;

                    _reader = new Thread(ReadLoop)
                    {
                        IsBackground = true,
                        Name = "AgentExtension ConPTY 读取",
                    };
                    _reader.Start();

                    // 退出必须**单独等进程句柄**，不能靠读管道读到 EOF 来判断：
                    _waiter = new Thread(WaitLoop)
                    {
                        IsBackground = true,
                        Name = "AgentExtension ConPTY 等待退出",
                    };
                    _waiter.Start();
                }
                catch
                {
                    CloseIfSet(ref ptyInput);
                    CloseIfSet(ref ptyOutput);
                    CloseIfSet(ref ourWrite);
                    CloseIfSet(ref ourRead);
                    DisposeCore();
                    throw;
                }
            }
        }

        private void StartProcess(string commandLine, string? workingDirectory, string? environmentBlock)
        {
            var startup = default(ConPtyNativeMethods.StartupInfoEx);
            startup.StartupInfo.cb = Marshal.SizeOf(typeof(ConPtyNativeMethods.StartupInfoEx));

            startup.StartupInfo.dwFlags = ConPtyNativeMethods.StartFUseStdHandles;
            startup.StartupInfo.hStdInput = IntPtr.Zero;
            startup.StartupInfo.hStdOutput = IntPtr.Zero;
            startup.StartupInfo.hStdError = IntPtr.Zero;

            IntPtr listSize = IntPtr.Zero;

            ConPtyNativeMethods.InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref listSize);
            _attributeList = Marshal.AllocHGlobal(listSize);

            if (!ConPtyNativeMethods.InitializeProcThreadAttributeList(_attributeList, 1, 0, ref listSize))
            {
                throw new IOException("初始化进程属性表失败。");
            }

            if (!ConPtyNativeMethods.UpdateProcThreadAttribute(
                    _attributeList,
                    0,
                    ConPtyNativeMethods.ProcThreadAttributePseudoConsole,
                    _pseudoConsole,
                    (IntPtr)IntPtr.Size,
                    IntPtr.Zero,
                    IntPtr.Zero))
            {
                throw new IOException("把伪控制台挂到子进程上失败。");
            }

            startup.lpAttributeList = _attributeList;

            var buffer = new StringBuilder(commandLine, commandLine.Length + 1);

            string? directory = string.IsNullOrWhiteSpace(workingDirectory) ? null : workingDirectory;

            uint flags = ConPtyNativeMethods.ExtendedStartupInfoPresent;
            IntPtr environment = IntPtr.Zero;

            if (!string.IsNullOrEmpty(environmentBlock))
            {
                environment = Marshal.StringToHGlobalUni(environmentBlock);
                flags |= ConPtyNativeMethods.CreateUnicodeEnvironment;
            }

            try
            {
                if (!ConPtyNativeMethods.CreateProcess(
                        null,
                        buffer,
                        IntPtr.Zero,
                        IntPtr.Zero,
                        false,
                        flags,
                        environment,
                        directory,
                        ref startup,
                        out ConPtyNativeMethods.ProcessInformation info))
                {
                    int error = Marshal.GetLastWin32Error();
                    throw new IOException("启动子进程失败（Win32 错误 " + error + "）：" + commandLine);
                }

                _processHandle = info.hProcess;
                _threadHandle = info.hThread;
            }
            finally
            {
                if (environment != IntPtr.Zero)
                {
                    Marshal.FreeHGlobal(environment);
                }
            }
        }

        #endregion

        #region 读写

        /// <summary>把按键送进子进程。</summary>
        public void Write(byte[] data)
        {
            if (data == null || data.Length == 0)
            {
                return;
            }

            FileStream? input;

            lock (_sync)
            {
                input = _input;
            }

            if (input == null)
            {
                return;
            }

            try
            {
                input.Write(data, 0, data.Length);
                input.Flush();
            }
            catch (IOException)
            {
            }
            catch (ObjectDisposedException)
            {
            }
        }

        /// <summary>改变终端尺寸。</summary>
        public void Resize(int columns, int rows)
        {
            TerminalSizePolicy.Normalize(columns, rows, out short nextColumns, out short nextRows);

            lock (_sync)
            {
                if (_disposed || _pseudoConsole == IntPtr.Zero)
                {
                    return;
                }

                if (!TerminalSizePolicy.ShouldResize(_columns, _rows, nextColumns, nextRows))
                {
                    return;
                }

                var size = new ConPtyNativeMethods.Coord { X = nextColumns, Y = nextRows };

                if (ConPtyNativeMethods.ResizePseudoConsole(_pseudoConsole, size) == 0)
                {
                    _columns = nextColumns;
                    _rows = nextRows;
                }
            }
        }

        private void ReadLoop()
        {
            var buffer = new byte[8192];
            FileStream? output = _output;

            if (output == null)
            {
                return;
            }

            try
            {
                while (true)
                {
                    int read = output.Read(buffer, 0, buffer.Length);

                    if (read <= 0)
                    {
                        break;
                    }

                    var chunk = new byte[read];
                    Buffer.BlockCopy(buffer, 0, chunk, 0, read);

                    OutputReceived?.Invoke(this, chunk);
                }
            }
            catch (IOException)
            {
            }
            catch (ObjectDisposedException)
            {
            }
        }

        private void WaitLoop()
        {
            IntPtr process = _processHandle;

            if (process == IntPtr.Zero)
            {
                return;
            }

            const uint WaitTimeout = 0x00000102;

            while (!_disposed)
            {
                if (ConPtyNativeMethods.WaitForSingleObject(process, 200) != WaitTimeout)
                {
                    break;
                }
            }

            if (_disposed)
            {
                return;
            }

            int exitCode = -1;

            if (ConPtyNativeMethods.GetExitCodeProcess(process, out int code))
            {
                exitCode = code;
            }

            if (Interlocked.Exchange(ref _exitRaised, 1) == 0)
            {
                Exited?.Invoke(this, exitCode);
            }
        }

        #endregion

        #region 释放

        /// <summary><inheritdoc /></summary>
        public void Dispose()
        {
            lock (_sync)
            {
                if (_disposed)
                {
                    return;
                }

                _disposed = true;
                DisposeCore();
            }
        }

        private void DisposeCore()
        {
            if (_pseudoConsole != IntPtr.Zero)
            {
                ConPtyNativeMethods.ClosePseudoConsole(_pseudoConsole);
                _pseudoConsole = IntPtr.Zero;
            }

            if (_processHandle != IntPtr.Zero)
            {
                const uint WaitTimeoutMs = 2000;
                const uint WaitTimeout = 0x00000102;

                if (ConPtyNativeMethods.WaitForSingleObject(_processHandle, WaitTimeoutMs) == WaitTimeout)
                {
                    ConPtyNativeMethods.TerminateProcess(_processHandle, 1);
                }

                // 等待线程可能正拿着这个句柄在 WaitForSingleObject 里，必须先让它走掉再关。
                _waiter?.Join(1000);
                _waiter = null;

                ConPtyNativeMethods.CloseHandle(_processHandle);
                _processHandle = IntPtr.Zero;
            }

            if (_threadHandle != IntPtr.Zero)
            {
                ConPtyNativeMethods.CloseHandle(_threadHandle);
                _threadHandle = IntPtr.Zero;
            }

            if (_attributeList != IntPtr.Zero)
            {
                ConPtyNativeMethods.DeleteProcThreadAttributeList(_attributeList);
                Marshal.FreeHGlobal(_attributeList);
                _attributeList = IntPtr.Zero;
            }

            TryDispose(_input);
            TryDispose(_output);
            _input = null;
            _output = null;
        }

        private static void TryDispose(Stream? stream)
        {
            try
            {
                stream?.Dispose();
            }
            catch (IOException)
            {
            }
        }

        private static void CloseIfSet(ref IntPtr handle)
        {
            if (handle != IntPtr.Zero)
            {
                ConPtyNativeMethods.CloseHandle(handle);
                handle = IntPtr.Zero;
            }
        }

        #endregion
    }
}
