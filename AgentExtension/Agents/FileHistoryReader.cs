// 读出 CLI 的文件快照，并把某一版还原回工作区

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>文件快照的读取与还原，取代在本管线下被 CLI 拒绝的 <c>/rewind</c>。</summary>
    public static class FileHistoryReader
    {
        #region 常量

        /// <summary>最多列出多少条快照，按备份时间倒序取。</summary>
        public const int MaxEntries = 200;

        private const string Marker = "trackedFileBackups";

        /// <summary>还原前把现有内容另存到这里，让这一步可撤。</summary>
        public const string BackupFolderName = "AgentExtension\\rewind-backups";

        #endregion

        #region 读取

        /// <summary>快照根目录，即 <c>~/.claude/file-history</c>。</summary>
        public static string DefaultHistoryRoot()
        {
            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string root = Path.Combine(home, ".claude", "file-history");
            return root;
        }

        /// <summary>列出某会话的文件快照，按备份时间倒序、同一文件同一版本只留一条。</summary>
        public static IReadOnlyList<FileBackupEntry> List(
            string transcriptPath, string historyRoot, string sessionId, string workingDirectory)
        {
            var entries = new List<FileBackupEntry>();

            if (string.IsNullOrEmpty(transcriptPath) || !File.Exists(transcriptPath))
            {
                return entries;
            }

            string snapshotDirectory = string.IsNullOrEmpty(sessionId)
                ? string.Empty
                : Path.Combine(historyRoot ?? string.Empty, sessionId);

            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            using (var reader = new StreamReader(
                new FileStream(transcriptPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)))
            {
                string line;

                while ((line = reader.ReadLine()) != null)
                {
                    if (line.IndexOf(Marker, StringComparison.Ordinal) < 0)
                    {
                        continue;
                    }

                    ReadLine(line, snapshotDirectory, workingDirectory, seen, entries);
                }
            }

            entries.Sort((a, b) => b.BackupTimeUtc.CompareTo(a.BackupTimeUtc));

            if (entries.Count > MaxEntries)
            {
                entries.RemoveRange(MaxEntries, entries.Count - MaxEntries);
            }

            return entries;
        }

        /// <summary>解析一行转录里的检查点。</summary>
        internal static void ReadLine(
            string line, string snapshotDirectory, string workingDirectory,
            HashSet<string> seen, List<FileBackupEntry> target)
        {
            JsonElement root;

            if (!TryParse(line, out root))
            {
                return;
            }

            if (!root.TryGetProperty("snapshot", out JsonElement snapshot)
                || snapshot.ValueKind != JsonValueKind.Object)
            {
                return;
            }

            if (!snapshot.TryGetProperty("trackedFileBackups", out JsonElement backups)
                || backups.ValueKind != JsonValueKind.Object)
            {
                return;
            }

            foreach (JsonProperty file in backups.EnumerateObject())
            {
                if (file.Value.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                FileBackupEntry? entry = ReadEntry(file.Name, file.Value, snapshotDirectory);

                if (entry == null)
                {
                    continue;
                }

                if (workingDirectory.Length > 0 && !IsInside(workingDirectory, entry.TargetPath))
                {
                    continue;
                }

                if (!seen.Add(entry.BackupFileName + "|" + entry.TargetPath))
                {
                    continue;
                }

                target.Add(entry);
            }
        }

        private static FileBackupEntry? ReadEntry(string relativePath, JsonElement value, string snapshotDirectory)
        {
            string backupFileName = ReadString(value, "backupFileName");

            if (backupFileName.Length == 0)
            {
                return null;
            }

            string parentDir = ReadString(value, "realParentDir");
            string fileName = Path.GetFileName(relativePath.Replace('/', '\\'));

            if (parentDir.Length == 0 || fileName.Length == 0)
            {
                return null;
            }

            var entry = new FileBackupEntry
            {
                RelativePath = relativePath,
                TargetPath = Path.Combine(parentDir, fileName),
                BackupFileName = backupFileName,
                Version = ReadInt(value, "version"),
                BackupTimeUtc = ReadTime(value, "backupTime")
            };

            if (snapshotDirectory.Length > 0)
            {
                entry.SnapshotPath = Path.Combine(snapshotDirectory, backupFileName);

                var info = new FileInfo(entry.SnapshotPath);
                entry.SnapshotExists = info.Exists;
                entry.SnapshotSize = info.Exists ? info.Length : 0;
            }

            return entry;
        }

        /// <summary>路径是否在某个目录之内。</summary>
        internal static bool IsInside(string directory, string path)
        {
            if (string.IsNullOrEmpty(directory) || string.IsNullOrEmpty(path))
            {
                return false;
            }

            string root = Path.GetFullPath(directory).TrimEnd('\\', '/') + "\\";
            string full;

            try
            {
                full = Path.GetFullPath(path);
            }
            catch (ArgumentException)
            {
                return false;
            }
            catch (NotSupportedException)
            {
                return false;
            }

            bool inside = full.StartsWith(root, StringComparison.OrdinalIgnoreCase);
            return inside;
        }

        /// <summary>按面板条目的 Id 反查。</summary>
        public static FileBackupEntry? FindById(
            string transcriptPath, string historyRoot, string sessionId, string workingDirectory, string id)
        {
            if (string.IsNullOrEmpty(id))
            {
                return null;
            }

            foreach (FileBackupEntry entry in List(transcriptPath, historyRoot, sessionId, workingDirectory))
            {
                string candidate = entry.BackupFileName + "|" + entry.TargetPath;

                if (string.Equals(candidate, id, StringComparison.OrdinalIgnoreCase))
                {
                    return entry;
                }
            }

            return null;
        }

        /// <summary>本会话转录的绝对路径。</summary>
        public static string TranscriptPathFor(string workingDirectory, string sessionId)
        {
            if (string.IsNullOrEmpty(sessionId))
            {
                return string.Empty;
            }

            string projectDirectory = SessionHistoryReader.ResolveProjectDirectory(
                SessionHistoryReader.DefaultTranscriptRoot(), workingDirectory);

            if (projectDirectory.Length == 0)
            {
                return string.Empty;
            }

            string path = Path.Combine(projectDirectory, sessionId + ".jsonl");
            return path;
        }

        #endregion

        #region 还原

        /// <summary>把某一版快照还原回工作区。</summary>
        public static string Restore(FileBackupEntry entry, string workingDirectory, string backupRoot)
        {
            if (entry == null)
            {
                throw new ArgumentNullException(nameof(entry));
            }

            if (!File.Exists(entry.SnapshotPath))
            {
                throw new FileNotFoundException($"快照已不存在：{entry.SnapshotPath}");
            }

            if (!IsInside(workingDirectory, entry.TargetPath))
            {
                throw new InvalidOperationException(
                    $"目标不在工作目录内，拒绝写入：{entry.TargetPath}");
            }

            string targetDirectory = Path.GetDirectoryName(entry.TargetPath);

            if (string.IsNullOrEmpty(targetDirectory) || !Directory.Exists(targetDirectory))
            {
                throw new DirectoryNotFoundException($"目标目录不存在：{targetDirectory}");
            }

            string savedTo = string.Empty;

            if (File.Exists(entry.TargetPath))
            {
                savedTo = Path.Combine(
                    backupRoot,
                    DateTime.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture),
                    Path.GetFileName(entry.TargetPath));

                Directory.CreateDirectory(Path.GetDirectoryName(savedTo));
                File.Copy(entry.TargetPath, savedTo, true);
            }

            File.Copy(entry.SnapshotPath, entry.TargetPath, true);

            return savedTo;
        }

        /// <summary>还原前另存的默认位置。</summary>
        public static string DefaultBackupRoot()
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string root = Path.Combine(local, BackupFolderName);
            return root;
        }

        #endregion

        #region 投影

        /// <summary>投影成面板条目。</summary>
        public static PanelItem ToPanelItem(FileBackupEntry entry)
        {
            var item = new PanelItem
            {
                Id = entry.BackupFileName + "|" + entry.TargetPath,
                ActionValue = entry.BackupFileName,
                Title = Path.GetFileName(entry.TargetPath),
                Subtitle = entry.RelativePath,

                // 快照没了就不能还原，界面据此禁用按钮。
                Enabled = entry.SnapshotExists
            };

            item.Fields["path"] = entry.TargetPath;
            item.Fields["version"] = entry.Version.ToString(CultureInfo.InvariantCulture);
            item.Fields["backupTime"] = SessionHistoryReader.FormatLocalTime(entry.BackupTimeUtc);
            item.Fields["size"] = entry.SnapshotExists
                ? SessionHistoryReader.FormatSize(entry.SnapshotSize)
                : string.Empty;

            return item;
        }

        #endregion

        #region JSON helpers

        private static bool TryParse(string line, out JsonElement root)
        {
            root = default(JsonElement);

            try
            {
                using (JsonDocument document = JsonDocument.Parse(line))
                {
                    root = document.RootElement.Clone();
                    return true;
                }
            }
            catch (JsonException)
            {
                return false;
            }
        }

        private static string ReadString(JsonElement parent, string name)
        {
            if (!parent.TryGetProperty(name, out JsonElement value) || value.ValueKind != JsonValueKind.String)
            {
                return string.Empty;
            }

            return value.GetString() ?? string.Empty;
        }

        private static int ReadInt(JsonElement parent, string name)
        {
            if (!parent.TryGetProperty(name, out JsonElement value) || value.ValueKind != JsonValueKind.Number)
            {
                return 0;
            }

            return value.TryGetInt32(out int parsed) ? parsed : 0;
        }

        private static DateTime ReadTime(JsonElement parent, string name)
        {
            string text = ReadString(parent, name);
            DateTime parsed;

            if (text.Length > 0 && DateTime.TryParse(
                text, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out parsed))
            {
                return parsed;
            }

            return DateTime.MinValue;
        }

        #endregion
    }
}
