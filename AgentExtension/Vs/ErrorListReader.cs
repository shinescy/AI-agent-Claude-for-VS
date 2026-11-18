// 从 Visual Studio 错误列表读取诊断

using System;
using System.Collections.Generic;
using EnvDTE;
using EnvDTE80;
using Microsoft.VisualStudio.Shell;

namespace AgentExtension.Vs
{
    /// <summary>读取错误列表当前的内容。</summary>
    public static class ErrorListReader
    {
        #region 读取

        /// <summary>读取全部诊断。</summary>
        public static IReadOnlyList<BuildIssue> Read()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            var issues = new List<BuildIssue>();

            try
            {
                var dte = Package.GetGlobalService(typeof(DTE)) as DTE2;

                ErrorList? errorList = dte?.ToolWindows?.ErrorList;
                ErrorItems? items = errorList?.ErrorItems;

                if (items == null)
                {
                    return issues;
                }

                for (int i = 1; i <= items.Count; i++)
                {
                    BuildIssue? issue = TryReadItem(items, i);

                    if (issue != null)
                    {
                        issues.Add(issue);
                    }
                }
            }
            catch (Exception)
            {
                // 错误列表在读取途中刷新会让 COM 调用失败；取不到就当没有，不该中断用户操作。
            }

            return issues;
        }

        private static BuildIssue? TryReadItem(ErrorItems items, int index)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            try
            {
                ErrorItem item = items.Item(index);

                var issue = new BuildIssue
                {
                    Severity = MapSeverity(item.ErrorLevel),
                    FilePath = item.FileName ?? string.Empty,
                    Line = item.Line,
                    Column = item.Column,
                    Message = item.Description ?? string.Empty,
                    Project = item.Project ?? string.Empty
                };

                return issue;
            }
            catch (Exception)
            {
                // 单条读取失败不该让整批作废。
                return null;
            }
        }

        private static BuildIssueSeverity MapSeverity(vsBuildErrorLevel level)
        {
            switch (level)
            {
                case vsBuildErrorLevel.vsBuildErrorLevelHigh:
                    return BuildIssueSeverity.Error;

                case vsBuildErrorLevel.vsBuildErrorLevelMedium:
                    return BuildIssueSeverity.Warning;

                default:
                    return BuildIssueSeverity.Message;
            }
        }

        #endregion
    }
}
