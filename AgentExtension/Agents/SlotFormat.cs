// 无集合可依时的格式校验方式

namespace AgentExtension.Agents
{
    /// <summary>仅在 <see cref="PanelSet.None"/> 时生效。</summary>
    public enum SlotFormat
    {
        None = 0,
        /// <summary>必须是合法的 http/https 绝对 URI。</summary>
        RemoteUrl = 1,
        /// <summary>服务器名：字母数字、连字符、下划线，1–64 位，不能以连字符开头。</summary>
        ServerName = 2,

        PluginScope = 3,

        /// <summary>会话标题：去空白后 1–200 字符，无控制字符。</summary>
        SessionTitle = 4,

        /// <summary>会话分组 id：32 位十六进制。</summary>
        GroupId = 5
    }
}
