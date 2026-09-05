// 一次文件预览的结果

namespace AgentExtension.Vs
{
    /// <summary>一次文件预览的结果。</summary>
    public class FilePreviewResult
    {
        /// <summary>回传给前端的路径，原样是前端请求时给的那个串——前端据此认领回包。</summary>
        public string Path { get; set; } = "";

        /// <summary>文本内容，可能已按行截断。</summary>
        public string Text { get; set; } = "";

        /// <summary>图片预览的完整 data URI；非图片时为空。</summary>
        public string Image { get; set; } = "";

        /// <summary>内容是否被截断。</summary>
        public bool Truncated { get; set; }

        /// <summary>原文总行数（未截断时与实际行数相同）。</summary>
        public int TotalLines { get; set; }

        /// <summary>文件体积（字节）。</summary>
        public long Size { get; set; }

        /// <summary>失败原因；成功时为空。</summary>
        public string Error { get; set; } = "";
    }
}
