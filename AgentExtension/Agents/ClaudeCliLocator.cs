// 解析 claude CLI 可执行文件路径

using System;
using System.Collections.Generic;
using System.IO;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 定位 claude 可执行文件。
    ///
    /// 装法不止一种，落点差别很大：官方安装器放 <c>~\.local\bin\claude.exe</c>，
    /// bun 放 <c>~\.bun\bin</c>，<c>npm i -g</c> 放 <c>%APPDATA%\npm\claude.cmd</c>（是 .cmd 不是 .exe），
    /// pnpm / yarn 又各有各的 shim 目录。**所以必须把 PATH 也扫一遍**——
    /// 只认死那几个路径的话，换台机器就会「明明装了却说没装」。
    /// </summary>
    public static class ClaudeCliLocator
    {
        #region 常量

        /// <summary>指定 claude 路径的环境变量。装在这里认不出来的地方时用它兜底。</summary>
        public const string PathEnvironmentVariable = "AGENTEXT_CLAUDE_PATH";

        private const string CommandName = "claude";

        /// <summary>Windows 认的可执行扩展名，按优先级。npm 全局装出来的启动器是 .cmd。</summary>
        private static readonly string[] Extensions = { ".exe", ".cmd", ".bat" };

        #endregion

        #region 候选路径

        /// <summary>自定义路径展开成候选：可以指到文件、指到目录，也可以只写个不带扩展名的路径。</summary>
        public static IEnumerable<string> GetCustomCandidates(string? customPath)
        {
            if (string.IsNullOrWhiteSpace(customPath))
            {
                yield break;
            }

            string expanded = Environment.ExpandEnvironmentVariables(customPath!.Trim()).Trim('"');

            if (expanded.Length == 0)
            {
                yield break;
            }

            yield return expanded;

            // 指到目录的情形：拼上文件名再试一遍。
            foreach (string extension in Extensions)
            {
                string candidate;

                if (TryCombine(expanded, CommandName + extension, out candidate))
                {
                    yield return candidate;
                }
            }

            // 只写了不带扩展名的路径：补上扩展名再试。
            if (Path.GetExtension(expanded).Length == 0)
            {
                foreach (string extension in Extensions)
                {
                    yield return expanded + extension;
                }
            }
        }

        /// <summary>各种装法的已知落点。</summary>
        public static IEnumerable<string> GetWellKnownCandidates(string? userProfile, string? appData, string? localAppData)
        {
            if (!string.IsNullOrWhiteSpace(userProfile))
            {
                // 官方安装器。本机 .bun 下是旧版，所以 .local 必须排在前面。
                yield return Path.Combine(userProfile!, @".local\bin\claude.exe");
                yield return Path.Combine(userProfile!, @".bun\bin\claude.exe");
            }

            if (!string.IsNullOrWhiteSpace(appData))
            {
                // npm i -g 装出来的是 .cmd 启动器，没有同名 .exe。
                yield return Path.Combine(appData!, @"npm\claude.cmd");
                yield return Path.Combine(appData!, @"npm\claude.exe");
            }

            if (!string.IsNullOrWhiteSpace(localAppData))
            {
                yield return Path.Combine(localAppData!, @"pnpm\claude.exe");
                yield return Path.Combine(localAppData!, @"pnpm\claude.cmd");
                yield return Path.Combine(localAppData!, @"Yarn\bin\claude.cmd");
            }
        }

        /// <summary>把 PATH 上的每个目录都按 claude.exe / .cmd / .bat 试一遍。</summary>
        public static IEnumerable<string> GetPathCandidates(IEnumerable<string>? pathDirectories)
        {
            if (pathDirectories == null)
            {
                yield break;
            }

            foreach (string directory in pathDirectories)
            {
                if (string.IsNullOrWhiteSpace(directory))
                {
                    continue;
                }

                string trimmed = directory.Trim().Trim('"');

                if (trimmed.Length == 0)
                {
                    continue;
                }

                foreach (string extension in Extensions)
                {
                    string candidate;

                    if (TryCombine(trimmed, CommandName + extension, out candidate))
                    {
                        yield return candidate;
                    }
                }
            }
        }

        /// <summary>按优先级列出全部候选路径，重复的只留第一次出现的位置。</summary>
        public static IReadOnlyList<string> GetDefaultCandidates(
            string? userProfile,
            string? appData,
            string? localAppData,
            IEnumerable<string>? pathDirectories,
            string? customPath)
        {
            var ordered = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            AddRange(ordered, seen, GetCustomCandidates(customPath));
            AddRange(ordered, seen, GetWellKnownCandidates(userProfile, appData, localAppData));

            // PATH 排在已知落点之后：已知落点的先后是刻意排过的，PATH 只做兜底。
            AddRange(ordered, seen, GetPathCandidates(pathDirectories));

            return ordered;
        }

        /// <summary>拆 PATH 环境变量。</summary>
        public static IReadOnlyList<string> SplitPath(string? path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return new string[0];
            }

            return path!.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
        }

        private static void AddRange(List<string> ordered, HashSet<string> seen, IEnumerable<string> candidates)
        {
            foreach (string candidate in candidates)
            {
                if (string.IsNullOrWhiteSpace(candidate))
                {
                    continue;
                }

                if (seen.Add(candidate))
                {
                    ordered.Add(candidate);
                }
            }
        }

        /// <summary>PATH / 自定义路径里混进畸形项时 Path.Combine 会抛，跳过就是了，不该让一条坏路径把整个查找搞崩。</summary>
        private static bool TryCombine(string directory, string fileName, out string combined)
        {
            try
            {
                combined = Path.Combine(directory, fileName);
                return true;
            }
            catch (ArgumentException)
            {
                combined = string.Empty;
                return false;
            }
        }

        #endregion

        #region 解析

        /// <summary>返回第一个真实存在的候选路径，全都不存在时返回 null。</summary>
        public static string? ResolveFromCandidates(IEnumerable<string> candidates, Func<string, bool> fileExists)
        {
            if (candidates == null)
            {
                throw new ArgumentNullException(nameof(candidates));
            }

            if (fileExists == null)
            {
                throw new ArgumentNullException(nameof(fileExists));
            }

            foreach (string candidate in candidates)
            {
                if (string.IsNullOrWhiteSpace(candidate))
                {
                    continue;
                }

                if (fileExists(candidate))
                {
                    return candidate;
                }
            }

            return null;
        }

        /// <summary>用真实文件系统解析当前机器上的 claude 路径。customPath 为空时读环境变量。</summary>
        public static string? Resolve(string? customPath)
        {
            IReadOnlyList<string> candidates = GetMachineCandidates(customPath);
            string? resolved = ResolveFromCandidates(candidates, File.Exists);

            return resolved;
        }

        /// <summary>当前机器上的已知落点（不含 PATH）。找不到时拿它告诉用户「到底找过哪儿」。</summary>
        public static IReadOnlyList<string> GetMachineWellKnownCandidates()
        {
            var ordered = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            AddRange(ordered, seen, GetWellKnownCandidates(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                Environment.GetEnvironmentVariable("APPDATA"),
                Environment.GetEnvironmentVariable("LOCALAPPDATA")));

            return ordered;
        }

        /// <summary>当前机器上的全部候选路径。</summary>
        public static IReadOnlyList<string> GetMachineCandidates(string? customPath)
        {
            string effectiveCustomPath = string.IsNullOrWhiteSpace(customPath)
                ? Environment.GetEnvironmentVariable(PathEnvironmentVariable) ?? string.Empty
                : customPath!;

            return GetDefaultCandidates(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                Environment.GetEnvironmentVariable("APPDATA"),
                Environment.GetEnvironmentVariable("LOCALAPPDATA"),
                SplitPath(Environment.GetEnvironmentVariable("PATH")),
                effectiveCustomPath);
        }

        #endregion
    }
}
