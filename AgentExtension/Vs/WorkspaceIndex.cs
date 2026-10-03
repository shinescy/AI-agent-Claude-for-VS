// 工作区文件索引，供 @ 引用检索

using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace AgentExtension.Vs
{
    /// <summary>工作目录下的文件清单。</summary>
    public class WorkspaceIndex
    {
        #region 字段

        private const int MaxFiles = 20000;

        private const int MaxDepth = 24;

        private readonly object _lock = new object();

        private string _root = string.Empty;
        private IReadOnlyList<string> _paths = Array.Empty<string>();
        private Task? _building;

        #endregion

        #region 属性

        /// <summary>索引是否已就绪。</summary>
        public bool IsReady
        {
            get
            {
                lock (_lock)
                {
                    bool ready = _building != null && _building.IsCompleted;
                    return ready;
                }
            }
        }

        public int Count
        {
            get
            {
                lock (_lock)
                {
                    return _paths.Count;
                }
            }
        }

        #endregion

        #region 构建

        /// <summary>针对某个工作目录启动后台扫描。</summary>
        public void EnsureBuilt(string workingDirectory)
        {
            if (string.IsNullOrWhiteSpace(workingDirectory) || !Directory.Exists(workingDirectory))
            {
                return;
            }

            lock (_lock)
            {
                if (_building != null && string.Equals(_root, workingDirectory, StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                _root = workingDirectory;
                _paths = Array.Empty<string>();
                _building = Task.Run(() => Build(workingDirectory));
            }
        }

        /// <summary>丢弃当前索引并重新扫描。</summary>
        public void Refresh()
        {
            string root;

            lock (_lock)
            {
                root = _root;
                _building = null;
            }

            EnsureBuilt(root);
        }

        private void Build(string root)
        {
            var collected = new List<string>();

            try
            {
                Walk(root, root, 0, collected);
            }
            catch (Exception)
            {
            }

            lock (_lock)
            {
                if (string.Equals(_root, root, StringComparison.OrdinalIgnoreCase))
                {
                    _paths = collected;
                }
            }
        }

        private static void Walk(string root, string current, int depth, List<string> collected)
        {
            if (depth > MaxDepth || collected.Count >= MaxFiles)
            {
                return;
            }

            string[] files;
            string[] dirs;

            try
            {
                files = Directory.GetFiles(current);
                dirs = Directory.GetDirectories(current);
            }
            catch (UnauthorizedAccessException)
            {
                return;
            }
            catch (DirectoryNotFoundException)
            {
                return;
            }

            foreach (string file in files)
            {
                if (collected.Count >= MaxFiles)
                {
                    return;
                }

                collected.Add(ToRelative(root, file));
            }

            foreach (string dir in dirs)
            {
                string name = Path.GetFileName(dir);

                if (WorkspaceIndexRules.IsIgnoredDirectory(name))
                {
                    continue;
                }

                Walk(root, dir, depth + 1, collected);
            }
        }

        private static string ToRelative(string root, string fullPath)
        {
            string relative = fullPath.Length > root.Length && fullPath.StartsWith(root, StringComparison.OrdinalIgnoreCase)
                ? fullPath.Substring(root.Length).TrimStart('\\', '/')
                : fullPath;

            return relative.Replace('\\', '/');
        }

        #endregion

        #region 检索

        /// <summary>按查询串检索。</summary>
        public IReadOnlyList<string> Search(string query, int limit = 20)
        {
            IReadOnlyList<string> snapshot;

            lock (_lock)
            {
                snapshot = _paths;
            }

            IReadOnlyList<string> ranked = WorkspaceIndexRules.Rank(snapshot, query, limit);
            return ranked;
        }

        #endregion
    }
}
