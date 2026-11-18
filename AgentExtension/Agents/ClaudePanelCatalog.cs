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

                Actions = new[]
                {
                    new PanelAction
                    {
                        Id = "session.rename",
                        Label = "重命名",
                        Slots = new[]
                        {
                            new SlotSpec { SourceSet = PanelSet.Sessions },
                            new SlotSpec { Format = SlotFormat.SessionTitle }
                        },
                        LocalRun = RenameSession
                    },
                    new PanelAction
                    {
                        Id = "session.archive",
                        Label = "存档",
                        Slots = new[] { new SlotSpec { SourceSet = PanelSet.Sessions } },
                        LocalRun = (context, values) => new SessionArchiveStore(SessionArchiveStore.DefaultFilePath())
                            .SetArchived(values[0], true)
                    },
                    new PanelAction
                    {
                        Id = "session.unarchive",
                        Label = "取消存档",
                        Slots = new[] { new SlotSpec { SourceSet = PanelSet.Sessions } },
                        LocalRun = (context, values) => new SessionArchiveStore(SessionArchiveStore.DefaultFilePath())
                            .SetArchived(values[0], false)
                    },
                    new PanelAction
                    {
                        Id = "session.group.create",
                        Label = "新建组",
                        Slots = new[] { new SlotSpec { Format = SlotFormat.SessionTitle } },
                        LocalRun = (context, values) => Groups().Create(context.WorkingDirectory, values[0])
                    },
                    new PanelAction
                    {
                        Id = "session.group.rename",
                        Label = "改组名",
                        Slots = new[]
                        {
                            new SlotSpec { Format = SlotFormat.GroupId },
                            new SlotSpec { Format = SlotFormat.SessionTitle }
                        },
                        LocalRun = (context, values) => Groups().Rename(context.WorkingDirectory, values[0], values[1])
                    },
                    new PanelAction
                    {
                        Id = "session.group.delete",
                        Label = "删除组",
                        Slots = new[] { new SlotSpec { Format = SlotFormat.GroupId } },
                        LocalRun = (context, values) => Groups().Delete(context.WorkingDirectory, values[0])
                    },
                    new PanelAction
                    {
                        Id = "session.group.move",
                        Label = "移到组",
                        Slots = new[]
                        {
                            new SlotSpec { SourceSet = PanelSet.Sessions },
                            new SlotSpec { Format = SlotFormat.GroupId }
                        },
                        LocalRun = (context, values) => Groups().Move(context.WorkingDirectory, values[0], values[1])
                    },
                    new PanelAction
                    {
                        Id = "session.group.ungroup",
                        Label = "移出组",
                        Slots = new[] { new SlotSpec { SourceSet = PanelSet.Sessions } },
                        LocalRun = (context, values) => Groups().Move(context.WorkingDirectory, values[0], string.Empty)
                    }
                },

                LocalGroups = context => Groups().Read(context.WorkingDirectory).Groups
            },
            new PanelDefinition
            {
                Id = "cloudSessions",
                Title = "Web 会话",

                // 由 CLI 用它自己的登录去读；本扩展不碰凭据
                LocalFetch = FetchCloudSessions,
                SlowLocalFetch = true,
                ProducesSet = PanelSet.CloudSessions,

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

            HashSet<string> archived = new SessionArchiveStore(SessionArchiveStore.DefaultFilePath()).ReadIds();
            HashSet<string> live = OpenSessionIds(context);
            SessionGroupsRecord groups = Groups().Read(context.WorkingDirectory);

            var items = new List<PanelItem>(entries.Count);

            foreach (SessionHistoryEntry entry in entries)
            {
                PanelItem item = SessionHistoryReader.ToPanelItem(entry);
                MarkSessionState(item, archived, live);
                MarkSessionGroup(item, groups);
                items.Add(item);
            }

            return items;
        }

        private static IReadOnlyList<PanelItem> FetchCloudSessions(PanelFetchContext context)
        {
            CloudSessionListResult result = CloudSessionReader.List(
                context.ExecutablePath, CloudSessionReader.DefaultTimeoutMs);

            if (!result.Available)
            {
                throw new InvalidOperationException(CloudSessionPanel.DescribeUnavailable(result));
            }

            IReadOnlyList<PanelItem> items = CloudSessionPanel.ToPanelItems(result);
            return items;
        }

        private static SessionGroupStore Groups()
        {
            var store = new SessionGroupStore(SessionGroupStore.DefaultFilePath());
            return store;
        }

        /// <summary>给条目标上所在的组；组已被删就当未分组。</summary>
        internal static void MarkSessionGroup(PanelItem item, SessionGroupsRecord groups)
        {
            string groupId;

            if (!groups.Members.TryGetValue(item.Id, out groupId))
            {
                return;
            }

            foreach (SessionGroup group in groups.Groups)
            {
                if (string.Equals(group.Id, groupId, StringComparison.OrdinalIgnoreCase))
                {
                    item.Fields["group"] = group.Id;
                    return;
                }
            }
        }

        /// <summary>给条目标上「已存档」「正开着」。</summary>
        internal static void MarkSessionState(PanelItem item, ICollection<string> archived, ICollection<string> live)
        {
            if (archived.Contains(item.Id))
            {
                item.Fields["archived"] = "1";
            }

            if (live.Contains(item.Id))
            {
                item.Fields["live"] = "1";
            }
        }

        /// <summary>有 CLI 进程在跑的会话，再并上当前 tab 的。</summary>
        private static HashSet<string> OpenSessionIds(PanelFetchContext context)
        {
            HashSet<string> ids = LiveSessionRegistry.ReadLiveSessionIds(LiveSessionRegistry.DefaultRoot());

            if (context.SessionId.Length > 0)
            {
                ids.Add(context.SessionId);
            }

            return ids;
        }

        /// <summary>改名：开着的会话拒绝，免得和 CLI 抢着写同一份转录。</summary>
        private static void RenameSession(PanelFetchContext context, IReadOnlyList<string> values)
        {
            string sessionId = values[0];

            if (OpenSessionIds(context).Contains(sessionId))
            {
                throw new InvalidOperationException("这条会话正开着（有 CLI 进程在跑），关掉那个 tab 再改名。");
            }

            string path = FileHistoryReader.TranscriptPathFor(context.WorkingDirectory, sessionId);
            SessionTitleWriter.AppendCustomTitle(path, sessionId, values[1]);
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
