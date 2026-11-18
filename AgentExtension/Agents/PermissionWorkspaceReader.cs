// 权限弹窗「工作区目录」一栏的数据

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>列出会话起始目录与各 settings 里的附加目录。</summary>
    public static class PermissionWorkspaceReader
    {
        #region 常量

        /// <summary>会话起始目录的来源标记。</summary>
        public const string SourceOriginal = "original";

        /// <summary>
        /// 面板作用域名到 CLI 规则来源名的映射。
        /// </summary>
        /// <remarks>前端按 CLI 的来源名翻译，两边用同一套词。</remarks>
        private static readonly Dictionary<string, string> ScopeToSource =
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["user"] = "userSettings",
                ["project"] = "projectSettings",
                ["local"] = "localSettings",
                ["managed"] = "policySettings"
            };

        #endregion

        #region 取数

        /// <summary>起始目录在前，附加目录按作用域顺序在后；同一路径只列一次。</summary>
        public static IReadOnlyList<Dictionary<string, string>> Compose(
            string workingDirectory, IEnumerable<PanelItem> items)
        {
            var rows = new List<Dictionary<string, string>>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            string start = (workingDirectory ?? string.Empty).Trim();

            if (start.Length > 0)
            {
                seen.Add(start);
                rows.Add(Row(start, SourceOriginal));
            }

            foreach (PanelItem item in items ?? Array.Empty<PanelItem>())
            {
                string kind;

                if (!item.Fields.TryGetValue("kind", out kind) || kind != PermissionSettingsReader.KindDirectory)
                {
                    continue;
                }

                string path = (item.Title ?? string.Empty).Trim();

                if (path.Length == 0 || !seen.Add(path))
                {
                    continue;
                }

                rows.Add(Row(path, SourceOf(item.Scope)));
            }

            return rows;
        }

        /// <summary>作用域名换成 CLI 的来源名；认不出的原样返回。</summary>
        public static string SourceOf(string? scope)
        {
            string key = scope ?? string.Empty;
            string source;

            if (!ScopeToSource.TryGetValue(key, out source))
            {
                source = key;
            }

            return source;
        }

        #endregion

        #region 内部

        /// <summary>拼一行。</summary>
        private static Dictionary<string, string> Row(string path, string source)
        {
            var row = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["path"] = path,
                ["source"] = source
            };

            return row;
        }

        #endregion
    }
}
