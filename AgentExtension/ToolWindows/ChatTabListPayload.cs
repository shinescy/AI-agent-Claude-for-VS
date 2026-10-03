// 出站 tabs 消息的载荷

using System;
using System.Collections.Generic;

namespace AgentExtension.ToolWindows
{
    /// <summary>整条 tab 条。顺序即界面上的顺序。</summary>
    public sealed class ChatTabListPayload
    {
        public IReadOnlyList<ChatTabSnapshot> Tabs { get; set; } = Array.Empty<ChatTabSnapshot>();

        public string ActiveId { get; set; } = string.Empty;

        /// <summary>这次推送要不要让前端把焦点放到 tab 条上。</summary>
        public bool FocusStrip { get; set; }
    }
}
