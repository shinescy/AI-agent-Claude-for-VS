// 读各作用域 settings 里的默认模式与附加目录，供权限规则弹窗使用

using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>读 settings.json 里的 defaultMode 与 additionalDirectories。</summary>
    /// <remarks>规则本身取自运行中的会话，不在这里读。</remarks>
    public static class PermissionSettingsReader
    {
        #region 常量

        /// <summary>默认权限模式（defaultMode）。</summary>
        public const string KindMode = "mode";

        /// <summary>附加可访问目录（additionalDirectories）。</summary>
        public const string KindDirectory = "dir";

        #endregion

        #region 取数

        /// <summary>按 用户 → 项目 → 项目本地 → 企业策略 的顺序读出全部条目。</summary>
        public static IReadOnlyList<PanelItem> List(string workingDirectory)
        {
            var items = new List<PanelItem>();

            foreach (KeyValuePair<string, string> source in Sources(workingDirectory))
            {
                string scope = source.Key;
                string path = source.Value;

                if (path.Length == 0 || !FileExists(path))
                {
                    continue;
                }

                items.AddRange(Parse(ReadAllText(path), scope, path));
            }

            return items;
        }

        /// <summary>各作用域对应的 settings 文件路径。</summary>
        public static IReadOnlyList<KeyValuePair<string, string>> Sources(string workingDirectory)
        {
            string home = SafeFolder(Environment.SpecialFolder.UserProfile);
            string programData = SafeFolder(Environment.SpecialFolder.CommonApplicationData);
            string project = workingDirectory ?? string.Empty;

            var sources = new[]
            {
                new KeyValuePair<string, string>(
                    "user", home.Length == 0 ? string.Empty : Path.Combine(home, ".claude", "settings.json")),
                new KeyValuePair<string, string>(
                    "project", project.Length == 0 ? string.Empty : Path.Combine(project, ".claude", "settings.json")),
                new KeyValuePair<string, string>(
                    "local", project.Length == 0 ? string.Empty : Path.Combine(project, ".claude", "settings.local.json")),
                new KeyValuePair<string, string>(
                    "managed",
                    programData.Length == 0 ? string.Empty : Path.Combine(programData, "ClaudeCode", "managed-settings.json"))
            };

            return sources;
        }

        #endregion

        #region 纯解析

        /// <summary>解析一段 settings JSON；读不出来按「什么都没写」处理。</summary>
        public static IReadOnlyList<PanelItem> Parse(string? json, string scope, string path)
        {
            var items = new List<PanelItem>();
            string text = json ?? string.Empty;

            if (text.Trim().Length == 0)
            {
                return items;
            }

            var options = new JsonDocumentOptions
            {
                AllowTrailingCommas = true,
                CommentHandling = JsonCommentHandling.Skip
            };

            try
            {
                using (JsonDocument document = JsonDocument.Parse(text, options))
                {
                    if (document.RootElement.ValueKind != JsonValueKind.Object
                        || !document.RootElement.TryGetProperty("permissions", out JsonElement permissions)
                        || permissions.ValueKind != JsonValueKind.Object)
                    {
                        return items;
                    }

                    if (permissions.TryGetProperty("defaultMode", out JsonElement mode)
                        && mode.ValueKind == JsonValueKind.String
                        && !string.IsNullOrWhiteSpace(mode.GetString()))
                    {
                        items.Add(Item(mode.GetString()!, KindMode, scope, path));
                    }

                    AddDirectories(items, permissions, scope, path);
                }
            }
            catch (JsonException)
            {
                // 文件坏了由「设置文件」面板报出来，这里不重复
            }

            return items;
        }

        /// <summary>把 additionalDirectories 里的字符串逐条加进来。</summary>
        private static void AddDirectories(List<PanelItem> items, JsonElement permissions, string scope, string path)
        {
            if (!permissions.TryGetProperty("additionalDirectories", out JsonElement array)
                || array.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            foreach (JsonElement element in array.EnumerateArray())
            {
                string value = element.ValueKind == JsonValueKind.String ? element.GetString() ?? string.Empty : string.Empty;

                if (value.Length > 0)
                {
                    items.Add(Item(value, KindDirectory, scope, path));
                }
            }
        }

        /// <summary>拼一条。</summary>
        private static PanelItem Item(string value, string kind, string scope, string path)
        {
            var item = new PanelItem
            {
                Id = $"{scope}|{kind}|{value}",
                ActionValue = path,
                Title = value,
                Subtitle = path,
                Scope = scope
            };

            item.Fields["kind"] = kind;
            item.Fields["path"] = path;
            return item;
        }

        #endregion

        #region 文件系统

        /// <summary>文件是否存在；出错当不存在。</summary>
        private static bool FileExists(string path)
        {
            try
            {
                bool exists = File.Exists(path);
                return exists;
            }
            catch (IOException)
            {
                return false;
            }
        }

        /// <summary>读全文；读不了给空串。</summary>
        private static string ReadAllText(string path)
        {
            try
            {
                string text = File.ReadAllText(path);
                return text;
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

        /// <summary>取系统目录；取不到给空串。</summary>
        private static string SafeFolder(Environment.SpecialFolder folder)
        {
            try
            {
                string path = Environment.GetFolderPath(folder);
                return path;
            }
            catch (ArgumentException)
            {
                return string.Empty;
            }
        }

        #endregion
    }
}
