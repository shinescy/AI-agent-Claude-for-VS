// 把编辑器选区格式化成发给代理的文本片段

using System;
using System.IO;

namespace AgentExtension.Vs
{
    /// <summary>把编辑器里选中的代码整理成代理能用的上下文。</summary>
    public static class SelectionFormatter
    {
        #region 格式化

        /// <summary>生成一段带文件位置的代码围栏。</summary>
        public static string Format(string filePath, int startLine, int endLine, string code)
        {
            string body = code ?? string.Empty;

            string language = GetLanguageId(filePath);
            string location = BuildLocation(filePath, startLine, endLine);

            string fence = BuildFence(body);

            var builder = new System.Text.StringBuilder();

            if (location.Length > 0)
            {
                builder.Append(location).Append('\n');
            }

            builder.Append(fence).Append(language).Append('\n');
            builder.Append(body);

            if (!body.EndsWith("\n", StringComparison.Ordinal))
            {
                builder.Append('\n');
            }

            builder.Append(fence);

            string formatted = builder.ToString();
            return formatted;
        }

        #endregion

        #region 内部

        private static string BuildLocation(string filePath, int startLine, int endLine)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                return string.Empty;
            }

            string name = SafeFileName(filePath);

            if (endLine > startLine)
            {
                return $"`{name}:{startLine}-{endLine}`";
            }

            return $"`{name}:{startLine}`";
        }

        private static string SafeFileName(string filePath)
        {
            try
            {
                string name = Path.GetFileName(filePath);
                return string.IsNullOrEmpty(name) ? filePath : name;
            }
            catch (ArgumentException)
            {
                return filePath;
            }
        }

        private static string BuildFence(string body)
        {
            int longest = 0;
            int current = 0;

            foreach (char c in body)
            {
                if (c == '`')
                {
                    current++;

                    if (current > longest)
                    {
                        longest = current;
                    }

                    continue;
                }

                current = 0;
            }

            int length = longest >= 3 ? longest + 1 : 3;
            return new string('`', length);
        }

        /// <summary>由扩展名推断围栏语言标识；不认识的返回空串。</summary>
        public static string GetLanguageId(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                return string.Empty;
            }

            string extension;

            try
            {
                extension = Path.GetExtension(filePath).ToLowerInvariant();
            }
            catch (ArgumentException)
            {
                return string.Empty;
            }

            switch (extension)
            {
                case ".cs": return "csharp";
                case ".vb": return "vb";
                case ".fs": return "fsharp";
                case ".cpp":
                case ".cc":
                case ".cxx":
                case ".h":
                case ".hpp": return "cpp";
                case ".c": return "c";
                case ".ts": return "typescript";
                case ".tsx": return "tsx";
                case ".js":
                case ".mjs":
                case ".cjs": return "javascript";
                case ".jsx": return "jsx";
                case ".py": return "python";
                case ".go": return "go";
                case ".rs": return "rust";
                case ".java": return "java";
                case ".kt": return "kotlin";
                case ".rb": return "ruby";
                case ".php": return "php";
                case ".sql": return "sql";
                case ".xml":
                case ".csproj":
                case ".vbproj":
                case ".props":
                case ".targets":
                case ".vsct": return "xml";
                case ".xaml": return "xml";
                case ".json": return "json";
                case ".yml":
                case ".yaml": return "yaml";
                case ".html":
                case ".htm": return "html";
                case ".css": return "css";
                case ".scss": return "scss";
                case ".md": return "markdown";
                case ".ps1": return "powershell";
                case ".sh": return "bash";
                case ".cmd":
                case ".bat": return "bat";
                default: return string.Empty;
            }
        }

        #endregion
    }
}
