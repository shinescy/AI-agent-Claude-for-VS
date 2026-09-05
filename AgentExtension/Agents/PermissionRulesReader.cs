// 读出各作用域的工具权限规则，供「权限」面板列出

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>读出 <c>settings.json</c> 里的工具权限规则（allow / deny / ask）。</summary>
    public static class PermissionRulesReader
    {
        #region 常量

        /// <summary>规则种类字段的取值。</summary>
        public const string KindAllow = "allow";

        public const string KindDeny = "deny";

        public const string KindAsk = "ask";

        /// <summary>默认权限模式（settings 里的 <c>defaultMode</c>）。</summary>
        public const string KindMode = "mode";

        /// <summary>附加可访问目录（<c>additionalDirectories</c>）。</summary>
        public const string KindDirectory = "dir";

        /// <summary>作用域本身的那一行：即使一条规则都没有也要有，否则面板空着像坏了。</summary>
        public const string KindFile = "file";

        #endregion

        #region 取数

        /// <summary>列出四个作用域里的权限规则，顺序为 用户 → 项目 → 项目本地 → 企业策略。</summary>
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

            return new[]
            {
                new KeyValuePair<string, string>(
                    "user", home.Length == 0 ? string.Empty : Path.Combine(home, ".claude", "settings.json")),
                new KeyValuePair<string, string>(
                    "project", project.Length == 0 ? string.Empty : Path.Combine(project, ".claude", "settings.json")),
                new KeyValuePair<string, string>(
                    "local", project.Length == 0 ? string.Empty : Path.Combine(project, ".claude", "settings.local.json")),

                // 企业策略：优先级最高，装了就必须让人看见，否则「我明明写了 allow 怎么还是拦」无从解释。
                new KeyValuePair<string, string>(
                    "managed",
                    programData.Length == 0 ? string.Empty : Path.Combine(programData, "ClaudeCode", "managed-settings.json"))
            };
        }

        #endregion

        #region 纯解析

        /// <summary>把一段 settings JSON 解析成面板条目。</summary>
        public static IReadOnlyList<PanelItem> Parse(string? json, string scope, string path)
        {
            var rules = new List<PanelItem>();
            int allow = 0;
            int deny = 0;
            int ask = 0;
            string mode = string.Empty;
            string error = string.Empty;

            string text = json ?? string.Empty;

            if (text.Trim().Length > 0)
            {
                try
                {
                    var options = new JsonDocumentOptions
                    {
                        AllowTrailingCommas = true,
                        CommentHandling = JsonCommentHandling.Skip
                    };

                    using (JsonDocument document = JsonDocument.Parse(text, options))
                    {
                        if (document.RootElement.ValueKind == JsonValueKind.Object
                            && document.RootElement.TryGetProperty("permissions", out JsonElement permissions)
                            && permissions.ValueKind == JsonValueKind.Object)
                        {
                            allow = AddRules(rules, permissions, "allow", KindAllow, scope, path);
                            deny = AddRules(rules, permissions, "deny", KindDeny, scope, path);
                            ask = AddRules(rules, permissions, "ask", KindAsk, scope, path);
                            AddRules(rules, permissions, "additionalDirectories", KindDirectory, scope, path);

                            if (permissions.TryGetProperty("defaultMode", out JsonElement modeElement)
                                && modeElement.ValueKind == JsonValueKind.String)
                            {
                                mode = modeElement.GetString() ?? string.Empty;

                                if (mode.Length > 0)
                                {
                                    rules.Insert(0, RuleItem(mode, KindMode, scope, path));
                                }
                            }
                        }
                    }
                }
                catch (JsonException exception)
                {
                    error = exception.Message;
                }
            }

            var items = new List<PanelItem>(rules.Count + 1);
            items.Add(FileItem(scope, path, allow, deny, ask, mode, error));
            items.AddRange(rules);
            return items;
        }

        private static int AddRules(
            List<PanelItem> items, JsonElement permissions, string property, string kind, string scope, string path)
        {
            if (!permissions.TryGetProperty(property, out JsonElement array) || array.ValueKind != JsonValueKind.Array)
            {
                return 0;
            }

            int count = 0;

            foreach (JsonElement element in array.EnumerateArray())
            {
                if (element.ValueKind != JsonValueKind.String)
                {
                    continue;
                }

                string rule = element.GetString() ?? string.Empty;

                if (rule.Length == 0)
                {
                    continue;
                }

                items.Add(RuleItem(rule, kind, scope, path));
                count++;
            }

            return count;
        }

        private static PanelItem RuleItem(string rule, string kind, string scope, string path)
        {
            var item = new PanelItem
            {
                Id = $"{scope}|{kind}|{rule}",
                ActionValue = path,
                Title = rule,
                Subtitle = path,
                Scope = scope
            };

            item.Fields["kind"] = kind;
            item.Fields["path"] = path;
            return item;
        }

        private static PanelItem FileItem(
            string scope, string path, int allow, int deny, int ask, string mode, string error)
        {
            var item = new PanelItem
            {
                Id = path,
                ActionValue = path,
                Title = Path.GetFileName(path),
                Subtitle = path,
                Scope = scope,

                Enabled = error.Length == 0,
                Detail = error
            };

            item.Fields["kind"] = KindFile;
            item.Fields["path"] = path;
            item.Fields["allow"] = allow.ToString(CultureInfo.InvariantCulture);
            item.Fields["deny"] = deny.ToString(CultureInfo.InvariantCulture);
            item.Fields["ask"] = ask.ToString(CultureInfo.InvariantCulture);
            item.Fields["mode"] = mode;
            return item;
        }

        #endregion

        #region 文件系统（可测试性边界）

        private static bool FileExists(string path)
        {
            try
            {
                return File.Exists(path);
            }
            catch (IOException)
            {
                return false;
            }
        }

        private static string ReadAllText(string path)
        {
            try
            {
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

        private static string SafeFolder(Environment.SpecialFolder folder)
        {
            try
            {
                return Environment.GetFolderPath(folder);
            }
            catch (ArgumentException)
            {
                return string.Empty;
            }
        }

        #endregion
    }
}
