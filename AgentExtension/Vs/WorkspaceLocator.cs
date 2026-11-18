// 解析代理进程的工作目录

using System;
using System.IO;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;

namespace AgentExtension.Vs
{
    /// <summary>解析工作目录。</summary>
    public static class WorkspaceLocator
    {
        #region 解析

        /// <summary>取解决方案所在目录，没有可用目录时返回 false。</summary>
        public static bool TryGetWorkspaceDirectory(out string directory)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            string? solutionDirectory = TryGetSolutionDirectory();

            if (!string.IsNullOrWhiteSpace(solutionDirectory) && Directory.Exists(solutionDirectory))
            {
                directory = solutionDirectory!;
                return true;
            }

            directory = FallbackDirectory;
            return false;
        }

        /// <summary>没有解决方案时的兜底目录。</summary>
        public static string FallbackDirectory
        {
            get
            {
                string path = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
                return path;
            }
        }

        private static string? TryGetSolutionDirectory()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            try
            {
                var solution = Package.GetGlobalService(typeof(SVsSolution)) as IVsSolution;

                if (solution == null)
                {
                    return null;
                }

                int hr = solution.GetSolutionInfo(out string directory, out _, out _);

                if (hr != Microsoft.VisualStudio.VSConstants.S_OK)
                {
                    return null;
                }

                return directory;
            }
            catch (Exception)
            {
                return null;
            }
        }

        #endregion
    }
}
