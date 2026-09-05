// 一个工作目录上次开着的整条 tab 条

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>一个工作目录上次开着的 tab 条。顺序即界面顺序。</summary>
    public sealed class WorkspaceTabsRecord
    {
        /// <summary>上次激活的那个的下标。读出来时保证落在 <c>[0, Tabs.Count)</c> 内。</summary>
        public int Active { get; set; }

        public IReadOnlyList<TabRecord> Tabs { get; set; } = Array.Empty<TabRecord>();
    }
}
