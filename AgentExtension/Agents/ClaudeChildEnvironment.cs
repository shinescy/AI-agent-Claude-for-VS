using System;
using System.Collections.Generic;
using System.Text;

namespace AgentExtension.Agents
{
    /// <summary>决定交给 claude 子进程的环境变量。</summary>
    public static class ClaudeChildEnvironment
    {
        #region 名单

        private static readonly string[] SessionMarkers =
        {
            "CLAUDECODE",
            "CLAUDE_CODE_SESSION_ID",
            "CLAUDE_CODE_CHILD_SESSION",
        };

        private static readonly string[] SessionKeys =
        {
            "AI_AGENT",
            "CLAUDECODE",
            "CLAUDE_CODE_BRIDGE_SESSION_ID",
            "CLAUDE_CODE_CHILD_SESSION",
            "CLAUDE_CODE_ENTRYPOINT",
            "CLAUDE_CODE_MESSAGING_SOCKET",
            "CLAUDE_CODE_MESSAGING_TOKEN",
            "CLAUDE_CODE_SESSION_ID",
            "CLAUDE_PID",
        };

        private static readonly string[] ColorKeys =
        {
            "NO_COLOR",
            "FORCE_COLOR",
        };

        #endregion

        #region 判定与清理

        /// <summary>这份环境是不是从一个 claude 会话里继承来的。</summary>
        public static bool LaunchedFromAgentSession(IDictionary<string, string> inherited)
        {
            if (inherited == null)
            {
                return false;
            }

            foreach (string marker in SessionMarkers)
            {
                if (Find(inherited, marker) != null)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>列出该从继承来的环境里摘掉的键（返回的是**这份环境里真实存在的那些键**， 大小写按它自己的写法，方便调用方直接 Remove）。</summary>
        public static IList<string> KeysToDrop(IDictionary<string, string> inherited)
        {
            var dropped = new List<string>();

            if (inherited == null)
            {
                return dropped;
            }

            bool fromAgent = LaunchedFromAgentSession(inherited);

            foreach (string key in SessionKeys)
            {
                string? actual = Find(inherited, key);

                if (actual != null)
                {
                    dropped.Add(actual);
                }
            }

            if (fromAgent)
            {
                foreach (string key in ColorKeys)
                {
                    string? actual = Find(inherited, key);

                    if (actual != null)
                    {
                        dropped.Add(actual);
                    }
                }
            }

            return dropped;
        }

        /// <summary>清理过的一份环境。</summary>
        public static IDictionary<string, string> Sanitize(IDictionary<string, string> inherited)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            if (inherited == null)
            {
                return result;
            }

            var drop = new HashSet<string>(KeysToDrop(inherited), StringComparer.OrdinalIgnoreCase);

            foreach (KeyValuePair<string, string> pair in inherited)
            {
                if (!drop.Contains(pair.Key))
                {
                    result[pair.Key] = pair.Value;
                }
            }

            return result;
        }

        /// <summary>当前进程的环境，键按 Windows 的规矩大小写不敏感。</summary>
        public static IDictionary<string, string> Current()
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            foreach (System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables())
            {
                string key = Convert.ToString(entry.Key) ?? string.Empty;

                if (key.Length > 0)
                {
                    result[key] = Convert.ToString(entry.Value) ?? string.Empty;
                }
            }

            return result;
        }

        #endregion

        #region 环境块

        /// <summary>拼成 CreateProcessW 要的那种环境块：<c>K=V\0K=V\0\0</c>。</summary>
        public static string BuildBlock(IDictionary<string, string> environment)
        {
            var keys = new List<string>();

            if (environment != null)
            {
                foreach (KeyValuePair<string, string> pair in environment)
                {
                    if (!string.IsNullOrEmpty(pair.Key) && pair.Key.IndexOf('=') < 0)
                    {
                        keys.Add(pair.Key);
                    }
                }
            }

            keys.Sort(StringComparer.OrdinalIgnoreCase);

            var builder = new StringBuilder();

            foreach (string key in keys)
            {
                builder.Append(key).Append('=').Append(environment![key] ?? string.Empty).Append('\0');
            }

            // 空环境也得有个结束符，否则 CreateProcess 读到的是一段没有终止的内存。
            builder.Append('\0');

            return builder.ToString();
        }

        #endregion

        #region 内部

        private static string? Find(IDictionary<string, string> environment, string key)
        {
            foreach (KeyValuePair<string, string> pair in environment)
            {
                if (string.Equals(pair.Key, key, StringComparison.OrdinalIgnoreCase))
                {
                    return pair.Key;
                }
            }

            return null;
        }

        #endregion
    }
}
