// 把 ClaudeSessionOptions 拼成 CLI 参数字符串

using System;
using System.Text;

namespace AgentExtension.Agents
{
    /// <summary>生成 claude CLI 的参数字符串。</summary>
    public static class ClaudeCommandBuilder
    {
        #region 参数拼装

        /// <summary>拼出完整参数字符串。</summary>
        public static string BuildArguments(ClaudeSessionOptions options)
        {
            if (options == null)
            {
                throw new ArgumentNullException(nameof(options));
            }

            var builder = new StringBuilder();

            builder.Append("--print --input-format stream-json --output-format stream-json --verbose");

            if (options.IncludePartialMessages)
            {
                builder.Append(" --include-partial-messages");
            }

            // --resume 与 --session-id 互斥：同时传会被 CLI 拒绝启动。
            if (!string.IsNullOrWhiteSpace(options.ResumeSessionId))
            {
                builder.Append(" --resume ").Append(Quote(options.ResumeSessionId));

                if (options.ForkSession)
                {
                    builder.Append(" --fork-session");
                }
            }
            else if (!string.IsNullOrWhiteSpace(options.SessionId))
            {
                builder.Append(" --session-id ").Append(Quote(options.SessionId));
            }

            if (!string.IsNullOrWhiteSpace(options.Model))
            {
                builder.Append(" --model ").Append(Quote(options.Model));
            }

            if (!string.IsNullOrWhiteSpace(options.Effort))
            {
                builder.Append(" --effort ").Append(Quote(options.Effort));
            }

            AppendPermissionFlag(builder, options.PermissionMode);

            string arguments = builder.ToString();
            return arguments;
        }

        /// <summary>拼终端那一路的参数。</summary>
        public static string BuildTerminalArguments(TerminalLaunchOptions options)
        {
            if (options == null)
            {
                throw new ArgumentNullException(nameof(options));
            }

            var builder = new StringBuilder();

            if (!string.IsNullOrWhiteSpace(options.ResumeSessionId))
            {
                // 必须分叉：不分叉的话终端和面板两个进程会同时往同一份转录里追加，互相覆盖。
                builder.Append("--resume ").Append(Quote(options.ResumeSessionId));
                builder.Append(" --fork-session");
            }

            if (!string.IsNullOrWhiteSpace(options.Model))
            {
                AppendSeparator(builder);
                builder.Append("--model ").Append(Quote(options.Model));
            }

            if (!string.IsNullOrWhiteSpace(options.Effort))
            {
                AppendSeparator(builder);
                builder.Append("--effort ").Append(Quote(options.Effort));
            }

            int beforePermission = builder.Length;
            AppendPermissionFlag(builder, options.PermissionMode);

            if (beforePermission == 0 && builder.Length > 0 && builder[0] == ' ')
            {
                builder.Remove(0, 1);
            }

            string arguments = builder.ToString();
            return arguments;
        }

        private static void AppendSeparator(StringBuilder builder)
        {
            if (builder.Length > 0)
            {
                builder.Append(' ');
            }
        }

        private static void AppendPermissionFlag(StringBuilder builder, string permissionMode)
        {
            string mode = (permissionMode ?? string.Empty).Trim();

            if (mode.Length == 0)
            {
                return;
            }

            if (string.Equals(mode, ClaudeSessionOptions.DangerouslySentinel, StringComparison.OrdinalIgnoreCase))
            {
                builder.Append(" --dangerously-skip-permissions");
                return;
            }

            // 必须加引号。
            builder.Append(" --permission-mode ").Append(Quote(mode));
        }

        #endregion

        #region 引用规则

        /// <summary>按 Windows 命令行解析规则加引号：紧邻结尾引号的反斜杠必须成对， 否则会转义掉引号并吞掉后续参数。</summary>
        private static string Quote(string value)
        {
            if (value == null)
            {
                value = string.Empty;
            }

            var builder = new StringBuilder("\"");
            int backslashes = 0;

            foreach (char c in value)
            {
                if (c == '\\')
                {
                    backslashes++;
                    continue;
                }

                if (c == '"')
                {
                    builder.Append('\\', (backslashes * 2) + 1);
                    backslashes = 0;
                    builder.Append('"');
                    continue;
                }

                builder.Append('\\', backslashes);
                backslashes = 0;
                builder.Append(c);
            }

            builder.Append('\\', backslashes * 2);
            builder.Append('"');

            string quoted = builder.ToString();
            return quoted;
        }

        #endregion
    }
}
