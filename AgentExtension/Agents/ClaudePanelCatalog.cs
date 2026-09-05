// 面板与动作的字面量目录

using System;
using System.Collections.Generic;
using System.IO;

namespace AgentExtension.Agents
{
    /// <summary>全部面板与动作。</summary>
    public static class ClaudePanelCatalog
    {
        #region 目录

        private static readonly PanelDefinition[] Panels =
        {
            new PanelDefinition
            {
                Id = "plugin",
                Title = "插件",
                FetchArguments = new[] { "plugin", "list", "--json" },
                ProducesSet = PanelSet.InstalledPlugins,
                Parser = PluginListParser.Parse,
                Actions = new[]
                {
                    // 这三条都显式带 --scope，**不能省**：enable/disable 的 --scope 默认是 auto-detect，而同一个
                    new PanelAction
                    {
                        Id = "plugin.enable",
                        Label = "启用",
                        Template = new[] { "plugin", "enable", PanelAction.Slot, "--scope", PanelAction.Slot },
                        Slots = new[]
                        {
                            new SlotSpec { SourceSet = PanelSet.InstalledPlugins },
                            new SlotSpec { Format = SlotFormat.PluginScope }
                        },
                        RestartHint = true
                    },
                    new PanelAction
                    {
                        Id = "plugin.disable",
                        Label = "禁用",
                        Template = new[] { "plugin", "disable", PanelAction.Slot, "--scope", PanelAction.Slot },
                        Slots = new[]
                        {
                            new SlotSpec { SourceSet = PanelSet.InstalledPlugins },
                            new SlotSpec { Format = SlotFormat.PluginScope }
                        },
                        RestartHint = true
                    },
                    new PanelAction
                    {
                        Id = "plugin.uninstall",
                        Label = "卸载",
                        Template = new[] { "plugin", "uninstall", PanelAction.Slot, "--scope", PanelAction.Slot },
                        Slots = new[]
                        {
                            new SlotSpec { SourceSet = PanelSet.InstalledPlugins },
                            new SlotSpec { Format = SlotFormat.PluginScope }
                        },
                        RestartHint = true
                    },
                    new PanelAction
                    {
                        Id = "plugin.details",
                        Label = "详情",
                        Template = new[] { "plugin", "details", PanelAction.Slot },
                        Slots = new[] { new SlotSpec { SourceSet = PanelSet.InstalledPlugins } },
                        RestartHint = false,
                        ShowsOutput = true
                    }
                }
            },
            new PanelDefinition
            {
                Id = "pluginUpdates",
                Title = "插件更新",
                // 与已装面板同一条取数命令：CLI **没有**任何「列出可更新插件」的查询。
                FetchArguments = new[] { "plugin", "list", "--json" },
                ProducesSet = PanelSet.InstalledPlugins,
                Parser = PluginListParser.Parse,
                Actions = new[]
                {
                    new PanelAction
                    {
                        Id = "plugin.update",
                        Label = "更新",
                        // 同样必须带 --scope，理由见上面 enable/disable 的注释。
                        Template = new[] { "plugin", "update", PanelAction.Slot, "--scope", PanelAction.Slot },
                        Slots = new[]
                        {
                            new SlotSpec { SourceSet = PanelSet.InstalledPlugins },
                            new SlotSpec { Format = SlotFormat.PluginScope }
                        },
                        RestartHint = true
                    },
                    new PanelAction
                    {
                        Id = "plugin.marketplaceUpdate",
                        Label = "刷新市场索引",
                        Template = new[] { "plugin", "marketplace", "update" },
                        Slots = new SlotSpec[0],
                        ShowsOutput = true
                    }
                }
            },
            new PanelDefinition
            {
                Id = "pluginMarket",
                Title = "插件市场",
                FetchArguments = new[] { "plugin", "list", "--json", "--available" },
                ProducesSet = PanelSet.AvailablePlugins,
                Parser = PluginMarketParser.Parse,
                Actions = new[]
                {
                    new PanelAction
                    {
                        Id = "plugin.install",
                        Label = "安装",
                        Template = new[] { "plugin", "install", PanelAction.Slot },
                        Slots = new[] { new SlotSpec { SourceSet = PanelSet.AvailablePlugins } },
                        RestartHint = true
                    }
                }
            },
            new PanelDefinition
            {
                Id = "mcp",
                Title = "MCP 服务器",
                FetchArguments = new[] { "mcp", "list" },
                ProducesSet = PanelSet.McpServers,
                Parser = McpListParser.Parse,
                Actions = new[]
                {
                    new PanelAction
                    {
                        Id = "mcp.get",
                        Label = "详情",
                        Template = new[] { "mcp", "get", PanelAction.Slot },
                        Slots = new[] { new SlotSpec { SourceSet = PanelSet.McpServers } },
                        ShowsOutput = true
                    },
                    new PanelAction
                    {
                        Id = "mcp.remove",
                        Label = "移除",
                        Template = new[] { "mcp", "remove", PanelAction.Slot },
                        Slots = new[] { new SlotSpec { SourceSet = PanelSet.McpServers } }
                    },
                    new PanelAction
                    {
                        Id = "mcp.logout",
                        Label = "退出登录",
                        Template = new[] { "mcp", "logout", PanelAction.Slot },
                        Slots = new[] { new SlotSpec { SourceSet = PanelSet.McpServers } }
                    },
                    new PanelAction
                    {
                        Id = "mcp.addRemote",
                        Label = "新增远程服务器",
                        Template = new[] { "mcp", "add", "--transport", "http", PanelAction.Slot, PanelAction.Slot },
                        Slots = new[]
                        {
                            new SlotSpec { Format = SlotFormat.ServerName },
                            new SlotSpec { Format = SlotFormat.RemoteUrl }
                        }
                    }
                }
            },
            new PanelDefinition
            {
                Id = "agents",
                Title = "后台代理",
                FetchArguments = new[] { "agents", "--json" },
                ProducesSet = PanelSet.None,
                Parser = AgentsListParser.Parse,
                Actions = new PanelAction[0]
            },
            new PanelDefinition
            {
                Id = "doctor",
                Title = "健康检查",
                FetchArguments = new[] { "doctor" },
                ProducesSet = PanelSet.None,
                Actions = new PanelAction[0],
                PlainText = true
            },
            new PanelDefinition
            {
                Id = "sessions",
                Title = "会话历史",

                // 唯一一个本地取数的面板：CLI 没有列会话的子命令，只能自己读转录目录。
                LocalFetch = FetchSessions,
                ProducesSet = PanelSet.Sessions,

                Actions = new PanelAction[0]
            },
            new PanelDefinition
            {
                Id = "memory",
                Title = "记忆",

                LocalFetch = context => MemoryFileLocator.List(context.WorkingDirectory),
                ProducesSet = PanelSet.None,

                Actions = new PanelAction[0]
            },
            new PanelDefinition
            {
                Id = "settingsFiles",
                Title = "设置文件",

                LocalFetch = context => SettingsFilesReader.List(context.WorkingDirectory),
                ProducesSet = PanelSet.None,
                Actions = new PanelAction[0]
            },
            new PanelDefinition
            {
                Id = "permissions",
                Title = "权限",

                LocalFetch = context => PermissionRulesReader.List(context.WorkingDirectory),
                ProducesSet = PanelSet.None,

                // 只读：加规则是放宽权限，不该由网页发一条消息完成，也不该由本扩展回写用户的配置文件。
                Actions = new PanelAction[0]
            },
            new PanelDefinition
            {
                Id = "fileHistory",
                Title = "文件回滚",

                LocalFetch = FetchFileHistory,
                ProducesSet = PanelSet.FileBackups,

                Actions = new PanelAction[0]
            }
        };

        private static IReadOnlyList<PanelItem> FetchFileHistory(PanelFetchContext context)
        {
            string transcript = FileHistoryReader.TranscriptPathFor(
                context.WorkingDirectory, context.SessionId);

            if (transcript.Length == 0)
            {
                return new PanelItem[0];
            }

            IReadOnlyList<FileBackupEntry> entries = FileHistoryReader.List(
                transcript,
                FileHistoryReader.DefaultHistoryRoot(),
                context.SessionId,
                context.WorkingDirectory);

            var items = new List<PanelItem>(entries.Count);

            foreach (FileBackupEntry entry in entries)
            {
                items.Add(FileHistoryReader.ToPanelItem(entry));
            }

            return items;
        }

        private static IReadOnlyList<PanelItem> FetchSessions(PanelFetchContext context)
        {
            int failures;
            IReadOnlyList<SessionHistoryEntry> entries = SessionHistoryReader.List(
                SessionHistoryReader.DefaultTranscriptRoot(), context.WorkingDirectory, string.Empty, out failures);

            if (entries.Count == 0 && failures > 0)
            {
                throw new IOException(
                    $"发现 {failures} 份转录，但一份都读不出来（可能是权限或文件被占用）。");
            }

            var items = new List<PanelItem>(entries.Count);

            foreach (SessionHistoryEntry entry in entries)
            {
                items.Add(SessionHistoryReader.ToPanelItem(entry));
            }

            return items;
        }

        public static IReadOnlyList<PanelDefinition> All
        {
            get
            {
                return Panels;
            }
        }

        #endregion

        #region 查找

        /// <summary>按 id 查面板。</summary>
        public static PanelDefinition? FindPanel(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                return null;
            }

            foreach (PanelDefinition panel in Panels)
            {
                if (string.Equals(panel.Id, id, StringComparison.Ordinal))
                {
                    return panel;
                }
            }

            return null;
        }

        /// <summary>按面板 id + 动作 id 查动作。</summary>
        public static PanelAction? FindAction(string panelId, string actionId)
        {
            PanelDefinition? panel = FindPanel(panelId);

            if (panel == null || string.IsNullOrWhiteSpace(actionId))
            {
                return null;
            }

            foreach (PanelAction action in panel.Actions)
            {
                if (string.Equals(action.Id, actionId, StringComparison.Ordinal))
                {
                    return action;
                }
            }

            return null;
        }

        #endregion
    }
}
