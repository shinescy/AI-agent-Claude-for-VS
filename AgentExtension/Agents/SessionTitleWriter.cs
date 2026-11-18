// 给会话改名：往转录追加一行 custom-title

using System.IO;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 与 CLI <c>/rename</c> 写同一种行，终端 <c>claude --resume</c> 与 tab 名都认它。
    /// </summary>
    /// <remarks>只追加，绝不重写已有内容。</remarks>
    public static class SessionTitleWriter
    {
        #region 写入

        /// <summary>追加一行 custom-title。转录不存在抛 FileNotFoundException。</summary>
        public static void AppendCustomTitle(string transcriptPath, string sessionId, string title)
        {
            if (string.IsNullOrEmpty(transcriptPath) || !File.Exists(transcriptPath))
            {
                throw new FileNotFoundException("找不到这条会话的转录文件。", transcriptPath);
            }

            string line = BuildLine(sessionId, title);
            bool needsBreak = !EndsWithNewline(transcriptPath);
            string text = (needsBreak ? "\n" : string.Empty) + line + "\n";

            using (var stream = new FileStream(transcriptPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
            {
                byte[] bytes = new UTF8Encoding(false).GetBytes(text);
                stream.Write(bytes, 0, bytes.Length);
            }
        }

        /// <summary>一行 JSON，键序与 CLI 一致。</summary>
        public static string BuildLine(string sessionId, string title)
        {
            var options = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

            var payload = new
            {
                type = "custom-title",
                customTitle = (title ?? string.Empty).Trim(),
                sessionId = sessionId ?? string.Empty
            };

            string line = JsonSerializer.Serialize(payload, options);
            return line;
        }

        #endregion

        #region 内部

        /// <summary>空文件也算以换行结尾。</summary>
        private static bool EndsWithNewline(string path)
        {
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                if (stream.Length == 0)
                {
                    return true;
                }

                stream.Seek(-1, SeekOrigin.End);
                bool ends = stream.ReadByte() == '\n';
                return ends;
            }
        }

        #endregion
    }
}
