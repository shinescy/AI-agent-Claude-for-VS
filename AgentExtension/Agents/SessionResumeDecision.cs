using System;
using System.IO;

namespace AgentExtension.Agents
{
    /// <summary>接回判定。开机接回与切权限模式重启都走这一处，避免两边各写一套。</summary>
    public static class SessionResumeDecision
    {
        /// <summary>
        /// 判定能不能接回候选会话。
        ///
        /// 两道关：id 必须是 Guid 形状（它会原样成为 <c>--resume</c> 的实参），
        /// 转录文件必须真的在（否则 CLI 会在空闲状态下退出，而 OnExited 在 !IsBusy 时不报错）。
        /// </summary>
        public static SessionResumeTarget Resolve(
            string transcriptRoot, string workingDirectory, string candidateSessionId)
        {
            var target = new SessionResumeTarget();
            string id = (candidateSessionId ?? string.Empty).Trim();

            Guid parsed;

            if (id.Length == 0 || !Guid.TryParseExact(id, "D", out parsed))
            {
                return target;
            }

            string directory = SessionHistoryReader.ResolveProjectDirectory(transcriptRoot, workingDirectory);

            if (directory.Length == 0)
            {
                return target;
            }

            string file = Path.Combine(directory, id + ".jsonl");

            if (!File.Exists(file))
            {
                return target;
            }

            target.SessionId = id;
            target.TranscriptPath = file;
            return target;
        }
    }
}
