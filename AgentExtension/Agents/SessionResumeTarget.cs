namespace AgentExtension.Agents
{
    /// <summary>一次接回判定的结果。</summary>
    public class SessionResumeTarget
    {
        /// <summary>要接回的会话 id；接不了时为空串。</summary>
        public string SessionId { get; set; } = string.Empty;

        /// <summary>那条会话的转录文件绝对路径，供回放读取；接不了时为空串。</summary>
        public string TranscriptPath { get; set; } = string.Empty;

        /// <summary>转录在，但只有命令没有对话，被要求跳过。</summary>
        public bool ProbeOnly { get; set; }

        /// <summary>能不能接回。</summary>
        public bool CanResume
        {
            get
            {
                bool can = SessionId.Length > 0;
                return can;
            }
        }
    }
}
