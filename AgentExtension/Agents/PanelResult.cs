// 一次面板取数或动作的结果

using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>一次取数或动作的结果。</summary>
    public class PanelResult
    {
        public string PanelId { get; set; } = string.Empty;

        public List<PanelItem> Items { get; set; } = new List<PanelItem>();

        /// <summary>出错原因；正常时为空串。</summary>
        public string Error { get; set; } = string.Empty;

        /// <summary>解析不了时的原始输出，也可能是查询型动作的结果或诊断信息。</summary>
        public string RawText { get; set; } = string.Empty;

        /// <summary>前端是否该把 <see cref="RawText"/> 单独渲染成一个原始输出块。</summary>
        public bool ShowsRawText { get; set; }

        /// <summary>需要提示「下个会话才生效」。</summary>
        public bool RestartHint { get; set; }

        /// <summary>关联的请求 id，原样回带给前端。</summary>
        public string RequestId { get; set; } = string.Empty;
    }
}
