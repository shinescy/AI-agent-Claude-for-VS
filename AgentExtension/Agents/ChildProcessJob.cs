// 作业对象：把子进程连同整棵子孙树一起管住

using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace AgentExtension.Agents
{
    /// <summary>作业对象：句柄一关，整棵进程树随之终结。</summary>
    public sealed class ChildProcessJob : IDisposable
    {
        #region 字段

        /// <summary>作业句柄；拿不到时为 Zero。</summary>
        private IntPtr _handle;

        /// <summary>是否已释放。</summary>
        private bool _disposed;

        #endregion

        #region 构造

        /// <summary>建一个关闭即杀光成员的作业。</summary>
        public ChildProcessJob()
        {
            _handle = CreateKillOnCloseJob();
        }

        #endregion

        #region 属性

        /// <summary>作业是否可用。</summary>
        public bool IsAvailable
        {
            get { return _handle != IntPtr.Zero; }
        }

        #endregion

        #region 纳入

        /// <summary>把一个 .NET 进程纳入作业。</summary>
        public bool Assign(Process process)
        {
            if (process == null)
            {
                return false;
            }

            try
            {
                return Assign(process.Handle);
            }
            catch (InvalidOperationException)
            {
                return false;
            }
        }

        /// <summary>把一个原生进程句柄纳入作业。</summary>
        public bool Assign(IntPtr processHandle)
        {
            if (_handle == IntPtr.Zero || processHandle == IntPtr.Zero)
            {
                return false;
            }

            bool ok = AssignProcessToJobObject(_handle, processHandle);
            return ok;
        }

        #endregion

        #region 终结与释放

        /// <summary>立刻终结作业里的全部进程。</summary>
        public void TerminateAll()
        {
            if (_handle == IntPtr.Zero)
            {
                return;
            }

            TerminateJobObject(_handle, 1);
        }

        /// <summary><inheritdoc /></summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;

            if (_handle != IntPtr.Zero)
            {
                // 先显式终结，关句柄本身也会触发 KILL_ON_JOB_CLOSE。
                TerminateJobObject(_handle, 1);
                CloseHandle(_handle);
                _handle = IntPtr.Zero;
            }
        }

        #endregion

        #region 内部

        /// <summary>建作业并设上 KILL_ON_JOB_CLOSE；失败返回 Zero。</summary>
        private static IntPtr CreateKillOnCloseJob()
        {
            IntPtr handle = CreateJobObject(IntPtr.Zero, null);

            if (handle == IntPtr.Zero)
            {
                return IntPtr.Zero;
            }

            var info = new JobObjectExtendedLimitInformation();
            info.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;

            int length = Marshal.SizeOf(typeof(JobObjectExtendedLimitInformation));
            IntPtr buffer = Marshal.AllocHGlobal(length);

            try
            {
                Marshal.StructureToPtr(info, buffer, false);

                bool ok = SetInformationJobObject(
                    handle, JobObjectExtendedLimitInformationClass, buffer, (uint)length);

                if (!ok)
                {
                    CloseHandle(handle);
                    return IntPtr.Zero;
                }

                return handle;
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }

        #endregion

        #region 互操作

        /// <summary>关闭即终结全部成员。</summary>
        private const uint JobObjectLimitKillOnJobClose = 0x00002000;

        /// <summary>扩展限额信息的类别号。</summary>
        private const int JobObjectExtendedLimitInformationClass = 9;

        /// <summary>作业基础限额。</summary>
        [StructLayout(LayoutKind.Sequential)]
        private struct JobObjectBasicLimitInformation
        {
            /// <summary>单进程用户态时限。</summary>
            public long PerProcessUserTimeLimit;

            /// <summary>整作业用户态时限。</summary>
            public long PerJobUserTimeLimit;

            /// <summary>限额开关位。</summary>
            public uint LimitFlags;

            /// <summary>最小工作集。</summary>
            public UIntPtr MinimumWorkingSetSize;

            /// <summary>最大工作集。</summary>
            public UIntPtr MaximumWorkingSetSize;

            /// <summary>活动进程数上限。</summary>
            public uint ActiveProcessLimit;

            /// <summary>亲和性掩码。</summary>
            public UIntPtr Affinity;

            /// <summary>优先级类。</summary>
            public uint PriorityClass;

            /// <summary>调度类。</summary>
            public uint SchedulingClass;
        }

        /// <summary>IO 计数，仅为布局占位。</summary>
        [StructLayout(LayoutKind.Sequential)]
        private struct IoCounters
        {
            /// <summary>布局占位：读次数。</summary>
            public ulong ReadOperationCount;

            /// <summary>布局占位：写次数。</summary>
            public ulong WriteOperationCount;

            /// <summary>布局占位：其他次数。</summary>
            public ulong OtherOperationCount;

            /// <summary>布局占位：读字节。</summary>
            public ulong ReadTransferCount;

            /// <summary>布局占位：写字节。</summary>
            public ulong WriteTransferCount;

            /// <summary>布局占位：其他字节。</summary>
            public ulong OtherTransferCount;
        }

        /// <summary>作业扩展限额信息。</summary>
        [StructLayout(LayoutKind.Sequential)]
        private struct JobObjectExtendedLimitInformation
        {
            /// <summary>基础限额，开关位在这里。</summary>
            public JobObjectBasicLimitInformation BasicLimitInformation;

            /// <summary>IO 计数占位。</summary>
            public IoCounters IoInfo;

            /// <summary>单进程内存上限。</summary>
            public UIntPtr ProcessMemoryLimit;

            /// <summary>整作业内存上限。</summary>
            public UIntPtr JobMemoryLimit;

            /// <summary>单进程内存峰值。</summary>
            public UIntPtr PeakProcessMemoryUsed;

            /// <summary>整作业内存峰值。</summary>
            public UIntPtr PeakJobMemoryUsed;
        }

        /// <summary>建一个匿名作业对象。</summary>
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string? lpName);

        /// <summary>给作业设置限额信息。</summary>
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetInformationJobObject(
            IntPtr hJob, int infoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

        /// <summary>把进程纳入作业。</summary>
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        /// <summary>终结作业里的全部进程。</summary>
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool TerminateJobObject(IntPtr hJob, uint uExitCode);

        /// <summary>关闭句柄。</summary>
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseHandle(IntPtr hObject);

        #endregion
    }
}
