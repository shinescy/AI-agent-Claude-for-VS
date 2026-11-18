// 钩子修改（claude edit-hook --json）的输入校验与拒绝解读

using System;
using System.Collections.Generic;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>把前端给的钩子修改校验后拼成 edit-hook 的输入。</summary>
    public static class HookEditRules
    {
        #region 白名单

        /// <summary>能做的操作。</summary>
        private static readonly HashSet<string> Ops =
            new HashSet<string>(StringComparer.Ordinal) { "add", "replace", "remove" };

        /// <summary>能写的三个设置文件。</summary>
        private static readonly HashSet<string> Sources =
            new HashSet<string>(StringComparer.Ordinal) { "userSettings", "projectSettings", "localSettings" };

        /// <summary>钩子类型。</summary>
        private static readonly HashSet<string> HookTypes =
            new HashSet<string>(StringComparer.Ordinal) { "command", "prompt", "agent", "http", "mcp_tool" };

        /// <summary>一条钩子配置序列化后的上限。</summary>
        private const int MaxHookLength = 100000;

        #endregion

        #region 校验

        /// <summary>校验并拼成子命令输入；不合规就抛 InvalidOperationException。</summary>
        public static string Build(JsonElement edit)
        {
            if (edit.ValueKind != JsonValueKind.Object)
            {
                throw Invalid("请求不是对象");
            }

            string op = ReadString(edit, "op");
            string source = ReadString(edit, "source");
            string eventName = ReadString(edit, "event");

            if (!Ops.Contains(op) || !Sources.Contains(source) || !IsEventName(eventName))
            {
                throw Invalid("操作、来源或事件不对");
            }

            var input = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["op"] = op,
                ["source"] = source,
                ["event"] = eventName
            };

            if (op != "remove")
            {
                input["matcher"] = ReadMatcher(edit);
                input["hook"] = ReadHook(edit, "hook");
            }

            if (op != "add")
            {
                input["target"] = ReadTarget(edit);
            }

            string json = JsonSerializer.Serialize(input);
            return json;
        }

        /// <summary>改或删要指明原来那条：{event, matcher, hook}。</summary>
        private static Dictionary<string, object> ReadTarget(JsonElement edit)
        {
            if (!edit.TryGetProperty("target", out JsonElement target) || target.ValueKind != JsonValueKind.Object)
            {
                throw Invalid("缺少原来那条钩子");
            }

            string eventName = ReadString(target, "event");

            if (!IsEventName(eventName))
            {
                throw Invalid("原来那条的事件不对");
            }

            var result = new Dictionary<string, object>(StringComparer.Ordinal)
            {
                ["event"] = eventName,
                ["matcher"] = ReadMatcher(target),
                ["hook"] = ReadHook(target, "hook")
            };

            return result;
        }

        /// <summary>matcher 可为空串，最长 1000。</summary>
        private static string ReadMatcher(JsonElement parent)
        {
            string matcher = ReadString(parent, "matcher");

            if (matcher.Length > 1000)
            {
                throw Invalid("匹配条件太长");
            }

            return matcher;
        }

        /// <summary>钩子配置：对象、类型在白名单里、不超长；原样带过去由 CLI 细查。</summary>
        private static JsonElement ReadHook(JsonElement parent, string name)
        {
            if (!parent.TryGetProperty(name, out JsonElement hook) || hook.ValueKind != JsonValueKind.Object)
            {
                throw Invalid("缺少钩子配置");
            }

            if (!HookTypes.Contains(ReadString(hook, "type")) || hook.GetRawText().Length > MaxHookLength)
            {
                throw Invalid("钩子类型不对或配置太长");
            }

            JsonElement copy = hook.Clone();
            return copy;
        }

        /// <summary>事件名只能是字母，最长 100。</summary>
        private static bool IsEventName(string name)
        {
            if (name.Length == 0 || name.Length > 100)
            {
                return false;
            }

            foreach (char c in name)
            {
                if (!(c >= 'A' && c <= 'Z') && !(c >= 'a' && c <= 'z'))
                {
                    return false;
                }
            }

            return true;
        }

        #endregion

        #region 拒绝

        /// <summary>stdout 最后一行若是 {"refusal":{code,file}}，给出说明；否则空串。</summary>
        public static string DescribeRefusal(string standardOutput)
        {
            string[] lines = (standardOutput ?? string.Empty).Trim().Split('\n');
            string last = lines[lines.Length - 1].Trim();

            if (!last.StartsWith("{", StringComparison.Ordinal))
            {
                return string.Empty;
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(last))
                {
                    JsonElement root = document.RootElement;

                    if (root.ValueKind != JsonValueKind.Object
                        || !root.TryGetProperty("refusal", out JsonElement refusal)
                        || refusal.ValueKind != JsonValueKind.Object)
                    {
                        return string.Empty;
                    }

                    string code = ReadString(refusal, "code");
                    string file = ReadString(refusal, "file");
                    string message = $"CLI 拒绝修改 {(file.Length > 0 ? file : "设置文件")}（原因代码：{code}），没有做任何改动。请在编辑器里检查这个文件。";
                    return message;
                }
            }
            catch (JsonException)
            {
                return string.Empty;
            }
        }

        #endregion

        #region 工具

        private static string ReadString(JsonElement parent, string name)
        {
            string value = parent.ValueKind == JsonValueKind.Object
                && parent.TryGetProperty(name, out JsonElement element)
                && element.ValueKind == JsonValueKind.String
                ? element.GetString() ?? string.Empty
                : string.Empty;
            return value;
        }

        private static InvalidOperationException Invalid(string why)
        {
            var exception = new InvalidOperationException("不是有效的钩子修改：" + why + "。");
            return exception;
        }

        #endregion
    }
}
