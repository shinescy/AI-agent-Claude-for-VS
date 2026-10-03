// 读取 Visual Studio 当前主题的颜色，供前端注入 CSS 变量

using System;
using System.Collections.Generic;
using AgentExtension.Bridge;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;

namespace AgentExtension.Vs
{
    /// <summary>把 VS 主题颜色取出来交给前端。</summary>
    public static class VsThemeReader
    {
        #region 读取

        /// <summary>读取当前主题。</summary>
        public static IReadOnlyDictionary<string, string> ReadCurrentTheme()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            System.Drawing.Color background = SafeGetColor(
                EnvironmentColors.ToolWindowBackgroundColorKey, fallbackR: 0x1E, fallbackG: 0x1E, fallbackB: 0x1E);

            System.Drawing.Color foreground = SafeGetColor(
                EnvironmentColors.ToolWindowTextColorKey, fallbackR: 0xD4, fallbackG: 0xD4, fallbackB: 0xD4);

            System.Drawing.Color border = SafeGetColor(
                EnvironmentColors.ToolWindowBorderColorKey, fallbackR: 0x3F, fallbackG: 0x3F, fallbackB: 0x46);

            System.Drawing.Color accent = SafeGetColor(
                EnvironmentColors.ControlLinkTextColorKey, fallbackR: 0x00, fallbackG: 0x78, fallbackB: 0xD4);

            bool isDark = ThemePalette.IsDark(background.R, background.G, background.B);

            byte accentR, accentG, accentB;
            ThemePalette.EnsureContrast(
                accent.R, accent.G, accent.B,
                background.R, background.G, background.B,
                ThemePalette.MinAccentContrast,
                out accentR, out accentG, out accentB);

            byte borderR, borderG, borderB;
            ThemePalette.EnsureContrast(
                border.R, border.G, border.B,
                background.R, background.G, background.B,
                ThemePalette.MinBorderContrast,
                out borderR, out borderG, out borderB);

            var tokens = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["background"] = ThemePalette.ToHex(background.R, background.G, background.B),
                ["foreground"] = ThemePalette.ToHex(foreground.R, foreground.G, foreground.B),
                ["border"] = ThemePalette.ToHex(borderR, borderG, borderB),
                ["accent"] = ThemePalette.ToHex(accentR, accentG, accentB),

                // 压在强调色**上面**的文字色。
                ["accent-text"] = ThemePalette.TextOn(
                    accentR, accentG, accentB,
                    foreground.R, foreground.G, foreground.B,
                    background.R, background.G, background.B),
                ["background-alt"] = ThemePalette.DeriveAlternateBackground(background.R, background.G, background.B),

                ["scheme"] = isDark ? "dark" : "light"
            };

            return tokens;
        }

        private static System.Drawing.Color SafeGetColor(
            ThemeResourceKey key, byte fallbackR, byte fallbackG, byte fallbackB)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            try
            {
                System.Drawing.Color color = VSColorTheme.GetThemedColor(key);
                return color;
            }
            catch (Exception)
            {
                System.Drawing.Color fallback = System.Drawing.Color.FromArgb(fallbackR, fallbackG, fallbackB);
                return fallback;
            }
        }

        #endregion
    }
}
