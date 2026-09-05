// 转录 JSON 行的公共解析工具，SessionHistoryReader 与 TranscriptReplayReader 共用
//
// 两者读的是同一种转录文件格式（CLI 写的 .jsonl）。之前各自维护一份 TryParse / ReadString /
// 命令名正则，逐字重复；CLI 哪天改了命令包装体的写法，两处漏改一处就是行为悄悄分叉、
// 还不报错——正是这个项目最忌讳的静默不一致。收进一个帮助类，两边只改一处。

using System.Text.Json;
using System.Text.RegularExpressions;

namespace AgentExtension.Agents
{
    /// <summary>转录（.jsonl）单行 JSON 的解析辅助。</summary>
    internal static class TranscriptJson
    {
        /// <summary>命令记录形如 <c>&lt;command-name&gt;/status&lt;/command-name&gt;</c>，取出命令名。</summary>
        public static readonly Regex CommandName = new Regex(
            @"<command-name>\s*/?(?<name>[^<\s]+)\s*</command-name>", RegexOptions.Compiled);

        /// <summary>解析一行 JSON。</summary>
        public static bool TryParse(string line, out JsonElement root)
        {
            root = default(JsonElement);

            try
            {
                using (JsonDocument document = JsonDocument.Parse(line))
                {
                    // JsonDocument 一释放，它的 RootElement 就不能再用了，必须克隆。
                    JsonElement clone = document.RootElement.Clone();
                    root = clone;
                    return true;
                }
            }
            catch (JsonException)
            {
                return false;
            }
        }

        /// <summary>读一个字符串字段，字段不存在或类型不对就返回空串。</summary>
        public static string ReadString(JsonElement root, string name)
        {
            if (root.ValueKind != JsonValueKind.Object)
            {
                return string.Empty;
            }

            JsonElement value;

            if (!root.TryGetProperty(name, out value) || value.ValueKind != JsonValueKind.String)
            {
                return string.Empty;
            }

            string text = value.GetString() ?? string.Empty;
            return text;
        }
    }
}
