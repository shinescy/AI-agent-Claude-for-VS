// 终端启动参数的闭集校验

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>把一组终端启动参数削到只剩已知取值。</summary>
    public static class TerminalLaunchSanitizer
    {
        #region 校验

        /// <summary>返回削过的参数；被拒的取值写进 ，供界面上说清楚。</summary>
        public static TerminalLaunchOptions Sanitize(
            TerminalLaunchOptions? raw,
            IReadOnlyList<string>? knownModels,
            IReadOnlyList<string>? knownEfforts,
            out IReadOnlyList<string> rejections)
        {
            var rejected = new List<string>();
            var result = new TerminalLaunchOptions();

            if (raw == null)
            {
                rejections = rejected;
                return result;
            }

            result.Model = Keep(raw.Model, knownModels, "模型", rejected);
            result.Effort = Keep(raw.Effort, knownEfforts, "强度", rejected);
            result.ResumeSessionId = KeepSessionId(raw.ResumeSessionId, rejected);

            string mode = (raw.PermissionMode ?? string.Empty).Trim();

            if (mode.Length > 0)
            {
                if (PermissionModes.IsKnown(mode))
                {
                    result.PermissionMode = mode;
                }
                else
                {
                    rejected.Add($"权限模式 “{mode}” 不在闭集里，终端不带这个参数。");
                }
            }

            rejections = rejected;
            return result;
        }

        /// <summary>会话 id 会原样进命令行，形状不对就丢。</summary>
        private static string KeepSessionId(string? value, List<string> rejected)
        {
            string id = (value ?? string.Empty).Trim();

            if (id.Length == 0)
            {
                return string.Empty;
            }

            Guid parsed;

            if (!Guid.TryParseExact(id, "D", out parsed))
            {
                rejected.Add($"会话 id “{id}” 形状不对，终端改开一条新会话。");
                return string.Empty;
            }

            return id;
        }

        /// <summary>在闭集里就留下，否则丢弃并记一条原因。</summary>
        private static string Keep(
            string? value,
            IReadOnlyList<string>? known,
            string what,
            List<string> rejected)
        {
            string trimmed = (value ?? string.Empty).Trim();

            if (trimmed.Length == 0)
            {
                return string.Empty;
            }

            if (known == null || known.Count == 0)
            {
                rejected.Add($"还没拿到 CLI 报的{what}清单，终端先用默认{what}。");
                return string.Empty;
            }

            foreach (string item in known)
            {
                if (string.Equals(item, trimmed, StringComparison.Ordinal))
                {
                    return trimmed;
                }
            }

            rejected.Add($"{what} “{trimmed}” 不在 CLI 报的清单里，终端不带这个参数。");
            return string.Empty;
        }

        #endregion
    }
}
