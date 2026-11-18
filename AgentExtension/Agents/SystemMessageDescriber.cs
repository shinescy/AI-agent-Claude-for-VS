// CLI 的 system 消息：哪些不显示、哪些说成一句话

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 把 init 以外的 system 消息归成「不显示 / 一句提示 / 认不出」。
    /// </summary>
    /// <remarks>
    /// CLI 有七十多种 system 子类型（2026-11 从 claude.exe 里扫出来的），
    /// 大半是进度心跳与界面同步，终端 TUI 自己也不画；原样带出就是满屏「未识别」。
    /// 认不出的仍返回 null，由解析器按 Raw 带出，不静默丢弃。
    /// </remarks>
    public static class SystemMessageDescriber
    {
        #region 常量

        /// <summary>进度、心跳与内部状态：终端里也看不到，不进转录。</summary>
        private static readonly HashSet<string> Silent = new HashSet<string>(StringComparer.Ordinal)
        {
            "thinking_tokens",
            "task_started", "task_progress", "task_updated", "task_summary", "background_tasks_changed",
            "session_state_changed", "session_metadata", "session_title_changed",
            "control_request_progress", "permission_check_status", "inherited_asks_settled",
            "turn_starting", "turn_duration", "turn_preempted", "turn_handoff_available", "turn_began_before_init",
            "file_snapshot", "commands_changed", "vcs_state_changed", "per_turn_effort_changed",
            "cloud_session_status", "cloud_session_delta",
            "checkpoint_done", "placed", "start_folder", "dev_intent", "peer_message_hold",
            "post_turn_summary", "stop_hook_summary", "memory_recall", "tool_host_result",
            "api_error", "elicitation_complete", "worker_shutting_down", "voice_call_talk",
            "feedback_draft_queued", "code_change_published", "rewind_stand_in", "scheduled_task_fire"
        };

        /// <summary>界面同步类消息的前缀（ui_toast、ui_focus 等）。</summary>
        private const string UiPrefix = "ui_";

        /// <summary>不进转录的顶层消息类型：工具进度、保活、命令生命周期等。</summary>
        private static readonly HashSet<string> SilentTopLevel = new HashSet<string>(StringComparer.Ordinal)
        {
            "tool_progress", "command_lifecycle", "keep_alive", "tool_use_summary", "prompt_suggestion",
            "transcript_mirror", "control_cancel_request", "env_manager_log", "auth_status"
        };

        #endregion

        #region 归类

        /// <summary>这种顶层类型是否不进转录。</summary>
        public static bool IsSilentTopLevel(string type)
        {
            bool silent = SilentTopLevel.Contains(type ?? string.Empty);
            return silent;
        }

        /// <summary>空列表表示不显示；null 表示认不出，调用方按 Raw 带出。</summary>
        public static IReadOnlyList<AgentEvent>? Describe(JsonElement root, string subtype)
        {
            string kind = subtype ?? string.Empty;

            if (kind == "status")
            {
                return DescribeStatus(root);
            }

            if (Silent.Contains(kind) || kind.StartsWith(UiPrefix, StringComparison.Ordinal))
            {
                return Array.Empty<AgentEvent>();
            }

            AgentEvent? special = DescribeKnown(root, kind);

            if (special != null)
            {
                return new[] { special };
            }

            if (kind == "task_notification")
            {
                // 正常完成的后台任务，工具卡片与模型的下一句都会交代，不另占一行
                return Array.Empty<AgentEvent>();
            }

            // 其余带文字的（informational、notification、model_fallback 等）照文字说
            string text = ReadString(root, "content");

            if (text.Trim().Length == 0)
            {
                text = ReadString(root, "text");
            }

            if (text.Trim().Length > 0)
            {
                return new[] { AgentEvent.Notice(text.Trim()) };
            }

            return null;
        }

        /// <summary>要专门措辞的几种；不是这几种返回 null。</summary>
        private static AgentEvent? DescribeKnown(JsonElement root, string kind)
        {
            switch (kind)
            {
                case "task_notification":
                    return DescribeTaskEnd(root);

                case "api_retry":
                    return DescribeRetry(root);

                case "compact_boundary":
                    return DescribeBoundary(root);

                case "bridge_state":
                    return AgentEvent.RemoteControl(new AgentRemoteControl
                    {
                        State = ReadString(root, "state"),
                        Detail = ReadString(root, "detail").Trim()
                    });

                case "bridge_status":
                    return AgentEvent.RemoteControl(new AgentRemoteControl
                    {
                        State = AgentRemoteControl.StateConnected,
                        SessionUrl = ReadString(root, "url")
                    });

                case "memory_saved":
                    return AgentEvent.Notice(
                        NoticeText.MemorySaved, NoticeText.Args("paths", string.Join("、", ReadStrings(root, "writtenPaths"))));

                case "session_writes_lost":
                    return AgentEvent.Notice(
                        NoticeText.SessionWritesLost, NoticeText.Args("code", ReadString(root, "error_code")));

                case "agents_killed":
                    return AgentEvent.Notice(NoticeText.AgentsKilled);

                case "model_refusal_no_fallback":
                    return ReadString(root, "content").Trim().Length > 0
                        ? null
                        : AgentEvent.Notice(NoticeText.ModelRefusedNoFallback);

                default:
                    return null;
            }
        }

        /// <summary>状态心跳：只有压缩的开始与失败要说。</summary>
        private static IReadOnlyList<AgentEvent> DescribeStatus(JsonElement root)
        {
            if (ReadString(root, "status") == "compacting")
            {
                AgentEvent started = AgentEvent.Compaction(
                    new AgentCompaction { Phase = AgentCompaction.PhaseStarted });
                return new[] { started };
            }

            if (ReadString(root, "compact_result") == "failed")
            {
                AgentEvent failed = AgentEvent.Compaction(new AgentCompaction
                {
                    Phase = AgentCompaction.PhaseFailed,
                    Error = ReadString(root, "compact_error").Trim()
                });
                return new[] { failed };
            }

            return Array.Empty<AgentEvent>();
        }

        /// <summary>压缩完成：触发方式、前后 token 数与耗时。</summary>
        private static AgentEvent DescribeBoundary(JsonElement root)
        {
            root.TryGetProperty("compact_metadata", out JsonElement metadata);

            var data = new AgentCompaction
            {
                Phase = AgentCompaction.PhaseCompleted,
                Trigger = ReadString(metadata, "trigger"),
                PreTokens = ReadLong(metadata, "pre_tokens"),
                PostTokens = ReadLong(metadata, "post_tokens"),
                DurationMs = ReadLong(metadata, "duration_ms"),
                BoundaryUuid = ReadString(root, "uuid")
            };

            AgentEvent completed = AgentEvent.Compaction(data);
            return completed;
        }

        /// <summary>后台任务失败或被停才说；正常完成返回 null。</summary>
        private static AgentEvent? DescribeTaskEnd(JsonElement root)
        {
            string status = ReadString(root, "status");
            string summary = ReadString(root, "summary").Trim();

            if (summary.Length == 0)
            {
                summary = ReadString(root, "task_id");
            }

            Dictionary<string, string> args = NoticeText.Args("summary", summary);

            switch (status)
            {
                case "failed":
                    return AgentEvent.Notice(NoticeText.TaskFailed, args);

                case "killed":
                case "stopped":
                    return AgentEvent.Notice(NoticeText.TaskStopped, args);

                default:
                    return null;
            }
        }

        /// <summary>API 出错正在重试。</summary>
        private static AgentEvent DescribeRetry(JsonElement root)
        {
            string error = ReadString(root, "error");

            if (error.Length == 0)
            {
                long status = ReadLong(root, "error_status");
                error = status > 0 ? status.ToString(CultureInfo.InvariantCulture) : "?";
            }

            long delayMs = ReadLong(root, "retry_delay_ms");
            string seconds = Math.Max(0, (delayMs + 500) / 1000).ToString(CultureInfo.InvariantCulture);

            AgentEvent notice = AgentEvent.Notice(NoticeText.ApiRetry, NoticeText.Args(
                "error", error,
                "seconds", seconds,
                "attempt", ReadLong(root, "attempt").ToString(CultureInfo.InvariantCulture),
                "max", ReadLong(root, "max_retries").ToString(CultureInfo.InvariantCulture)));
            return notice;
        }

        #endregion

        #region JSON 读取

        /// <summary>读字符串字段，不是字符串给空串。</summary>
        private static string ReadString(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object
                || !parent.TryGetProperty(name, out JsonElement value)
                || value.ValueKind != JsonValueKind.String)
            {
                return string.Empty;
            }

            string text = value.GetString() ?? string.Empty;
            return text;
        }

        /// <summary>读整数字段，不是数字给 0。</summary>
        private static long ReadLong(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object
                || !parent.TryGetProperty(name, out JsonElement value)
                || value.ValueKind != JsonValueKind.Number)
            {
                return 0;
            }

            long number = value.TryGetInt64(out long parsed) ? parsed : 0;
            return number;
        }

        /// <summary>读字符串数组，非字符串元素跳过。</summary>
        private static List<string> ReadStrings(JsonElement parent, string name)
        {
            var items = new List<string>();

            if (parent.ValueKind != JsonValueKind.Object
                || !parent.TryGetProperty(name, out JsonElement array)
                || array.ValueKind != JsonValueKind.Array)
            {
                return items;
            }

            foreach (JsonElement element in array.EnumerateArray())
            {
                if (element.ValueKind == JsonValueKind.String)
                {
                    items.Add(element.GetString() ?? string.Empty);
                }
            }

            return items;
        }

        #endregion
    }
}
