// 探测结果的本地缓存

using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>探测答案缓存，键为「命令|附加参数」。</summary>
    public class ProbeCache
    {
        #region 字段

        /// <summary>护住条目表：探测线程与起会话的线程都会碰。</summary>
        private readonly object _gate = new object();

        /// <summary>落盘位置；空串表示只在内存里。</summary>
        private readonly string _filePath;

        /// <summary>条目表，第一次用到才读文件。</summary>
        private Dictionary<string, string>? _entries;

        #endregion

        #region 构造

        /// <summary>按指定文件建一份缓存。</summary>
        public ProbeCache(string filePath)
        {
            _filePath = filePath ?? string.Empty;
        }

        /// <summary>默认落盘路径，在 LocalAppData 下。</summary>
        public static string DefaultFilePath()
        {
            string root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string path = Path.Combine(root, "AgentExtension", "probe-cache.json");
            return path;
        }

        /// <summary>进程内共用的一份。</summary>
        public static ProbeCache Default { get; } = new ProbeCache(DefaultFilePath());

        #endregion

        #region 读写

        /// <summary>缓存键：命令加附加参数。</summary>
        public static string KeyFor(string command, string extraArguments)
        {
            string key = (command ?? string.Empty) + "|" + (extraArguments ?? string.Empty);
            return key;
        }

        /// <summary>上次的原文；没有返回空串。</summary>
        public string Get(string key)
        {
            lock (_gate)
            {
                Dictionary<string, string> entries = Load();
                string text;

                bool found = entries.TryGetValue(key ?? string.Empty, out text);
                return found ? text : string.Empty;
            }
        }

        /// <summary>记下这次的原文并落盘。落盘失败只影响下次冷启动，就地咽下。</summary>
        public void Set(string key, string text)
        {
            if (string.IsNullOrEmpty(key) || string.IsNullOrEmpty(text))
            {
                return;
            }

            lock (_gate)
            {
                Dictionary<string, string> entries = Load();
                entries[key] = text;
                Save(entries);
            }
        }

        /// <summary>读文件；坏文件、没文件都当空表。</summary>
        private Dictionary<string, string> Load()
        {
            if (_entries != null)
            {
                return _entries;
            }

            var entries = new Dictionary<string, string>(StringComparer.Ordinal);

            try
            {
                if (_filePath.Length > 0 && File.Exists(_filePath))
                {
                    Dictionary<string, string>? parsed =
                        JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(_filePath));

                    if (parsed != null)
                    {
                        foreach (KeyValuePair<string, string> pair in parsed)
                        {
                            entries[pair.Key] = pair.Value ?? string.Empty;
                        }
                    }
                }
            }
            catch (Exception)
            {
                // 缓存只是个加速，读不出来就从头探
            }

            _entries = entries;
            return entries;
        }

        /// <summary>写文件；目录不在就建。</summary>
        private void Save(Dictionary<string, string> entries)
        {
            if (_filePath.Length == 0)
            {
                return;
            }

            try
            {
                string? directory = Path.GetDirectoryName(_filePath);

                if (!string.IsNullOrEmpty(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                File.WriteAllText(_filePath, JsonSerializer.Serialize(entries, new JsonSerializerOptions
                {
                    WriteIndented = true
                }));
            }
            catch (Exception)
            {
                // 同上：写不进去只是下次冷启动慢一点
            }
        }

        #endregion
    }
}
