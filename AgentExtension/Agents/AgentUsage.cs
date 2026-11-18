// 一个轮次的 token 用量与成本

using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>token 用量与成本。</summary>
    public class AgentUsage
    {
        public int InputTokens { get; set; }

        public int OutputTokens { get; set; }

        public int CacheReadTokens { get; set; }

        public int CacheCreationTokens { get; set; }

        public double CostUsd { get; set; }

        public int DurationMs { get; set; }

        /// <summary>这次写入缓存的有效期：1h、5m，没写入为空串。</summary>
        public string CacheTtl { get; set; } = string.Empty;

        /// <summary>这条回复的时刻，Unix 毫秒；不知道为 0。</summary>
        public long AtUnixMs { get; set; }

        /// <summary>从消息的 usage 节点读用量；没有该节点返回 null。</summary>
        public static AgentUsage? FromMessage(JsonElement message, long atUnixMs)
        {
            if (message.ValueKind != JsonValueKind.Object
                || !message.TryGetProperty("usage", out JsonElement node)
                || node.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var usage = new AgentUsage
            {
                InputTokens = ReadInt(node, "input_tokens"),
                OutputTokens = ReadInt(node, "output_tokens"),
                CacheReadTokens = ReadInt(node, "cache_read_input_tokens"),
                CacheCreationTokens = ReadInt(node, "cache_creation_input_tokens"),
                AtUnixMs = atUnixMs
            };

            if (node.TryGetProperty("cache_creation", out JsonElement creation))
            {
                if (ReadInt(creation, "ephemeral_1h_input_tokens") > 0)
                {
                    usage.CacheTtl = "1h";
                }
                else if (ReadInt(creation, "ephemeral_5m_input_tokens") > 0)
                {
                    usage.CacheTtl = "5m";
                }
            }

            return usage;
        }

        /// <summary>读整数字段，缺失或类型不对为 0。</summary>
        private static int ReadInt(JsonElement parent, string name)
        {
            if (parent.ValueKind != JsonValueKind.Object
                || !parent.TryGetProperty(name, out JsonElement value)
                || value.ValueKind != JsonValueKind.Number)
            {
                return 0;
            }

            int number = value.TryGetInt32(out int parsed) ? parsed : 0;
            return number;
        }
    }
}
