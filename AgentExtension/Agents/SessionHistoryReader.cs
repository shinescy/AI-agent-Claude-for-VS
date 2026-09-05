// 读出本工作目录下的历史会话，供「会话历史」面板列出

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AgentExtension.Agents
{
    /// <summary>从 CLI 的转录目录里读出历史会话。</summary>
    public static class SessionHistoryReader
    {
        #region 常量

        /// <summary>每份转录最多读这么多字节找标题。</summary>
        public const int HeadBytes = 96 * 1024;

        /// <summary>最多列出多少条会话。</summary>
        public const int MaxEntries = 40;

        #endregion

        #region 目录定位

        /// <summary>把工作目录编码成转录子目录名：非字母数字一律换成连字符。</summary>
        public static string EncodeProjectDirectory(string cwd)
        {
            if (string.IsNullOrEmpty(cwd))
            {
                return string.Empty;
            }

            var builder = new StringBuilder(cwd.Length);

            foreach (char c in cwd.TrimEnd('\\', '/'))
            {
                builder.Append(char.IsLetterOrDigit(c) ? c : '-');
            }

            return builder.ToString();
        }

        /// <summary>转录根目录，即 <c>~/.claude/projects</c>。</summary>
        public static string DefaultTranscriptRoot()
        {
            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string root = Path.Combine(home, ".claude", "projects");
            return root;
        }

        /// <summary>找到某工作目录对应的转录子目录。</summary>
        public static string ResolveProjectDirectory(string transcriptRoot, string cwd)
        {
            if (string.IsNullOrEmpty(transcriptRoot) || !Directory.Exists(transcriptRoot))
            {
                return string.Empty;
            }

            string encoded = Path.Combine(transcriptRoot, EncodeProjectDirectory(cwd));

            if (Directory.Exists(encoded))
            {
                return encoded;
            }

            foreach (string candidate in Directory.GetDirectories(transcriptRoot))
            {
                if (DirectoryMatchesCwd(candidate, cwd))
                {
                    return candidate;
                }
            }

            return string.Empty;
        }

        private static bool DirectoryMatchesCwd(string directory, string cwd)
        {
            string newest = Directory
                .GetFiles(directory, "*.jsonl")
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .FirstOrDefault();

            if (newest == null)
            {
                return false;
            }

            string recorded = ReadRecordedCwd(ReadHeadLines(newest));

            return recorded.Length > 0
                && string.Equals(
                    recorded.TrimEnd('\\', '/'),
                    (cwd ?? string.Empty).TrimEnd('\\', '/'),
                    StringComparison.OrdinalIgnoreCase);
        }

        #endregion

        #region 列表

        /// <summary>列出某工作目录下的历史会话，按最后活动时间倒序。</summary>
        public static IReadOnlyList<SessionHistoryEntry> List(
            string transcriptRoot, string cwd, string excludeSessionId)
        {
            int failures;
            return List(transcriptRoot, cwd, excludeSessionId, out failures);
        }

        /// <summary>同上，另外报告有多少份转录读失败了。</summary>
        public static IReadOnlyList<SessionHistoryEntry> List(
            string transcriptRoot, string cwd, string excludeSessionId, out int failures)
        {
            var entries = new List<SessionHistoryEntry>();
            failures = 0;
            string directory = ResolveProjectDirectory(transcriptRoot, cwd);

            if (directory.Length == 0)
            {
                return entries;
            }

            IEnumerable<string> files = Directory
                .GetFiles(directory, "*.jsonl")
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .Take(MaxEntries);

            foreach (string file in files)
            {
                string id = Path.GetFileNameWithoutExtension(file);

                if (!string.IsNullOrEmpty(excludeSessionId)
                    && string.Equals(id, excludeSessionId, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                // 单份转录读坏（写入中被截断、编码异常）不该让整个面板空掉，但要计数。
                try
                {
                    entries.Add(ReadEntry(file));
                }
                catch (IOException)
                {
                    failures++;
                }
                catch (UnauthorizedAccessException)
                {
                    failures++;
                }
            }

            return entries;
        }

        /// <summary>读一份转录的摘要。</summary>
        public static SessionHistoryEntry ReadEntry(string filePath)
        {
            var info = new FileInfo(filePath);
            IReadOnlyList<string> lines = ReadHeadLines(filePath);

            var entry = new SessionHistoryEntry
            {
                SessionId = Path.GetFileNameWithoutExtension(filePath),
                LastActivityUtc = info.LastWriteTimeUtc,
                SizeBytes = info.Length
            };

            FillFromLines(entry, lines);
            return entry;
        }

        /// <summary>从转录行里提取标题、分支、版本与「是否只是探测」。</summary>
        internal static void FillFromLines(SessionHistoryEntry entry, IReadOnlyList<string> lines)
        {
            string firstPrompt = string.Empty;
            string firstCommand = string.Empty;

            foreach (string line in lines)
            {
                JsonElement root;

                if (!TranscriptJson.TryParse(line, out root))
                {
                    continue;
                }

                if (entry.GitBranch.Length == 0)
                {
                    entry.GitBranch = TranscriptJson.ReadString(root, "gitBranch");
                }

                if (entry.CliVersion.Length == 0)
                {
                    entry.CliVersion = TranscriptJson.ReadString(root, "version");
                }

                if (firstPrompt.Length > 0 || TranscriptJson.ReadString(root, "type") != "user")
                {
                    continue;
                }

                if (root.TryGetProperty("isMeta", out JsonElement meta)
                    && meta.ValueKind == JsonValueKind.True)
                {
                    continue;
                }

                string text = ReadUserText(root);

                if (text.Length == 0)
                {
                    continue;
                }

                if (text[0] == '<')
                {
                    if (firstCommand.Length == 0)
                    {
                        Match match = TranscriptJson.CommandName.Match(text);

                        if (match.Success)
                        {
                            firstCommand = "/" + match.Groups["name"].Value;
                        }
                    }

                    continue;
                }

                firstPrompt = Condense(text);
            }

            entry.ProbeOnly = firstPrompt.Length == 0;
            entry.Title = firstPrompt.Length > 0
                ? firstPrompt
                : (firstCommand.Length > 0 ? "命令：" + firstCommand : string.Empty);
        }

        private static string ReadUserText(JsonElement root)
        {
            if (!root.TryGetProperty("message", out JsonElement message)
                || message.ValueKind != JsonValueKind.Object)
            {
                return string.Empty;
            }

            if (!message.TryGetProperty("content", out JsonElement content))
            {
                return string.Empty;
            }

            if (content.ValueKind == JsonValueKind.String)
            {
                return (content.GetString() ?? string.Empty).Trim();
            }

            if (content.ValueKind != JsonValueKind.Array)
            {
                return string.Empty;
            }

            foreach (JsonElement block in content.EnumerateArray())
            {
                if (block.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                if (TranscriptJson.ReadString(block, "type") != "text")
                {
                    continue;
                }

                string text = TranscriptJson.ReadString(block, "text").Trim();

                if (text.Length > 0)
                {
                    return text;
                }
            }

            return string.Empty;
        }

        /// <summary>把多行/多空白压成一行，并截到标题长度。</summary>
        internal static string Condense(string text)
        {
            string collapsed = Regex.Replace(text ?? string.Empty, @"\s+", " ").Trim();

            const int limit = 80;

            if (collapsed.Length <= limit)
            {
                return collapsed;
            }

            return collapsed.Substring(0, limit) + "…";
        }

        /// <summary>取转录记录里的 cwd（首条带这个字段的即可）。</summary>
        internal static string ReadRecordedCwd(IReadOnlyList<string> lines)
        {
            foreach (string line in lines)
            {
                JsonElement root;

                if (!TranscriptJson.TryParse(line, out root))
                {
                    continue;
                }

                string cwd = TranscriptJson.ReadString(root, "cwd");

                if (cwd.Length > 0)
                {
                    return cwd;
                }
            }

            return string.Empty;
        }

        private static IReadOnlyList<string> ReadHeadLines(string filePath)
        {
            var buffer = new byte[HeadBytes];
            int read;

            using (var stream = new FileStream(
                filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                read = stream.Read(buffer, 0, buffer.Length);
            }

            string text = Encoding.UTF8.GetString(buffer, 0, read);
            string[] lines = text.Split('\n');

            var result = new List<string>(lines.Length);
            int last = read == HeadBytes ? lines.Length - 1 : lines.Length;

            for (int i = 0; i < last; i++)
            {
                string line = lines[i].Trim();

                if (line.Length > 0)
                {
                    result.Add(line);
                }
            }

            return result;
        }

        #endregion

        #region 投影

        /// <summary>把摘要投影成面板条目。</summary>
        public static PanelItem ToPanelItem(SessionHistoryEntry entry)
        {
            var item = new PanelItem
            {
                Id = entry.SessionId,
                ActionValue = entry.SessionId,
                Title = entry.Title.Length > 0 ? entry.Title : "（没有提问）",
                Subtitle = FormatLocalTime(entry.LastActivityUtc),

                Enabled = !entry.ProbeOnly
            };

            item.Fields["session"] = entry.SessionId;
            item.Fields["size"] = FormatSize(entry.SizeBytes);

            if (entry.GitBranch.Length > 0)
            {
                item.Fields["branch"] = entry.GitBranch;
            }

            if (entry.CliVersion.Length > 0)
            {
                item.Fields["cliVersion"] = entry.CliVersion;
            }

            return item;
        }

        /// <summary>时间按本机时区显示：用户看的是自己的钟。</summary>
        internal static string FormatLocalTime(DateTime utc)
        {
            DateTime local = utc.Kind == DateTimeKind.Utc ? utc.ToLocalTime() : utc;
            string text = local.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
            return text;
        }

        internal static string FormatSize(long bytes)
        {
            if (bytes < 1024)
            {
                return bytes.ToString(CultureInfo.InvariantCulture) + " B";
            }

            if (bytes < 1024 * 1024)
            {
                return (bytes / 1024d).ToString("0.#", CultureInfo.InvariantCulture) + " KB";
            }

            return (bytes / (1024d * 1024d)).ToString("0.#", CultureInfo.InvariantCulture) + " MB";
        }

        #endregion
    }
}
