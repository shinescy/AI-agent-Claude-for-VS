// 终端行列数的取值策略，与 ConPTY 互操作解耦以便单测

namespace AgentExtension.Terminal
{
    /// <summary>把前端报来的行列数收敛成 ConPTY 能接受的值。</summary>
    public static class TerminalSizePolicy
    {
        #region 边界

        /// <summary>尺寸不可用时回落到的列数（VT 传统默认值）。</summary>
        public const short DefaultColumns = 80;

        /// <summary>尺寸不可用时回落到的行数。</summary>
        public const short DefaultRows = 24;

        /// <summary>最小列数。</summary>
        public const short MinColumns = 2;

        /// <summary>最小行数。</summary>
        public const short MinRows = 1;

        /// <summary>上限。</summary>
        public const short MaxColumns = 1000;

        /// <summary>行数上限，理由同 <see cref="MaxColumns"/>。</summary>
        public const short MaxRows = 1000;

        #endregion

        #region 收敛

        /// <summary>把一对行列数收敛到可用区间。</summary>
        public static void Normalize(int columns, int rows, out short normalizedColumns, out short normalizedRows)
        {
            normalizedColumns = columns <= 0 ? DefaultColumns : Clamp(columns, MinColumns, MaxColumns);
            normalizedRows = rows <= 0 ? DefaultRows : Clamp(rows, MinRows, MaxRows);
        }

        /// <summary>判断新尺寸是否值得下发一次 resize。</summary>
        public static bool ShouldResize(short currentColumns, short currentRows, short nextColumns, short nextRows)
        {
            return currentColumns != nextColumns || currentRows != nextRows;
        }

        private static short Clamp(int value, short min, short max)
        {
            if (value < min)
            {
                return min;
            }

            if (value > max)
            {
                return max;
            }

            return (short)value;
        }

        #endregion
    }
}
