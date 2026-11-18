// 权限弹窗「默认模式」一栏的数据

using System;
using System.Collections.Generic;
using System.Linq;

namespace AgentExtension.Agents
{
    /// <summary>列出各 settings 里写的 defaultMode，按生效优先级排。</summary>
    public static class PermissionDefaultModeReader
    {
        /// <summary>优先级从高到低：企业策略 → 项目本地 → 项目 → 用户。</summary>
        private static readonly string[] Precedence = { "managed", "local", "project", "user" };

        #region 取数

        /// <summary>挑出 defaultMode 行，按优先级排序。</summary>
        public static IReadOnlyList<Dictionary<string, string>> Compose(IEnumerable<PanelItem> items)
        {
            List<Dictionary<string, string>> rows = (items ?? Array.Empty<PanelItem>())
                .Where(IsModeItem)
                .OrderBy(item => RankOf(item.Scope))
                .Select(item => Row(item.Title.Trim(), PermissionWorkspaceReader.SourceOf(item.Scope)))
                .ToList();

            return rows;
        }

        #endregion

        #region 内部

        /// <summary>是否是非空的 defaultMode 行。</summary>
        private static bool IsModeItem(PanelItem item)
        {
            string kind;
            bool isMode = item.Fields.TryGetValue("kind", out kind)
                && kind == PermissionSettingsReader.KindMode
                && !string.IsNullOrWhiteSpace(item.Title);

            return isMode;
        }

        /// <summary>作用域的优先级序号；认不出的排最后。</summary>
        private static int RankOf(string? scope)
        {
            int index = Array.IndexOf(Precedence, scope ?? string.Empty);
            int rank = index < 0 ? Precedence.Length : index;
            return rank;
        }

        /// <summary>拼一行。</summary>
        private static Dictionary<string, string> Row(string mode, string source)
        {
            var row = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["mode"] = mode,
                ["source"] = source
            };

            return row;
        }

        #endregion
    }
}
