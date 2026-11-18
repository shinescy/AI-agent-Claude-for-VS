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

        /// <summary>文件头至少读这么多字符。</summary>
        public const int HeadBytes = 96 * 1024;

        /// <summary>找首条提问时最多读到这里。</summary>
        public const int PromptScanLimit = 4 * 1024 * 1024;

        /// <summary>找 CLI 标题时从尾部读的字节数。</summary>
        public const int TitleTailBytes = 256 * 1024;

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
            bool complete;
            IReadOnlyList<string> lines = ReadHeadLines(filePath, out complete);

            var entry = new SessionHistoryEntry
            {
                SessionId = Path.GetFileNameWithoutExtension(filePath),
                LastActivityUtc = info.LastWriteTimeUtc,
                SizeBytes = info.Length
            };

            FillFromLines(entry, lines);
            entry.CliTitle = CliTitleFromLines(lines.Concat(
                TranscriptReplayReader.ReadTailLines(filePath, TitleTailBytes, int.MaxValue)).ToList());

            // 没读完不能断定没提问；有 CLI 标题说明真聊过——但前提是有对话行。
            // 实测（2026-11-18）：有的转录只有 ai-title / agent-name 两行，CLI 报 No conversation found。
            if (!complete || (entry.CliTitle.Length > 0 && entry.HasConversation))
            {
                entry.ProbeOnly = false;
            }

            return entry;
        }

        /// <summary>只读 CLI 标题，头尾各扫一遍。</summary>
        public static string ReadCliTitle(string filePath)
        {
            IReadOnlyList<string> head = ReadHeadLines(filePath);
            IReadOnlyList<string> tail = TranscriptReplayReader.ReadTailLines(filePath, TitleTailBytes, int.MaxValue);
            string title = CliTitleFromLines(head.Concat(tail).ToList());
            return title;
        }

        /// <summary>从若干行里取 CLI 标题。</summary>
        public static string CliTitleFromLines(IReadOnlyList<string> lines)
        {
            string custom = string.Empty;
            string ai = string.Empty;

            foreach (string line in lines)
            {
                JsonElement root;
                bool isCustom;
                string title;

                if (!TranscriptJson.TryParse(line, out root) || !TryReadCliTitle(root, out isCustom, out title))
                {
                    continue;
                }

                if (isCustom)
                {
                    custom = title;
                }
                else
                {
                    ai = title;
                }
            }

            string chosen = custom.Length > 0 ? custom : ai;
            return chosen;
        }

        /// <summary>这一行是不是 CLI 写的标题记录。</summary>
        public static bool TryReadCliTitle(JsonElement root, out bool isCustom, out string title)
        {
            string type = TranscriptJson.ReadString(root, "type");
            isCustom = type == "custom-title";
            title = string.Empty;

            if (!isCustom && type != "ai-title")
            {
                return false;
            }

            title = Condense(TranscriptJson.ReadString(root, isCustom ? "customTitle" : "aiTitle"));
            bool has = title.Length > 0;
            return has;
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

                if (!entry.HasConversation)
                {
                    string type = TranscriptJson.ReadString(root, "type");
                    entry.HasConversation = type == "user" || type == "assistant";
                }

                if (firstPrompt.Length > 0)
                {
                    continue;
                }

                string text = ReadUserMessageText(root);

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

        /// <summary>非 isMeta 的用户消息正文；不是则为空串。</summary>
        private static string ReadUserMessageText(JsonElement root)
        {
            if (TranscriptJson.ReadString(root, "type") != "user")
            {
                return string.Empty;
            }

            if (root.TryGetProperty("isMeta", out JsonElement meta)
                && meta.ValueKind == JsonValueKind.True)
            {
                return string.Empty;
            }

            string text = TranscriptJson.ReadUserText(root);
            return text;
        }

        /// <summary>这一行是不是用户亲口说的话（不是命令、不是元信息）。</summary>
        private static bool IsRealPrompt(string line)
        {
            JsonElement root;

            if (!TranscriptJson.TryParse(line, out root))
            {
                return false;
            }

            string text = ReadUserMessageText(root);
            bool real = text.Length > 0 && text[0] != '<';
            return real;
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
            bool complete;
            IReadOnlyList<string> lines = ReadHeadLines(filePath, out complete);
            return lines;
        }

        /// <summary>读文件头直到见到真实提问；complete 表示读到了文件末尾。</summary>
        private static IReadOnlyList<string> ReadHeadLines(string filePath, out bool complete)
        {
            // 上限只管耗时，不能当结论：没读完的部分不等于没有
            var result = new List<string>();
            long consumed = 0;
            bool seenPrompt = false;
            complete = false;

            using (var stream = new FileStream(
                filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (var reader = new StreamReader(stream, Encoding.UTF8))
            {
                string? raw;

                while ((raw = reader.ReadLine()) != null)
                {
                    consumed += raw.Length + 1;
                    string line = raw.Trim();

                    if (line.Length > 0)
                    {
                        result.Add(line);
                        seenPrompt = seenPrompt || IsRealPrompt(line);
                    }

                    if (consumed >= PromptScanLimit || (consumed >= HeadBytes && seenPrompt))
                    {
                        break;
                    }
                }

                complete = reader.EndOfStream;
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
                Title = PanelTitle(entry),
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

        /// <summary>面板标题：CLI 标题优先，与 claude --resume 一致。</summary>
        internal static string PanelTitle(SessionHistoryEntry entry)
        {
            if (entry.CliTitle.Length > 0)
            {
                return entry.CliTitle;
            }

            if (entry.Title.Length > 0)
            {
                return entry.Title;
            }

            string placeholder = entry.ProbeOnly ? "（没有提问）" : "（未读到标题）";
            return placeholder;
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
