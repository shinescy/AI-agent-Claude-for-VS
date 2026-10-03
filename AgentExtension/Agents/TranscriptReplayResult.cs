// 一次历史回放读取的结果，纯数据类

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>一次历史回放读取的结果。</summary>
    public class TranscriptReplayResult
    {
        /// <summary>可以直接喂给前端 replay 的事件序列。</summary>
        public IReadOnlyList<AgentEvent> Events { get; set; } = Array.Empty<AgentEvent>();

        /// <summary>认不出的记录条数（含坏行）。已知的簿记类型不计。</summary>
        public int UnknownRecords { get; set; }

        /// <summary>是否因为字节预算或条数上限而没读全。</summary>
        public bool Truncated { get; set; }
    }
}
