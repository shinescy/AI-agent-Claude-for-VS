// 把子命令的输出整理成可进转录的文本

using System.Collections.Generic;
using System.Text;

namespace AgentExtension.Agents
{
    /// <summary>把子命令的 stdout / stderr / 退出码整理成一段可读文本。</summary>
    public static class SubcommandOutputFormatter
    {
        #region 上限

        /// <summary>保留的最大行数。</summary>
        public const int MaxLines = 60;

        /// <summary>保留的最大字符数。</summary>
        public const int MaxChars = 4000;

        #endregion

        #region 格式化

        /// <summary>整理输出。</summary>
        public static string Format(string label, string standardOutput, string standardError, int exitCode)
        {
            string combined = Combine(standardOutput, standardError);
            string clipped = Clip(combined);

            var builder = new StringBuilder();
            builder.Append(label ?? string.Empty);

            if (exitCode != 0)
            {
                builder.Append($"（退出码 {exitCode}）");
            }

            builder.Append('\n');

            if (clipped.Length == 0)
            {
                builder.Append(exitCode == 0 ? "（无输出）" : "（无输出，且执行失败）");
                return builder.ToString();
            }

            builder.Append(clipped);
            return builder.ToString();
        }

        private static string Combine(string standardOutput, string standardError)
        {
            string outText = (standardOutput ?? string.Empty).TrimEnd();
            string errText = (standardError ?? string.Empty).TrimEnd();

            if (errText.Length == 0)
            {
                return outText;
            }

            if (outText.Length == 0)
            {
                return errText;
            }

            string combined = outText + "\n\n[stderr]\n" + errText;
            return combined;
        }

        private static string Clip(string text)
        {
            if (string.IsNullOrEmpty(text))
            {
                return string.Empty;
            }

            string[] lines = text.Replace("\r\n", "\n").Split('\n');
            bool truncatedByLines = lines.Length > MaxLines;

            var kept = new List<string>();
            int count = truncatedByLines ? MaxLines : lines.Length;

            for (int i = 0; i < count; i++)
            {
                kept.Add(lines[i]);
            }

            string result = string.Join("\n", kept);
            bool truncatedByChars = false;

            if (result.Length > MaxChars)
            {
                result = result.Substring(0, MaxChars);
                truncatedByChars = true;
            }

            if (truncatedByLines || truncatedByChars)
            {
                result += $"\n…（输出已截断，原共 {lines.Length} 行）";
            }

            return result;
        }

        #endregion
    }
}
