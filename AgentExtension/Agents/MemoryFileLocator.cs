// 找出这次会话实际会读到的记忆文件，供「记忆」面板列出

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace AgentExtension.Agents
{
    /// <summary>找出与当前工作目录相关的记忆文件。</summary>
    public static class MemoryFileLocator
    {
        #region 常量

        /// <summary>向上找几级父目录。</summary>
        public const int MaxParentLevels = 6;

        private static readonly string[] MemoryFileNames = { "CLAUDE.md", "CLAUDE.local.md" };

        #endregion

        #region 定位

        /// <summary>列出记忆文件，按「项目 → 用户 → 自动记忆」的顺序。</summary>
        public static IReadOnlyList<PanelItem> List(string workingDirectory)
        {
            var items = new List<PanelItem>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            AddProjectChain(items, seen, workingDirectory);
            AddUserLevel(items, seen);
            AddAutoMemory(items, seen, workingDirectory);

            return items;
        }

        private static void AddProjectChain(List<PanelItem> items, HashSet<string> seen, string workingDirectory)
        {
            if (string.IsNullOrWhiteSpace(workingDirectory))
            {
                return;
            }

            DirectoryInfo? directory = SafeDirectory(workingDirectory);

            for (int level = 0; level <= MaxParentLevels && directory != null; level++)
            {
                foreach (string name in MemoryFileNames)
                {
                    string path = Path.Combine(directory.FullName, name);

                    string scope = level == 0 ? "project" : "parent";
                    AddIfExists(items, seen, path, scope);
                }

                directory = directory.Parent;
            }
        }

        private static DirectoryInfo? SafeDirectory(string path)
        {
            try
            {
                return new DirectoryInfo(path);
            }
            catch (ArgumentException)
            {
                return null;
            }
            catch (PathTooLongException)
            {
                return null;
            }
        }

        private static void AddUserLevel(List<PanelItem> items, HashSet<string> seen)
        {
            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            AddIfExists(items, seen, Path.Combine(home, ".claude", "CLAUDE.md"), "user");
        }

        private static void AddAutoMemory(List<PanelItem> items, HashSet<string> seen, string workingDirectory)
        {
            string directory = AutoMemoryDirectory(workingDirectory);

            if (directory.Length == 0 || !Directory.Exists(directory))
            {
                return;
            }

            string[] files;

            try
            {
                files = Directory.GetFiles(directory, "*.md");
            }
            catch (IOException)
            {
                return;
            }
            catch (UnauthorizedAccessException)
            {
                return;
            }

            Array.Sort(files, StringComparer.OrdinalIgnoreCase);

            foreach (string file in files)
            {
                AddIfExists(items, seen, file, "auto");
            }
        }

        /// <summary>自动记忆目录。</summary>
        public static string AutoMemoryDirectory(string workingDirectory)
        {
            if (string.IsNullOrWhiteSpace(workingDirectory))
            {
                return string.Empty;
            }

            string encoded = SessionHistoryReader.EncodeProjectDirectory(workingDirectory);

            if (encoded.Length == 0)
            {
                return string.Empty;
            }

            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string path = Path.Combine(home, ".claude", "projects", encoded, "memory");
            return path;
        }

        #endregion

        #region 投影

        private static void AddIfExists(List<PanelItem> items, HashSet<string> seen, string path, string scope)
        {
            if (!File.Exists(path) || !seen.Add(path))
            {
                return;
            }

            FileInfo info;

            try
            {
                info = new FileInfo(path);
            }
            catch (IOException)
            {
                return;
            }

            var item = new PanelItem
            {
                Id = path,

                ActionValue = path,
                Title = Path.GetFileName(path),
                Subtitle = path,
                Enabled = true,
                Scope = scope
            };

            item.Fields["path"] = path;
            item.Fields["size"] = SessionHistoryReader.FormatSize(info.Length);
            item.Fields["modified"] = SessionHistoryReader.FormatLocalTime(info.LastWriteTimeUtc);
            item.Fields["lines"] = CountLines(path).ToString(CultureInfo.InvariantCulture);

            items.Add(item);
        }

        private static int CountLines(string path)
        {
            try
            {
                int count = 0;

                using (var reader = new StreamReader(path))
                {
                    while (reader.ReadLine() != null)
                    {
                        count++;
                    }
                }

                return count;
            }
            catch (IOException)
            {
                return 0;
            }
            catch (UnauthorizedAccessException)
            {
                return 0;
            }
        }

        #endregion
    }
}
