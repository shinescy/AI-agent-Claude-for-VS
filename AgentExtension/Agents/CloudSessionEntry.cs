// 一条网页（云端）会话的摘要

namespace AgentExtension.Agents
{
    /// <summary>CLI 的 list_cloud_sessions 回的一条会话。</summary>
    public class CloudSessionEntry
    {
        /// <summary>云端会话 id，形如 <c>session_…</c>。</summary>
        public string Id { get; set; } = string.Empty;

        /// <summary>标题，服务端的原文；可能为空。</summary>
        public string Title { get; set; } = string.Empty;

        /// <summary>最后更新时间，ISO 8601 原文。</summary>
        public string UpdatedAt { get; set; } = string.Empty;

        /// <summary>running / idle / requires_action / archived / pending / failed。</summary>
        public string Status { get; set; } = string.Empty;

        /// <summary>仓库，<c>owner/name</c>；没有为空。</summary>
        public string Repository { get; set; } = string.Empty;

        /// <summary>会话在做的分支；没有为空。</summary>
        public string Branch { get; set; } = string.Empty;

        /// <summary>在哪跑；<c>bridge</c> 是远程控制的会话。</summary>
        public string EnvironmentKind { get; set; } = string.Empty;
    }
}
