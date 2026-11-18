// 本扩展自己的会话分组，按工作目录各存一套

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>
    /// 分组只记在本扩展的文件里，不改转录；CLI 不知道有分组。
    /// </summary>
    public class SessionGroupStore
    {
        #region 字段与构造

        private static readonly object Gate = new object();

        private readonly string _filePath;

        /// <summary>按指定文件读写。</summary>
        public SessionGroupStore(string filePath)
        {
            _filePath = filePath ?? string.Empty;
        }

        /// <summary>默认落点：<c>%LocalAppData%\AgentExtension\session-groups.json</c>。</summary>
        public static string DefaultFilePath()
        {
            string root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string path = Path.Combine(root, "AgentExtension", "session-groups.json");
            return path;
        }

        #endregion

        #region 读

        /// <summary>读某个目录的分组；没有或读坏给空清单，绝不抛。</summary>
        public SessionGroupsRecord Read(string workingDirectory)
        {
            lock (Gate)
            {
                Dictionary<string, SessionGroupsRecord> all = ReadAll();
                SessionGroupsRecord record = Find(all, workingDirectory) ?? new SessionGroupsRecord();
                return record;
            }
        }

        #endregion

        #region 改

        /// <summary>新建一个组，返回它的 id。</summary>
        public string Create(string workingDirectory, string name)
        {
            string id = Guid.NewGuid().ToString("N");

            Mutate(workingDirectory, record =>
            {
                record.Groups.Add(new SessionGroup { Id = id, Name = CleanName(name) });
            });

            return id;
        }

        /// <summary>改组名；组不存在抛 KeyNotFoundException。</summary>
        public void Rename(string workingDirectory, string groupId, string name)
        {
            Mutate(workingDirectory, record =>
            {
                Require(record, groupId).Name = CleanName(name);
            });
        }

        /// <summary>删组：里面的会话回到未分组，会话本身不动。</summary>
        public void Delete(string workingDirectory, string groupId)
        {
            Mutate(workingDirectory, record =>
            {
                SessionGroup group = Require(record, groupId);
                record.Groups.Remove(group);

                List<string> orphans = record.Members
                    .Where(pair => string.Equals(pair.Value, groupId, StringComparison.OrdinalIgnoreCase))
                    .Select(pair => pair.Key)
                    .ToList();

                foreach (string sessionId in orphans)
                {
                    record.Members.Remove(sessionId);
                }
            });
        }

        /// <summary>把会话放进某个组；组 id 为空串＝移回未分组。</summary>
        public void Move(string workingDirectory, string sessionId, string groupId)
        {
            Mutate(workingDirectory, record =>
            {
                if (string.IsNullOrEmpty(groupId))
                {
                    record.Members.Remove(sessionId);
                    return;
                }

                Require(record, groupId);
                record.Members[sessionId] = groupId;
            });
        }

        #endregion

        #region 内部

        private static string CleanName(string name)
        {
            string cleaned = (name ?? string.Empty).Trim();

            if (cleaned.Length == 0)
            {
                throw new ArgumentException("组名为空。", nameof(name));
            }

            return cleaned;
        }

        private static SessionGroup Require(SessionGroupsRecord record, string groupId)
        {
            SessionGroup? found = record.Groups
                .FirstOrDefault(g => string.Equals(g.Id, groupId, StringComparison.OrdinalIgnoreCase));

            if (found == null)
            {
                throw new KeyNotFoundException("这个分组已经不存在了，请刷新后重试。");
            }

            return found;
        }

        /// <summary>盘符大小写与尾部分隔符不同也算同一个目录。</summary>
        private static string NormalizeKey(string workingDirectory)
        {
            string key = (workingDirectory ?? string.Empty).Trim().TrimEnd('\\', '/');
            return key;
        }

        private static SessionGroupsRecord? Find(Dictionary<string, SessionGroupsRecord> all, string workingDirectory)
        {
            SessionGroupsRecord? found;
            all.TryGetValue(NormalizeKey(workingDirectory), out found);
            return found;
        }

        private void Mutate(string workingDirectory, Action<SessionGroupsRecord> change)
        {
            string key = NormalizeKey(workingDirectory);

            if (key.Length == 0)
            {
                throw new InvalidOperationException("还不知道当前工作目录，没法记分组。");
            }

            lock (Gate)
            {
                Dictionary<string, SessionGroupsRecord> all = ReadAll();
                SessionGroupsRecord record = Find(all, key) ?? new SessionGroupsRecord();

                change(record);

                all[key] = record;
                WriteAll(all);
            }
        }

        private Dictionary<string, SessionGroupsRecord> ReadAll()
        {
            var all = new Dictionary<string, SessionGroupsRecord>(StringComparer.OrdinalIgnoreCase);

            if (_filePath.Length == 0 || !File.Exists(_filePath))
            {
                return all;
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(File.ReadAllText(_filePath, Encoding.UTF8)))
                {
                    if (document.RootElement.ValueKind != JsonValueKind.Object)
                    {
                        return all;
                    }

                    foreach (JsonProperty directory in document.RootElement.EnumerateObject())
                    {
                        all[NormalizeKey(directory.Name)] = ParseRecord(directory.Value);
                    }
                }
            }
            catch (JsonException)
            {
                // 读坏当没有：会话弹窗不能因此打不开
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }

            return all;
        }

        private static SessionGroupsRecord ParseRecord(JsonElement value)
        {
            var record = new SessionGroupsRecord();

            if (value.ValueKind != JsonValueKind.Object)
            {
                return record;
            }

            JsonElement groups;

            if (value.TryGetProperty("groups", out groups) && groups.ValueKind == JsonValueKind.Array)
            {
                foreach (JsonElement item in groups.EnumerateArray())
                {
                    string id = ReadString(item, "id");
                    string name = ReadString(item, "name");

                    if (id.Length > 0 && name.Length > 0)
                    {
                        record.Groups.Add(new SessionGroup { Id = id, Name = name });
                    }
                }
            }

            JsonElement members;

            if (value.TryGetProperty("members", out members) && members.ValueKind == JsonValueKind.Object)
            {
                foreach (JsonProperty member in members.EnumerateObject())
                {
                    string groupId = member.Value.ValueKind == JsonValueKind.String
                        ? (member.Value.GetString() ?? string.Empty)
                        : string.Empty;

                    if (groupId.Length > 0)
                    {
                        record.Members[member.Name] = groupId;
                    }
                }
            }

            return record;
        }

        private static string ReadString(JsonElement item, string name)
        {
            JsonElement found;

            if (item.ValueKind == JsonValueKind.Object
                && item.TryGetProperty(name, out found)
                && found.ValueKind == JsonValueKind.String)
            {
                string text = (found.GetString() ?? string.Empty).Trim();
                return text;
            }

            return string.Empty;
        }

        private void WriteAll(Dictionary<string, SessionGroupsRecord> all)
        {
            var wire = new Dictionary<string, object>();

            foreach (KeyValuePair<string, SessionGroupsRecord> pair in all)
            {
                wire[pair.Key] = new Dictionary<string, object>
                {
                    { "groups", pair.Value.Groups.Select(g => new Dictionary<string, string> { { "id", g.Id }, { "name", g.Name } }).ToList() },
                    { "members", pair.Value.Members }
                };
            }

            try
            {
                string directory = Path.GetDirectoryName(_filePath) ?? string.Empty;

                if (directory.Length > 0 && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                var options = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
                };

                File.WriteAllText(_filePath, JsonSerializer.Serialize(wire, options), new UTF8Encoding(false));
            }
            catch (UnauthorizedAccessException ex)
            {
                throw new IOException($"分组清单写不进去：{ex.Message}", ex);
            }
        }

        #endregion
    }
}
