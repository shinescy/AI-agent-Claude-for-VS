// 列网页会话的结果

using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>一次 list_cloud_sessions 的结果：要么一批会话，要么读不了的原因。</summary>
    public class CloudSessionListResult
    {
        /// <summary>读到了。</summary>
        public bool Available { get; set; }

        /// <summary>读不了的原因代码，CLI 给的；如 <c>started_by_session</c>。</summary>
        public string Reason { get; set; } = string.Empty;

        /// <summary>读不了时 CLI 给人看的那句话。</summary>
        public string Message { get; set; } = string.Empty;

        /// <summary>会话，服务端给的顺序。</summary>
        public List<CloudSessionEntry> Sessions { get; set; } = new List<CloudSessionEntry>();

        /// <summary>服务端还有更多，这一页没装下。</summary>
        public bool Truncated { get; set; }

        /// <summary>造一个「读不了」。</summary>
        public static CloudSessionListResult Unavailable(string reason, string message)
        {
            var result = new CloudSessionListResult
            {
                Available = false,
                Reason = reason ?? string.Empty,
                Message = message ?? string.Empty
            };

            return result;
        }
    }
}
