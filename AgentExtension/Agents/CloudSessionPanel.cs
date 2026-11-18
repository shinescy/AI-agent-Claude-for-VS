// 把网页会话投影成面板条目，把「读不了」说成人话

using System;
using System.Collections.Generic;
using System.Globalization;

namespace AgentExtension.Agents
{
    /// <summary>网页会话面板的投影。</summary>
    public static class CloudSessionPanel
    {
        #region 条目

        /// <summary>逐条投影；顺序照服务端给的（最近的在前）。</summary>
        public static IReadOnlyList<PanelItem> ToPanelItems(CloudSessionListResult result)
        {
            var items = new List<PanelItem>(result.Sessions.Count);

            foreach (CloudSessionEntry entry in result.Sessions)
            {
                var item = new PanelItem
                {
                    Id = entry.Id,
                    ActionValue = entry.Id,
                    Title = entry.Title.Trim().Length > 0 ? entry.Title.Trim() : "（没有标题）",
                    Subtitle = FormatUpdatedAt(entry.UpdatedAt),
                    Enabled = true
                };

                item.Fields["status"] = entry.Status;

                if (entry.Repository.Length > 0)
                {
                    item.Fields["repo"] = entry.Repository;
                }

                if (entry.Branch.Length > 0)
                {
                    item.Fields["branch"] = entry.Branch;
                }

                if (entry.EnvironmentKind.Length > 0)
                {
                    item.Fields["kind"] = entry.EnvironmentKind;
                }

                items.Add(item);
            }

            if (result.Truncated && items.Count > 0)
            {
                // 列表没列全要让用户知道，不然会以为会话丢了
                items[items.Count - 1].Fields["truncated"] = "1";
            }

            return items;
        }

        /// <summary>ISO 时间转成本机时区的 <c>yyyy-MM-dd HH:mm</c>；认不出原样给。</summary>
        internal static string FormatUpdatedAt(string iso)
        {
            DateTimeOffset parsed;

            if (!DateTimeOffset.TryParse(
                    iso, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out parsed))
            {
                return iso ?? string.Empty;
            }

            string text = SessionHistoryReader.FormatLocalTime(parsed.UtcDateTime);
            return text;
        }

        #endregion

        #region 读不了的原因

        /// <summary>按 CLI 给的原因代码说成中文；不认识的代码用 CLI 的原话。</summary>
        public static string DescribeUnavailable(CloudSessionListResult result)
        {
            switch (result.Reason)
            {
                case "started_by_session":
                    return "CLI 拒绝读取：这个 Visual Studio 是从某个 Claude Code 会话里启动的。请自己从开始菜单或桌面启动 VS 再试。";

                case "not_signed_in":
                case "sign_in_expired":
                    return "还没登录或登录已过期，请先在「设置」里登录 Claude 账号。";

                case "provider":
                    return "网页会话只对 Claude 账号登录可用，当前用的不是。";

                case "policy":
                case "policy_unverified":
                    return "你所在组织的策略不允许读取网页会话。" + Tail(result.Message);

                case "temporarily_unavailable":
                    return "暂时读不到网页会话，稍后再点一次刷新。";

                case "unsupported":
                    return "当前的 Claude Code 版本不支持列出网页会话，请先升级 CLI。" + Tail(result.Message);

                case "timeout":
                    return "等 CLI 回话超时了，稍后再点一次刷新。";

                case "no_cli":
                    return "没有找到 claude 可执行文件。";

                default:
                    return result.Message.Length > 0
                        ? result.Message
                        : "没能读到网页会话（" + result.Reason + "）。";
            }
        }

        private static string Tail(string message)
        {
            string tail = string.IsNullOrWhiteSpace(message) ? string.Empty : "（" + message.Trim() + "）";
            return tail;
        }

        #endregion
    }
}
