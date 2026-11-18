// 「接回历史会话」的请求载荷

namespace AgentExtension.Bridge
{
    /// <summary>接回一条历史会话的请求。</summary>
    public class SessionResumeRequest
    {
        public SessionResumeRequest(string sessionId, bool fork)
        {
            SessionId = sessionId ?? string.Empty;
            Fork = fork;
        }

        /// <summary>要接回的会话 id。</summary>
        public string SessionId { get; }

        /// <summary>是否开分支：拿上下文但写进新的转录（<c>--fork-session</c>），原会话不被追写。</summary>
        public bool Fork { get; }
    }
}
