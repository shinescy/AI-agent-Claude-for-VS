// 解析 agents --json

using System;
using System.Collections.Generic;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>解析 <c>claude agents --json</c>。</summary>
    public static class AgentsListParser
    {
        #region 解析

        public static IReadOnlyList<PanelItem> Parse(string json)
        {
            var items = new List<PanelItem>();

            using (JsonDocument document = ParseDocument(json))
            {
                if (document.RootElement.ValueKind != JsonValueKind.Array)
                {
                    throw new JsonException("agents --json 的根节点不是数组。");
                }

                int index = 0;

                foreach (JsonElement element in document.RootElement.EnumerateArray())
                {
                    items.Add(ReadItem(element, index));
                    index++;
                }
            }

            return items;
        }

        private static JsonDocument ParseDocument(string json)
        {
            try
            {
                JsonDocument document = JsonDocument.Parse(json);
                return document;
            }
            catch (JsonException ex) when (ex.GetType() != typeof(JsonException))
            {
                // System.Text.Json 对非法 JSON 会抛更具体的子类型（如 JsonReaderException），
                throw new JsonException(ex.Message, ex);
            }
        }

        private static PanelItem ReadItem(JsonElement element, int index)
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                throw new JsonException(
                    $"agents --json 第 {index} 项不是对象：{element.GetRawText()}");
            }

            string sessionId = ReadString(element, "sessionId");

            if (string.IsNullOrWhiteSpace(sessionId))
            {
                // sessionId 是唯一必须可靠的字段：它构成条目的复合 Id。
                throw new JsonException(
                    $"agents --json 第 {index} 项缺少有效的 sessionId：{element.GetRawText()}");
            }

            string status = ReadString(element, "status");
            string kind = ReadString(element, "kind");
            string pid = element.TryGetProperty("pid", out JsonElement pidElement)
                && pidElement.ValueKind == JsonValueKind.Number
                ? pidElement.GetInt32().ToString()
                : string.Empty;

            var item = new PanelItem
            {
                // sessionId 不保证唯一——实测存在同一会话被多个进程共享的记录（同 sessionId 不同 pid）。
                Id = $"{sessionId}#{pid}",
                ActionValue = sessionId,
                Title = ReadString(element, "name"),
                Subtitle = status.Length > 0 ? $"{kind} · {status}" : kind,
                Enabled = string.Equals(status, "idle", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(status, "busy", StringComparison.OrdinalIgnoreCase)
            };

            item.Fields["session"] = sessionId;
            item.Fields["status"] = status;
            item.Fields["kind"] = kind;
            item.Fields["cwd"] = ReadString(element, "cwd");
            item.Fields["pid"] = pid;

            return item;
        }

        private static string ReadString(JsonElement element, string name)
        {
            if (element.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String)
            {
                return value.GetString() ?? string.Empty;
            }

            return string.Empty;
        }

        #endregion
    }
}
