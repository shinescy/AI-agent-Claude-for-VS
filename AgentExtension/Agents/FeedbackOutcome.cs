// 反馈回包与用户所选方式的核对

namespace AgentExtension.Agents
{
    /// <summary>核对反馈结果，不让「可能已发出」被说成「只存了本机」。</summary>
    public static class FeedbackOutcome
    {
        /// <summary>回包与所选方式对不上时给出如实的错误；一致返回空串。</summary>
        public static string Check(string error, bool saveLocally, string feedbackId, string bundlePath)
        {
            if (error.Length > 0)
            {
                return error;
            }

            if (saveLocally && bundlePath.Length == 0)
            {
                string message = feedbackId.Length > 0
                    ? $"CLI 没有按「只存本机」处理，内容已经提交给 Anthropic（反馈编号 {feedbackId}）。"
                    : "CLI 没有按「只存本机」处理，也没给出报告路径，不确定内容是否已发出。";
                return message;
            }

            if (!saveLocally && feedbackId.Length == 0)
            {
                return "CLI 没有返回反馈编号，不确定是否提交成功。";
            }

            return string.Empty;
        }
    }
}
