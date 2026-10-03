// 按行收发 JSON 的子进程宿主契约

using System;
using System.Collections.Generic;

namespace AgentExtension.Agents
{
    /// <summary>以行为单位与子进程收发文本。</summary>
    public interface IJsonLineProcessHost : IDisposable
    {
        bool IsRunning { get; }

        event EventHandler<string> LineReceived;

        event EventHandler<string> ErrorLineReceived;

        event EventHandler<int> Exited;

        void Start(string fileName, string arguments, string workingDirectory, IDictionary<string, string> environment);

        void WriteLine(string line);

        void Kill();
    }
}
