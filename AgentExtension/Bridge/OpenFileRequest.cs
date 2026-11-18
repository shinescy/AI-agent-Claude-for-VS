// 前端请求在编辑器中打开某个文件位置

namespace AgentExtension.Bridge
{
    /// <summary>打开文件的请求。</summary>
    public class OpenFileRequest
    {
        public OpenFileRequest(string path, int line)
        {
            Path = path ?? string.Empty;
            Line = line;
        }

        public string Path { get; }

        /// <summary>目标行号（1 起）。</summary>
        public int Line { get; }
    }
}
