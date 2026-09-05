// 本地取数面板需要的上下文

namespace AgentExtension.Agents
{
    /// <summary>本地取数（<see cref="PanelDefinition.LocalFetch"/>）拿到的上下文。</summary>
    public class PanelFetchContext
    {
        /// <summary>当前工作目录。</summary>
        public string WorkingDirectory { get; set; } = string.Empty;

        /// <summary>当前会话 id。</summary>
        public string SessionId { get; set; } = string.Empty;
    }
}
