// 允许从面板发起的 CLI 子命令白名单

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>子命令白名单。</summary>
    public static class ClaudeSubcommandCatalog
    {
        #region 白名单

        private static readonly ClaudeSubcommand[] Items =
        {
            new ClaudeSubcommand
            {
                Id = "doctor",
                Label = "安装健康检查",
                Arguments = "doctor",
                CanRunInPanel = true
            },
            new ClaudeSubcommand
            {
                Id = "mcp",
                Label = "MCP 服务器状态",
                Arguments = "mcp list",
                CanRunInPanel = true
            },
            new ClaudeSubcommand
            {
                Id = "plugin",
                Label = "已装插件",
                Arguments = "plugin list",
                CanRunInPanel = true
            },
            new ClaudeSubcommand
            {
                Id = "auth",
                Label = "登录 / 认证",
                Arguments = "auth",
                CanRunInPanel = false,
                Guidance = "认证是交互式流程，面板内无法完成。请在终端执行：claude auth"
            }
        };

        /// <summary>全部条目。</summary>
        public static IReadOnlyList<ClaudeSubcommand> All
        {
            get
            {
                return Items;
            }
        }

        #endregion

        #region 查找

        /// <summary>按 id 查白名单条目。</summary>
        public static ClaudeSubcommand? Find(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                return null;
            }

            foreach (ClaudeSubcommand item in Items)
            {
                if (string.Equals(item.Id, id, StringComparison.Ordinal))
                {
                    return item;
                }
            }

            return null;
        }

        #endregion
    }
}
