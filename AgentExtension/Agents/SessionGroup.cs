// 会话管理弹窗里的一个分组

namespace AgentExtension.Agents
{
    /// <summary>一个会话分组。</summary>
    public class SessionGroup
    {
        /// <summary>分组 id：32 位十六进制。</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>用户起的组名。</summary>
        public string Name { get; set; } = string.Empty;
    }
}
