// 面板取数、校验与动作执行

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace AgentExtension.Agents
{
    /// <summary>面板服务：取数 → 登记活集合 → 校验 → 执行 → 重取。</summary>
    public class ClaudePanelService
    {
        #region 依赖

        private readonly Func<string, IReadOnlyList<string>, string, Task<SubcommandOutcome>> _run;
        private readonly string _executablePath;
        private readonly string _workingDirectory;

        private readonly Func<string>? _sessionIdProvider;

        private readonly ConcurrentDictionary<PanelSet, Dictionary<string, string>> _sets =
            new ConcurrentDictionary<PanelSet, Dictionary<string, string>>();

        public ClaudePanelService(
            Func<string, IReadOnlyList<string>, string, Task<SubcommandOutcome>> run,
            string executablePath,
            string workingDirectory)
            : this(run, executablePath, workingDirectory, null)
        {
        }

        public ClaudePanelService(
            Func<string, IReadOnlyList<string>, string, Task<SubcommandOutcome>> run,
            string executablePath,
            string workingDirectory,
            Func<string>? sessionIdProvider)
        {
            _run = run ?? throw new ArgumentNullException(nameof(run));
            _executablePath = executablePath;
            _workingDirectory = workingDirectory;
            _sessionIdProvider = sessionIdProvider;
        }

        #endregion

        #region 取数

        /// <summary>打开面板：执行取数命令并登记集合。</summary>
        public async Task<PanelResult> OpenAsync(string panelId)
        {
            PanelDefinition? panel = ClaudePanelCatalog.FindPanel(panelId);

            if (panel == null)
            {
                return new PanelResult { PanelId = panelId, Error = $"没有名为 “{panelId}” 的面板。", ShowsRawText = true };
            }

            return await FetchAsync(panel).ConfigureAwait(false);
        }

        private async Task<PanelResult> FetchAsync(PanelDefinition panel)
        {
            var result = new PanelResult { PanelId = panel.Id };

            if (panel.LocalFetch != null)
            {
                return FetchLocal(panel);
            }

            SubcommandOutcome outcome = await _run(_executablePath, panel.FetchArguments, _workingDirectory)
                .ConfigureAwait(false);

            result.RawText = string.IsNullOrEmpty(outcome.StandardOutput)
                ? outcome.StandardError
                : outcome.StandardOutput;

            if (outcome.StartFailure != null)
            {
                result.Error = $"无法执行——{outcome.StartFailure}";
                result.ShowsRawText = true;
                return result;
            }

            if (outcome.TimedOut)
            {
                result.Error = "执行超时。";
                result.ShowsRawText = true;
                return result;
            }

            if (panel.PlainText)
            {
                result.ShowsRawText = true;
                return result;
            }

            List<PanelItem>? items;
            Exception? parseError = null;

            try
            {
                items = new List<PanelItem>(ParseFor(panel, outcome.StandardOutput));
            }
            catch (Exception ex)
            {
                // 解析不了不代表没数据，原始输出必须带出去。
                items = null;
                parseError = ex;
            }

            if ((items == null || items.Count == 0) && outcome.ExitCode != 0)
            {
                result.Error = $"命令返回 {outcome.ExitCode}。";
                result.ShowsRawText = true;
                return result;
            }

            if (items == null)
            {
                result.Error = $"解析失败：{parseError!.Message}";
                result.ShowsRawText = true;
                return result;
            }

            result.Items = items;

            MarkCurrentProject(result.Items);

            RegisterSet(panel, result.Items);

            return result;
        }

        private PanelResult FetchLocal(PanelDefinition panel)
        {
            var result = new PanelResult { PanelId = panel.Id };

            var context = new PanelFetchContext
            {
                WorkingDirectory = _workingDirectory,
                SessionId = _sessionIdProvider != null ? (_sessionIdProvider() ?? string.Empty) : string.Empty
            };

            try
            {
                result.Items = new List<PanelItem>(panel.LocalFetch!(context));
            }
            catch (Exception ex)
            {
                result.Error = $"读取失败：{ex.Message}";
                result.ShowsRawText = true;
                return result;
            }

            RegisterSet(panel, result.Items);

            return result;
        }

        private static IReadOnlyList<PanelItem> ParseFor(PanelDefinition panel, string output)
        {
            if (panel.Parser == null)
            {
                throw new NotSupportedException($"面板 {panel.Id} 没有配置解析器。");
            }

            return panel.Parser(output);
        }

        private void MarkCurrentProject(IReadOnlyList<PanelItem> items)
        {
            foreach (PanelItem item in items)
            {
                if (!item.Fields.TryGetValue("cwd", out string cwd))
                {
                    continue;
                }

                bool current = string.Equals(
                    cwd.TrimEnd('\\'),
                    (_workingDirectory ?? string.Empty).TrimEnd('\\'),
                    StringComparison.OrdinalIgnoreCase);

                item.CurrentProject = current;
            }
        }

        private void RegisterSet(PanelDefinition panel, IReadOnlyList<PanelItem> items)
        {
            if (panel.ProducesSet == PanelSet.None)
            {
                return;
            }

            var map = new Dictionary<string, string>(StringComparer.Ordinal);

            foreach (PanelItem item in items)
            {
                map[item.Id] = item.ActionValue;
            }

            _sets[panel.ProducesSet] = map;
        }

        #endregion

        #region 动作

        /// <summary>执行一条动作，成功后重取列表。</summary>
        public async Task<PanelResult> ActAsync(string panelId, string actionId, IReadOnlyList<string> values)
        {
            PanelDefinition? panel = ClaudePanelCatalog.FindPanel(panelId);
            PanelAction? action = ClaudePanelCatalog.FindAction(panelId, actionId);

            if (panel == null)
            {
                return new PanelResult { PanelId = panelId, Error = $"没有名为 “{panelId}” 的面板。", ShowsRawText = true };
            }

            if (action == null)
            {
                return new PanelResult { PanelId = panelId, Error = $"面板 “{panelId}” 下没有名为 “{actionId}” 的动作。", ShowsRawText = true };
            }

            SlotValidationResult validation = PanelActionValidator.Validate(action, values, LookupSet);

            if (!validation.Accepted)
            {
                // 被拒的动作绝不能起进程。
                return new PanelResult { PanelId = panelId, Error = validation.Reason, ShowsRawText = true };
            }

            if (!TryFill(action, values, out IReadOnlyList<string> filledArguments, out string fillError))
            {
                // 找不到 ActionValue 映射（见 TryResolveActionValue 的注释）绝不能退回复合 Id
                return new PanelResult { PanelId = panelId, Error = fillError, ShowsRawText = true };
            }

            SubcommandOutcome outcome = await _run(_executablePath, filledArguments, _workingDirectory)
                .ConfigureAwait(false);

            // 与 FetchAsync 对称：已经拿到的 stdout/stderr 不能在超时/起不来分支被吞掉。
            string rawText = string.IsNullOrEmpty(outcome.StandardOutput)
                ? outcome.StandardError
                : outcome.StandardOutput;

            if (outcome.StartFailure != null)
            {
                return new PanelResult
                {
                    PanelId = panelId,
                    Error = $"无法执行——{outcome.StartFailure}",
                    RawText = rawText,
                    ShowsRawText = true
                };
            }

            if (outcome.TimedOut)
            {
                return new PanelResult
                {
                    PanelId = panelId,
                    Error = "执行超时。",
                    RawText = rawText,
                    ShowsRawText = true
                };
            }

            if (outcome.ExitCode != 0)
            {
                return new PanelResult
                {
                    PanelId = panelId,
                    Error = $"命令返回 {outcome.ExitCode}。",
                    RawText = string.IsNullOrEmpty(outcome.StandardError)
                        ? outcome.StandardOutput
                        : outcome.StandardError + Environment.NewLine + outcome.StandardOutput,
                    ShowsRawText = true
                };
            }

            PanelResult refreshed = await FetchAsync(panel).ConfigureAwait(false);
            refreshed.RestartHint = action.RestartHint;

            if (action.ShowsOutput)
            {
                // 这类动作的 stdout 本身就是结果（如 plugin details / mcp get），不能被重取列表的输出覆盖掉。
                if (refreshed.Error.Length == 0)
                {
                    refreshed.RawText = outcome.StandardOutput;
                }
                else if (outcome.StandardOutput.Length > 0)
                {
                    refreshed.RawText = refreshed.RawText.Length > 0
                        ? refreshed.RawText + Environment.NewLine + Environment.NewLine
                            + "—— 动作本身的输出 ——" + Environment.NewLine + outcome.StandardOutput
                        : outcome.StandardOutput;
                }

                refreshed.ShowsRawText = true;
            }

            return refreshed;
        }

        /// <summary>把槽位值按顺序填进模板。</summary>
        internal bool TryFill(PanelAction action, IReadOnlyList<string> values, out IReadOnlyList<string> filled, out string error)
        {
            var result = new List<string>();
            int next = 0;

            foreach (string token in action.Template)
            {
                if (token != PanelAction.Slot)
                {
                    result.Add(token);
                    continue;
                }

                SlotSpec slot = action.Slots[next];
                string value = values[next];
                next++;

                if (slot.SourceSet == PanelSet.None)
                {
                    result.Add(value);
                    continue;
                }

                if (!TryResolveActionValue(slot.SourceSet, value, out string actionValue))
                {
                    filled = Array.Empty<string>();
                    error = $"“{value}” 不在当前列表里，请刷新面板后重试。";
                    return false;
                }

                // 真正拼进命令行的是 ActionValue，而校验过的是 Id——校验器那道「不能以连字符开头」的守卫
                if (actionValue.StartsWith("-", StringComparison.Ordinal))
                {
                    filled = Array.Empty<string>();
                    error = $"“{actionValue}” 以连字符开头，会被 CLI 当成命令行标志位，已拒绝执行。";
                    return false;
                }

                result.Add(actionValue);
            }

            filled = result;
            error = string.Empty;
            return true;
        }

        /// <summary>把 Id（可能是复合值）换成同一条记录的 ActionValue。</summary>
        internal bool TryResolveActionValue(PanelSet set, string id, out string actionValue)
        {
            if (_sets.TryGetValue(set, out Dictionary<string, string>? map) && map.TryGetValue(id, out string? found))
            {
                actionValue = found;
                return true;
            }

            actionValue = string.Empty;
            return false;
        }

        private IReadOnlyCollection<string>? LookupSet(PanelSet set)
        {
            return _sets.TryGetValue(set, out Dictionary<string, string>? found) ? found.Keys : null;
        }

        /// <summary>某个值是否在最近一次取数登记的集合里。</summary>
        public bool IsKnownMember(PanelSet set, string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return false;
            }

            IReadOnlyCollection<string>? members = LookupSet(set);

            if (members == null)
            {
                return false;
            }

            foreach (string member in members)
            {
                if (string.Equals(member, value, StringComparison.Ordinal))
                {
                    return true;
                }
            }

            return false;
        }

        #endregion
    }
}
