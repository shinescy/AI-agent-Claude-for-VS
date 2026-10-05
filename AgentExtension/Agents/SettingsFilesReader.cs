// 列出各作用域的 settings.json 及其中已有的配置段，供「设置文件」面板落地

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>列出 Claude Code 的几个 <c>settings.json</c>，以及每个文件里**实际存在**的顶层配置段。</summary>
    public static class SettingsFilesReader
    {
        #region 取数

        /// <summary>列出四个作用域的 settings 文件，顺序同 <see cref="PermissionRulesReader.Sources"/>。</summary>
        public static IReadOnlyList<PanelItem> List(string workingDirectory)
        {
            var items = new List<PanelItem>();

            foreach (KeyValuePair<string, string> source in PermissionRulesReader.Sources(workingDirectory))
            {
                string path = source.Value;

                if (path.Length == 0 || !Exists(path))
                {
                    continue;
                }

                items.Add(Describe(ReadAllText(path), source.Key, path));
            }

            return items;
        }

        #endregion

        #region 纯解析

        /// <summary>把一段 settings JSON 描述成一条面板条目：有哪些顶层段、各段多少项。</summary>
        public static PanelItem Describe(string? json, string scope, string path)
        {
            var sections = new List<string>();
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
                        if (document.RootElement.ValueKind == JsonValueKind.Object)
                        {
                            foreach (JsonProperty property in document.RootElement.EnumerateObject())
                            {
                                sections.Add(property.Name + Size(property.Value));
                            }
                        }
                    }
                }
                catch (JsonException exception)
                {
                    error = exception.Message;
                }
            }

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

            item.Fields["path"] = path;
            item.Fields["sections"] = string.Join(" · ", sections);
            item.Fields["count"] = sections.Count.ToString(CultureInfo.InvariantCulture);
            return item;
        }

        private static string Size(JsonElement value)
        {
            switch (value.ValueKind)
            {
                case JsonValueKind.Object:
                    {
                        int count = 0;

                        foreach (JsonProperty unused in value.EnumerateObject())
                        {
                            count++;
                        }

                        return $"({count})";
                    }

                case JsonValueKind.Array:
                    return $"[{value.GetArrayLength()}]";

                default:
                    return string.Empty;
            }
        }

        #endregion

        #region 文件系统

        private static bool Exists(string path)
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

        #endregion
    }
}
