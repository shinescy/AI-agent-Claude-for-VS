// system/init 事件的载荷

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>会话清单，来自 CLI 的 system/init 事件。</summary>
    public class AgentSessionInfo
    {
        public string SessionId { get; set; } = string.Empty;

        public string Model { get; set; } = string.Empty;

        public string Cwd { get; set; } = string.Empty;

        /// <summary>CLI 回报的权限模式。</summary>
        public string PermissionMode { get; set; } = string.Empty;

        public string CliVersion { get; set; } = string.Empty;

        public IReadOnlyList<string> Tools { get; set; } = Array.Empty<string>();

        /// <summary>可用斜杠命令，含插件命名空间格式 <c>plugin:command</c>。</summary>
        public IReadOnlyList<string> SlashCommands { get; set; } = Array.Empty<string>();

        /// <summary>同一批命令，连带 CLI 给的说明与参数提示。</summary>
        public IReadOnlyList<AgentSlashCommand> SlashCommandInfos { get; set; } = Array.Empty<AgentSlashCommand>();

        /// <summary>仅终端可用的命令（实测为 doctor、color）。</summary>
        public IReadOnlyList<string> TerminalSlashCommands { get; set; } = Array.Empty<string>();

        public IReadOnlyList<string> Skills { get; set; } = Array.Empty<string>();

        public IReadOnlyList<string> SubAgents { get; set; } = Array.Empty<string>();

        public IReadOnlyList<McpServerInfo> McpServers { get; set; } = Array.Empty<McpServerInfo>();

        /// <summary>协议能力协商结果。</summary>
        public IReadOnlyList<string> Capabilities { get; set; } = Array.Empty<string>();

        /// <summary>CLI 汇报的可用模型清单，来自 initialize 握手。</summary>
        public IReadOnlyList<AgentModelInfo> Models { get; set; } = Array.Empty<AgentModelInfo>();

        /// <summary>订阅类型，如 <c>Claude Max</c>。</summary>
        public string SubscriptionType { get; set; } = string.Empty;

        /// <summary>当前思考强度。</summary>
        public string EffortLevel { get; set; } = string.Empty;

        /// <summary>可选模型取值，来自 <c>/model</c> 的 Available 清单。</summary>
        public IReadOnlyList<string> AvailableModels { get; set; } = Array.Empty<string>();

        /// <summary>可选思考档位，来自 <c>/effort</c> 的用法串。</summary>
        public IReadOnlyList<string> EffortLevels { get; set; } = Array.Empty<string>();

        /// <summary>额度窗口，来自 <c>/usage</c>。</summary>
        public IReadOnlyList<UsageWindow> UsageWindows { get; set; } = Array.Empty<UsageWindow>();

        /// <summary><c>/usage</c> 的完整输出原文，供 status 面板原样展示那段行为画像 （requests / sessions / top skills / top MCP servers 之类）。</summary>
        public string UsageRawText { get; set; } = string.Empty;

        /// <summary>是否携带了任何可用于更新界面的状态。</summary>
        public bool HasAnyState
        {
            get
            {
                return Model.Length > 0
                    || EffortLevel.Length > 0
                    || AvailableModels.Count > 0
                    || EffortLevels.Count > 0
                    || SlashCommands.Count > 0
                    || UsageWindows.Count > 0;
            }
        }
    }
}
