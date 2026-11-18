// 压缩摘要：从转录记录里取正文

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>读压缩摘要；管道里不保证带，转录里一定有。</summary>
    public static class CompactSummaryReader
    {
        #region 常量

        /// <summary>只读转录末尾这么多字节：摘要紧跟在压缩之后。</summary>
        private const int TailBytes = 4 * 1024 * 1024;

        #endregion

        #region 判定与取文

        /// <summary>这条用户记录是不是压缩摘要（转录与管道两种写法）。</summary>
        public static bool IsSummaryRecord(JsonElement root)
        {
            bool summary = IsTrue(root, "isCompactSummary") || IsTrue(root, "is_compact_summary");
            return summary;
        }

        /// <summary>取 message.content 里的全部文字。</summary>
        public static string ReadText(JsonElement root)
        {
            if (!root.TryGetProperty("message", out JsonElement message)
                || message.ValueKind != JsonValueKind.Object
                || !message.TryGetProperty("content", out JsonElement content))
            {
                return string.Empty;
            }

            if (content.ValueKind == JsonValueKind.String)
            {
                string single = content.GetString() ?? string.Empty;
                return single;
            }

            if (content.ValueKind != JsonValueKind.Array)
            {
                return string.Empty;
            }

            var builder = new StringBuilder();

            foreach (JsonElement block in content.EnumerateArray())
            {
                if (block.ValueKind != JsonValueKind.Object
                    || !block.TryGetProperty("type", out JsonElement type)
                    || type.ValueKind != JsonValueKind.String
                    || type.GetString() != "text"
                    || !block.TryGetProperty("text", out JsonElement text)
                    || text.ValueKind != JsonValueKind.String)
                {
                    continue;
                }

                if (builder.Length > 0)
                {
                    builder.Append("\n\n");
                }

                builder.Append(text.GetString());
            }

            string joined = builder.ToString();
            return joined;
        }

        #endregion

        #region 从转录找

        /// <summary>
        /// 在转录末尾找某次压缩的摘要；找不到给空串。
        /// <paramref name="allowLatest"/> 为真时认不出分界就退回最后一条摘要。
        /// </summary>
        public static string Find(string transcriptPath, string boundaryUuid, bool allowLatest)
        {
            if (string.IsNullOrEmpty(transcriptPath) || !File.Exists(transcriptPath))
            {
                return string.Empty;
            }

            string latest = string.Empty;

            foreach (string line in ReadTail(transcriptPath))
            {
                if (line.IndexOf("ompact", StringComparison.Ordinal) < 0)
                {
                    continue;
                }

                JsonElement root;

                if (!TranscriptJson.TryParse(line, out root) || !IsSummaryRecord(root))
                {
                    continue;
                }

                string text = ReadText(root);

                if (boundaryUuid.Length > 0
                    && string.Equals(TranscriptJson.ReadString(root, "parentUuid"), boundaryUuid, StringComparison.Ordinal))
                {
                    return text;
                }

                latest = text;
            }

            string fallback = allowLatest ? latest : string.Empty;
            return fallback;
        }

        /// <summary>按行读出文件末尾一段；第一行可能被截断，丢掉。</summary>
        private static List<string> ReadTail(string path)
        {
            var lines = new List<string>();

            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                long start = Math.Max(0, stream.Length - TailBytes);
                stream.Seek(start, SeekOrigin.Begin);

                using (var reader = new StreamReader(stream, Encoding.UTF8))
                {
                    if (start > 0)
                    {
                        reader.ReadLine();
                    }

                    string? line;

                    while ((line = reader.ReadLine()) != null)
                    {
                        if (line.Length > 0)
                        {
                            lines.Add(line);
                        }
                    }
                }
            }

            return lines;
        }

        #endregion

        #region JSON 读取

        /// <summary>字段为 true 才算真。</summary>
        private static bool IsTrue(JsonElement root, string name)
        {
            bool flag = root.ValueKind == JsonValueKind.Object
                && root.TryGetProperty(name, out JsonElement value)
                && value.ValueKind == JsonValueKind.True;
            return flag;
        }

        #endregion
    }
}
