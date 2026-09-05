// 启动 claude CLI 所需的全部参数，纯数据类

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>启动一次 Claude 会话所需的参数。</summary>
    public class ClaudeSessionOptions
    {
        /// <summary>已解析的可执行文件绝对路径，由 ClaudeCliLocator 得出。</summary>
        public string ExecutablePath { get; set; } = string.Empty;

        /// <summary>扩展预先生成的会话 id。</summary>
        public string SessionId { get; set; } = string.Empty;

        /// <summary>要恢复的会话 id。</summary>
        public string ResumeSessionId { get; set; } = string.Empty;

        /// <summary>接回会话时是否开一条新的会话 id（<c>--fork-session</c>）。</summary>
        public bool ForkSession { get; set; }

        /// <summary>模型别名（sonnet / opus / haiku）。</summary>
        public string Model { get; set; } = string.Empty;

        /// <summary>努力级别（low / medium / high / xhigh / max）。</summary>
        public string Effort { get; set; } = string.Empty;

        /// <summary>权限模式。</summary>
        public string PermissionMode { get; set; } = "acceptEdits";

        /// <summary><see cref="PermissionMode"/> 的哨兵值：翻译成 --dangerously-skip-permissions。</summary>
        public const string DangerouslySentinel = "dangerously";

        /// <summary>是否请求 token 级增量。</summary>
        public bool IncludePartialMessages { get; set; } = true;

        /// <summary>子进程环境变量覆盖，主要用于传入刷新过的 PATH。</summary>
        public IDictionary<string, string> EnvironmentOverrides { get; } =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }
}
