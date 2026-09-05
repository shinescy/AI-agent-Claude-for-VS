// 把 claude CLI 的 stream-json 行解析成归一化事件

using System;
using System.Collections.Generic;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>逐行解析 CLI 的 NDJSON 输出。</summary>
    public class ClaudeStreamParser
    {
        #region 字段

        private static readonly IReadOnlyList<AgentEvent> Empty = Array.Empty<AgentEvent>();

        private readonly bool _expectDeltas;

        /// <summary>是否**确实**收到过增量。</summary>
        private bool _sawDeltas;

        #endregion

        #region 构造

        public ClaudeStreamParser(bool expectDeltas)
        {
            _expectDeltas = expectDeltas;
        }

        #endregion

        #region 入口

        /// <summary>解析一行。</summary>
        public IReadOnlyList<AgentEvent> ParseLine(string line)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                return Empty;
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(line))
                {
                    JsonElement root = document.RootElement;

                    if (root.ValueKind != JsonValueKind.Object)
                    {
                        return Empty;
                    }

                    string type = ReadString(root, "type");

                    switch (type)
                    {
                        case "system":
                            return ParseSystem(root, line);

                        case "stream_event":
                            return ParseStreamEvent(root);

                        case "assistant":
                            return ParseAssistant(root);

                        case "user":
                            return ParseUser(root);

                        case "control_response":
                            return ParseControlResponse(root);

                        case "rate_limit_event":
                            return ParseRateLimit(root);

                        case "result":
                            return ParseResult(root);

                        default:
                            // 兜底：不认识的类型也带出去，绝不静默丢弃。
                            return new[] { AgentEvent.Raw(line) };
                    }
                }
            }
            catch (JsonException)
            {
                return new[] { AgentEvent.Raw(line) };
            }
        }

        #endregion

        #region 各类型解析

        private IReadOnlyList<AgentEvent> ParseSystem(JsonElement root, string line)
        {
            string subtype = ReadString(root, "subtype");

            if (subtype.StartsWith("hook_", StringComparison.Ordinal))
            {
                AgentEvent hookEvent = AgentEvent.Hook(ReadString(root, "hook_name"), subtype);
                return new[] { hookEvent };
            }

            if (subtype != "init")
            {
                return new[] { AgentEvent.Raw(line) };
            }

            var info = new AgentSessionInfo
            {
                SessionId = ReadString(root, "session_id"),
                Model = ReadString(root, "model"),
                Cwd = ReadString(root, "cwd"),
                PermissionMode = ReadString(root, "permissionMode"),
                CliVersion = ReadString(root, "claude_code_version"),
                Tools = ReadStringArray(root, "tools"),
                SlashCommands = ReadStringArray(root, "slash_commands"),
                TerminalSlashCommands = ReadStringArray(root, "terminal_slash_commands"),
                Skills = ReadStringArray(root, "skills"),
                SubAgents = ReadStringArray(root, "agents"),
                Capabilities = ReadStringArray(root, "capabilities"),
                McpServers = ReadMcpServers(root)
            };

            AgentEvent startedEvent = AgentEvent.Started(info);
            return new[] { startedEvent };
        }

        private IReadOnlyList<AgentEvent> ParseStreamEvent(JsonElement root)
        {
            if (!root.TryGetProperty("event", out JsonElement inner) || inner.ValueKind != JsonValueKind.Object)
            {
                return Empty;
            }

            if (ReadString(inner, "type") != "content_block_delta")
            {
                return Empty;
            }

            if (!inner.TryGetProperty("delta", out JsonElement delta) || delta.ValueKind != JsonValueKind.Object)
            {
                return Empty;
            }

            switch (ReadString(delta, "type"))
            {
                case "text_delta":
                    _sawDeltas = true;
                    return new[] { AgentEvent.Text(ReadString(delta, "text")) };

                case "thinking_delta":
                    _sawDeltas = true;
                    return new[] { AgentEvent.ThinkingText(ReadString(delta, "thinking")) };

                default:
                    return Empty;
            }
        }

        private IReadOnlyList<AgentEvent> ParseAssistant(JsonElement root)
        {
            if (!root.TryGetProperty("message", out JsonElement message) || message.ValueKind != JsonValueKind.Object)
            {
                return Empty;
            }

            var events = new List<AgentEvent>();

            // 只有**确实收到过**增量才跳过完整消息里的文本。
            bool skipStreamedContent = _expectDeltas && _sawDeltas;

            if (message.TryGetProperty("content", out JsonElement content) && content.ValueKind == JsonValueKind.Array)
            {
                foreach (JsonElement block in content.EnumerateArray())
                {
                    switch (ReadString(block, "type"))
                    {
                        case "text":
                            if (!skipStreamedContent)
                            {
                                events.Add(AgentEvent.Text(ReadString(block, "text")));
                            }
                            break;

                        case "thinking":
                            if (!skipStreamedContent)
                            {
                                events.Add(AgentEvent.ThinkingText(ReadString(block, "thinking")));
                            }
                            break;

                        case "tool_use":
                            var call = new AgentToolCall
                            {
                                ToolUseId = ReadString(block, "id"),
                                Name = ReadString(block, "name"),
                                InputJson = ReadRawJson(block, "input")
                            };
                            events.Add(AgentEvent.ToolStarted(call));
                            break;
                    }
                }
            }

            AgentUsage? usage = ReadUsage(message);
            if (usage != null)
            {
                events.Add(AgentEvent.Usage(usage));
            }

            return events;
        }

        private IReadOnlyList<AgentEvent> ParseUser(JsonElement root)
        {
            if (!root.TryGetProperty("message", out JsonElement message) || message.ValueKind != JsonValueKind.Object)
            {
                return Empty;
            }

            if (!message.TryGetProperty("content", out JsonElement content) || content.ValueKind != JsonValueKind.Array)
            {
                return Empty;
            }

            var events = new List<AgentEvent>();

            foreach (JsonElement block in content.EnumerateArray())
            {
                if (ReadString(block, "type") != "tool_result")
                {
                    continue;
                }

                var call = new AgentToolCall
                {
                    ToolUseId = ReadString(block, "tool_use_id"),
                    ResultText = FlattenResultContent(block),
                    IsError = ReadBool(block, "is_error")
                };

                events.Add(AgentEvent.ToolCompleted(call));
            }

            return events;
        }

        private IReadOnlyList<AgentEvent> ParseControlResponse(JsonElement root)
        {
            if (!root.TryGetProperty("response", out JsonElement envelope) || envelope.ValueKind != JsonValueKind.Object)
            {
                return Empty;
            }

            if (ReadString(envelope, "subtype") != "success")
            {
                return Empty;
            }

            if (!envelope.TryGetProperty("response", out JsonElement body) || body.ValueKind != JsonValueKind.Object)
            {
                return Empty;
            }

            // 中断确认等其它控制回包没有 commands，不该被当成会话就绪。
            if (!body.TryGetProperty("commands", out JsonElement commands) || commands.ValueKind != JsonValueKind.Array)
            {
                return Empty;
            }

            IReadOnlyList<AgentModelInfo> models = ReadModels(body);

            var info = new AgentSessionInfo
            {
                SessionId = ReadString(root, "session_id"),
                Model = ResolveDefaultModel(models),
                PermissionMode = ReadString(body, "current_permission_mode"),
                SlashCommands = ReadObjectNames(commands),
                SlashCommandInfos = ReadCommandInfos(commands),

                EffortLevels = UnionEffortLevels(models),
                Models = models,
                SubscriptionType = ReadSubscriptionType(body)
            };

            AgentEvent startedEvent = AgentEvent.Started(info);
            return new[] { startedEvent };
        }

        private static IReadOnlyList<string> UnionEffortLevels(IReadOnlyList<AgentModelInfo> models)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var union = new List<string>();

            foreach (AgentModelInfo model in models)
            {
                foreach (string level in model.SupportedEffortLevels)
                {
                    if (level.Length > 0 && seen.Add(level))
                    {
                        union.Add(level);
                    }
                }
            }

            return union;
        }

        private static string ResolveDefaultModel(IReadOnlyList<AgentModelInfo> models)
        {
            foreach (AgentModelInfo model in models)
            {
                if (string.Equals(model.Value, "default", StringComparison.Ordinal))
                {
                    return model.ResolvedModel;
                }
            }

            return models.Count > 0 ? models[0].ResolvedModel : string.Empty;
        }

        private static IReadOnlyList<AgentSlashCommand> ReadCommandInfos(JsonElement array)
        {
            var list = new List<AgentSlashCommand>();

            foreach (JsonElement item in array.EnumerateArray())
            {
                string name = ReadString(item, "name");

                if (name.Length == 0)
                {
                    continue;
                }

                list.Add(new AgentSlashCommand
                {
                    Name = name,
                    Description = ReadString(item, "description"),
                    ArgumentHint = ReadString(item, "argumentHint")
                });
            }

            return list;
        }

        private static IReadOnlyList<string> ReadObjectNames(JsonElement array)
        {
            var list = new List<string>();

            foreach (JsonElement item in array.EnumerateArray())
            {
                string name = ReadString(item, "name");

                if (name.Length > 0)
                {
                    list.Add(name);
                }
            }

            return list;
        }

        private static IReadOnlyList<AgentModelInfo> ReadModels(JsonElement body)
        {
            if (!body.TryGetProperty("models", out JsonElement array) || array.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<AgentModelInfo>();
            }

            var list = new List<AgentModelInfo>();

            foreach (JsonElement item in array.EnumerateArray())
            {
                list.Add(new AgentModelInfo
                {
                    Value = ReadString(item, "value"),
                    DisplayName = ReadString(item, "displayName"),
                    ResolvedModel = ReadString(item, "resolvedModel"),
                    Description = ReadString(item, "description"),
                    SupportsEffort = ReadBool(item, "supportsEffort"),
                    SupportedEffortLevels = ReadStringArray(item, "supportedEffortLevels")
                });
            }

            return list;
        }

        private static string ReadSubscriptionType(JsonElement body)
        {
            if (!body.TryGetProperty("account", out JsonElement account) || account.ValueKind != JsonValueKind.Object)
            {
                return string.Empty;
            }

            return ReadString(account, "subscriptionType");
        }

        private IReadOnlyList<AgentEvent> ParseRateLimit(JsonElement root)
        {
            if (!root.TryGetProperty("rate_limit_info", out JsonElement info) || info.ValueKind != JsonValueKind.Object)
            {
                return Empty;
            }

            var rateLimit = new AgentRateLimit
            {
                Status = ReadString(info, "status"),
                LimitType = ReadString(info, "rateLimitType"),
                Utilization = ReadDouble(info, "utilization"),
                ResetsAt = ReadLong(info, "resetsAt"),
                IsUsingOverage = ReadBool(info, "isUsingOverage")
            };

            AgentEvent rateEvent = AgentEvent.RateLimit(rateLimit);
            return new[] { rateEvent };
        }

        private IReadOnlyList<AgentEvent> ParseResult(JsonElement root)
        {
            var events = new List<AgentEvent>();

            string subtype = ReadString(root, "subtype");
            string terminalReason = ReadString(root, "terminal_reason");

            bool wasInterrupted = terminalReason == "aborted"
                               || terminalReason == "aborted_streaming"
                               || subtype == "error_during_execution";

            var usage = new AgentUsage
            {
                CostUsd = ReadDouble(root, "total_cost_usd"),
                DurationMs = ReadInt(root, "duration_ms")
            };

            if (root.TryGetProperty("usage", out JsonElement usageNode) && usageNode.ValueKind == JsonValueKind.Object)
            {
                usage.InputTokens = ReadInt(usageNode, "input_tokens");
                usage.OutputTokens = ReadInt(usageNode, "output_tokens");
                usage.CacheReadTokens = ReadInt(usageNode, "cache_read_input_tokens");
                usage.CacheCreationTokens = ReadInt(usageNode, "cache_creation_input_tokens");
            }

            var denials = new List<AgentPermissionDenial>();

            if (root.TryGetProperty("permission_denials", out JsonElement denialArray)
                && denialArray.ValueKind == JsonValueKind.Array)
            {
                foreach (JsonElement denial in denialArray.EnumerateArray())
                {
                    denials.Add(new AgentPermissionDenial
                    {
                        ToolName = ReadString(denial, "tool_name"),
                        ToolUseId = ReadString(denial, "tool_use_id"),
                        ToolInputJson = ReadRawJson(denial, "tool_input")
                    });
                }
            }

            // 非成功且非用户中断时，先把原因说清楚再关闭轮次，否则转录无法自证发生了什么。
            if (subtype != "success" && !wasInterrupted)
            {
                string message = ReadString(root, "result");

                if (string.IsNullOrEmpty(message))
                {
                    message = ReadString(root, "error");
                }

                if (string.IsNullOrEmpty(message))
                {
                    message = subtype;
                }

                events.Add(AgentEvent.Failure(message));
            }

            var result = new AgentTurnResult
            {
                Usage = usage,
                WasInterrupted = wasInterrupted,
                PermissionDenials = denials
            };

            events.Add(AgentEvent.Completed(result));
            return events;
        }

        #endregion

        #region JSON 读取辅助

        private static string ReadString(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object)
            {
                return string.Empty;
            }

            if (!parent.TryGetProperty(name, out JsonElement value) || value.ValueKind != JsonValueKind.String)
            {
                return string.Empty;
            }

            string text = value.GetString() ?? string.Empty;
            return text;
        }

        private static int ReadInt(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object)
            {
                return 0;
            }

            if (!parent.TryGetProperty(name, out JsonElement value) || value.ValueKind != JsonValueKind.Number)
            {
                return 0;
            }

            int number = value.TryGetInt32(out int parsed) ? parsed : 0;
            return number;
        }

        private static long ReadLong(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object)
            {
                return 0L;
            }

            if (!parent.TryGetProperty(name, out JsonElement value) || value.ValueKind != JsonValueKind.Number)
            {
                return 0L;
            }

            long number = value.TryGetInt64(out long parsed) ? parsed : 0L;
            return number;
        }

        private static double ReadDouble(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object)
            {
                return 0d;
            }

            if (!parent.TryGetProperty(name, out JsonElement value) || value.ValueKind != JsonValueKind.Number)
            {
                return 0d;
            }

            double number = value.TryGetDouble(out double parsed) ? parsed : 0d;
            return number;
        }

        private static bool ReadBool(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            if (!parent.TryGetProperty(name, out JsonElement value))
            {
                return false;
            }

            bool flag = value.ValueKind == JsonValueKind.True;
            return flag;
        }

        private static string ReadRawJson(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(name, out JsonElement value))
            {
                return string.Empty;
            }

            string raw = value.GetRawText();
            return raw;
        }

        private static IReadOnlyList<string> ReadStringArray(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object
                || !parent.TryGetProperty(name, out JsonElement array)
                || array.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<string>();
            }

            var list = new List<string>();

            foreach (JsonElement item in array.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    list.Add(item.GetString() ?? string.Empty);
                }
            }

            return list;
        }

        private static IReadOnlyList<McpServerInfo> ReadMcpServers(JsonElement root)
        {
            if (!root.TryGetProperty("mcp_servers", out JsonElement array) || array.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<McpServerInfo>();
            }

            var list = new List<McpServerInfo>();

            foreach (JsonElement item in array.EnumerateArray())
            {
                list.Add(new McpServerInfo
                {
                    Name = ReadString(item, "name"),
                    Status = ReadString(item, "status")
                });
            }

            return list;
        }

        private static AgentUsage? ReadUsage(JsonElement message)
        {
            if (!message.TryGetProperty("usage", out JsonElement usageNode) || usageNode.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var usage = new AgentUsage
            {
                InputTokens = ReadInt(usageNode, "input_tokens"),
                OutputTokens = ReadInt(usageNode, "output_tokens"),
                CacheReadTokens = ReadInt(usageNode, "cache_read_input_tokens"),
                CacheCreationTokens = ReadInt(usageNode, "cache_creation_input_tokens")
            };

            return usage;
        }

        private static string FlattenResultContent(JsonElement block)
        {
            if (!block.TryGetProperty("content", out JsonElement content))
            {
                return string.Empty;
            }

            if (content.ValueKind == JsonValueKind.String)
            {
                string text = content.GetString() ?? string.Empty;
                return text;
            }

            if (content.ValueKind != JsonValueKind.Array)
            {
                return string.Empty;
            }

            var parts = new List<string>();

            foreach (JsonElement item in content.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    parts.Add(item.GetString() ?? string.Empty);
                    continue;
                }

                string itemText = ReadString(item, "text");

                if (!string.IsNullOrEmpty(itemText))
                {
                    parts.Add(itemText);
                }
            }

            string joined = string.Join("\n", parts);
            return joined;
        }

        #endregion
    }
}
