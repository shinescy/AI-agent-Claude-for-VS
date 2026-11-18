// 读出或写回的一条记忆

namespace AgentExtension.Agents
{
    /// <summary>记忆文件的内容与身份戳。</summary>
    public class MemoryFileContent
    {
        /// <summary>文件内容。</summary>
        public string Content { get; set; } = string.Empty;

        /// <summary>身份戳，写和删时要原样带回。</summary>
        public string Version { get; set; } = string.Empty;

        /// <summary>是不是合法 UTF-8；不是就只给看不给改。</summary>
        public bool Editable { get; set; }
    }
}
