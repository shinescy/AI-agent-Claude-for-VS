// 一个轮次的最终结果

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>轮次结束时的汇总。</summary>
    public class AgentTurnResult
    {
        public AgentUsage? Usage { get; set; }

        /// <summary>轮次是被用户中断的（而非失败）。</summary>
        public bool WasInterrupted { get; set; }

        public IReadOnlyList<AgentPermissionDenial> PermissionDenials { get; set; } =
            Array.Empty<AgentPermissionDenial>();
    }
}
