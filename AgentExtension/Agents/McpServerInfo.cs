// init 事件里的 MCP 服务器状态

namespace AgentExtension.Agents
{
    /// <summary>MCP 服务器及其连接状态（实测取值 connected / needs-auth）。</summary>
    public class McpServerInfo
    {
        public string Name { get; set; } = string.Empty;

        public string Status { get; set; } = string.Empty;
    }
}
