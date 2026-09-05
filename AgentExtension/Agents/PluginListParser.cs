// 解析 plugin list --json

using System.Collections.Generic;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>解析 <c>claude plugin list --json</c>。</summary>
    public static class PluginListParser
    {
        #region 解析

        public static IReadOnlyList<PanelItem> Parse(string json)
        {
            var items = new List<PanelItem>();

            using (JsonDocument document = ParseDocument(json))
            {
                if (document.RootElement.ValueKind != JsonValueKind.Array)
                {
                    throw new JsonException("plugin list --json 的根节点不是数组。");
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
                    $"plugin list --json 第 {index} 项不是对象：{element.GetRawText()}");
            }

            string id = ReadString(element, "id");

            if (string.IsNullOrWhiteSpace(id))
            {
                // id 是唯一必须可靠的字段：后续动作靠它做集合成员校验，
                throw new JsonException(
                    $"plugin list --json 第 {index} 项缺少有效的 id：{element.GetRawText()}");
            }

            string version = ReadString(element, "version");
            string scope = ReadString(element, "scope");
            string projectPath = ReadString(element, "projectPath");

            var item = new PanelItem
            {
                // id 不保证唯一——实测同一个 id 会在 user 作用域一份、多个项目的 local 作用域
                Id = Compose(id, scope, projectPath),
                // 传给 CLI 的实参必须是原始 id：复合值 CLI 认不出，会被当成不存在的插件。
                ActionValue = id,
                Title = SplitName(id),
                Subtitle = $"{version} · {scope}",
                Enabled = element.TryGetProperty("enabled", out JsonElement enabled)
                    && enabled.ValueKind == JsonValueKind.True,
                Scope = scope
            };

            item.Fields["marketplace"] = SplitMarketplace(id);
            item.Fields["version"] = version;
            item.Fields["scope"] = scope;
            item.Fields["installPath"] = ReadString(element, "installPath");
            item.Fields["installedAt"] = ReadString(element, "installedAt");

            if (projectPath.Length > 0)
            {
                // 只有 local 作用域的记录才带这个字段；也是区分同 id 多条 local 记录的唯一依据。
                item.Fields["projectPath"] = projectPath;
            }

            return item;
        }

        /// <summary>把三段拼成列表内唯一的 Id。</summary>
        private static string Compose(string id, string scope, string projectPath)
        {
            return $"{Escape(id)}#{Escape(scope)}#{Escape(projectPath)}";
        }

        private static string Escape(string value)
        {
            return value.Replace("%", "%25").Replace("#", "%23");
        }

        private static string SplitName(string id)
        {
            int at = id.IndexOf('@');
            return at > 0 ? id.Substring(0, at) : id;
        }

        private static string SplitMarketplace(string id)
        {
            int at = id.IndexOf('@');
            return at >= 0 && at < id.Length - 1 ? id.Substring(at + 1) : string.Empty;
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
