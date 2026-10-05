// 一份文件快照（CLI 在改动文件前留下的备份）

using System;

namespace AgentExtension.Agents
{
    /// <summary>一份文件快照，来自 CLI 自己的检查点机制。</summary>
    public class FileBackupEntry
    {
        /// <summary>转录里记的相对路径（形如 <c>docs\a\b.md</c>），用于展示。</summary>
        public string RelativePath { get; set; } = string.Empty;

        /// <summary>还原目标的绝对路径，由 <c>realParentDir</c> 与文件名拼出。</summary>
        public string TargetPath { get; set; } = string.Empty;

        /// <summary>快照文件名，形如 <c>67e6300569db5130@v2</c>。</summary>
        public string BackupFileName { get; set; } = string.Empty;

        /// <summary>快照文件的绝对路径。</summary>
        public string SnapshotPath { get; set; } = string.Empty;

        /// <summary>第几版。</summary>
        public int Version { get; set; }

        /// <summary>CLI 记的备份时刻。</summary>
        public DateTime BackupTimeUtc { get; set; }

        /// <summary>快照文件当前是否还在（CLI 会清理旧快照，转录里的记录可能已经没有对应文件）。</summary>
        public bool SnapshotExists { get; set; }

        /// <summary>快照大小，供界面判断这一版有多少内容。</summary>
        public long SnapshotSize { get; set; }
    }
}
