// 读 CLI 自己登记的「正开着的会话」

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 列出进程还活着的会话 id。
    /// </summary>
    /// <remarks>CLI 每个进程写一份 <c>~/.claude/sessions/&lt;PID&gt;.json</c>，含 sessionId。</remarks>
    public static class LiveSessionRegistry
    {
        #region 取数

        /// <summary>登记目录，即 <c>~/.claude/sessions</c>。</summary>
        public static string DefaultRoot()
        {
            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string root = Path.Combine(home, ".claude", "sessions");
            return root;
        }

        /// <summary>读出进程还活着的会话 id；目录读不了给空集。</summary>
        public static HashSet<string> ReadLiveSessionIds(string root)
        {
            var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            string[] files;

            try
            {
                if (string.IsNullOrEmpty(root) || !Directory.Exists(root))
                {
                    return ids;
                }

                files = Directory.GetFiles(root, "*.json");
            }
            catch (IOException)
            {
                return ids;
            }
            catch (UnauthorizedAccessException)
            {
                return ids;
            }

            foreach (string file in files)
            {
                int pid;

                if (!int.TryParse(Path.GetFileNameWithoutExtension(file), NumberStyles.None, CultureInfo.InvariantCulture, out pid)
                    || !IsAlive(pid))
                {
                    continue;
                }

                string id = ReadSessionId(file);

                if (id.Length > 0)
                {
                    ids.Add(id);
                }
            }

            return ids;
        }

        /// <summary>从一份登记 JSON 里取 sessionId；取不到给空串。</summary>
        public static string ParseSessionId(string json)
        {
            try
            {
                using (JsonDocument document = JsonDocument.Parse(json ?? string.Empty))
                {
                    if (document.RootElement.ValueKind == JsonValueKind.Object
                        && document.RootElement.TryGetProperty("sessionId", out JsonElement value)
                        && value.ValueKind == JsonValueKind.String)
                    {
                        string id = value.GetString() ?? string.Empty;
                        return id;
                    }
                }
            }
            catch (JsonException)
            {
            }

            return string.Empty;
        }

        #endregion

        #region 内部

        /// <summary>读文件再解析。</summary>
        private static string ReadSessionId(string file)
        {
            try
            {
                string id = ParseSessionId(File.ReadAllText(file));
                return id;
            }
            catch (IOException)
            {
                return string.Empty;
            }
            catch (UnauthorizedAccessException)
            {
                return string.Empty;
            }
        }

        /// <summary>进程是否还在。</summary>
        private static bool IsAlive(int pid)
        {
            try
            {
                using (Process process = Process.GetProcessById(pid))
                {
                    bool alive = !process.HasExited;
                    return alive;
                }
            }
            catch (ArgumentException)
            {
                return false;
            }
            catch (InvalidOperationException)
            {
                return false;
            }
            catch (Win32Exception)
            {
                // 别人的进程查不了退出状态，按活着算，宁可少接一条
                return true;
            }
        }

        #endregion
    }
}
