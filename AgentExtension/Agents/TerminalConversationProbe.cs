// 终端那一路会话有没有真聊过：增量读它的转录

using System;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 盯终端会话转录，判定之后有无真对话。
    /// </summary>
    public class TerminalConversationProbe
    {
        #region 字段

        /// <summary>模型没真回话时 CLI 记的占位型号。</summary>
        private const string SyntheticModel = "<synthetic>";

        /// <summary>转录目录还没建出来时的重找间隔。</summary>
        private static readonly TimeSpan ResolveRetryInterval = TimeSpan.FromSeconds(10);

        /// <summary>串行化后台轮询与 UI 线程的同步轮询。</summary>
        private readonly object _gate = new object();

        /// <summary>解析转录目录，解不出返回空串。</summary>
        private readonly Func<string> _resolveDirectory;

        /// <summary>转录文件完整路径，解出后缓存。</summary>
        private string _path = string.Empty;

        /// <summary>下次允许重找目录的时刻。</summary>
        private DateTime _nextResolveUtc = DateTime.MinValue;

        /// <summary>已读到的字节位置，只停在整行末尾。</summary>
        private long _offset;

        /// <summary>起算时刻，早于它的行不算新对话。</summary>
        private DateTime _sinceUtc;

        /// <summary>起算之后是否已见到真对话。</summary>
        private volatile bool _hasConversation;

        #endregion

        #region 构造

        /// <summary>从 <paramref name="sinceUtc"/> 起盯这条会话的转录。</summary>
        public TerminalConversationProbe(string sessionId, Func<string> resolveDirectory, DateTime sinceUtc)
        {
            SessionId = sessionId ?? string.Empty;
            _resolveDirectory = resolveDirectory ?? throw new ArgumentNullException(nameof(resolveDirectory));
            _sinceUtc = sinceUtc;
        }

        #endregion

        #region 属性

        /// <summary>被盯的终端会话 id。</summary>
        public string SessionId { get; }

        /// <summary>起算之后是否已见到真对话。</summary>
        public bool HasConversation => _hasConversation;

        /// <summary>起算之后的首条真提问原文；没见到为空串。</summary>
        public string FirstPrompt { get; private set; } = string.Empty;

        /// <summary>CLI 给这条会话起的标题；没有为空串。</summary>
        public string CliTitle
        {
            get
            {
                string title = _customTitle.Length > 0 ? _customTitle : _aiTitle;
                return title;
            }
        }

        /// <summary>/rename 写的标题。</summary>
        private string _customTitle = string.Empty;

        /// <summary>CLI 自动起的标题，每轮可能重写。</summary>
        private string _aiTitle = string.Empty;

        #endregion

        #region 轮询

        /// <summary>读新增行；有新对话或标题变了返回 true。</summary>
        public bool Poll()
        {
            lock (_gate)
            {
                try
                {
                    string path = ResolvePath();

                    if (path.Length == 0)
                    {
                        return false;
                    }

                    string titleBefore = CliTitle;
                    bool found = ReadAppended(path);
                    bool changed = found && !_hasConversation;

                    if (found)
                    {
                        _hasConversation = true;
                    }

                    changed |= CliTitle != titleBefore;
                    return changed;
                }
                catch (IOException)
                {
                    return false;
                }
                catch (UnauthorizedAccessException)
                {
                    return false;
                }
            }
        }

        /// <summary>改从新时刻起算，此前的对话不再作数。</summary>
        public void Rearm(DateTime sinceUtc)
        {
            lock (_gate)
            {
                _sinceUtc = sinceUtc;
                _hasConversation = false;
                FirstPrompt = string.Empty;
                _customTitle = string.Empty;
                _aiTitle = string.Empty;
            }
        }

        /// <summary>转录路径；目录还没建出来返回空串。</summary>
        private string ResolvePath()
        {
            if (_path.Length > 0)
            {
                return _path;
            }

            DateTime now = DateTime.UtcNow;

            if (now < _nextResolveUtc)
            {
                return string.Empty;
            }

            string directory = _resolveDirectory() ?? string.Empty;

            if (directory.Length == 0 || SessionId.Length == 0)
            {
                _nextResolveUtc = now + ResolveRetryInterval;
                return string.Empty;
            }

            _path = Path.Combine(directory, SessionId + ".jsonl");
            return _path;
        }

        /// <summary>从上次停下的整行处读到文件尾，逐行判定。</summary>
        private bool ReadAppended(string path)
        {
            var info = new FileInfo(path);

            if (!info.Exists)
            {
                return false;
            }

            if (info.Length < _offset)
            {
                // 文件被重写过，从头再读
                _offset = 0;
            }

            if (info.Length == _offset)
            {
                return false;
            }

            byte[] buffer;

            using (var stream = new FileStream(
                path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var copy = new MemoryStream())
            {
                stream.Seek(_offset, SeekOrigin.Begin);
                stream.CopyTo(copy);
                buffer = copy.ToArray();
            }

            int end = Array.LastIndexOf(buffer, (byte)'\n');

            if (end < 0)
            {
                // 最后一行还没写完，下次再读
                return false;
            }

            _offset += end + 1;

            string text = Encoding.UTF8.GetString(buffer, 0, end + 1);
            string prompt;
            bool found = ContainsConversation(text, _sinceUtc, out prompt);

            if (FirstPrompt.Length == 0)
            {
                FirstPrompt = prompt;
            }

            TrackCliTitles(text);
            return found;
        }

        #endregion

        #region 判定

        /// <summary>多行文本里有没有起算之后的真对话。</summary>
        public static bool ContainsConversation(string text, DateTime sinceUtc)
        {
            string prompt;
            bool found = ContainsConversation(text, sinceUtc, out prompt);
            return found;
        }

        /// <summary>同上，并带出其中首条真提问的原文（没有则空串）。</summary>
        public static bool ContainsConversation(string text, DateTime sinceUtc, out string firstPrompt)
        {
            firstPrompt = string.Empty;
            bool found = false;

            foreach (string raw in (text ?? string.Empty).Split('\n'))
            {
                string line = raw.TrimEnd('\r');

                if (!IsConversationLine(line, sinceUtc))
                {
                    continue;
                }

                found = true;

                if (firstPrompt.Length == 0)
                {
                    firstPrompt = ReadPrompt(line);
                }
            }

            return found;
        }

        /// <summary>记下文本里 CLI 写的标题，含分叉带来的。</summary>
        private void TrackCliTitles(string text)
        {
            foreach (string raw in text.Split('\n'))
            {
                JsonElement root;
                bool isCustom;
                string title;

                if (!TranscriptJson.TryParse(raw.TrimEnd('\r'), out root)
                    || !SessionHistoryReader.TryReadCliTitle(root, out isCustom, out title))
                {
                    continue;
                }

                if (isCustom)
                {
                    _customTitle = title;
                }
                else
                {
                    _aiTitle = title;
                }
            }
        }

        /// <summary>已判定为对话的行若是提问，取其原文。</summary>
        private static string ReadPrompt(string line)
        {
            JsonElement root;

            if (!TranscriptJson.TryParse(line, out root) || TranscriptJson.ReadString(root, "type") != "user")
            {
                return string.Empty;
            }

            string text = TranscriptJson.ReadUserText(root);
            return text;
        }

        /// <summary>这一行是不是起算之后的真提问或真回复。</summary>
        public static bool IsConversationLine(string line, DateTime sinceUtc)
        {
            JsonElement root;

            if (string.IsNullOrWhiteSpace(line) || !TranscriptJson.TryParse(line, out root))
            {
                return false;
            }

            string type = TranscriptJson.ReadString(root, "type");

            if ((type != "user" && type != "assistant") || !IsAfter(root, sinceUtc))
            {
                return false;
            }

            if (type == "assistant")
            {
                bool replied = ReadModel(root) != SyntheticModel;
                return replied;
            }

            if (IsTrue(root, "isMeta") || IsTrue(root, "isCompactSummary"))
            {
                return false;
            }

            // 斜杠命令与命令输出都裹在尖括号里
            string text = TranscriptJson.ReadUserText(root);
            bool prompt = text.Length > 0 && text[0] != '<';
            return prompt;
        }

        /// <summary>行时间戳不早于起算时刻。</summary>
        private static bool IsAfter(JsonElement root, DateTime sinceUtc)
        {
            DateTime at;

            bool parsed = DateTime.TryParse(
                TranscriptJson.ReadString(root, "timestamp"),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
                out at);

            bool after = parsed && at >= sinceUtc;
            return after;
        }

        /// <summary>回复行记的型号。</summary>
        private static string ReadModel(JsonElement root)
        {
            JsonElement message;

            if (!root.TryGetProperty("message", out message))
            {
                return string.Empty;
            }

            string model = TranscriptJson.ReadString(message, "model");
            return model;
        }

        /// <summary>布尔字段是否为 true。</summary>
        private static bool IsTrue(JsonElement root, string name)
        {
            JsonElement value;

            bool yes = root.TryGetProperty(name, out value) && value.ValueKind == JsonValueKind.True;
            return yes;
        }

        #endregion
    }
}
