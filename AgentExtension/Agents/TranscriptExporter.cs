// 把转录导出成本机文件（/export 的落盘实现）

using System;
using System.Globalization;
using System.IO;
using System.Text;

namespace AgentExtension.Agents
{
    /// <summary>把前端给的一段 Markdown 写成本机文件。</summary>
    public static class TranscriptExporter
    {
        #region 常量

        /// <summary>内容大小上限（字符）。</summary>
        public const int MaxBytes = 8 * 1024 * 1024;

        private const int MaxAttempts = 100;

        #endregion

        #region 导出

        /// <summary>导出目录。</summary>
        public static string DefaultDirectory()
        {
            string root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(root, "AgentExtension", "exports");
        }

        /// <summary>按时间戳生成一个**尚不存在**的文件名。</summary>
        public static string BuildPath(string directory, DateTime timestamp, Func<string, bool> exists)
        {
            string stamp = timestamp.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
            string candidate = Path.Combine(directory, $"transcript-{stamp}.md");

            for (int attempt = 2; exists(candidate) && attempt <= MaxAttempts; attempt++)
            {
                candidate = Path.Combine(directory, $"transcript-{stamp}-{attempt}.md");
            }

            return candidate;
        }

        /// <summary>写文件并返回绝对路径。</summary>
        public static string Export(string? markdown, DateTime timestamp)
        {
            string content = markdown ?? string.Empty;

            if (content.Trim().Length == 0)
            {
                throw new ArgumentException("转录是空的，没有可导出的内容。", nameof(markdown));
            }

            if (content.Length > MaxBytes)
            {
                throw new ArgumentException(
                    $"内容超过 {MaxBytes / 1024 / 1024} MB 上限（{content.Length} 字符），没有导出。",
                    nameof(markdown));
            }

            string directory = DefaultDirectory();
            Directory.CreateDirectory(directory);

            string path = BuildPath(directory, timestamp, File.Exists);

            File.WriteAllText(path, content, new UTF8Encoding(true));
            return path;
        }

        #endregion
    }
}
