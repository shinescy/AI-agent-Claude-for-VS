// 解析 CLI 对 list_cloud_sessions 控制请求的回包

using System;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 回包形状取自 2026-11-18 实测（CLI 2.1.326）与 CLI 自带的协议定义。
    /// </summary>
    /// <remarks>
    /// <c>{"type":"control_response","response":{"subtype":"success","request_id":"…","response":{…}}}</c>；
    /// 内层 <c>status</c> 为 <c>ok</c> 带 <c>sessions</c>，为 <c>unavailable</c> 带 <c>reason</c> 与 <c>message</c>。
    /// </remarks>
    public static class CloudSessionListParser
    {
        #region 解析

        /// <summary>这一行是不是给这条请求的回包；不是返回 null。</summary>
        public static CloudSessionListResult? Parse(string? line, string requestId)
        {
            string text = line ?? string.Empty;

            // 便宜的预筛：流里绝大多数行与此无关
            if (text.IndexOf("control_response", StringComparison.Ordinal) < 0
                || text.IndexOf(requestId, StringComparison.Ordinal) < 0)
            {
                return null;
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(text))
                {
                    JsonElement root = document.RootElement;
                    JsonElement envelope;

                    if (root.ValueKind != JsonValueKind.Object
                        || ReadString(root, "type") != "control_response"
                        || !root.TryGetProperty("response", out envelope)
                        || envelope.ValueKind != JsonValueKind.Object
                        || ReadString(envelope, "request_id") != requestId)
                    {
                        return null;
                    }

                    if (ReadString(envelope, "subtype") != "success")
                    {
                        // 老 CLI 不认这条请求时走这里
                        string error = ReadString(envelope, "error");
                        return CloudSessionListResult.Unavailable("unsupported", error);
                    }

                    JsonElement body;

                    if (!envelope.TryGetProperty("response", out body) || body.ValueKind != JsonValueKind.Object)
                    {
                        return CloudSessionListResult.Unavailable("failed", string.Empty);
                    }

                    CloudSessionListResult parsed = ParseBody(body);
                    return parsed;
                }
            }
            catch (JsonException)
            {
                return null;
            }
        }

        private static CloudSessionListResult ParseBody(JsonElement body)
        {
            if (ReadString(body, "status") != "ok")
            {
                string reason = ReadString(body, "reason");
                return CloudSessionListResult.Unavailable(
                    reason.Length > 0 ? reason : "failed", ReadString(body, "message"));
            }

            var result = new CloudSessionListResult { Available = true };
            JsonElement truncated;

            result.Truncated = body.TryGetProperty("truncated", out truncated)
                && truncated.ValueKind == JsonValueKind.True;

            JsonElement sessions;

            if (!body.TryGetProperty("sessions", out sessions) || sessions.ValueKind != JsonValueKind.Array)
            {
                return result;
            }

            foreach (JsonElement item in sessions.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                string id = ReadString(item, "id");

                // id 之后会进命令行，形状不对的整条丢掉
                if (!CloudSessionId.IsValid(id))
                {
                    continue;
                }

                result.Sessions.Add(new CloudSessionEntry
                {
                    Id = id,
                    Title = ReadString(item, "title"),
                    UpdatedAt = ReadString(item, "updated_at"),
                    Status = ReadString(item, "status"),
                    Repository = ReadRepository(item),
                    Branch = ReadString(item, "branch"),
                    EnvironmentKind = ReadString(item, "environment_kind")
                });
            }

            return result;
        }

        private static string ReadRepository(JsonElement item)
        {
            JsonElement repository;

            if (!item.TryGetProperty("repository", out repository) || repository.ValueKind != JsonValueKind.Object)
            {
                return string.Empty;
            }

            string owner = ReadString(repository, "owner");
            string name = ReadString(repository, "name");
            string joined = owner.Length > 0 && name.Length > 0 ? owner + "/" + name : name;
            return joined;
        }

        private static string ReadString(JsonElement element, string name)
        {
            JsonElement value;

            if (element.TryGetProperty(name, out value) && value.ValueKind == JsonValueKind.String)
            {
                string text = value.GetString() ?? string.Empty;
                return text;
            }

            return string.Empty;
        }

        #endregion
    }
}
