// 按工作目录记住本扩展上次开的 tab 条

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 把「本扩展上次在某个工作目录里开的 tab 条」记在本地 JSON 里。
    ///
    /// 不按「转录目录里最新的 jsonl」推断：那个目录里还混着面板取数的短进程、
    /// 以及用户在终端里跑的 Claude Code，按时间取会接错人。
    /// </summary>
    public class LastSessionStore
    {
        #region 字段与构造

        private readonly string _filePath;

        private readonly object _gate = new object();

        public LastSessionStore(string filePath)
        {
            _filePath = filePath ?? string.Empty;
        }

        /// <summary>默认落点：<c>%LocalAppData%\AgentExtension\last-session.json</c>。</summary>
        public static string DefaultFilePath()
        {
            string root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string path = Path.Combine(root, "AgentExtension", "last-session.json");
            return path;
        }

        #endregion

        #region 读写

        /// <summary>读出某工作目录上次**激活**的那条会话 id；没有记录或文件读坏都返回空串。</summary>
        public string Read(string workingDirectory)
        {
            WorkspaceTabsRecord record = ReadTabs(workingDirectory);

            if (record.Tabs.Count == 0)
            {
                return string.Empty;
            }

            string id = record.Tabs[record.Active].SessionId;
            return id;
        }

        /// <summary>记下某工作目录**当前激活的** tab 的会话 id。与已记的相同则不落盘，返回是否真写了。</summary>
        public bool Write(string workingDirectory, string sessionId)
        {
            string id = (sessionId ?? string.Empty).Trim();

            if (NormalizeKey(workingDirectory).Length == 0 || id.Length == 0)
            {
                return false;
            }

            lock (_gate)
            {
                WorkspaceTabsRecord record = ReadTabsCore(workingDirectory);
                var tabs = new List<TabRecord>(record.Tabs);

                if (tabs.Count == 0)
                {
                    tabs.Add(new TabRecord { SessionId = id, Title = DefaultTitle(1) });
                    record.Active = 0;
                }
                else
                {
                    if (string.Equals(tabs[record.Active].SessionId, id, StringComparison.OrdinalIgnoreCase))
                    {
                        return false;
                    }

                    tabs[record.Active].SessionId = id;
                }

                record.Tabs = tabs;
                bool written = WriteTabsCore(workingDirectory, record);
                return written;
            }
        }

        /// <summary>读出某工作目录上次开着的整条 tab 条。没有记录、读坏、格式不认得都返回空条，**绝不抛**。</summary>
        public WorkspaceTabsRecord ReadTabs(string workingDirectory)
        {
            lock (_gate)
            {
                WorkspaceTabsRecord record = ReadTabsCore(workingDirectory);
                return record;
            }
        }

        /// <summary>整条写回。返回是否真写进了磁盘。</summary>
        public bool WriteTabs(string workingDirectory, WorkspaceTabsRecord record)
        {
            if (NormalizeKey(workingDirectory).Length == 0 || record == null)
            {
                return false;
            }

            lock (_gate)
            {
                bool written = WriteTabsCore(workingDirectory, record);
                return written;
            }
        }

        #endregion

        #region 内部

        /// <summary>盘符大小写与尾部分隔符都可能变，归一化后才当同一个目录。</summary>
        private static string NormalizeKey(string workingDirectory)
        {
            string trimmed = (workingDirectory ?? string.Empty).Trim().TrimEnd('\\', '/');
            return trimmed;
        }

        /// <summary>默认标题。与 <c>ChatTabPolicy.NextTitle</c> 的形状保持一致。</summary>
        private static string DefaultTitle(int index)
        {
            string title = "会话 " + index.ToString(CultureInfo.InvariantCulture);
            return title;
        }

        /// <summary>会话 id 必须是 Guid 形状：它会原样成为 <c>--resume</c> 的实参，而这个文件用户可以手改。</summary>
        private static bool IsValidSessionId(string sessionId)
        {
            string id = (sessionId ?? string.Empty).Trim();
            Guid parsed;
            bool ok = id.Length > 0 && Guid.TryParseExact(id, "D", out parsed);
            return ok;
        }

        private WorkspaceTabsRecord ReadTabsCore(string workingDirectory)
        {
            var empty = new WorkspaceTabsRecord();
            string key = NormalizeKey(workingDirectory);

            if (key.Length == 0 || _filePath.Length == 0 || !File.Exists(_filePath))
            {
                return empty;
            }

            try
            {
                string text = File.ReadAllText(_filePath, Encoding.UTF8);

                using (JsonDocument document = JsonDocument.Parse(text))
                {
                    JsonElement root = document.RootElement;

                    if (root.ValueKind != JsonValueKind.Object)
                    {
                        return empty;
                    }

                    foreach (JsonProperty property in root.EnumerateObject())
                    {
                        if (!string.Equals(NormalizeKey(property.Name), key, StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        WorkspaceTabsRecord parsed = ParseWorkspace(property.Value);
                        return parsed;
                    }
                }
            }
            catch (JsonException)
            {
                // 写坏了就当没有记录：这条路在开面板的必经之路上，抛出去等于面板起不来。
                return empty;
            }
            catch (IOException)
            {
                return empty;
            }
            catch (UnauthorizedAccessException)
            {
                return empty;
            }

            return empty;
        }

        /// <summary>一个目录条目：字符串是旧格式（迁移成单 tab），对象是新格式。</summary>
        private static WorkspaceTabsRecord ParseWorkspace(JsonElement value)
        {
            var record = new WorkspaceTabsRecord();

            if (value.ValueKind == JsonValueKind.String)
            {
                string legacy = value.GetString() ?? string.Empty;

                if (!IsValidSessionId(legacy))
                {
                    return record;
                }

                record.Tabs = new List<TabRecord>
                {
                    new TabRecord { SessionId = legacy.Trim(), Title = DefaultTitle(1) }
                };

                record.Active = 0;
                return record;
            }

            if (value.ValueKind != JsonValueKind.Object)
            {
                return record;
            }

            JsonElement tabsElement;

            if (!value.TryGetProperty("tabs", out tabsElement)
                || tabsElement.ValueKind != JsonValueKind.Array)
            {
                return record;
            }

            var tabs = new List<TabRecord>();

            foreach (JsonElement item in tabsElement.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                JsonElement idElement;

                if (!item.TryGetProperty("id", out idElement)
                    || idElement.ValueKind != JsonValueKind.String)
                {
                    continue;
                }

                string sessionId = (idElement.GetString() ?? string.Empty).Trim();

                if (sessionId.Length > 0 && !IsValidSessionId(sessionId))
                {
                    // 校验必须先于任何文件操作：非空的 id 会原样变成 --resume 的命令行参数，
                    // 形状不对就丢。空串不在此列——「这个 tab 还没有会话」是懒启动的合法状态，
                    // 真正的安全校验在 SessionResumeDecision.Resolve 里（Guid 形状 + 转录文件
                    // 存在性），这里丢空串纯属过度防御：不仅会把标题也一并丢掉，还会让
                    // active 下标与过滤后的数组位置错开（原始下标是按过滤前的顺序记的）。
                    continue;
                }

                JsonElement titleElement;
                string title = item.TryGetProperty("title", out titleElement)
                    && titleElement.ValueKind == JsonValueKind.String
                        ? (titleElement.GetString() ?? string.Empty).Trim()
                        : string.Empty;

                if (title.Length == 0)
                {
                    title = DefaultTitle(tabs.Count + 1);
                }

                tabs.Add(new TabRecord { SessionId = sessionId, Title = title });
            }

            record.Tabs = tabs;

            JsonElement activeElement;
            int active = 0;

            if (value.TryGetProperty("active", out activeElement)
                && activeElement.ValueKind == JsonValueKind.Number)
            {
                activeElement.TryGetInt32(out active);
            }

            if (active < 0 || active >= tabs.Count)
            {
                active = 0;
            }

            record.Active = active;
            return record;
        }

        private bool WriteTabsCore(string workingDirectory, WorkspaceTabsRecord record)
        {
            string key = NormalizeKey(workingDirectory);

            try
            {
                var all = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

                // 别的目录原样克隆 JsonElement 写回，不走 ParseWorkspace/ToWire 重新序列化：
                // 混合升级时对方多半还是旧格式字符串，一旦解析再重建就会被这次写操作连带迁移成新格式对象，
                // 用户根本没碰过的目录就丢了「旧版本扩展读到新格式会降级成没有记录」这条保护。
                if (_filePath.Length > 0 && File.Exists(_filePath))
                {
                    string existing = File.ReadAllText(_filePath, Encoding.UTF8);

                    using (JsonDocument document = JsonDocument.Parse(existing))
                    {
                        if (document.RootElement.ValueKind == JsonValueKind.Object)
                        {
                            foreach (JsonProperty property in document.RootElement.EnumerateObject())
                            {
                                if (string.Equals(NormalizeKey(property.Name), key, StringComparison.OrdinalIgnoreCase))
                                {
                                    continue;
                                }

                                // Clone 是必须的：property.Value 绑在这个 using 块的 JsonDocument 上，出了块就失效。
                                all[NormalizeKey(property.Name)] = property.Value.Clone();
                            }
                        }
                    }
                }

                all[key] = ToWire(record);

                string directory = Path.GetDirectoryName(_filePath) ?? string.Empty;

                if (directory.Length > 0 && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                var options = new JsonSerializerOptions { WriteIndented = true };
                string json = JsonSerializer.Serialize(all, options);

                File.WriteAllText(_filePath, json, Encoding.UTF8);
                return true;
            }
            catch (JsonException)
            {
                return false;
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

        /// <summary>落盘用的形状。键名固定 <c>active</c> / <c>tabs</c> / <c>id</c> / <c>title</c>。</summary>
        private static object ToWire(WorkspaceTabsRecord record)
        {
            var tabs = new List<Dictionary<string, string>>();

            foreach (TabRecord tab in record.Tabs)
            {
                tabs.Add(new Dictionary<string, string>
                {
                    { "id", tab.SessionId },
                    { "title", tab.Title }
                });
            }

            var wire = new Dictionary<string, object>
            {
                { "active", record.Active },
                { "tabs", tabs }
            };

            return wire;
        }

        #endregion
    }
}
