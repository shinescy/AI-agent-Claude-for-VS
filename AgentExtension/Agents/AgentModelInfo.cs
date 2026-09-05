// CLI 汇报的可用模型

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>一个可选模型，来自 initialize 握手的 <c>models</c> 数组。</summary>
    public class AgentModelInfo
    {
        /// <summary>传给 <c>--model</c> 的取值，如 <c>default</c> / <c>opus</c>。</summary>
        public string Value { get; set; } = string.Empty;

        /// <summary>给用户看的名字。</summary>
        public string DisplayName { get; set; } = string.Empty;

        /// <summary>该取值实际解析成的模型，如 <c>claude-opus-5[1m]</c>。</summary>
        public string ResolvedModel { get; set; } = string.Empty;

        /// <summary>一句话说明。</summary>
        public string Description { get; set; } = string.Empty;

        /// <summary>该模型是否支持 <c>--effort</c>。</summary>
        public bool SupportsEffort { get; set; }

        /// <summary>该模型支持的 effort 档位。</summary>
        public IReadOnlyList<string> SupportedEffortLevels { get; set; } = Array.Empty<string>();
    }
}
