// 终端起步期：首屏没出来前别再起别的 CLI 抢 CPU

using System;

namespace AgentExtension.Agents
{
    /// <summary>一路 TUI 是否已过起步期。</summary>
    /// <remarks>并发起 CLI 互相拖慢，见 terminal-fixes-2026-11.md。</remarks>
    public class TerminalWarmUp
    {
        #region 字段

        /// <summary>累计输出到这么多字节算首屏已出。</summary>
        public const int DrawnBytes = 1024;

        /// <summary>迟迟不出首屏时的放行时限。</summary>
        public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

        /// <summary>输出线程与 UI 线程都会碰。</summary>
        private readonly object _gate = new object();

        /// <summary>这一路起步的时刻；null 表示没起过。</summary>
        private DateTime? _startedUtc;

        /// <summary>这一路累计的输出字节。</summary>
        private long _bytes;

        /// <summary>已过起步期。</summary>
        private bool _settled;

        #endregion

        #region 状态

        /// <summary>新起一路终端，重新计。</summary>
        public void Begin(DateTime nowUtc)
        {
            lock (_gate)
            {
                _startedUtc = nowUtc;
                _bytes = 0;
                _settled = false;
            }
        }

        /// <summary>记一批输出；刚跨过门槛时返回 true。</summary>
        public bool Feed(int count)
        {
            lock (_gate)
            {
                if (_settled || _startedUtc == null)
                {
                    return false;
                }

                _bytes += count;
                _settled = _bytes >= DrawnBytes;
                return _settled;
            }
        }

        /// <summary>进程退出；之前还没收尾时返回 true。</summary>
        public bool MarkExited()
        {
            lock (_gate)
            {
                if (_settled || _startedUtc == null)
                {
                    return false;
                }

                _settled = true;
                return true;
            }
        }

        /// <summary>已过起步期，或从没起过，或已超时。</summary>
        public bool IsSettled(DateTime nowUtc)
        {
            lock (_gate)
            {
                bool settled = _startedUtc == null
                    || _settled
                    || nowUtc - _startedUtc.Value >= Timeout;
                return settled;
            }
        }

        #endregion
    }
}
