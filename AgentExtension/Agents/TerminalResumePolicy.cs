// 终端重启的接回判定：转录真在才接，否则开新会话

namespace AgentExtension.Agents
{
    /// <summary>终端重启时该不该接回。</summary>
    public static class TerminalResumePolicy
    {
        /// <summary>按「真聊过才接回」判定，返回完整目标。</summary>
        public static SessionResumeTarget Resolve(
            string transcriptRoot, string workingDirectory, string candidateSessionId)
        {
            SessionResumeTarget target = SessionResumeDecision.Resolve(
                transcriptRoot, workingDirectory, candidateSessionId, requireConversation: true);

            return target;
        }
    }
}
