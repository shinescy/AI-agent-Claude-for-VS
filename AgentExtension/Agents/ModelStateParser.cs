// 解析 /model 与 /effort 的输出，取出当前值与可选值

using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace AgentExtension.Agents
{
    /// <summary>解析 <c>/model</c> 与 <c>/effort</c> 不带参数时的输出。</summary>
    public static class ModelStateParser
    {
        #region 正则

        private static readonly Regex CurrentLine = new Regex(
            @"Current model:\s*(?<model>.+?)\s*(?:\(effort:\s*(?<effort>[^)]+)\))?\s*$",
            RegexOptions.Multiline | RegexOptions.Compiled);

        private static readonly Regex AvailableLine = new Regex(
            @"Available:\s*(?<list>[^\r\n]+)",
            RegexOptions.Compiled);

        private static readonly Regex EffortUsage = new Regex(
            @"/effort\s*<(?<list>[^>]+)>",
            RegexOptions.Compiled);

        #endregion

        #region /model

        /// <summary>从 <c>/model</c> 的输出里取出当前模型、当前强度与可选模型。</summary>
        public static ModelState ParseModelOutput(string text)
        {
            var state = new ModelState();

            if (string.IsNullOrWhiteSpace(text))
            {
                return state;
            }

            Match current = CurrentLine.Match(text);

            if (current.Success)
            {
                state.Model = current.Groups["model"].Value.Trim();

                if (current.Groups["effort"].Success)
                {
                    state.Effort = current.Groups["effort"].Value.Trim();
                }
            }

            Match available = AvailableLine.Match(text);

            if (available.Success)
            {
                state.AvailableModels = SplitList(available.Groups["list"].Value, ',');
            }

            return state;
        }

        #endregion

        #region /effort

        /// <summary>从 <c>/effort</c> 的用法串里取出全部可选档位。</summary>
        public static IReadOnlyList<string> ParseEffortLevels(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                return Array.Empty<string>();
            }

            Match match = EffortUsage.Match(text);

            if (!match.Success)
            {
                return Array.Empty<string>();
            }

            return SplitList(match.Groups["list"].Value, '|');
        }

        #endregion

        #region 辅助

        private static IReadOnlyList<string> SplitList(string raw, char separator)
        {
            var list = new List<string>();

            foreach (string part in raw.Split(separator))
            {
                string item = part.Trim().TrimEnd('.');

                if (item.Length == 0)
                {
                    continue;
                }

                if (item.IndexOf(' ') >= 0)
                {
                    continue;
                }

                if (!list.Contains(item))
                {
                    list.Add(item);
                }
            }

            return list;
        }

        #endregion
    }

    /// <summary>当前模型、当前强度与可选模型。</summary>
    public class ModelState
    {
        public string Model { get; set; } = string.Empty;

        public string Effort { get; set; } = string.Empty;

        public IReadOnlyList<string> AvailableModels { get; set; } = Array.Empty<string>();

        /// <summary>是否解析出了任何有效内容。</summary>
        public bool HasValue
        {
            get
            {
                return Model.Length > 0 || Effort.Length > 0 || AvailableModels.Count > 0;
            }
        }
    }
}
