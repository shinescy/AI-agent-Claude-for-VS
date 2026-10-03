// 把参数数组拼成 Windows 命令行

using System;
using System.Collections.Generic;
using System.Text;

namespace AgentExtension.Agents
{
    /// <summary>参数数组 → 单条命令行。</summary>
    public static class CommandLineBuilder
    {
        #region 拼接

        /// <summary>把参数逐个转义后用空格连接。</summary>
        public static string Join(IReadOnlyList<string> arguments)
        {
            if (arguments == null)
            {
                throw new ArgumentNullException(nameof(arguments));
            }

            var builder = new StringBuilder();

            foreach (string argument in arguments)
            {
                if (builder.Length > 0)
                {
                    builder.Append(' ');
                }

                builder.Append(Quote(argument ?? string.Empty));
            }

            return builder.ToString();
        }

        #endregion

        #region 单个参数转义

        private static string Quote(string argument)
        {
            bool needsQuotes = argument.Length == 0
                || argument.IndexOfAny(new[] { ' ', '\t', '"' }) >= 0;

            if (!needsQuotes)
            {
                return argument;
            }

            var builder = new StringBuilder();
            builder.Append('"');

            int backslashes = 0;

            foreach (char c in argument)
            {
                if (c == '\\')
                {
                    backslashes++;
                    continue;
                }

                if (c == '"')
                {
                    builder.Append('\\', backslashes * 2 + 1);
                    builder.Append('"');
                    backslashes = 0;
                    continue;
                }

                builder.Append('\\', backslashes);
                builder.Append(c);
                backslashes = 0;
            }

            // 结尾的反斜杠要翻倍，否则会把收尾的引号转义掉，参数边界就塌了。
            builder.Append('\\', backslashes * 2);
            builder.Append('"');

            return builder.ToString();
        }

        #endregion
    }
}
