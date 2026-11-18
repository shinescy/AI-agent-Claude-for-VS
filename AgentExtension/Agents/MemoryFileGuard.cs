// 记忆文件的读、写、删：只碰 CLI 清单里列出、且确实在自动记忆文件夹里的普通文件

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 记忆文件守卫。与 VS Code 版同一套校验：清单里有、在自动记忆文件夹内、
    /// 路径上没有链接、不是硬链接、不超 1MB；写和删要求身份戳没变。
    /// </summary>
    public static class MemoryFileGuard
    {
        #region 常量

        /// <summary>记忆文件大小上限。</summary>
        public const int SizeLimit = 1024 * 1024;

        #endregion

        #region 读写删

        /// <summary>读一个记忆文件；不是合法 UTF-8 时 editable 为 false。</summary>
        public static MemoryFileContent Read(string path, string autoFolder, ICollection<string> listedPaths)
        {
            string file = Vet(path, autoFolder, listedPaths);
            byte[] bytes;
            string version;

            // 内容与身份戳从同一个句柄取，免得两次打开之间被 CLI 改掉
            using (SafeFileHandle handle = OpenNoFollow(file, GenericRead, FileShare.ReadWrite | FileShare.Delete))
            {
                FileIdentity identity = IdentityOf(handle);
                version = Format(identity);

                using (var stream = new FileStream(handle, FileAccess.Read))
                {
                    bytes = new byte[identity.Size];
                    int offset = 0;

                    while (offset < bytes.Length)
                    {
                        int read = stream.Read(bytes, offset, bytes.Length - offset);

                        if (read == 0)
                        {
                            break;
                        }

                        offset += read;
                    }
                }
            }

            try
            {
                string text = new UTF8Encoding(false, true).GetString(bytes).TrimStart('﻿');
                return new MemoryFileContent { Content = text, Version = version, Editable = true };
            }
            catch (DecoderFallbackException)
            {
                string lossy = Encoding.UTF8.GetString(bytes);
                return new MemoryFileContent { Content = lossy, Version = version, Editable = false };
            }
        }

        /// <summary>写回一个记忆文件：身份戳要与打开时一致，先写临时文件再替换。</summary>
        public static MemoryFileContent Write(
            string path, string content, string version, string autoFolder, ICollection<string> listedPaths, DateTime now)
        {
            if (Encoding.UTF8.GetByteCount(content ?? string.Empty) > SizeLimit)
            {
                throw new InvalidOperationException("记忆超过 1MB，没有保存。请删减后再存。");
            }

            string file = Vet(path, autoFolder, listedPaths);
            RequireUnchanged(file, version);

            string stamped = StampModified(content ?? string.Empty, now);
            string directory = Path.GetDirectoryName(file)!;
            string temp = Path.Combine(directory, "." + Guid.NewGuid().ToString("N") + ".tmp");

            try
            {
                File.WriteAllText(temp, stamped, new UTF8Encoding(false));

                // 替换前最后核对一次（不跟随链接），把被换掉或被改过的窗口压到最小
                RequireUnchanged(file, version);
                File.Replace(temp, file, null);
            }
            finally
            {
                if (File.Exists(temp))
                {
                    File.Delete(temp);
                }
            }

            var result = new MemoryFileContent { Content = stamped, Version = VersionOf(file), Editable = true };
            return result;
        }

        /// <summary>删一个记忆文件；记忆索引与团队共享记忆不许删。</summary>
        public static void Delete(string path, string name, string version, string autoFolder, ICollection<string> listedPaths)
        {
            if (string.Equals(Path.GetFileName(path), "MEMORY.md", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("MEMORY.md 是记忆的索引，不是一条记忆，不能在这里删。");
            }

            if ((name ?? string.Empty).StartsWith("team/", StringComparison.Ordinal))
            {
                throw new InvalidOperationException("这条记忆是团队共享的，不能在这里删。");
            }

            string file = Vet(path, autoFolder, listedPaths);

            // 独占打开、在同一个句柄上核对再删，中间不给别人换文件的机会
            using (SafeFileHandle handle = OpenNoFollow(file, GenericRead | DeleteAccess, FileShare.None))
            {
                if (!string.Equals(Format(IdentityOf(handle)), version ?? string.Empty, StringComparison.Ordinal))
                {
                    throw new InvalidOperationException("这条记忆在你打开之后被改过了，请关掉重新打开再改。");
                }

                var disposition = new FileDispositionInfo { DeleteFile = true };

                if (!SetFileInformationByHandle(handle, FileDispositionInfoClass, ref disposition, Marshal.SizeOf(disposition)))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                }
            }
        }

        #endregion

        #region 校验

        /// <summary>过一遍全部校验，返回规范化后的完整路径。</summary>
        internal static string Vet(string path, string autoFolder, ICollection<string> listedPaths)
        {
            if (string.IsNullOrWhiteSpace(path) || !Path.IsPathRooted(path))
            {
                throw new InvalidOperationException("不是记忆文件的绝对路径。");
            }

            string full = Path.GetFullPath(path);

            // 带 .. 之类会被规范化改掉的写法一律不认
            if (!string.Equals(full.TrimEnd('\\', '/'), path.Replace('/', '\\').TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("不是记忆文件的绝对路径。");
            }

            if (listedPaths == null || !listedPaths.Contains(path))
            {
                throw new InvalidOperationException("这条记忆已不在 Claude 的清单里，请关掉弹窗重新打开。");
            }

            if (string.IsNullOrWhiteSpace(autoFolder))
            {
                throw new InvalidOperationException("没有自动记忆文件夹，无法在这里查看或修改。");
            }

            string root = Path.GetFullPath(autoFolder).TrimEnd('\\', '/') + "\\";

            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("这条记忆不在自动记忆文件夹里，不能在这里查看或修改。");
            }

            // 文件本身与它到文件夹之间的每一级目录都不能是链接
            var info = new FileInfo(full);

            if (!info.Exists || IsReparsePoint(info.Attributes))
            {
                throw new InvalidOperationException("这条记忆是链接或不是普通文件，不能在这里使用。");
            }

            for (DirectoryInfo? dir = info.Directory; dir != null; dir = dir.Parent)
            {
                string dirPath = dir.FullName.TrimEnd('\\') + "\\";

                if (dirPath.Length < root.Length)
                {
                    break;
                }

                if (IsReparsePoint(dir.Attributes))
                {
                    throw new InvalidOperationException("记忆所在的文件夹是链接，不能在这里使用。");
                }
            }

            if (info.Length > SizeLimit)
            {
                throw new InvalidOperationException("这条记忆超过 1MB，不在这里显示；可以在编辑器里打开。");
            }

            // 不跟随链接再取一次身份：是链接、多硬链接、超大都会在这里被拒
            ReadIdentity(full);

            return full;
        }

        private static bool IsReparsePoint(FileAttributes attributes)
        {
            bool isLink = (attributes & FileAttributes.ReparsePoint) != 0;
            return isLink;
        }

        /// <summary>打开之后文件被改过就拒绝，免得覆盖别处的修改。</summary>
        private static void RequireUnchanged(string file, string version)
        {
            if (!string.Equals(VersionOf(file), version ?? string.Empty, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("这条记忆在你打开之后被改过了，请关掉重新打开再改。");
            }
        }

        /// <summary>身份戳：卷号、文件编号、修改时间、大小。</summary>
        internal static string VersionOf(string file)
        {
            string version = Format(ReadIdentity(file));
            return version;
        }

        #endregion

        #region frontmatter

        /// <summary>frontmatter 里恰好一行 modified: 时把它改成当前时间（与 VS Code 版一致）。</summary>
        internal static string StampModified(string content, DateTime now)
        {
            Match block = Regex.Match(content, @"\A---\r?\n(.*?)\r?\n---(\r?\n|\z)", RegexOptions.Singleline);

            if (!block.Success)
            {
                return content;
            }

            // [^\r\n]* 而不是 .*：.NET 的 . 会吃掉 \r，CRLF 文件会被改成混合换行
            MatchCollection lines = Regex.Matches(block.Groups[1].Value, @"(?m)^modified:[^\r\n]*");

            if (lines.Count != 1)
            {
                return content;
            }

            string stamp = "modified: " + now.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");
            int start = block.Groups[1].Index + lines[0].Index;
            string result = content.Substring(0, start) + stamp + content.Substring(start + lines[0].Length);
            return result;
        }

        #endregion

        #region 文件身份

        /// <summary>文件身份信息。</summary>
        private struct FileIdentity
        {
            public uint Attributes;
            public uint Volume;
            public ulong Index;
            public uint Links;
            public long WriteTicks;
            public long Size;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ByHandleFileInformation
        {
            public uint FileAttributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
            public uint VolumeSerialNumber;
            public uint FileSizeHigh;
            public uint FileSizeLow;
            public uint NumberOfLinks;
            public uint FileIndexHigh;
            public uint FileIndexLow;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct FileDispositionInfo
        {
            [MarshalAs(UnmanagedType.U1)]
            public bool DeleteFile;
        }

        /// <summary>读权限。</summary>
        private const uint GenericRead = 0x80000000;

        /// <summary>删除权限。</summary>
        private const uint DeleteAccess = 0x00010000;

        /// <summary>打开链接本身而不是它指向的目标。</summary>
        private const uint OpenReparsePoint = 0x00200000;

        /// <summary>SetFileInformationByHandle 的「删除标记」信息类。</summary>
        private const int FileDispositionInfoClass = 4;

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFile(
            string name, uint access, FileShare share, IntPtr security, FileMode mode, uint flags, IntPtr template);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetFileInformationByHandle(SafeFileHandle file, out ByHandleFileInformation information);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetFileInformationByHandle(
            SafeFileHandle file, int infoClass, ref FileDispositionInfo info, int size);

        /// <summary>不跟随链接地打开；路径被换成链接时打开的是链接本身，随后会被认出来拒掉。</summary>
        private static SafeFileHandle OpenNoFollow(string file, uint access, FileShare share)
        {
            SafeFileHandle handle = CreateFile(file, access, share, IntPtr.Zero, FileMode.Open, OpenReparsePoint, IntPtr.Zero);

            if (handle.IsInvalid)
            {
                int code = Marshal.GetLastWin32Error();
                handle.Dispose();
                throw new InvalidOperationException("打不开这条记忆：" + new Win32Exception(code).Message);
            }

            return handle;
        }

        /// <summary>从句柄取身份；是链接或有多个硬链接就拒绝。</summary>
        private static FileIdentity IdentityOf(SafeFileHandle handle)
        {
            if (!GetFileInformationByHandle(handle, out ByHandleFileInformation info))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }

            long writeTicks = ((long)(uint)info.LastWriteTime.dwHighDateTime << 32) | (uint)info.LastWriteTime.dwLowDateTime;

            var identity = new FileIdentity
            {
                Attributes = info.FileAttributes,
                Volume = info.VolumeSerialNumber,
                Index = ((ulong)info.FileIndexHigh << 32) | info.FileIndexLow,
                Links = info.NumberOfLinks,
                WriteTicks = writeTicks,
                Size = ((long)info.FileSizeHigh << 32) | info.FileSizeLow
            };

            if (IsReparsePoint((FileAttributes)identity.Attributes))
            {
                throw new InvalidOperationException("这条记忆是链接或不是普通文件，不能在这里使用。");
            }

            if (identity.Links != 1)
            {
                throw new InvalidOperationException("这条记忆有多个硬链接，不能在这里使用。");
            }

            if (identity.Size > SizeLimit)
            {
                throw new InvalidOperationException("这条记忆超过 1MB，不在这里显示；可以在编辑器里打开。");
            }

            return identity;
        }

        /// <summary>身份戳文本：卷号-文件编号-写入时间-大小。</summary>
        private static string Format(FileIdentity identity)
        {
            string version = $"{identity.Volume:x}-{identity.Index:x}-{identity.WriteTicks}-{identity.Size}";
            return version;
        }

        /// <summary>按路径取身份（不跟随链接）。</summary>
        private static FileIdentity ReadIdentity(string file)
        {
            using (SafeFileHandle handle = OpenNoFollow(file, GenericRead, FileShare.ReadWrite | FileShare.Delete))
            {
                FileIdentity identity = IdentityOf(handle);
                return identity;
            }
        }

        #endregion
    }
}
