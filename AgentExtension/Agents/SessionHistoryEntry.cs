// 一条历史会话的摘要

using System;

namespace AgentExtension.Agents
{
    /// <summary>一条历史会话的摘要，来自 <c>~/.claude/projects/&lt;项目目录&gt;/&lt;会话 id&gt;.jsonl</c>。</summary>
    public class SessionHistoryEntry
    {
        /// <summary>会话 id，等于转录文件名（去掉扩展名）。</summary>
        public string SessionId { get; set; } = string.Empty;

        /// <summary>给人看的标题：首条真实提问的开头，没有提问时退回「命令：/xxx」或空串。</summary>
        public string Title { get; set; } = string.Empty;

        /// <summary>最后活动时间，取转录文件的写入时间——比逐行找最后一条时间戳便宜得多。</summary>
        public DateTime LastActivityUtc { get; set; }

        /// <summary>转录里记的 git 分支，没有则空串。</summary>
        public string GitBranch { get; set; } = string.Empty;

        /// <summary>写这份转录的 CLI 版本，没有则空串。</summary>
        public string CliVersion { get; set; } = string.Empty;

        /// <summary>转录文件大小。</summary>
        public long SizeBytes { get; set; }

        /// <summary>是否只是一次探测会话。</summary>
        public bool ProbeOnly { get; set; }
    }
}
