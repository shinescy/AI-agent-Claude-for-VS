// 从 CLI 的转录文件尾部读出历史，折成可回放的事件序列

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
    /// <summary>
    /// 把一份转录（<c>~/.claude/projects/&lt;编码目录&gt;/&lt;会话 id&gt;.jsonl</c>）
    /// 折成可以喂给前端 replay 的事件序列。
    ///
    /// 只读尾部：实测同一目录下存在 91.4 MB 的转录，整读会把 VS 拖住。
    /// </summary>
    public static class TranscriptReplayReader
    {
        #region 常量

        /// <summary>从尾部最多读这么多字节。</summary>
        public const int DefaultByteBudget = 512 * 1024;

        /// <summary>最多回放这么多条记录。</summary>
        public const int DefaultMaxRecords = 200;

        #endregion

        #region 尾部读取

        /// <summary>从文件尾部读出若干整行，超预算时丢掉开头那半行。</summary>
        internal static IReadOnlyList<string> ReadTailLines(string filePath, int byteBudget, int maxRecords)
        {
            bool dropped;
            IReadOnlyList<string> lines = ReadTailLines(filePath, byteBudget, maxRecords, out dropped);
            return lines;
        }

        /// <summary>同上，另外报告有没有因为预算或条数上限而丢掉前面的内容。</summary>
        internal static IReadOnlyList<string> ReadTailLines(
            string filePath, int byteBudget, int maxRecords, out bool dropped)
        {
            var result = new List<string>();
            dropped = false;

            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
            {
                return result;
            }

            byte[] buffer;
            bool seeked;

            using (var stream = new FileStream(
                filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                long length = stream.Length;
                long start = length > byteBudget ? length - byteBudget : 0;
                seeked = start > 0;

                stream.Seek(start, SeekOrigin.Begin);

                int size = (int)(length - start);
                buffer = new byte[size];

                int read = 0;

                while (read < size)
                {
                    int chunk = stream.Read(buffer, read, size - read);

                    if (chunk <= 0)
                    {
                        break;
                    }

                    read += chunk;
                }

                if (read < size)
                {
                    Array.Resize(ref buffer, read);
                }
            }

            string text = Encoding.UTF8.GetString(buffer);
            string[] lines = text.Split('\n');

            // 从中间切进去的话，第一行是残缺的——UTF-8 多字节字符被切开产生的替换字符
            // 也落在这一行里，丢掉它两个问题一起解决。
            int first = seeked ? 1 : 0;

            for (int i = first; i < lines.Length; i++)
            {
                string line = lines[i].Trim();

                if (line.Length > 0)
                {
                    result.Add(line);
                }
            }

            if (result.Count > maxRecords)
            {
                result.RemoveRange(0, result.Count - maxRecords);
                dropped = true;
            }

            // 从中间切进去过，说明前面还有内容没读。
            dropped = dropped || seeked;

            return result;
        }

        #endregion

        #region 映射

        /// <summary>单条工具结果最多回放这么多字符。</summary>
        private const int ToolResultLimit = 2048;

        /// <summary>不该回放的簿记记录类型，实测自真转录。跳过它们不算「认不出」。</summary>
        private static readonly HashSet<string> BookkeepingTypes = new HashSet<string>(StringComparer.Ordinal)
        {
            "system", "queue-operation", "attachment", "mode", "last-prompt", "atis-latch",
            "summary", "file-history-snapshot", "file-history-delta",
            "api-request", "api-request-blob", "api-request-shape",
            "permission-mode", "session-owner", "ai-title", "tools-used",
            "cost-state", "bridge-session"
        };

        /// <summary>按默认预算读一份转录。</summary>
        public static TranscriptReplayResult Read(string filePath)
        {
            TranscriptReplayResult result = Read(filePath, DefaultByteBudget, DefaultMaxRecords);
            return result;
        }

        /// <summary>读一份转录并折成事件序列。</summary>
        public static TranscriptReplayResult Read(string filePath, int byteBudget, int maxRecords)
        {
            var result = new TranscriptReplayResult();
            var events = new List<AgentEvent>();
            int unknown = 0;

            // 被当成探测丢掉的那些用户记录的 uuid：CLI 对它们的回话（「No response requested.」）
            // 要跟着一起丢。按 parentUuid 认亲，不匹配那句英文——它随 CLI 版本和语言会变。
            var probeUuids = new HashSet<string>(StringComparer.Ordinal);

            bool dropped;
            IReadOnlyList<string> lines = ReadTailLines(filePath, byteBudget, maxRecords, out dropped);

            foreach (string line in lines)
            {
                JsonElement root;

                if (!TranscriptJson.TryParse(line, out root))
                {
                    unknown++;
                    continue;
                }

                if (IsTrue(root, "isSidechain"))
                {
                    // 子代理的内部往来。回放出来只会淹没主线。
                    continue;
                }

                string type = TranscriptJson.ReadString(root, "type");

                if (type == "assistant")
                {
                    string parentUuid = TranscriptJson.ReadString(root, "parentUuid");

                    if (parentUuid.Length > 0 && probeUuids.Contains(parentUuid))
                    {
                        continue;
                    }

                    int assistantStart = events.Count;
                    MapAssistant(root, events);
                    StampFrom(root, events, assistantStart);
                    continue;
                }

                if (type == "system" && TranscriptJson.ReadString(root, "subtype") == "compact_boundary")
                {
                    int boundaryStart = events.Count;
                    events.Add(AgentEvent.Compaction(ReadBoundary(root)));
                    StampFrom(root, events, boundaryStart);
                    continue;
                }

                if (type == "user" && CompactSummaryReader.IsSummaryRecord(root))
                {
                    // 摘要是给模型的，不是用户说的话；挂到压缩块上
                    events.Add(AgentEvent.Compaction(new AgentCompaction
                    {
                        Phase = AgentCompaction.PhaseSummary,
                        BoundaryUuid = TranscriptJson.ReadString(root, "parentUuid"),
                        Summary = CompactSummaryReader.ReadText(root)
                    }));
                    continue;
                }

                if (type == "user")
                {
                    if (IsProbeRecord(root))
                    {
                        string uuid = TranscriptJson.ReadString(root, "uuid");

                        if (uuid.Length > 0)
                        {
                            probeUuids.Add(uuid);
                        }

                        continue;
                    }

                    int userStart = events.Count;
                    MapUser(root, events);
                    StampFrom(root, events, userStart);
                    continue;
                }

                if (BookkeepingTypes.Contains(type))
                {
                    continue;
                }

                unknown++;
            }

            result.Events = events;
            result.UnknownRecords = unknown;

            // 只在**真的**丢掉了前面的内容时才说「只回放最近的一段」。
            // 拿「行数正好等于上限」来推断会误报，而误报等于对用户说了句没发生的事。
            result.Truncated = dropped;
            return result;
        }

        /// <summary>转录里的压缩分界记录折成「压缩完成」。</summary>
        private static AgentCompaction ReadBoundary(JsonElement root)
        {
            root.TryGetProperty("compactMetadata", out JsonElement metadata);

            var data = new AgentCompaction
            {
                Phase = AgentCompaction.PhaseCompleted,
                Trigger = ReadMetadataString(metadata, "trigger"),
                PreTokens = ReadMetadataLong(metadata, "preTokens"),
                PostTokens = ReadMetadataLong(metadata, "postTokens"),
                DurationMs = ReadMetadataLong(metadata, "durationMs"),
                BoundaryUuid = TranscriptJson.ReadString(root, "uuid")
            };

            return data;
        }

        /// <summary>读 compactMetadata 里的字符串。</summary>
        private static string ReadMetadataString(JsonElement metadata, string name)
        {
            string value = metadata.ValueKind == JsonValueKind.Object
                ? TranscriptJson.ReadString(metadata, name)
                : string.Empty;
            return value;
        }

        /// <summary>读 compactMetadata 里的整数，不是数字给 0。</summary>
        private static long ReadMetadataLong(JsonElement metadata, string name)
        {
            if (metadata.ValueKind != JsonValueKind.Object
                || !metadata.TryGetProperty(name, out JsonElement value)
                || value.ValueKind != JsonValueKind.Number)
            {
                return 0;
            }

            long number = value.TryGetInt64(out long parsed) ? parsed : 0;
            return number;
        }

        /// <summary>
        /// 这条用户记录是不是面板自己发的探测（<c>/model</c> <c>/effort</c> <c>/usage</c>）。
        ///
        /// 判定放在读取循环里而不是 <see cref="AddUserText"/> 里，是因为只有这一层拿得到
        /// 记录的 uuid——CLI 对探测的回话要靠它认亲才能一起丢掉。
        /// </summary>
        private static bool IsProbeRecord(JsonElement root)
        {
            JsonElement content;

            if (!TryGetContent(root, out content))
            {
                return false;
            }

            if (content.ValueKind == JsonValueKind.String)
            {
                bool probe = IsProbeText(content.GetString() ?? string.Empty);
                return probe;
            }

            if (content.ValueKind != JsonValueKind.Array)
            {
                return false;
            }

            // 命令记录实测只有一个 text 块；只要其中出现探测命令就整条算探测。
            foreach (JsonElement block in content.EnumerateArray())
            {
                if (block.ValueKind != JsonValueKind.Object
                    || TranscriptJson.ReadString(block, "type") != "text")
                {
                    continue;
                }

                if (IsProbeText(TranscriptJson.ReadString(block, "text")))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool IsProbeText(string text)
        {
            string trimmed = (text ?? string.Empty).Trim();

            if (trimmed.Length == 0 || trimmed[0] != '<')
            {
                // 用户自己打出来的话，哪怕以斜杠开头也不是探测。
                return false;
            }

            Match match = TranscriptJson.CommandName.Match(trimmed);

            if (!match.Success)
            {
                return false;
            }

            bool probe = AgentProbeCommands.IsProbe(match.Groups["name"].Value);
            return probe;
        }

        private static void MapAssistant(JsonElement root, List<AgentEvent> events)
        {
            JsonElement content;

            if (!TryGetContent(root, out content) || content.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            foreach (JsonElement block in content.EnumerateArray())
            {
                if (block.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                string kind = TranscriptJson.ReadString(block, "type");

                if (kind == "text")
                {
                    string text = TranscriptJson.ReadString(block, "text");

                    if (text.Length > 0)
                    {
                        events.Add(AgentEvent.Text(text));
                    }

                    continue;
                }

                if (kind == "thinking")
                {
                    string thinking = TranscriptJson.ReadString(block, "thinking");

                    if (thinking.Length > 0)
                    {
                        events.Add(AgentEvent.ThinkingText(thinking));
                    }

                    continue;
                }

                if (kind != "tool_use")
                {
                    continue;
                }

                var call = new AgentToolCall
                {
                    ToolUseId = TranscriptJson.ReadString(block, "id"),
                    Name = TranscriptJson.ReadString(block, "name"),
                    InputJson = ReadRawJson(block, "input")
                };

                events.Add(AgentEvent.ToolStarted(call));
            }

            AddUsage(root, events);
        }

        /// <summary>记录的时刻，Unix 毫秒；没有或认不出给 0。</summary>
        private static long ReadRecordTime(JsonElement root)
        {
            long atUnixMs = 0L;
            string stamp = TranscriptJson.ReadString(root, "timestamp");

            if (DateTimeOffset.TryParse(
                stamp, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out DateTimeOffset at))
            {
                atUnixMs = at.ToUnixTimeMilliseconds();
            }

            return atUnixMs;
        }

        /// <summary>这条记录折出来的事件都记上记录的时刻。</summary>
        private static void StampFrom(JsonElement root, List<AgentEvent> events, int start)
        {
            long atUnixMs = ReadRecordTime(root);

            if (atUnixMs == 0)
            {
                return;
            }

            for (int i = start; i < events.Count; i++)
            {
                events[i].StampIfMissing(atUnixMs);
            }
        }

        /// <summary>补一条带时刻的用量，界面靠它算缓存还剩多久。</summary>
        private static void AddUsage(JsonElement root, List<AgentEvent> events)
        {
            if (!root.TryGetProperty("message", out JsonElement message))
            {
                return;
            }

            long atUnixMs = ReadRecordTime(root);

            AgentUsage? usage = AgentUsage.FromMessage(message, atUnixMs);

            if (usage != null)
            {
                events.Add(AgentEvent.Usage(usage));
            }
        }

        private static void MapUser(JsonElement root, List<AgentEvent> events)
        {
            if (IsTrue(root, "isMeta"))
            {
                return;
            }

            JsonElement content;

            if (!TryGetContent(root, out content))
            {
                return;
            }

            if (content.ValueKind == JsonValueKind.String)
            {
                AddUserText(content.GetString() ?? string.Empty, events);
                return;
            }

            if (content.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            // 子代理结束时 CLI 在这里附上耗时与 token 数。
            root.TryGetProperty("toolUseResult", out JsonElement stats);

            foreach (JsonElement block in content.EnumerateArray())
            {
                if (block.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                string kind = TranscriptJson.ReadString(block, "type");

                if (kind == "text")
                {
                    AddUserText(TranscriptJson.ReadString(block, "text"), events);
                    continue;
                }

                if (kind != "tool_result")
                {
                    continue;
                }

                var call = new AgentToolCall
                {
                    ToolUseId = TranscriptJson.ReadString(block, "tool_use_id"),
                    ResultText = Truncate(ReadToolResultText(block)),
                    IsError = IsTrue(block, "is_error"),
                    DurationMs = ReadLong(stats, "totalDurationMs"),
                    TotalTokens = ReadLong(stats, "totalTokens")
                };

                events.Add(AgentEvent.ToolCompleted(call));
            }
        }

        /// <summary>用户那一句：命令记录取命令名，其余带尖括号的包装体一律跳过。</summary>
        private static void AddUserText(string text, List<AgentEvent> events)
        {
            string trimmed = (text ?? string.Empty).Trim();

            if (trimmed.Length == 0)
            {
                return;
            }

            if (trimmed[0] != '<')
            {
                events.Add(AgentEvent.UserPromptText(trimmed));
                return;
            }

            Match match = TranscriptJson.CommandName.Match(trimmed);

            if (!match.Success)
            {
                // <local-command-caveat> 之类的包装体，不是用户说的话。
                return;
            }

            events.Add(AgentEvent.UserPromptText("/" + match.Groups["name"].Value));
        }

        private static string ReadToolResultText(JsonElement block)
        {
            JsonElement content;

            if (!block.TryGetProperty("content", out content))
            {
                return string.Empty;
            }

            if (content.ValueKind == JsonValueKind.String)
            {
                string text = content.GetString() ?? string.Empty;
                return text;
            }

            if (content.ValueKind != JsonValueKind.Array)
            {
                return string.Empty;
            }

            var builder = new StringBuilder();

            foreach (JsonElement piece in content.EnumerateArray())
            {
                if (piece.ValueKind != JsonValueKind.Object || TranscriptJson.ReadString(piece, "type") != "text")
                {
                    continue;
                }

                if (builder.Length > 0)
                {
                    builder.Append('\n');
                }

                builder.Append(TranscriptJson.ReadString(piece, "text"));
            }

            string joined = builder.ToString();
            return joined;
        }

        private static string Truncate(string text)
        {
            string value = text ?? string.Empty;

            if (value.Length <= ToolResultLimit)
            {
                return value;
            }

            string cut = value.Substring(0, ToolResultLimit) + "\n…（已截断，完整内容见转录文件）";
            return cut;
        }

        #endregion

        #region 说明文案

        /// <summary>回放结尾那条说明。</summary>
        public static AgentEvent ClosingNotice(int unknownRecords)
        {
            if (unknownRecords <= 0)
            {
                return AgentEvent.Notice(NoticeText.ReplayClosing);
            }

            AgentEvent notice = AgentEvent.Notice(
                NoticeText.ReplayClosingWithUnknown,
                NoticeText.Args("n", unknownRecords.ToString(CultureInfo.InvariantCulture)));

            return notice;
        }

        #endregion

        #region JSON 辅助

        private static bool TryGetContent(JsonElement root, out JsonElement content)
        {
            content = default(JsonElement);

            JsonElement message;

            if (!root.TryGetProperty("message", out message) || message.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            bool found = message.TryGetProperty("content", out content);
            return found;
        }

        /// <summary>读长整数字段，缺失或类型不对为 0。</summary>
        private static long ReadLong(JsonElement root, string name)
        {
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty(name, out JsonElement value)
                || value.ValueKind != JsonValueKind.Number)
            {
                return 0L;
            }

            long number = value.TryGetInt64(out long parsed) ? parsed : 0L;
            return number;
        }

        private static string ReadRawJson(JsonElement root, string name)
        {
            JsonElement value;

            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(name, out value))
            {
                return string.Empty;
            }

            string raw = value.GetRawText();
            return raw;
        }

        private static bool IsTrue(JsonElement root, string name)
        {
            if (root.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            JsonElement value;

            if (!root.TryGetProperty(name, out value))
            {
                return false;
            }

            bool flag = value.ValueKind == JsonValueKind.True;
            return flag;
        }

        #endregion
    }
}
