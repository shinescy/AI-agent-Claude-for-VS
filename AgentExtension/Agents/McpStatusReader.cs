// mcp_status 控制请求的回包解析

using System;
using System.Collections.Generic;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>把 mcp_status 回包读成 MCP 服务器列表。</summary>
    public static class McpStatusReader
    {
        /// <summary>读回包；认不出就返回 null，与「零个服务器」区分开。</summary>
        public static IReadOnlyList<McpServerInfo>? Read(string response)
        {
            if (string.IsNullOrWhiteSpace(response))
            {
                return null;
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(response))
                {
                    JsonElement root = document.RootElement;

                    if (root.ValueKind != JsonValueKind.Object)
                    {
                        return null;
                    }

                    JsonElement array;
                    bool found = root.TryGetProperty("mcpServers", out array)
                              || root.TryGetProperty("mcp_servers", out array);

                    if (!found || array.ValueKind != JsonValueKind.Array)
                    {
                        return null;
                    }

                    var list = new List<McpServerInfo>();

                    foreach (JsonElement item in array.EnumerateArray())
                    {
                        string name = ReadString(item, "name");

                        if (name.Length == 0)
                        {
                            continue;
                        }

                        list.Add(new McpServerInfo { Name = name, Status = ReadString(item, "status") });
                    }

                    return list;
                }
            }
            catch (JsonException)
            {
                return null;
            }
        }

        /// <summary>读字符串字段，缺失或非字符串为空串。</summary>
        private static string ReadString(JsonElement item, string field)
        {
            if (item.ValueKind != JsonValueKind.Object
                || !item.TryGetProperty(field, out JsonElement value)
                || value.ValueKind != JsonValueKind.String)
            {
                return string.Empty;
            }

            string text = value.GetString() ?? string.Empty;
            return text;
        }
    }
}
