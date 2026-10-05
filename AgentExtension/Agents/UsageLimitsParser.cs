// 解析 /usage 的额度窗口行

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace AgentExtension.Agents
{
    /// <summary>解析 <c>/usage</c> 输出里的额度窗口。</summary>
    public static class UsageLimitsParser
    {
        #region 常量

        private static readonly Regex WindowPattern = new Regex(
            @"^[ \t]*(?<label>Current [^:]+):[ \t]*(?<percent>\d+)%[ \t]*used[ \t]*·[ \t]*resets[ \t]+(?<resets>.+?)[ \t]*$",
            RegexOptions.Compiled | RegexOptions.Multiline);

        private static readonly Regex ModelInLabel = new Regex(
            @"\((?<model>[^)]+)\)[ \t]*$", RegexOptions.Compiled);

        private static readonly Regex ResetPattern = new Regex(
            @"^(?<month>[A-Za-z]{3})[ \t]+(?<day>\d{1,2}),[ \t]*(?<hour>\d{1,2})(?::(?<minute>\d{2}))?[ \t]*(?<meridiem>am|pm)[ \t]*(?:\((?<zone>[^)]+)\))?[ \t]*$",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private const string AllModelsMarker = "all models";

        #endregion

        #region 解析

        /// <summary>解析出全部额度窗口。</summary>
        public static IReadOnlyList<UsageWindow> Parse(string text)
        {
            return Parse(text, DateTimeOffset.Now);
        }

        /// <summary>指定参照时刻的重载，供测试用固定时间验证年份推断，不依赖运行日期。</summary>
        internal static IReadOnlyList<UsageWindow> Parse(string text, DateTimeOffset reference)
        {
            var windows = new List<UsageWindow>();

            if (string.IsNullOrWhiteSpace(text))
            {
                return windows;
            }

            foreach (Match match in WindowPattern.Matches(text))
            {
                string label = match.Groups["label"].Value.Trim();
                string resets = match.Groups["resets"].Value.Trim();

                long unix;

                var window = new UsageWindow
                {
                    Label = label,
                    PercentUsed = int.Parse(match.Groups["percent"].Value, CultureInfo.InvariantCulture),
                    ResetsAtText = resets,
                    Model = ExtractModel(label),
                    ResetsAtUnix = TryParseResetTime(resets, reference, out unix) ? unix : 0
                };

                windows.Add(window);
            }

            return windows;
        }

        private static string ExtractModel(string label)
        {
            Match match = ModelInLabel.Match(label);

            if (!match.Success)
            {
                return string.Empty;
            }

            string inside = match.Groups["model"].Value.Trim();

            return inside.IndexOf(AllModelsMarker, StringComparison.OrdinalIgnoreCase) >= 0
                ? string.Empty
                : inside;
        }

        /// <summary>把重置时刻原文解析成 Unix 秒。</summary>
        internal static bool TryParseResetTime(string text, DateTimeOffset reference, out long unixSeconds)
        {
            unixSeconds = 0;

            if (string.IsNullOrWhiteSpace(text))
            {
                return false;
            }

            Match match = ResetPattern.Match(text.Trim());

            if (!match.Success)
            {
                return false;
            }

            string zone = match.Groups["zone"].Success ? match.Groups["zone"].Value.Trim() : string.Empty;

            if (zone.Length > 0 && !ZoneLooksLocal(zone))
            {
                return false;
            }

            int month;

            if (!TryMonthNumber(match.Groups["month"].Value, out month))
            {
                return false;
            }

            int day = int.Parse(match.Groups["day"].Value, CultureInfo.InvariantCulture);
            int hour = int.Parse(match.Groups["hour"].Value, CultureInfo.InvariantCulture);
            int minute = match.Groups["minute"].Success
                ? int.Parse(match.Groups["minute"].Value, CultureInfo.InvariantCulture)
                : 0;
            bool pm = match.Groups["meridiem"].Value.Equals("pm", StringComparison.OrdinalIgnoreCase);

            if (hour == 12)
            {
                hour = pm ? 12 : 0;
            }
            else if (pm)
            {
                hour += 12;
            }

            for (int yearOffset = 0; yearOffset <= 1; yearOffset++)
            {
                int year = reference.Year + yearOffset;

                if (month < 1 || month > 12 || day < 1 || day > DateTime.DaysInMonth(year, month))
                {
                    continue;
                }

                var candidate = new DateTimeOffset(
                    new DateTime(year, month, day, hour, minute, 0, DateTimeKind.Unspecified),
                    reference.Offset);

                // 允许略早于参照时刻：窗口刚好在这一刻重置时不该被推到明年。
                if (candidate >= reference.AddDays(-1))
                {
                    unixSeconds = candidate.ToUnixTimeSeconds();
                    return true;
                }
            }

            return false;
        }

        private static bool ZoneLooksLocal(string zone)
        {
            string city = zone;
            int slash = zone.LastIndexOf('/');

            if (slash >= 0 && slash < zone.Length - 1)
            {
                city = zone.Substring(slash + 1);
            }

            city = city.Replace('_', ' ').Trim();

            if (city.Length == 0)
            {
                return false;
            }

            TimeZoneInfo local = TimeZoneInfo.Local;

            return local.Id.IndexOf(city, StringComparison.OrdinalIgnoreCase) >= 0
                || local.DisplayName.IndexOf(city, StringComparison.OrdinalIgnoreCase) >= 0
                || local.StandardName.IndexOf(city, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool TryMonthNumber(string abbreviation, out int month)
        {
            string[] names = { "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec" };
            string key = abbreviation.Trim().ToLowerInvariant();

            for (int i = 0; i < names.Length; i++)
            {
                if (names[i] == key)
                {
                    month = i + 1;
                    return true;
                }
            }

            month = 0;
            return false;
        }

        #endregion
    }
}
