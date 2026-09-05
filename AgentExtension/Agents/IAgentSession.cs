// 代理会话契约，未来多代理适配器共同实现

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>与 AI 编码代理的一次实时对话。</summary>
    public interface IAgentSession : IDisposable
    {
        string SessionId { get; }

        string ResumableSessionId { get; }

        string Model { get; }

        bool IsBusy { get; }

        event EventHandler<AgentEvent> Received;

        void Start(string workingDirectory);

        void Send(string text);

        void Send(AgentPrompt prompt);

        void Interrupt();

        IReadOnlyList<AgentEvent> Replay();
    }
}
