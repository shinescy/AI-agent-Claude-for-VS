// 错误列表里的一条诊断

namespace AgentExtension.Vs
{
    /// <summary>诊断级别。</summary>
    public enum BuildIssueSeverity
    {
        Message,
        Warning,
        Error
    }

    /// <summary>错误列表里的一条诊断，纯数据以便格式化逻辑可单测。</summary>
    public class BuildIssue
    {
        public BuildIssueSeverity Severity { get; set; }

        public string FilePath { get; set; } = string.Empty;

        public int Line { get; set; }

        public int Column { get; set; }

        /// <summary>诊断编号，如 CS0103。</summary>
        public string Code { get; set; } = string.Empty;

        public string Message { get; set; } = string.Empty;

        /// <summary>所属项目名，可能为空。</summary>
        public string Project { get; set; } = string.Empty;
    }
}
