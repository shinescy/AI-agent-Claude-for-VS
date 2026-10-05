// 把错误列表整理成发给代理的文本

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace AgentExtension.Vs
{
    /// <summary>把构建诊断整理成代理能用的清单。</summary>
    public static class BuildIssueFormatter
    {
        #region 上限

        /// <summary>最多列出的错误条数。</summary>
        public const int MaxErrors = 30;

        /// <summary>警告只作补充上下文，给得更少。</summary>
        public const int MaxWarnings = 10;

        #endregion

        #region 格式化

        /// <summary>生成诊断清单。</summary>
        public static string Format(IReadOnlyList<BuildIssue> issues)
        {
            if (issues == null || issues.Count == 0)
            {
                return string.Empty;
            }

            List<BuildIssue> errors = issues.Where(i => i.Severity == BuildIssueSeverity.Error).ToList();
            List<BuildIssue> warnings = issues.Where(i => i.Severity == BuildIssueSeverity.Warning).ToList();

            if (errors.Count == 0 && warnings.Count == 0)
            {
                return string.Empty;
            }

            var builder = new StringBuilder();

            if (errors.Count > 0)
            {
                AppendSection(builder, "构建错误", errors, MaxErrors);
            }

            if (warnings.Count > 0)
            {
                if (builder.Length > 0)
                {
                    builder.Append('\n');
                }

                AppendSection(builder, "警告（供参考）", warnings, MaxWarnings);
            }

            string formatted = builder.ToString().TrimEnd('\n');
            return formatted;
        }

        private static void AppendSection(
            StringBuilder builder, string title, List<BuildIssue> items, int limit)
        {
            builder.Append(title).Append('（').Append(items.Count).Append(" 条）：\n\n");

            int shown = Math.Min(items.Count, limit);

            for (int i = 0; i < shown; i++)
            {
                builder.Append(FormatOne(items[i])).Append('\n');
            }

            if (items.Count > shown)
            {
                builder.Append("…… 另有 ").Append(items.Count - shown).Append(" 条未列出\n");
            }
        }

        private static string FormatOne(BuildIssue issue)
        {
            var builder = new StringBuilder("- ");

            string location = BuildLocation(issue);

            if (location.Length > 0)
            {
                builder.Append(location).Append(' ');
            }

            if (!string.IsNullOrWhiteSpace(issue.Code))
            {
                builder.Append(issue.Code).Append(": ");
            }

            builder.Append((issue.Message ?? string.Empty).Trim());

            string line = builder.ToString();
            return line;
        }

        private static string BuildLocation(BuildIssue issue)
        {
            if (string.IsNullOrWhiteSpace(issue.FilePath))
            {
                return string.Empty;
            }

            string name = SafeFileName(issue.FilePath);

            if (issue.Line > 0)
            {
                return $"`{name}:{issue.Line}`";
            }

            return $"`{name}`";
        }

        private static string SafeFileName(string filePath)
        {
            try
            {
                string name = Path.GetFileName(filePath);
                return string.IsNullOrEmpty(name) ? filePath : name;
            }
            catch (ArgumentException)
            {
                return filePath;
            }
        }

        #endregion
    }
}
