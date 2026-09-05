// 主题色的纯计算，不依赖 VS SDK 以便单测

using System.Globalization;

namespace AgentExtension.Bridge
{
    /// <summary>把宿主取到的原始颜色换算成前端需要的调色板。</summary>
    public static class ThemePalette
    {
        #region 转换

        /// <summary>转成 CSS 十六进制色值。</summary>
        public static string ToHex(byte r, byte g, byte b)
        {
            string hex = string.Format(CultureInfo.InvariantCulture, "#{0:X2}{1:X2}{2:X2}", r, g, b);
            return hex;
        }

        #endregion

        #region 判断

        /// <summary>是否算深色背景。</summary>
        public static bool IsDark(byte r, byte g, byte b)
        {
            double luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
            bool dark = luminance < 128d;
            return dark;
        }

        #endregion

        #region 推导

        /// <summary>从背景色推出一个略有区别的“次级背景”，用于卡片、代码块这类需要与底色分层的元素。</summary>
        public static string DeriveAlternateBackground(byte r, byte g, byte b, int amount = 12)
        {
            if (amount < 0)
            {
                amount = 0;
            }

            int direction = IsDark(r, g, b) ? 1 : -1;

            byte shiftedR = Clamp(r + (direction * amount));
            byte shiftedG = Clamp(g + (direction * amount));
            byte shiftedB = Clamp(b + (direction * amount));

            string hex = ToHex(shiftedR, shiftedG, shiftedB);
            return hex;
        }

        private static byte Clamp(int value)
        {
            if (value < 0)
            {
                return 0;
            }

            if (value > 255)
            {
                return 255;
            }

            return (byte)value;
        }

        #endregion

        #region 对比度

        /// <summary>强调色至少要达到的对比度。</summary>
        public const double MinAccentContrast = 3.0d;

        /// <summary>边框至少要达到的对比度。</summary>
        public const double MinBorderContrast = 1.35d;

        /// <summary>WCAG 相对亮度。</summary>
        public static double RelativeLuminance(byte r, byte g, byte b)
        {
            double luminance = (0.2126 * Linearize(r)) + (0.7152 * Linearize(g)) + (0.0722 * Linearize(b));
            return luminance;
        }

        /// <summary>WCAG 对比度，取值 1（完全相同）到 21（纯黑对纯白）。</summary>
        public static double ContrastRatio(
            byte r1, byte g1, byte b1,
            byte r2, byte g2, byte b2)
        {
            double first = RelativeLuminance(r1, g1, b1);
            double second = RelativeLuminance(r2, g2, b2);

            double lighter = first > second ? first : second;
            double darker = first > second ? second : first;

            double ratio = (lighter + 0.05d) / (darker + 0.05d);
            return ratio;
        }

        /// <summary>把前景色朝“看得见”的方向推，直到与背景的对比度达到 。</summary>
        public static void EnsureContrast(
            byte foreR, byte foreG, byte foreB,
            byte backR, byte backG, byte backB,
            double minRatio,
            out byte outR, out byte outG, out byte outB)
        {
            outR = foreR;
            outG = foreG;
            outB = foreB;

            if (ContrastRatio(foreR, foreG, foreB, backR, backG, backB) >= minRatio)
            {
                return;
            }

            byte targetChannel = IsDark(backR, backG, backB) ? (byte)255 : (byte)0;

            for (int step = 1; step <= 20; step++)
            {
                double weight = step / 20d;

                byte mixedR = Mix(foreR, targetChannel, weight);
                byte mixedG = Mix(foreG, targetChannel, weight);
                byte mixedB = Mix(foreB, targetChannel, weight);

                if (ContrastRatio(mixedR, mixedG, mixedB, backR, backG, backB) >= minRatio)
                {
                    outR = mixedR;
                    outG = mixedG;
                    outB = mixedB;
                    return;
                }
            }

            outR = targetChannel;
            outG = targetChannel;
            outB = targetChannel;
        }

        /// <summary>压在某个颜色**上面**的文字该用什么色。</summary>
        public static string TextOn(
            byte r, byte g, byte b,
            byte foreR, byte foreG, byte foreB,
            byte backR, byte backG, byte backB)
        {
            double againstFore = ContrastRatio(r, g, b, foreR, foreG, foreB);
            double againstBack = ContrastRatio(r, g, b, backR, backG, backB);

            double best = againstFore >= againstBack ? againstFore : againstBack;

            if (best >= MinAccentContrast)
            {
                string themed = againstFore >= againstBack
                    ? ToHex(foreR, foreG, foreB)
                    : ToHex(backR, backG, backB);
                return themed;
            }

            double againstWhite = ContrastRatio(r, g, b, 255, 255, 255);
            double againstBlack = ContrastRatio(r, g, b, 0x1F, 0x1F, 0x1F);

            string extreme = againstWhite >= againstBlack ? "#FFFFFF" : "#1F1F1F";
            return extreme;
        }

        private static double Linearize(byte channel)
        {
            double normalized = channel / 255d;

            if (normalized <= 0.03928d)
            {
                return normalized / 12.92d;
            }

            double linear = System.Math.Pow((normalized + 0.055d) / 1.055d, 2.4d);
            return linear;
        }

        private static byte Mix(byte from, byte to, double weight)
        {
            double mixed = from + ((to - from) * weight);
            byte rounded = Clamp((int)System.Math.Round(mixed));
            return rounded;
        }

        #endregion
    }
}
