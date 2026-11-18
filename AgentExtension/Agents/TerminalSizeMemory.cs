// 记住上次终端的真实尺寸，预启动按它起，接上时不必整屏重画

using System;
using System.Globalization;
using System.IO;

namespace AgentExtension.Agents
{
    /// <summary>上次终端的行列数，落盘跨 VS 重启。</summary>
    public class TerminalSizeMemory
    {
        #region 字段

        /// <summary>从没记过时用的列数。</summary>
        public const int FallbackColumns = 120;

        /// <summary>从没记过时用的行数。</summary>
        public const int FallbackRows = 40;

        /// <summary>护住内存里那份：多个 tab 的桥都会读写。</summary>
        private readonly object _gate = new object();

        /// <summary>落盘位置；空串表示只在内存里。</summary>
        private readonly string _filePath;

        /// <summary>已读过文件没有。</summary>
        private bool _loaded;

        /// <summary>记住的列数。</summary>
        private int _columns = FallbackColumns;

        /// <summary>记住的行数。</summary>
        private int _rows = FallbackRows;

        #endregion

        #region 构造

        /// <summary>按指定文件建一份。</summary>
        public TerminalSizeMemory(string filePath)
        {
            _filePath = filePath ?? string.Empty;
        }

        /// <summary>默认落盘路径，在 LocalAppData 下。</summary>
        public static string DefaultFilePath()
        {
            string root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string path = Path.Combine(root, "AgentExtension", "terminal-size.txt");
            return path;
        }

        /// <summary>进程内共用的一份。</summary>
        public static TerminalSizeMemory Default { get; } = new TerminalSizeMemory(DefaultFilePath());

        #endregion

        #region 读写

        /// <summary>记住的列数。</summary>
        public int Columns
        {
            get
            {
                lock (_gate)
                {
                    Load();
                    return _columns;
                }
            }
        }

        /// <summary>记住的行数。</summary>
        public int Rows
        {
            get
            {
                lock (_gate)
                {
                    Load();
                    return _rows;
                }
            }
        }

        /// <summary>记下新尺寸；变了才落盘，失败只影响下次冷启动。</summary>
        public void Remember(int columns, int rows)
        {
            if (columns <= 0 || rows <= 0)
            {
                return;
            }

            lock (_gate)
            {
                Load();

                if (columns == _columns && rows == _rows)
                {
                    return;
                }

                _columns = columns;
                _rows = rows;

                if (_filePath.Length == 0)
                {
                    return;
                }

                try
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(_filePath) ?? ".");
                    File.WriteAllText(_filePath, Format(columns, rows));
                }
                catch (IOException)
                {
                }
                catch (UnauthorizedAccessException)
                {
                }
            }
        }

        /// <summary>落盘格式，形如 138x67。</summary>
        public static string Format(int columns, int rows)
        {
            string text = columns.ToString(CultureInfo.InvariantCulture) + "x" + rows.ToString(CultureInfo.InvariantCulture);
            return text;
        }

        /// <summary>解析落盘文本；坏了返回 false。</summary>
        public static bool TryParse(string text, out int columns, out int rows)
        {
            columns = 0;
            rows = 0;

            string[] parts = (text ?? string.Empty).Trim().Split('x');

            bool ok = parts.Length == 2
                && int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out columns)
                && int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out rows)
                && columns > 0
                && rows > 0;

            return ok;
        }

        /// <summary>第一次用到才读文件；读不出就用兜底尺寸。</summary>
        private void Load()
        {
            if (_loaded)
            {
                return;
            }

            _loaded = true;

            if (_filePath.Length == 0 || !File.Exists(_filePath))
            {
                return;
            }

            try
            {
                int columns;
                int rows;

                if (TryParse(File.ReadAllText(_filePath), out columns, out rows))
                {
                    _columns = columns;
                    _rows = rows;
                }
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }

        #endregion
    }
}
