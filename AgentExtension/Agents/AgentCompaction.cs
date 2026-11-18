// 一次上下文压缩的进度与结果

namespace AgentExtension.Agents
{
    /// <summary>上下文压缩事件的载荷。</summary>
    public class AgentCompaction
    {
        #region 阶段

        /// <summary>开始压缩。</summary>
        public const string PhaseStarted = "started";

        /// <summary>压缩完成。</summary>
        public const string PhaseCompleted = "completed";

        /// <summary>压缩失败。</summary>
        public const string PhaseFailed = "failed";

        /// <summary>补上摘要正文。</summary>
        public const string PhaseSummary = "summary";

        #endregion

        #region 属性

        /// <summary>阶段，取上面四个常量之一。</summary>
        public string Phase { get; set; } = string.Empty;

        /// <summary>触发方式：manual 或 auto。</summary>
        public string Trigger { get; set; } = string.Empty;

        /// <summary>压缩前的上下文 token 数。</summary>
        public long PreTokens { get; set; }

        /// <summary>压缩后的上下文 token 数；0 表示没报。</summary>
        public long PostTokens { get; set; }

        /// <summary>压缩耗时毫秒；0 表示没报。</summary>
        public long DurationMs { get; set; }

        /// <summary>分界记录的 uuid，用来认领摘要。</summary>
        public string BoundaryUuid { get; set; } = string.Empty;

        /// <summary>摘要正文；还没拿到为空。</summary>
        public string Summary { get; set; } = string.Empty;

        /// <summary>失败原因。</summary>
        public string Error { get; set; } = string.Empty;

        #endregion
    }
}
