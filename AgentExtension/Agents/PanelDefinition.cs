// 一个面板的定义

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>一个面板：取数命令 + 它产出的集合 + 可执行的动作。</summary>
    public class PanelDefinition
    {
        public string Id { get; set; } = string.Empty;

        public string Title { get; set; } = string.Empty;

        /// <summary>取数命令，全字面量。</summary>
        public string[] FetchArguments { get; set; } = new string[0];

        /// <summary>取数结果登记为哪个集合，供槽位校验使用。</summary>
        public PanelSet ProducesSet { get; set; } = PanelSet.None;

        public PanelAction[] Actions { get; set; } = new PanelAction[0];

        /// <summary>该面板没有结构化输出，原样显示原始文本即可。</summary>
        public bool PlainText { get; set; }

        /// <summary>把取数命令的 stdout 解析成条目。</summary>
        public Func<string, IReadOnlyList<PanelItem>>? Parser { get; set; }

        /// <summary>本地取数：不跑 CLI，由宿主自己产出条目，参数是当前工作目录。</summary>
        public Func<PanelFetchContext, IReadOnlyList<PanelItem>>? LocalFetch { get; set; }
    }
}
