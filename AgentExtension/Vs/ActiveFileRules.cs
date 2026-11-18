using System;
using System.Collections.Generic;
using System.IO;

namespace AgentExtension.Vs
{
    /// <summary>活动文档名字对象的规整规则。</summary>
    public static class ActiveFileRules
    {
        /// <summary>只放行磁盘上存在的绝对文件路径。</summary>
        public static string Normalize(string? moniker)
        {
            string result = string.Empty;

            if (string.IsNullOrWhiteSpace(moniker))
            {
                return result;
            }

            string candidate = moniker!.Trim();

            // 虚拟文档、项目名字对象（RDT_PROJ_MK::{guid}）等都带「::」
            if (candidate.IndexOf("::", StringComparison.Ordinal) >= 0)
            {
                return result;
            }

            try
            {
                if (Path.IsPathRooted(candidate) && File.Exists(candidate))
                {
                    result = Path.GetFullPath(candidate);
                }
            }
            catch (Exception)
            {
                // 非法字符等：当作没有活动文件
            }

            return result;
        }

        /// <summary>组装推给前端的 activeFile 载荷。</summary>
        public static Dictionary<string, string> BuildPayload(string workingDirectory, string fullPath)
        {
            string path = string.Empty;
            string name = string.Empty;

            if (!string.IsNullOrWhiteSpace(fullPath))
            {
                path = FilePreviewRules.ToDisplayPath(workingDirectory, fullPath);
                name = Path.GetFileName(fullPath);
            }

            // 键名是跨语言契约，前端 App.tsx 按 path / name 读
            var payload = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["path"] = path,
                ["name"] = name
            };

            return payload;
        }
    }
}
