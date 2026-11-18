// 从终端输入字节里认出用户提交的整行 /clear

using System;
using System.Text;

namespace AgentExtension.Agents
{
    /// <summary>认出终端里敲下的 /clear（回车提交那一刻）。</summary>
    public sealed class TerminalClearDetector
    {
        #region 字段

        /// <summary>要认出的清屏命令。</summary>
        private const string ClearCommand = "/clear";

        /// <summary>当前这一行累积的可见字符。</summary>
        private readonly StringBuilder _line = new StringBuilder();

        /// <summary>正在吞一段 ESC 转义序列。</summary>
        private bool _inEscape;

        /// <summary>当前 ESC 序列已吞的字节，判括号粘贴标记用。</summary>
        private readonly StringBuilder _escape = new StringBuilder();

        /// <summary>正处在一段括号粘贴里。</summary>
        private bool _inPaste;

        #endregion

        #region 喂入

        /// <summary>喂一批敲进终端的字节；这批里提交了 /clear 就返回真。</summary>
        public bool Feed(byte[] data)
        {
            if (data == null)
            {
                return false;
            }

            bool hit = false;

            foreach (byte b in data)
            {
                if (FeedByte(b))
                {
                    hit = true;
                }
            }

            return hit;
        }

        #endregion

        #region 内部

        /// <summary>吃一个字节；它正好提交了 /clear 就返回真。</summary>
        private bool FeedByte(byte b)
        {
            if (_inEscape)
            {
                _escape.Append((char)b);

                // 转义序列吞到字母或 ~ 收尾为止。
                if ((b >= (byte)'A' && b <= (byte)'Z') || (b >= (byte)'a' && b <= (byte)'z') || b == (byte)'~')
                {
                    _inEscape = false;
                    EndEscape();
                }

                return false;
            }

            switch (b)
            {
                case 0x1b: // ESC：方向键等转义序列的开头
                    _inEscape = true;
                    _escape.Clear();
                    return false;

                case 0x0d: // 回车
                case 0x0a: // 换行
                    if (_inPaste)
                    {
                        // 粘贴内容里的换行不是用户提交，别误触发
                        _line.Clear();
                        return false;
                    }

                    bool hit = IsClear();
                    _line.Clear();
                    return hit;

                case 0x08: // 退格
                case 0x7f: // DEL
                    if (_line.Length > 0)
                    {
                        _line.Remove(_line.Length - 1, 1);
                    }

                    return false;

                case 0x15: // Ctrl+U 清行
                case 0x03: // Ctrl+C 中断
                    _line.Clear();
                    return false;

                case 0x09: // Tab 补全：唯一前缀补成 /clear
                    NormalizeOnComplete();
                    return false;
            }

            if (b >= 0x20 && b <= 0x7e)
            {
                _line.Append((char)b);
            }
            else
            {
                // 其它控制字节或多字节输入，让这一行不再等于 /clear。
                _line.Append('�');
            }

            return false;
        }

        /// <summary>一段 ESC 序列吞完：认出括号粘贴的进出标记。</summary>
        private void EndEscape()
        {
            string seq = _escape.ToString();
            _escape.Clear();

            if (seq == "[200~")
            {
                _inPaste = true;
            }
            else if (seq == "[201~")
            {
                // 粘贴整段不算用户敲的命令行
                _inPaste = false;
                _line.Clear();
            }
        }

        /// <summary>Tab 补全：是 /clear 唯一前缀就补全，否则作废。</summary>
        private void NormalizeOnComplete()
        {
            string cur = _line.ToString().Trim();
            _line.Clear();

            if (cur.Length >= 3 && ClearCommand.StartsWith(cur, StringComparison.Ordinal))
            {
                _line.Append(ClearCommand);
            }
        }

        /// <summary>当前行去空白后是 /clear 或它的唯一前缀。</summary>
        private bool IsClear()
        {
            string line = _line.ToString().Trim();
            // /cl 起唯一指向 /clear，补全或菜单只提交前缀也算
            bool clear = line.Length >= 3 && ClearCommand.StartsWith(line, StringComparison.Ordinal);
            return clear;
        }

        #endregion
    }
}
