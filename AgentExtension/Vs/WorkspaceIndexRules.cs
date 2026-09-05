// 工作区索引的过滤与匹配规则（纯逻辑，可单测）

using System;
using System.Collections.Generic;
using System.Linq;

namespace AgentExtension.Vs
{
    /// <summary>决定哪些目录不进索引、以及 @ 检索怎么排序。</summary>
    public static class WorkspaceIndexRules
    {
        #region 忽略规则

        private static readonly HashSet<string> IgnoredDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".git", ".vs", ".vscode", ".idea", "node_modules", "bin", "obj",
            "dist", "out", "packages", "TestResults", ".superpowers", "__pycache__"
        };

        /// <summary>该目录是否应跳过。</summary>
        public static bool IsIgnoredDirectory(string directoryName)
        {
            if (string.IsNullOrWhiteSpace(directoryName))
            {
                return true;
            }

            bool ignored = IgnoredDirectories.Contains(directoryName);
            return ignored;
        }

        #endregion

        #region 匹配与排序

        /// <summary>按查询串筛选并排序候选路径。</summary>
        public static IReadOnlyList<string> Rank(IEnumerable<string> paths, string query, int limit = 20)
        {
            if (paths == null)
            {
                return Array.Empty<string>();
            }

            if (limit < 1)
            {
                return Array.Empty<string>();
            }

            if (string.IsNullOrWhiteSpace(query))
            {
                return paths.Take(limit).ToList();
            }

            string q = query.Trim().ToLowerInvariant();
            var scored = new List<KeyValuePair<int, string>>();

            foreach (string path in paths)
            {
                if (string.IsNullOrEmpty(path))
                {
                    continue;
                }

                string lower = path.ToLowerInvariant();
                string fileName = GetFileName(lower);

                int score;

                if (fileName.StartsWith(q, StringComparison.Ordinal))
                {
                    score = 0;
                }
                else if (fileName.Contains(q))
                {
                    score = 1;
                }
                else if (lower.Contains(q))
                {
                    score = 2;
                }
                else
                {
                    continue;
                }

                scored.Add(new KeyValuePair<int, string>(score, path));
            }

            List<string> ordered = scored
                .OrderBy(p => p.Key)
                .ThenBy(p => p.Value.Length)
                .ThenBy(p => p.Value, StringComparer.OrdinalIgnoreCase)
                .Select(p => p.Value)
                .Take(limit)
                .ToList();

            return ordered;
        }

        private static string GetFileName(string path)
        {
            int slash = path.LastIndexOf('/');
            string name = slash >= 0 ? path.Substring(slash + 1) : path;
            return name;
        }

        #endregion
    }
}
