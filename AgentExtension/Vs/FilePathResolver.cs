// 把代理输出里的文件路径解析成可打开的绝对路径

using System;
using System.IO;

namespace AgentExtension.Vs
{
    /// <summary>解析代理提到的文件路径。</summary>
    public static class FilePathResolver
    {
        #region 解析

        /// <summary>解析成绝对路径；无法确定时返回 null。</summary>
        public static string? Resolve(string raw, string workingDirectory, Func<string, bool> fileExists)
        {
            if (fileExists == null)
            {
                throw new ArgumentNullException(nameof(fileExists));
            }

            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            string normalized = raw.Trim().Replace('/', '\\');

            if (IsRooted(normalized))
            {
                return fileExists(normalized) ? normalized : null;
            }

            if (string.IsNullOrWhiteSpace(workingDirectory))
            {
                return null;
            }

            // 必须先去掉开头的分隔符：Path.Combine 会把以分隔符开头的第二个参数当成绝对路径，直接丢掉前面那段。
            string relative = normalized.TrimStart('\\');

            if (relative.Length == 0)
            {
                return null;
            }

            string combined;

            try
            {
                combined = Path.Combine(workingDirectory, relative);
            }
            catch (ArgumentException)
            {
                return null;
            }

            return fileExists(combined) ? combined : null;
        }

        private static bool IsRooted(string path)
        {
            if (path.Length >= 2 && path[1] == ':')
            {
                return true;
            }

            if (path.StartsWith(@"\\", StringComparison.Ordinal))
            {
                return true;
            }

            return false;
        }

        #endregion
    }
}
