// 一个工作目录下的全部分组与归属

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>某个工作目录的分组清单。</summary>
    public class SessionGroupsRecord
    {
        /// <summary>分组，按创建顺序。</summary>
        public List<SessionGroup> Groups { get; set; } = new List<SessionGroup>();

        /// <summary>会话 id → 分组 id；不在里面的就是未分组。</summary>
        public Dictionary<string, string> Members { get; set; } =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }
}
