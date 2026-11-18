// 远程控制的连接状态：以 CLI 的回话为准，不以按钮为准

using System.Text.Json;

namespace AgentExtension.Agents
{
    /// <summary>远程控制状态事件的载荷。</summary>
    public class AgentRemoteControl
    {
        #region 状态

        /// <summary>已连上，可在手机或网页继续。</summary>
        public const string StateConnected = "connected";

        /// <summary>已关闭。</summary>
        public const string StateOff = "off";

        /// <summary>开不起来或中途断了，原因在 Detail。</summary>
        public const string StateFailed = "failed";

        /// <summary>组织策略禁用了远程控制。</summary>
        public const string StatePolicyDisabled = "policy_disabled";

        #endregion

        #region 属性

        /// <summary>状态：上面的常量，或 CLI 报的其它状态原样带出。</summary>
        public string State { get; set; } = string.Empty;

        /// <summary>说明或失败原因，CLI 的原话。</summary>
        public string Detail { get; set; } = string.Empty;

        /// <summary>在网页上继续这条会话的地址；没有为空。</summary>
        public string SessionUrl { get; set; } = string.Empty;

        /// <summary>这是对用户点按开关的回话；CLI 自己推的状态变化为 false。</summary>
        public bool Requested { get; set; }

        #endregion

        #region 解析

        /// <summary>由 remote_control 请求的成功回包得出状态。</summary>
        public static AgentRemoteControl FromResponse(string responseJson, bool enabled)
        {
            var info = new AgentRemoteControl { State = enabled ? StateConnected : StateOff };

            if (!enabled || string.IsNullOrEmpty(responseJson))
            {
                return info;
            }

            try
            {
                using (JsonDocument document = JsonDocument.Parse(responseJson))
                {
                    JsonElement root = document.RootElement;

                    if (root.ValueKind == JsonValueKind.Object
                        && root.TryGetProperty("session_url", out JsonElement url)
                        && url.ValueKind == JsonValueKind.String)
                    {
                        info.SessionUrl = url.GetString() ?? string.Empty;
                    }
                }
            }
            catch (JsonException)
            {
                // 回包认不出也算开成功了：CLI 回的是 success
            }

            return info;
        }

        #endregion
    }
}
