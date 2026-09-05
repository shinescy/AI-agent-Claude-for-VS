// 解析 mcp list 的文本输出

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>解析 <c>claude mcp list</c>。</summary>
    public static class McpListParser
    {
        #region 解析

        public static IReadOnlyList<PanelItem> Parse(string text)
        {
            var items = new List<PanelItem>();

            if (string.IsNullOrWhiteSpace(text))
            {
                return items;
            }

            string[] lines = text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);

            foreach (string line in lines)
            {
                string trimmed = line.Trim();

                if (trimmed.Length == 0 || trimmed.StartsWith("Checking MCP server health", StringComparison.Ordinal))
                {
                    continue;
                }

                items.Add(ReadLine(trimmed));
            }

            return items;
        }

        private static PanelItem ReadLine(string line)
        {
            int separator = line.IndexOf(": ", StringComparison.Ordinal);

            if (separator <= 0)
            {
                // 认不出就原样留着，绝不丢弃。
                return new PanelItem { Id = line, ActionValue = line, Title = line, Enabled = true };
            }

            string name = line.Substring(0, separator);
            string rest = line.Substring(separator + 2).Trim();

            int statusAt = rest.LastIndexOf(" - ", StringComparison.Ordinal);
            string address = statusAt > 0 ? rest.Substring(0, statusAt).Trim() : rest;
            string status = statusAt > 0 ? rest.Substring(statusAt + 3).Trim() : string.Empty;

            var item = new PanelItem
            {
                Id = name,
                ActionValue = name,
                Title = name,
                Subtitle = address,
                Enabled = status.IndexOf("Connected", StringComparison.OrdinalIgnoreCase) >= 0
                    && status.IndexOf("Failed", StringComparison.OrdinalIgnoreCase) < 0
            };

            item.Fields["url"] = address;
            item.Fields["status"] = status;

            return item;
        }

        #endregion
    }
}
