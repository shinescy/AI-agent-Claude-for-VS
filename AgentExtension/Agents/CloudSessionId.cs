// 网页（云端）会话 id 的认法

using System;
using System.Text.RegularExpressions;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 云端会话 id 会原样进命令行（<c>--teleport</c>），形状不对一律不认。
    /// </summary>
    /// <remarks>形状取自 CLI 自己的校验：<c>session_…</c> 或 <c>cse_…</c>，最长 128。</remarks>
    public static class CloudSessionId
    {
        #region 常量

        /// <summary>CLI 认的最大长度。</summary>
        public const int MaximumLength = 128;

        private static readonly Regex Pattern =
            new Regex(@"\A(?:session|cse)_[A-Za-z0-9_-]+\z", RegexOptions.Compiled);

        #endregion

        #region 判定

        /// <summary>是不是一个形状合法的云端会话 id。</summary>
        public static bool IsValid(string? id)
        {
            string text = id ?? string.Empty;
            bool valid = text.Length > 0 && text.Length <= MaximumLength && Pattern.IsMatch(text);
            return valid;
        }

        /// <summary>从用户贴的内容里取 id：可以是 id 本身，也可以是 claude.ai/code 的链接。</summary>
        public static bool TryParse(string? input, out string id)
        {
            id = string.Empty;
            string text = (input ?? string.Empty).Trim();

            if (text.Length == 0)
            {
                return false;
            }

            if (IsValid(text))
            {
                id = text;
                return true;
            }

            Uri uri;

            if (!Uri.TryCreate(text, UriKind.Absolute, out uri)
                || uri.Scheme != Uri.UriSchemeHttps
                || !IsClaudeHost(uri.Host))
            {
                return false;
            }

            // 链接形如 https://claude.ai/code/session_xxx，id 取路径里最后一个合法的段
            string[] segments = uri.AbsolutePath.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);

            for (int i = segments.Length - 1; i >= 0; i--)
            {
                if (IsValid(segments[i]))
                {
                    id = segments[i];
                    return true;
                }
            }

            return false;
        }

        private static bool IsClaudeHost(string host)
        {
            bool known = string.Equals(host, "claude.ai", StringComparison.OrdinalIgnoreCase)
                || host.EndsWith(".claude.ai", StringComparison.OrdinalIgnoreCase);
            return known;
        }

        #endregion
    }
}
