// 持久化里的一条 tab

namespace AgentExtension.Agents
{
    /// <summary>记录文件里的一条 tab。</summary>
    public sealed class TabRecord
    {
        /// <summary>
        /// 会话 id。JSON 键是 <c>id</c>，但它**不是 tab id**——
        /// tab id 每次重启都重新生成，存下来没有意义；这里存的是能拿去 <c>--resume</c> 的那个。
        /// </summary>
        public string SessionId { get; set; } = string.Empty;

        public string Title { get; set; } = string.Empty;
    }
}
