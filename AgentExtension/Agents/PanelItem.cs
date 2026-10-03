// 面板条目的统一投影

using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>面板条目的统一投影。</summary>
    public class PanelItem
    {
        /// <summary>界面用来去重/选中/做集合成员校验的值。</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>动作槽位真正要传给 CLI 的实参值。</summary>
        public string ActionValue { get; set; } = string.Empty;

        public string Title { get; set; } = string.Empty;

        public string Subtitle { get; set; } = string.Empty;

        /// <summary>是否处于启用/连通状态；不适用的面板恒为 true。</summary>
        public bool Enabled { get; set; } = true;

        /// <summary>详情区的自由文本。</summary>
        public string Detail { get; set; } = string.Empty;

        /// <summary>详情区的键值表，顺序即展示顺序。</summary>
        public Dictionary<string, string> Fields { get; set; } = new Dictionary<string, string>();

        /// <summary>是否属于当前项目（宿主按工作目录比对后标出）。</summary>
        public bool CurrentProject { get; set; }

        /// <summary>机读的安装作用域（user / project / local / managed），不适用的面板为空串。</summary>
        public string Scope { get; set; } = string.Empty;
    }
}
