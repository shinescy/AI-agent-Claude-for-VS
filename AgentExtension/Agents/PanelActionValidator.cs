// 槽位值校验——面板通道的安全边界

using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace AgentExtension.Agents
{
    /// <summary>槽位值校验。</summary>
    public static class PanelActionValidator
    {
        #region 常量

        private static readonly Regex ServerNamePattern =
            new Regex(@"\A[A-Za-z0-9_][A-Za-z0-9_-]{0,63}\z", RegexOptions.Compiled);

        private static readonly string[] PluginScopes = { "user", "project", "local", "managed" };

        private const int MaximumSlotValueLength = 512;


        #endregion

        #region 校验

        /// <summary>校验一条动作的全部槽位值。</summary>
        public static SlotValidationResult Validate(
            PanelAction action,
            IReadOnlyList<string> values,
            Func<PanelSet, IReadOnlyCollection<string>?> setLookup)
        {
            if (action == null)
            {
                return SlotValidationResult.Reject("动作不存在。");
            }

            if (values == null || values.Count != action.Slots.Length)
            {
                return SlotValidationResult.Reject(
                    $"参数个数不对：需要 {action.Slots.Length} 个，收到 {values?.Count ?? 0} 个。");
            }

            for (int i = 0; i < action.Slots.Length; i++)
            {
                SlotValidationResult single = ValidateSlot(action.Slots[i], values[i], setLookup);

                if (!single.Accepted)
                {
                    return single;
                }
            }

            return SlotValidationResult.Accept();
        }

        private static SlotValidationResult ValidateSlot(
            SlotSpec slot,
            string value,
            Func<PanelSet, IReadOnlyCollection<string>?> setLookup)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return SlotValidationResult.Reject("参数为空。");
            }

            if (value.StartsWith("-", StringComparison.Ordinal))
            {
                return SlotValidationResult.Reject("参数不能以连字符开头，会被当成命令行标志位。");
            }

            if (value.Length > MaximumSlotValueLength)
            {
                return SlotValidationResult.Reject(
                    $"参数过长（{value.Length} 字符，上限 {MaximumSlotValueLength}）。");
            }

            if (slot.SourceSet != PanelSet.None)
            {
                IReadOnlyCollection<string>? set = setLookup(slot.SourceSet);

                if (set == null)
                {
                    // 没有集合就等于没有校验，宁可拒绝。
                    return SlotValidationResult.Reject("列表尚未取到，请先刷新面板。");
                }

                foreach (string candidate in set)
                {
                    if (string.Equals(candidate, value, StringComparison.Ordinal))
                    {
                        return SlotValidationResult.Accept();
                    }
                }

                return SlotValidationResult.Reject($"“{value}” 不在当前列表里，请刷新面板后重试。");
            }

            switch (slot.Format)
            {
                case SlotFormat.RemoteUrl:
                {
                    foreach (char c in value)
                    {
                        if (char.IsWhiteSpace(c))
                        {
                            return SlotValidationResult.Reject("地址不能包含空白符。");
                        }

                        if (char.IsControl(c))
                        {
                            return SlotValidationResult.Reject("地址不能包含控制字符。");
                        }

                        if (c == '"')
                        {
                            return SlotValidationResult.Reject("地址不能包含双引号。");
                        }
                    }

                    bool parsed = Uri.TryCreate(value, UriKind.Absolute, out Uri uri);

                    if (!parsed || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
                    {
                        return SlotValidationResult.Reject("地址必须是 http 或 https 开头的完整 URL。");
                    }

                    return SlotValidationResult.Accept();
                }

                case SlotFormat.PluginScope:
                {
                    foreach (string scope in PluginScopes)
                    {
                        if (string.Equals(scope, value, StringComparison.Ordinal))
                        {
                            return SlotValidationResult.Accept();
                        }
                    }

                    return SlotValidationResult.Reject(
                        $"作用域 “{value}” 不是合法取值（{string.Join(" / ", PluginScopes)}）。");
                }

                case SlotFormat.ServerName:
                {
                    if (!ServerNamePattern.IsMatch(value))
                    {
                        return SlotValidationResult.Reject(
                            "名称只能是字母、数字、下划线、连字符，1–64 位，且不能以连字符开头。");
                    }

                    return SlotValidationResult.Accept();
                }

                default:
                {
                    return SlotValidationResult.Reject("该参数没有声明校验方式，已拒绝执行。");
                }
            }
        }

        #endregion
    }
}
