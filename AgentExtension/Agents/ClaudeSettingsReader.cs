// 从 settings.json 读出 CLI 不汇报的那几项设置

using System;
using System.IO;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>读取 Claude Code 的 settings.json。</summary>
    public static class ClaudeSettingsReader
    {
        #region 纯逻辑

        /// <summary>从两段 settings JSON 里取 effortLevel，项目级优先。</summary>
        public static string ResolveEffortLevel(string? projectJson, string? userJson)
        {
            string fromProject = ReadEffort(projectJson);

            if (fromProject.Length > 0)
            {
                return fromProject;
            }

            return ReadEffort(userJson);
        }

        private static string ReadEffort(string? json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return string.Empty;
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(json!))
                {
                    JsonElement root = document.RootElement;

                    if (root.ValueKind != JsonValueKind.Object)
                    {
                        return string.Empty;
                    }

                    if (!root.TryGetProperty("effortLevel", out JsonElement value)
                        || value.ValueKind != JsonValueKind.String)
                    {
                        return string.Empty;
                    }

                    return value.GetString() ?? string.Empty;
                }
            }
            catch (JsonException)
            {
                return string.Empty;
            }
        }

        #endregion

        #region 读盘

        /// <summary>按「项目 &gt; 用户」读出 effortLevel。</summary>
        public static string ReadEffortLevel(string workingDirectory)
        {
            string projectJson = TryReadFile(Path.Combine(workingDirectory ?? string.Empty, ".claude", "settings.json"));
            string userJson = TryReadFile(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "settings.json"));

            return ResolveEffortLevel(projectJson, userJson);
        }

        private static string TryReadFile(string path)
        {
            try
            {
                if (!File.Exists(path))
                {
                    return string.Empty;
                }

                return File.ReadAllText(path);
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

        #endregion
    }
}
