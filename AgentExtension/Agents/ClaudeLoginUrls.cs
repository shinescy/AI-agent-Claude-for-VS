// claude_authenticate 回包里的两个登录网址

namespace AgentExtension.Agents
{
    /// <summary>CLI 开始登录后给出的网址。</summary>
    public class ClaudeLoginUrls
    {
        /// <summary>手动粘授权码用的网址，给用户看。</summary>
        public string ManualUrl { get; set; } = string.Empty;

        /// <summary>浏览器自动回调用的网址，宿主替用户打开。</summary>
        public string AutomaticUrl { get; set; } = string.Empty;
    }
}
