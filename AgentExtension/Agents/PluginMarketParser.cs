// 解析 plugin list --json --available 的市场条目

using System.Collections.Generic;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>解析 <c>claude plugin list --json --available</c>。</summary>
    public static class PluginMarketParser
    {
        #region 解析

        public static IReadOnlyList<PanelItem> Parse(string json)
        {
            var items = new List<PanelItem>();

            using (JsonDocument document = ParseDocument(json))
            {
                JsonElement root = document.RootElement;

                if (root.ValueKind != JsonValueKind.Object)
                {
                    throw new JsonException("plugin list --json --available 的根节点不是对象。");
                }

                if (!root.TryGetProperty("available", out JsonElement available)
                    || available.ValueKind != JsonValueKind.Array)
                {
                    throw new JsonException("plugin list --json --available 缺少 available 数组。");
                }

                int index = 0;

                foreach (JsonElement element in available.EnumerateArray())
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
                // System.Text.Json 对非法 JSON 会抛更具体的子类型，统一成基类，
                throw new JsonException(ex.Message, ex);
            }
        }

        private static PanelItem ReadItem(JsonElement element, int index)
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                throw new JsonException(
                    $"available 第 {index} 项不是对象：{element.GetRawText()}");
            }

            string pluginId = ReadString(element, "pluginId");

            if (string.IsNullOrWhiteSpace(pluginId))
            {
                // pluginId 是唯一必须可靠的字段：它是安装动作的槽位值，
                throw new JsonException(
                    $"available 第 {index} 项缺少有效的 pluginId：{element.GetRawText()}");
            }

            string name = ReadString(element, "name");
            string marketplaceName = ReadString(element, "marketplaceName");
            string description = ReadString(element, "description");
            string source = ReadSource(element);
            string installCount = ReadNumber(element, "installCount");

            var item = new PanelItem
            {
                Id = pluginId,
                ActionValue = pluginId,
                Title = name,
                Subtitle = installCount.Length > 0
                    ? $"{marketplaceName} · {installCount} 次安装"
                    : marketplaceName,
                Enabled = true,
                Detail = description
            };

            item.Fields["marketplace"] = marketplaceName;
            item.Fields["source"] = source;
            item.Fields["installCount"] = installCount;

            return item;
        }

        private static string ReadSource(JsonElement element)
        {
            if (!element.TryGetProperty("source", out JsonElement source))
            {
                return string.Empty;
            }

            if (source.ValueKind == JsonValueKind.String)
            {
                return source.GetString() ?? string.Empty;
            }

            if (source.ValueKind == JsonValueKind.Object)
            {
                string url = ReadString(source, "url");
                string path = ReadString(source, "path");
                string reference = ReadString(source, "ref");

                string text = url;

                if (path.Length > 0)
                {
                    text += "/" + path.TrimStart('/');
                }

                if (reference.Length > 0)
                {
                    text += "@" + reference;
                }

                return text;
            }

            return string.Empty;
        }

        private static string ReadString(JsonElement element, string name)
        {
            if (element.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String)
            {
                return value.GetString() ?? string.Empty;
            }

            return string.Empty;
        }

        private static string ReadNumber(JsonElement element, string name)
        {
            if (element.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.Number)
            {
                return value.GetRawText();
            }

            return string.Empty;
        }

        #endregion
    }
}
