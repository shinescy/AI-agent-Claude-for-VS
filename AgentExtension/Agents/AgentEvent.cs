// 归一化事件，Agents 层与 UI 层之间的唯一契约

using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AgentExtension.Agents
{
    /// <summary>一条归一化事件。</summary>
    public class AgentEvent
    {
        #region 属性

        public AgentEventKind Kind { get; private set; }

        /// <summary>文本类事件（AssistantText / Thinking / Failed / RateLimitUpdated）的内容。</summary>
        public string Content { get; private set; } = string.Empty;

        public AgentSessionInfo? SessionInfo { get; private set; }

        public AgentToolCall? ToolCall { get; private set; }

        public AgentUsage? UsageData { get; private set; }

        public AgentTurnResult? TurnResult { get; private set; }

        /// <summary>配额状态，随 RateLimitUpdated 事件下发。</summary>
        public AgentRateLimit? RateLimitData { get; private set; }

        /// <summary>可翻译文案的中文模板；为 null 表示 <see cref="Content"/> 就是最终文本。</summary>
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? TextKey { get; private set; }

        /// <summary>模板里 <c>{name}</c> 占位的取值。</summary>
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public Dictionary<string, string>? TextArgs { get; private set; }

        public string HookName { get; private set; } = string.Empty;

        public string HookPhase { get; private set; } = string.Empty;

        #endregion

        #region 文本类工厂

        public static AgentEvent Text(string content)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.AssistantText, Content = content ?? string.Empty };
            return evt;
        }

        public static AgentEvent ThinkingText(string content)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.Thinking, Content = content ?? string.Empty };
            return evt;
        }

        /// <summary>配额状态。</summary>
        public static AgentEvent RateLimit(AgentRateLimit rateLimit)
        {
            var evt = new AgentEvent
            {
                Kind = AgentEventKind.RateLimitUpdated,
                Content = rateLimit?.Status ?? string.Empty,
                RateLimitData = rateLimit
            };
            return evt;
        }

        public static AgentEvent Failure(string message)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.Failed, Content = message ?? string.Empty };
            return evt;
        }

        /// <summary>未被专门处理的原始输出行，原样带出以免静默丢失。</summary>
        public static AgentEvent Raw(string line)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.Raw, Content = line ?? string.Empty };
            return evt;
        }

        /// <summary>已经成形的文本（CLI 原样输出这类），前端不翻译。</summary>
        public static AgentEvent RawNotice(string text)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.Notice, Content = text ?? string.Empty };
            return evt;
        }

        /// <summary>可翻译的系统提示：模板与取值一起带走，前端按面板当前语言渲染。</summary>
        public static AgentEvent Notice(string template, Dictionary<string, string>? args = null)
        {
            var evt = new AgentEvent
            {
                Kind = AgentEventKind.Notice,

                // Content 仍是填好的中文：前端认不出模板时退回它，导出的转录也用它。
                Content = NoticeText.Fill(template, args),
                TextKey = template ?? string.Empty,
                TextArgs = args
            };

            return evt;
        }

        /// <summary>
        /// 用户发出的一句话。
        ///
        /// **只进桥的日志、不下发**：实时发送时前端已经本地加过用户块（state.ts 的 userSent），
        /// 再下发一遍同一句话会出现两次。它的用途是让 replay（WebView 重建、历史回放）
        /// 能把用户说过的话也画出来。
        /// </summary>
        public static AgentEvent UserPromptText(string content)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.UserPrompt, Content = content ?? string.Empty };
            return evt;
        }

        #endregion

        #region 结构化工厂

        public static AgentEvent Started(AgentSessionInfo info)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.SessionStarted, SessionInfo = info };
            return evt;
        }

        public static AgentEvent ToolStarted(AgentToolCall call)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.ToolCallStarted, ToolCall = call };
            return evt;
        }

        public static AgentEvent ToolCompleted(AgentToolCall call)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.ToolCallCompleted, ToolCall = call };
            return evt;
        }

        public static AgentEvent Hook(string name, string phase)
        {
            var evt = new AgentEvent
            {
                Kind = AgentEventKind.HookProgress,
                HookName = name ?? string.Empty,
                HookPhase = phase ?? string.Empty
            };
            return evt;
        }

        public static AgentEvent Usage(AgentUsage usage)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.UsageUpdated, UsageData = usage };
            return evt;
        }

        public static AgentEvent Completed(AgentTurnResult result)
        {
            var evt = new AgentEvent { Kind = AgentEventKind.TurnCompleted, TurnResult = result };
            return evt;
        }

        #endregion
    }
}
