// 本扩展自己的会话存档清单

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 存档＝从默认列表收起，不删不改转录。清单是一份会话 id 数组。
    /// </summary>
    /// <remarks>CLI 没有存档概念，终端 <c>claude --resume</c> 里照样能看到。</remarks>
    public class SessionArchiveStore
    {
        #region 字段与构造

        private static readonly object Gate = new object();

        private readonly string _filePath;

        /// <summary>按指定文件读写。</summary>
        public SessionArchiveStore(string filePath)
        {
            _filePath = filePath ?? string.Empty;
        }

        /// <summary>默认落点：<c>%LocalAppData%\AgentExtension\archived-sessions.json</c>。</summary>
        public static string DefaultFilePath()
        {
            string root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string path = Path.Combine(root, "AgentExtension", "archived-sessions.json");
            return path;
        }

        #endregion

        #region 读写

        /// <summary>读出已存档的 id；没有或读坏给空集，绝不抛。</summary>
        public HashSet<string> ReadIds()
        {
            lock (Gate)
            {
                HashSet<string> ids = ReadCore();
                return ids;
            }
        }

        /// <summary>存档或取消存档；写盘失败抛 IOException。</summary>
        public void SetArchived(string sessionId, bool archived)
        {
            string id = (sessionId ?? string.Empty).Trim();

            if (id.Length == 0)
            {
                throw new ArgumentException("会话 id 为空。", nameof(sessionId));
            }

            lock (Gate)
            {
                HashSet<string> ids = ReadCore();
                bool changed = archived ? ids.Add(id) : ids.Remove(id);

                if (!changed)
                {
                    return;
                }

                WriteCore(ids);
            }
        }

        #endregion

        #region 内部

        private HashSet<string> ReadCore()
        {
            var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (_filePath.Length == 0 || !File.Exists(_filePath))
            {
                return ids;
            }

            try
            {
                string text = File.ReadAllText(_filePath, Encoding.UTF8);

                using (JsonDocument document = JsonDocument.Parse(text))
                {
                    if (document.RootElement.ValueKind != JsonValueKind.Array)
                    {
                        return ids;
                    }

                    foreach (JsonElement item in document.RootElement.EnumerateArray())
                    {
                        string value = item.ValueKind == JsonValueKind.String
                            ? (item.GetString() ?? string.Empty).Trim()
                            : string.Empty;

                        if (value.Length > 0)
                        {
                            ids.Add(value);
                        }
                    }
                }
            }
            catch (JsonException)
            {
                // 读坏当没有：会话面板不能因此打不开
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }

            return ids;
        }

        private void WriteCore(HashSet<string> ids)
        {
            try
            {
                string directory = Path.GetDirectoryName(_filePath) ?? string.Empty;

                if (directory.Length > 0 && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                List<string> sorted = ids.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
                string json = JsonSerializer.Serialize(sorted, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json, new UTF8Encoding(false));
            }
            catch (UnauthorizedAccessException ex)
            {
                throw new IOException($"存档清单写不进去：{ex.Message}", ex);
            }
        }

        #endregion
    }
}
