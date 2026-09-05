// 读一小段文件内容供 webview 就地预览

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace AgentExtension.Vs
{
    /// <summary>读文件给网页预览。</summary>
    public static class FilePreviewReader
    {
        #region 读取

        /// <summary>读一个文件的预览内容。</summary>
        public static FilePreviewResult Read(
            string requested, string workingDirectory, ICollection<string>? userPicked)
        {
            var result = new FilePreviewResult { Path = requested ?? "" };

            string? full = FilePreviewRules.ResolveReadable(requested ?? "", workingDirectory, userPicked);

            if (full == null)
            {
                // 措辞要说清「为什么不给看」，否则用户只会以为功能坏了。
                result.Error = "这个文件不在工作区里，也不是你挑进来的，出于安全不预览。";
                return result;
            }

            try
            {
                var info = new FileInfo(full);

                if (!info.Exists)
                {
                    result.Error = "文件不存在（可能已被移动或删除）。";
                    return result;
                }

                result.Size = info.Length;

                string? mediaType = FilePreviewRules.ImageMediaType(full);

                if (mediaType != null)
                {
                    ReadImage(info, full, mediaType, result);
                    return result;
                }

                ReadText(info, full, result);
                return result;
            }
            catch (IOException exception)
            {
                result.Error = $"读取失败：{exception.Message}";
                return result;
            }
            catch (UnauthorizedAccessException exception)
            {
                result.Error = $"读取失败：{exception.Message}";
                return result;
            }
        }

        private static void ReadImage(FileInfo info, string full, string mediaType, FilePreviewResult result)
        {
            if (info.Length > FilePreviewRules.MaxImageBytes)
            {
                result.Error = $"图片有 {Describe(info.Length)}，超过预览上限，请在编辑器里打开。";
                return;
            }

            byte[] bytes = File.ReadAllBytes(full);
            result.Image = $"data:{mediaType};base64,{Convert.ToBase64String(bytes)}";
        }

        private static void ReadText(FileInfo info, string full, FilePreviewResult result)
        {
            byte[] head;
            int read;

            using (FileStream stream = File.OpenRead(full))
            {
                int want = (int)Math.Min(info.Length, FilePreviewRules.MaxTextBytes);
                head = new byte[want];
                read = ReadFully(stream, head);
            }

            if (FilePreviewRules.LooksBinary(head, read))
            {
                result.Error = $"这是二进制文件（{Describe(info.Length)}），没有可读的文本预览。";
                return;
            }

            string text = new UTF8Encoding(false).GetString(head, 0, read);

            text = text.TrimStart('﻿');

            bool truncated;
            int totalLines;
            result.Text = FilePreviewRules.TruncateLines(text, FilePreviewRules.MaxLines, out truncated, out totalLines);

            bool bytesTruncated = info.Length > FilePreviewRules.MaxTextBytes;

            result.Truncated = truncated || bytesTruncated;
            result.TotalLines = totalLines;
        }

        private static int ReadFully(Stream stream, byte[] buffer)
        {
            int total = 0;

            while (total < buffer.Length)
            {
                int n = stream.Read(buffer, total, buffer.Length - total);

                if (n <= 0)
                {
                    break;
                }

                total += n;
            }

            return total;
        }

        private static string Describe(long bytes)
        {
            if (bytes < 1024)
            {
                return $"{bytes} 字节";
            }

            if (bytes < 1024 * 1024)
            {
                return $"{bytes / 1024.0:0.#} KB";
            }

            return $"{bytes / (1024.0 * 1024.0):0.#} MB";
        }

        #endregion
    }
}
