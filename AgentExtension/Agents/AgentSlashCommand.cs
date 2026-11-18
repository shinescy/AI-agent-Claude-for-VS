// 一条 slash 命令的说明

namespace AgentExtension.Agents
{
    /// <summary>一条 slash 命令连带它的说明，来自 initialize 握手回包里的 <c>commands</c> 数组。</summary>
    public class AgentSlashCommand
    {
        /// <summary>命令名，不含前导斜杠；插件命令形如 <c>plugin:command</c>。</summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>一句话说明。</summary>
        public string Description { get; set; } = string.Empty;

        /// <summary>参数提示，形如 <c>[review-aspects]</c>；不需要参数时为空串。</summary>
        public string ArgumentHint { get; set; } = string.Empty;
    }
}
