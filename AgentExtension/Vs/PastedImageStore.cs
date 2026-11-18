// 终端输入框粘贴的截图落成临时文件，CLI 认路径转附件

using System;
using System.IO;

namespace AgentExtension.Vs
{
    /// <summary>把粘贴来的图片存成临时文件。</summary>
    public class PastedImageStore
    {
        /// <summary>单张图片的体积上限（字节）。</summary>
        public const int MaxBytes = 20 * 1024 * 1024;

        /// <summary>临时图片保留天数。</summary>
        public const int KeepDays = 7;

        /// <summary>存放目录。</summary>
        private readonly string _directory;

        /// <summary>用指定目录构造。</summary>
        public PastedImageStore(string directory)
        {
            _directory = directory;
        }

        /// <summary>默认目录：%TEMP%\AgentExtension\pasted-images。</summary>
        public static string DefaultDirectory()
        {
            string result = Path.Combine(Path.GetTempPath(), "AgentExtension", "pasted-images");
            return result;
        }

        #region 保存

        /// <summary>把 data URL 写成文件，返回绝对路径；格式不对时抛异常。</summary>
        public string Save(string dataUrl)
        {
            string extension = ParseDataUrl(dataUrl, out byte[] bytes);

            Directory.CreateDirectory(_directory);
            CleanupOld();

            string name = $"paste-{DateTime.Now:yyyyMMdd-HHmmss}-{Guid.NewGuid().ToString("N").Substring(0, 6)}.{extension}";
            string path = Path.Combine(_directory, name);

            File.WriteAllBytes(path, bytes);

            return path;
        }

        /// <summary>解析 data URL，返回扩展名并输出字节。</summary>
        public static string ParseDataUrl(string dataUrl, out byte[] bytes)
        {
            const string prefix = "data:";
            const string marker = ";base64,";

            string text = dataUrl ?? "";
            int markerAt = text.IndexOf(marker, StringComparison.Ordinal);

            if (!text.StartsWith(prefix, StringComparison.Ordinal) || markerAt < 0)
            {
                throw new InvalidDataException("不是 base64 的 data URL");
            }

            string mediaType = text.Substring(prefix.Length, markerAt - prefix.Length).ToLowerInvariant();
            string extension = ExtensionOf(mediaType);

            if (extension.Length == 0)
            {
                throw new InvalidDataException($"不支持的图片格式：{mediaType}");
            }

            string base64 = text.Substring(markerAt + marker.Length);

            // base64 每 4 字符 3 字节，先估算，免得超大串先解码再拒
            if ((long)base64.Length / 4 * 3 > MaxBytes)
            {
                throw new InvalidDataException("图片超过 20MB");
            }

            try
            {
                bytes = Convert.FromBase64String(base64);
            }
            catch (FormatException)
            {
                throw new InvalidDataException("图片数据不是合法的 base64");
            }

            if (bytes.Length == 0)
            {
                throw new InvalidDataException("图片是空的");
            }

            return extension;
        }

        /// <summary>MIME 类型对应的扩展名；CLI 只认这四种。</summary>
        public static string ExtensionOf(string mediaType)
        {
            switch (mediaType)
            {
                case "image/png":
                    return "png";
                case "image/jpeg":
                case "image/jpg":
                    return "jpg";
                case "image/gif":
                    return "gif";
                case "image/webp":
                    return "webp";
                default:
                    return "";
            }
        }

        #endregion

        #region 清理

        /// <summary>删掉超过保留期的旧图，失败不影响保存。</summary>
        private void CleanupOld()
        {
            DateTime cutoff = DateTime.Now.AddDays(-KeepDays);

            try
            {
                foreach (string file in Directory.GetFiles(_directory, "paste-*"))
                {
                    if (File.GetLastWriteTime(file) < cutoff)
                    {
                        TryDelete(file);
                    }
                }
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }

        /// <summary>尽力删一个文件。</summary>
        private static void TryDelete(string file)
        {
            try
            {
                File.Delete(file);
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }

        #endregion
    }
}
