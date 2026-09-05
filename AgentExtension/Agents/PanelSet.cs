// 槽位取值来源集合

namespace AgentExtension.Agents
{
    /// <summary>槽位值必须属于的集合。</summary>
    public enum PanelSet
    {
        None = 0,
        InstalledPlugins = 1,
        AvailablePlugins = 2,
        McpServers = 3,

        Sessions = 4,

        FileBackups = 5
    }
}
