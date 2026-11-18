using System;
using System.IO;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>读取 CLI 的自动压缩开关；null 表示这次没读到。</summary>
    public static class AutoCompactSetting
    {
        #region 解析

        /// <summary>按配置文本与环境变量判断；文本坏了报 null。</summary>
        public static bool? Parse(string? claudeJsonText, Func<string, string?> env)
        {
            bool? enabled = true;

            if (!string.IsNullOrEmpty(env("DISABLE_AUTO_COMPACT")) || !string.IsNullOrEmpty(env("DISABLE_COMPACT")))
            {
                enabled = false;
                return enabled;
            }

            if (claudeJsonText == null)
            {
                enabled = null;
                return enabled;
            }

            try
            {
                using (JsonDocument doc = JsonDocument.Parse(claudeJsonText))
                {
                    JsonElement root = doc.RootElement;
                    if (root.ValueKind == JsonValueKind.Object
                        && root.TryGetProperty("autoCompactEnabled", out JsonElement value)
                        && value.ValueKind == JsonValueKind.False)
                    {
                        enabled = false;
                    }
                }
            }
            catch (JsonException)
            {
                // CLI 写到一半时读到的是残缺文本，这次不算数
                enabled = null;
            }

            return enabled;
        }

        #endregion

        #region 读取

        /// <summary>读指定配置文件；不存在按开，读失败报 null。</summary>
        public static bool? ReadFile(string path, Func<string, string?> env)
        {
            string? text;

            try
            {
                text = File.Exists(path) ? File.ReadAllText(path) : "{}";
            }
            catch (Exception)
            {
                text = null;
            }

            bool? enabled = Parse(text, env);
            return enabled;
        }

        /// <summary>读用户目录下的 .claude.json 与进程环境变量。</summary>
        public static bool? Read()
        {
            bool? enabled = null;

            try
            {
                string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude.json");
                enabled = ReadFile(path, name => Environment.GetEnvironmentVariable(name));
            }
            catch (Exception)
            {
                enabled = null;
            }

            return enabled;
        }

        #endregion
    }
}
