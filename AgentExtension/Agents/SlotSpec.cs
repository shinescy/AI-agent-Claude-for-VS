// 单个槽位的校验声明

namespace AgentExtension.Agents
{
    /// <summary>单个槽位的校验声明。</summary>
    public class SlotSpec
    {
        public PanelSet SourceSet { get; set; } = PanelSet.None;

        public SlotFormat Format { get; set; } = SlotFormat.None;
    }
}
