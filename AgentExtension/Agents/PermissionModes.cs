// 权限模式的闭集，消息桥据此拒绝非法取值

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>合法权限模式的闭集。</summary>
    public static class PermissionModes
    {
        #region 闭集

        private static readonly string[] Known =
        {
            "acceptEdits",
            "auto",
            "bypassPermissions",
            "manual",
            "dontAsk",
            "plan",
            ClaudeSessionOptions.DangerouslySentinel
        };

        public static IReadOnlyList<string> All
        {
            get
            {
                return Known;
            }
        }

        #endregion

        #region 判定

        /// <summary>是否是已知取值。</summary>
        public static bool IsKnown(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return false;
            }

            foreach (string known in Known)
            {
                if (string.Equals(known, value, StringComparison.Ordinal))
                {
                    return true;
                }
            }

            return false;
        }

        #endregion
    }
}
