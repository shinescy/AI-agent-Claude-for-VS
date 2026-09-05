// 一条面板动作的定义

namespace AgentExtension.Agents
{
    /// <summary>一条面板动作。</summary>
    public class PanelAction
    {
        /// <summary>模板中的槽位占位符。</summary>
        public const string Slot = "{slot}";

        public string Id { get; set; } = string.Empty;

        public string Label { get; set; } = string.Empty;

        public string[] Template { get; set; } = new string[0];

        /// <summary>与模板中占位符的出现顺序一一对应。</summary>
        public SlotSpec[] Slots { get; set; } = new SlotSpec[0];

        /// <summary>执行后需要提示「下个会话才生效」。</summary>
        public bool RestartHint { get; set; }

        /// <summary>这条动作本身就是查询——它的 stdout 就是要看的结果（如 <c>plugin details</c> / <c>mcp get</c>）， 不是「执行完再重取列表」那种改状态的动作。</summary>
        public bool ShowsOutput { get; set; }
    }
}
