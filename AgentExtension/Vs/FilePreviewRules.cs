// 文件预览的纯规则：能不能读、读多少、算不算图片

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace AgentExtension.Vs
{
    /// <summary>文件预览的判定规则。</summary>
    public static class FilePreviewRules
    {
        #region 上限

        /// <summary>文本预览最多读这么多字节。</summary>
        public const int MaxTextBytes = 128 * 1024;

        /// <summary>文本预览最多显示这么多行。</summary>
        public const int MaxLines = 200;

        /// <summary>图片预览的体积上限。</summary>
        public const int MaxImageBytes = 2 * 1024 * 1024;

        private const int SniffBytes = 8000;

        #endregion

        #region 路径

        /// <summary>把网页要求的路径解析成「允许读」的绝对路径；不允许则返回 null。</summary>
        public static string? ResolveReadable(
            string requested, string workingDirectory, ICollection<string>? userPicked)
        {
            if (string.IsNullOrWhiteSpace(requested))
            {
                return null;
            }

            string normalized = requested.Trim().Replace('/', '\\');
            string full;

            if (IsRooted(normalized))
            {
                try
                {
                    full = Path.GetFullPath(normalized);
                }
                catch (Exception)
                {
                    return null;
                }
            }
            else
            {
                if (string.IsNullOrWhiteSpace(workingDirectory))
                {
                    return null;
                }

                string relative = normalized.TrimStart('\\');

                if (relative.Length == 0)
                {
                    return null;
                }

                try
                {
                    full = Path.GetFullPath(Path.Combine(workingDirectory, relative));
                }
                catch (Exception)
                {
                    return null;
                }
            }

            if (IsInside(workingDirectory, full))
            {
                return full;
            }

            if (userPicked != null && userPicked.Contains(full))
            {
                return full;
            }

            return null;
        }

        /// <summary>路径是否在某个目录之内。</summary>
        public static bool IsInside(string directory, string fullPath)
        {
            if (string.IsNullOrWhiteSpace(directory) || string.IsNullOrWhiteSpace(fullPath))
            {
                return false;
            }

            string root;

            try
            {
                root = Path.GetFullPath(directory).TrimEnd('\\', '/') + "\\";
            }
            catch (Exception)
            {
                return false;
            }

            bool inside = fullPath.StartsWith(root, StringComparison.OrdinalIgnoreCase);
            return inside;
        }

        /// <summary>转成相对工作目录、正斜杠的路径；不在工作目录里就原样返回绝对路径。</summary>
        public static string ToDisplayPath(string workingDirectory, string fullPath)
        {
            if (!IsInside(workingDirectory, fullPath))
            {
                return fullPath;
            }

            string root = Path.GetFullPath(workingDirectory).TrimEnd('\\', '/') + "\\";
            string relative = fullPath.Substring(root.Length).Replace('\\', '/');
            return relative;
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

        #region 内容

        /// <summary>按扩展名判断能不能当图片预览，能则给出 media type。</summary>
        public static string? ImageMediaType(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return null;
            }

            string extension = Path.GetExtension(path).ToLowerInvariant();

            switch (extension)
            {
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".gif": return "image/gif";
                case ".webp": return "image/webp";
                case ".bmp": return "image/bmp";
                case ".svg": return "image/svg+xml";
                case ".ico": return "image/x-icon";
                default: return null;
            }
        }

        /// <summary>开头有 NUL 字节就当二进制。</summary>
        public static bool LooksBinary(byte[] bytes, int count)
        {
            if (bytes == null)
            {
                return false;
            }

            int limit = Math.Min(count, Math.Min(bytes.Length, SniffBytes));

            for (int i = 0; i < limit; i++)
            {
                if (bytes[i] == 0)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>按行截断。</summary>
        public static string TruncateLines(string text, int maxLines, out bool truncated, out int totalLines)
        {
            truncated = false;
            totalLines = 0;

            if (string.IsNullOrEmpty(text))
            {
                return string.Empty;
            }

            string[] lines = text.Replace("\r\n", "\n").Split('\n');
            totalLines = lines.Length;

            if (lines.Length <= maxLines)
            {
                return string.Join("\n", lines);
            }

            truncated = true;

            var kept = new StringBuilder();

            for (int i = 0; i < maxLines; i++)
            {
                if (i > 0)
                {
                    kept.Append('\n');
                }

                kept.Append(lines[i]);
            }

            return kept.ToString();
        }

        #endregion
    }
}
