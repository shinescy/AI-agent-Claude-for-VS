// 一次用户输入的完整内容（文本 + 图片）

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>随提示词一起发送的图片。</summary>
    public class AgentImage
    {
        /// <summary>MIME 类型，如 <c>image/png</c>。</summary>
        public string MediaType { get; set; } = string.Empty;

        /// <summary>不含 data URI 前缀的纯 base64 数据。</summary>
        public string Base64Data { get; set; } = string.Empty;

        public bool IsValid
        {
            get
            {
                bool valid = !string.IsNullOrWhiteSpace(MediaType) && !string.IsNullOrWhiteSpace(Base64Data);
                return valid;
            }
        }
    }

    /// <summary>一次用户输入。</summary>
    public class AgentPrompt
    {
        public string Text { get; set; } = string.Empty;

        public IReadOnlyList<AgentImage> Images { get; set; } = Array.Empty<AgentImage>();
    }
}
