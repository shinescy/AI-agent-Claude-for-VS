// 一个 tab 在界面上的样子

namespace AgentExtension.ToolWindows
{
    /// <summary>一个 tab 给前端看的那部分状态。纯数据，直接序列化进 <c>tabs</c> 消息。</summary>
    public sealed class ChatTabSnapshot
    {
        /// <summary>tab 自己的 id。**不是会话 id**——会话 id 由 CLI 说了算，同一个 tab 换会话时会变。</summary>
        public string Id { get; set; } = string.Empty;

        public string Title { get; set; } = string.Empty;

        /// <summary>正在跑一轮。</summary>
        public bool Busy { get; set; }

        /// <summary>未被激活期间有过输出。</summary>
        public bool Unread { get; set; }

        /// <summary>这个 tab 崩了（会话起不来 / 运行中失败），需要用户过去看一眼原因。</summary>
        public bool Failed { get; set; }
    }
}
