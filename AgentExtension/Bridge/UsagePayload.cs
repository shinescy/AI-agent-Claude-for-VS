// usage 消息的载荷：额度快照

using System;
using System.Collections.Generic;
using AgentExtension.Agents;

namespace AgentExtension.Bridge
{
    /// <summary>额度快照，广播给发起 tab 以外的其余桥。</summary>
    /// <remarks>为何是专用消息，见 docs/memory/multi-session-tabs.md。</remarks>
    public sealed class UsagePayload
    {
        /// <summary>额度窗口清单。</summary>
        public IReadOnlyList<UsageWindow> UsageWindows { get; set; } = Array.Empty<UsageWindow>();

        /// <summary>/usage 的完整原文。</summary>
        public string UsageRawText { get; set; } = string.Empty;
    }
}
