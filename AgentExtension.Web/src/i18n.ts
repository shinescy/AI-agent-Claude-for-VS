// 多语言。

export type Lang = 'zh' | 'en';

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

/** 英文文案表：键是中文原文，值是英文。 */
const EN: Record<string, string> = {
  // —— 覆盖层外壳 ——
  '执行中…': 'Running…',
  '执行中… 已 {n} 秒': 'Running… {n}s elapsed',
  '刷新': 'Refresh',
  '关闭（Esc）': 'Close (Esc)',
  '详情': 'Details',
  '下面是上一次取到的列表，可能已经过期；点「刷新」重取。':
    'The list below is from the previous fetch and may be out of date. Choose Refresh to reload it.',
  '命令执行完成，但没有任何输出。': 'The command finished successfully but produced no output.',
  '等待宿主回应超时。命令可能已经执行完成，请先点「刷新」查看当前状态，不要直接重试——安装、更新、移除这类操作重复执行会再跑一遍。':
    'Timed out waiting for the host. The command may have completed anyway — choose Refresh to check the current state instead of retrying. Install, update and remove are not idempotent and would run a second time.',

  '插件': 'Plugins',
  '插件市场': 'Plugin Marketplace',
  '插件更新': 'Plugin Updates',
  'MCP 服务器': 'MCP Servers',
  '后台代理': 'Background Agents',
  '健康检查': 'Health Check',

  '插件视图': 'Plugin views',
  '已安装': 'Installed',
  '市场': 'Marketplace',
  '更新': 'Update',
  '搜索…': 'Search…',
  '搜索插件市场': 'Search the plugin marketplace',
  '搜索已装插件': 'Search installed plugins',
  '没有匹配的插件。': 'No plugins match.',
  '没有可安装的插件。': 'No plugins available to install.',
  '没有已装插件。': 'No plugins installed.',
  '启用': 'Enable',
  '禁用': 'Disable',
  '安装': 'Install',
  '卸载': 'Uninstall',
  '取消': 'Cancel',
  '确认卸载 {name}': 'Confirm uninstall of {name}',
  '刷新市场索引': 'Refresh marketplace index',
  '从各市场的源重新拉取索引。不刷新的话，更新命令拿到的还是本地那份旧索引。':
    'Re-fetch each marketplace index from its source. Without this, update still sees the stale local index.',
  'CLI 不提供「哪些插件有新版本」的查询，这里如实列出已装版本与上次更新时间。':
    'The CLI offers no way to query which plugins have newer versions, so this lists the installed version and last update time instead.',
  'CLI 没有报告这份安装的作用域，无法确定要操作哪一份，相关按钮已停用。':
    'The CLI did not report a scope for this installation, so there is no way to tell which copy to act on. The affected buttons are disabled.',
  '请在终端执行 {command} 确认后手动处理。':
    'Run {command} in a terminal to check, then handle it manually.',

  '改动将在下个会话生效。': 'The change takes effect in the next session.',
  '知道了': 'Dismiss',

  '搜索 MCP 服务器': 'Search MCP servers',
  '没有已配置的 MCP 服务器。': 'No MCP servers configured.',
  '没有匹配的服务器。': 'No servers match.',
  '新增远程服务器': 'Add remote server',
  '移除': 'Remove',
  '退出登录': 'Sign out',
  '名称': 'Name',
  '地址': 'URL',
  '状态': 'Status',
  '添加': 'Add',
  '需要登录 MCP 服务器请在终端执行 {command}。': 'To sign in to an MCP server, run {command} in a terminal.',
  '只支持 http/https 远程服务器。本机命令（stdio）形态请在终端用 {command} 配置。':
    'Only http/https remote servers are supported here. Configure local-command (stdio) servers with {command} in a terminal.',
  '名称只能是字母、数字、下划线、连字符，1–64 位，且不能以连字符开头。':
    'The name may contain letters, digits, underscores and hyphens, 1–64 characters, and cannot start with a hyphen.',
  '地址必须是 http:// 或 https:// 开头的完整地址，且不含空格。':
    'The URL must start with http:// or https://, be complete, and contain no spaces.',

  '只看当前项目': 'Current project only',
  '没有活动会话。': 'No active sessions.',
  '当前项目没有活动会话。': 'No active sessions in the current project.',

  '品牌': 'Vendor',
  '型号': 'Model',
  '权限': 'Permissions',
  '面板': 'Panels',
  '需在终端完成': 'Terminal required',
  '需终端': 'Terminal',
  '字体、字号与文字颜色': 'Font, size and text colour',
  '语言': 'Language',
  '模型品牌。目前只实现了 Claude 适配器。': 'Model vendor. Only the Claude adapter is implemented so far.',
  '{label}（未接入）': '{label} (not integrated)',
  'CLI 子命令（doctor / MCP / 插件 / 认证）': 'CLI subcommands (doctor / MCP / plugins / auth)',

  '安装健康检查': 'Installation health check',
  'MCP 服务器状态': 'MCP server status',
  '已装插件': 'Installed plugins',
  '登录 / 认证': 'Sign in / auth',
  '认证是交互式流程，面板内无法完成。请在终端执行：claude auth':
    'Authentication is interactive and cannot be completed in a panel. Run this in a terminal: claude auth',

  '接受编辑': 'Accept edits',
  '自动': 'Auto',
  '绕过权限': 'Bypass permissions',
  '手动': 'Manual',
  '不询问': "Don't ask",
  '计划模式': 'Plan mode',
  '危险模式': 'Dangerous mode',
  '默认。语义上最保守的合法取值。实测本管线下仍无工具门禁。':
    'Default, and the most conservative legal value. Measured: this pipeline still applies no tool gating.',
  '由 CLI 自行决定。实测无工具门禁。': 'Left to the CLI. Measured: no tool gating.',
  '绕过全部权限检查。实测与「危险模式」最终等效。':
    'Bypasses every permission check. Measured: equivalent to Dangerous mode in practice.',
  'CLI 自己给 default 起的名字，两个值等价。终端底栏写作 manual mode。':
    'The CLI’s own name for default; the two values are equivalent. The terminal footer writes it as "manual mode".',
  '实测无工具门禁。': 'Measured: no tool gating.',
  '让代理先给出方案。实测该模式下它仍能直接写文件。':
    'Asks the agent to propose a plan first. Measured: it can still write files directly in this mode.',
  '--dangerously-skip-permissions。实测 CLI 回报为 bypassPermissions，两者等效。':
    '--dangerously-skip-permissions. Measured: the CLI reports bypassPermissions; the two are equivalent.',

  '版本': 'Version',
  '作用域': 'Scope',
  '安装路径': 'Install path',
  '安装时间': 'Installed at',
  '项目路径': 'Project path',
  '来源': 'Source',
  '安装次数': 'Installs',
  '形态': 'Kind',
  '会话': 'Session',
  '进程号': 'PID',
  '工作目录': 'Working directory',
  '状态未知': 'Status unknown',

  '未知': 'Unknown',
  '未识别': 'Unrecognised',
  '已中断': 'Interrupted',
  '≈${amount} API 等价': '≈${amount} API-equivalent',
  '被拒：{tools}': 'Denied: {tools}',
  '、': ', ',
  // 「执行中…」在覆盖层那一节已有，工具卡片复用同一条。
  '按 API 标价折算的等价成本，含缓存写入与读取。':
    'Equivalent cost computed from API list prices, including cache writes and reads.',
  '订阅制下不据此扣费，实际用量看窗口顶部那条额度栏。':
    'On a subscription this is not what gets billed — see the quota bar at the top of the window for actual usage.',

  '附件': 'Attachment',
  '拖拽调整输入框高度，双击恢复默认': 'Drag to resize the input box; double-click to reset',
  '输入消息，Enter 发送，Shift+Enter 换行，/ 触发命令补全，@ 引用文件，可粘贴图片':
    'Type a message. Enter sends, Shift+Enter adds a line, / opens command completion, @ references a file, and images can be pasted.',
  '仅终端': 'Terminal only',

  '思考强度': 'Thinking effort',
  '{label}：{description}': '{label}: {description}',
  '强度': 'Effort',
  '低': 'Low',
  '中': 'Medium',
  '高': 'High',
  '很高': 'Very high',
  '最高': 'Max',
  '快速直接的实现，额外开销最小': 'Quick, direct implementation with minimal overhead',
  '折中：常规实现与测试': 'A middle ground: ordinary implementation plus tests',
  '全面实现，包含充分的测试与文档': 'Thorough implementation with full tests and documentation',
  '比 high 更深入的推理，略低于最高档': 'Deeper reasoning than high, just short of the top tier',
  '最强能力与最深推理。可能消耗过多 token、响应很慢或过度思考，只在最难的任务上用':
    'Maximum capability and the deepest reasoning. May burn a lot of tokens, respond slowly or overthink — reserve it for the hardest tasks.',
  'xhigh 加上动态工作流编排': 'xhigh plus dynamic workflow orchestration',
  '由 CLI 自行选择档位': 'Let the CLI pick the tier',

  '默认': 'Default',
  '不传 --model，由 CLI 决定（通常跟随你的账号设置）。':
    'Omits --model and lets the CLI decide, which usually follows your account setting.',
  '能力最强，速度与成本也最高。别名始终指向最新的 Opus。':
    'The most capable, and the slowest and most expensive. The alias always points at the latest Opus.',
  '能力与速度较均衡。': 'A balance of capability and speed.',
  '最快、最省，适合简单任务。': 'Fastest and cheapest; good for simple tasks.',
  '别名指向最新的 Fable 模型。': 'The alias points at the latest Fable model.',

  '会话 {n}': 'Session {n}',
  '{n} 个文件': '{n} files',
  '{n} 条': '{n} items',

  // —— 宿主推来的系统提示（键与 C# 的 NoticeText 常量逐条对齐，由契约测试盯防）——
  '已接回上次会话{id}。以下是上次会话的本地回放。':
    'Resumed the previous session{id}. Below is a local replay of it.',
  '已接回上次会话{id}。以下是上次会话的本地回放。上次的记录较长，只回放最近的一段。':
    'Resumed the previous session{id}. Below is a local replay of it. '
    + 'The previous transcript was long, so only the most recent stretch is replayed.',
  ['已接回上次会话{id}，但本地没读到可回放的历史（上次可能只发过命令）。'
    + '上下文在 CLI 那边，接着聊就是；下面从这一刻开始记录。']:
    'Resumed the previous session{id}, but no replayable history was found locally '
    + '(last time may have been commands only). The context lives in the CLI — just carry on; '
    + 'the record below starts from this moment.',
  '以上是上次会话的本地回放（工具结果已截断，用量与耗时不回放）。下面是这一次。':
    'That was a local replay of the previous session (tool results truncated; usage and timings not replayed). '
    + 'What follows is this session.',
  '以上是上次会话的本地回放（工具结果已截断，用量与耗时不回放）。下面是这一次。另有 {n} 条记录未回放。':
    'That was a local replay of the previous session (tool results truncated; usage and timings not replayed). '
    + 'What follows is this session. Another {n} record(s) were not replayed.',
  '上次会话的上下文已接回，但历史消息没读出来（{reason}）。下面从这一刻重新记录。':
    'The previous context was resumed, but its history could not be read ({reason}). '
    + 'The record below starts from this moment.',
  ['上次这个 tab 里那条会话（{id}）已经找不到本地记录，可能被清理或过了保留期。'
    + '已为这个 tab 开一条新的空会话，之前的上下文接不回来了。']:
    'The session this tab held last time ({id}) has no local record left — it was cleaned up or aged out. '
    + 'A new, empty session was started for this tab; the earlier context cannot be resumed.',
  ['已接回会话 {id}。上下文已交给 CLI，但历史消息不会回填到这里——'
    + 'CLI 在本管线下只喂上下文、不回放消息，因此下面从这一刻重新开始记录。']:
    'Resumed session {id}. The context went to the CLI, but its messages are not backfilled here — '
    + 'in this pipeline the CLI only takes the context and does not replay messages, '
    + 'so the record below starts from this moment.',
  ['已按分支接回会话 {id}。上下文已交给 CLI，但历史消息不会回填到这里——'
    + 'CLI 在本管线下只喂上下文、不回放消息，因此下面从这一刻重新开始记录。']:
    'Forked session {id}. The context went to the CLI, but its messages are not backfilled here — '
    + 'in this pipeline the CLI only takes the context and does not replay messages, '
    + 'so the record below starts from this moment.',
  '这条会话已经开在「{title}」里，已切过去。':
    'That session is already open in "{title}" — switched to it.',
  '已开一条新会话，上下文清空。': 'Started a new session; the context is cleared.',
  '接回会话失败：会话 id 形状不对。': 'Could not resume: that session id is malformed.',
  '接回会话失败：这个会话不在最近一次列出的会话里，请重新打开会话历史面板。':
    'Could not resume: that session is not in the most recently listed set. Reopen the session history panel.',

  '上次那条会话 CLI 已经不认了，已改开新会话。上面那些记录只是本地转录的回放，它现在并不记得。':
    'The CLI no longer recognises the previous session, so a new one was started. '
    + 'What is above is a replay of the local transcript — the CLI does not remember any of it.',
  '解决方案切换后按新目录接回的那条会话 CLI 已经不认了，已改开新会话。上下文没有保留。':
    'After the solution changed, the session resumed against the new directory was no longer recognised by the CLI, '
    + 'so a new one was started. No context was kept.',
  '你点的那条会话 CLI 已经不认了，已改开新会话。上下文没有保留。':
    'The CLI no longer recognises the session you chose, so a new one was started. No context was kept.',
  '重启后想保留的上下文 CLI 已经不认了，已改开新会话。上面的对话记录还留着，但 CLI 已经不再记得它们。':
    'The context meant to survive the restart was no longer recognised by the CLI, so a new session was started. '
    + 'The conversation above is still on screen, but the CLI no longer remembers it.',
  '已改开新会话。': 'Started a new session instead.',

  '未能识别当前解决方案目录，代理将工作在：{path}。若这不是你要的目录，请打开解决方案后重新打开本面板。':
    'The current solution directory could not be determined, so the agent will work in: {path}. '
    + 'If that is not what you want, open the solution and reopen this panel.',
  '解决方案在打开面板期间变了（{from} → {to}），上次那条会话不属于当前目录，已按当前目录重新判定。':
    'The solution changed while the panel was open ({from} → {to}). '
    + 'The previous session does not belong to the current directory, so it was re-evaluated against it.',
  ['本次打开期间的 tab 条不会被记住：面板启动时解决方案还没加载完，'
    + '恢复用的是临时目录（{restored}），与当前目录（{current}）对不上，'
    + '继续写会覆盖掉你为这个解决方案存的 tab 条。关掉本面板再打开一次即可恢复正常。']:
    'Tabs will not be remembered for this session: the solution had not finished loading when the panel started, '
    + 'so restore used a stand-in directory ({restored}) that does not match the current one ({current}). '
    + 'Writing anyway would overwrite the tabs saved for this solution. Close and reopen the panel to fix it.',
  ['恢复上次的 tab 条时丢弃了 {n} 个：超过同时打开上限（{max} 个），'
    + '或与另一个 tab 记录了同一条会话。记录文件可能被手改过，或在多台机器间同步过。']:
    'Dropped {n} tab(s) while restoring: over the limit of {max} open at once, '
    + 'or recorded against the same session as another tab. '
    + 'The record file may have been hand-edited or synced between machines.',
  '最多同时开 {max} 个会话 tab。先关掉一个再开新的。':
    'At most {max} session tabs can be open at once. Close one before opening another.',

  '权限模式已切换为 {mode}，已保留上下文。':
    'Permission mode switched to {mode}; the context was kept.',
  '权限模式已切换为 {mode}，新会话——上面那些记录 CLI 已经不认了，它不记得其中任何一句。':
    'Permission mode switched to {mode}. This is a new session — the CLI no longer recognises what is above '
    + 'and remembers none of it.',
  '启动探测有一轮没有回应，已不再抑制输出。状态栏里的模型与强度可能不全。':
    'One startup probe went unanswered, so output is no longer suppressed. '
    + 'The model and effort in the status bar may be incomplete.',

  '接受编辑（acceptEdits）': 'accept edits (acceptEdits)',
  '自动（auto）': 'auto',
  '绕过权限（bypassPermissions）': 'bypass permissions (bypassPermissions)',
  '手动（manual）': 'manual',
  '不询问（dontAsk）': "don't ask (dontAsk)",
  '计划模式（plan）': 'plan mode (plan)',
  '危险模式（--dangerously-skip-permissions）': 'dangerous mode (--dangerously-skip-permissions)',

  '打不开 {path}：在工作目录下找不到这个文件。':
    'Cannot open {path}: no such file under the working directory.',
  '转录已导出到 {path}': 'Transcript exported to {path}',
  '导出失败：{reason}': 'Export failed: {reason}',
  '还原失败：没有指定要还原的条目。': 'Restore failed: no entry was specified.',
  '还原失败：这一版不在最近一次列出的快照里，请重新打开文件回滚面板。':
    'Restore failed: that version is not in the most recently listed snapshots. Reopen the file history panel.',
  '还原失败：这一版已经查不到了（快照可能已被 CLI 清理）。':
    'Restore failed: that version can no longer be found (the CLI may have cleaned up the snapshot).',
  '已把 {path} 还原到第 {version} 版（{backup}）；覆盖前的内容已另存到 {saved}。':
    'Restored {path} to version {version} ({backup}); the overwritten content was saved to {saved}.',
  '已把 {path} 还原到第 {version} 版（{backup}）；该文件此前不存在，因此没有需要另存的内容。':
    'Restored {path} to version {version} ({backup}); the file did not exist before, so nothing was saved aside.',
  '还原失败：{reason}': 'Restore failed: {reason}',
  '处理前端消息时出错：{reason}': 'Error handling a message from the UI: {reason}',

  '在 VS 里打开': 'Open in VS',
  '收起': 'Collapse',
  '正在读取…': 'Reading…',
  '{shown} / {total} 行 · {size}': '{shown} of {total} lines · {size}',
  '只显示了前一部分，完整内容请在 VS 里打开。':
    'Only the first part is shown; open it in VS for the whole file.',
  '预览 {path}': 'Preview {path}',
  '挑文件': 'Attach a file',
  '挑一个文件插入 @ 引用': 'Pick a file to insert as an @ reference',
  '{shown} / {total} 条（继续输入以缩小范围）': '{shown} of {total} — keep typing to narrow',
  '停止': 'Stop',
  '停止（Esc）': 'Stop (Esc)',
  '发送': 'Send',

  // —— 额度用量条 ——
  '额度用量': 'Quota usage',
  '额度用量获取中…': 'Loading quota usage…',
  '当前会话': 'Current session',
  '本周': 'This week',
  '本周（{model}）': 'This week ({model})',
  '余 {left}': '{left} left',
  '重置于 {when}': 'Resets {when}',
  '已重置': 'Reset',
  '{d} 天 {h} 小时': '{d}d {h}h',
  '{h} 小时 {m} 分': '{h}h {m}m',
  '{m} 分 {s} 秒': '{m}m {s}s',
  '重新读取额度用量。该命令不消耗额度。': 'Re-read quota usage. This command does not consume quota.',

  '会话尚未启动': 'Session not started',
  '模型未知': 'Model unknown',
  'MCP {n} 个': 'MCP {n}',
  'CLI 实际使用：{model}': 'CLI is actually using {model}',

  // —— 会话历史面板（取代被 CLI 拒绝的 /resume） ——
  '会话历史': 'Session history',
  '只看有对话的': 'Only sessions with a conversation',
  '接回会话会重启 CLI 并带上 --resume：上下文交给 CLI，但历史消息不会回填到这里。':
    'Resuming restarts the CLI with --resume: the CLI gets the context back, but the past messages are not re-rendered here.',
  '这个目录下还没有历史会话。': 'No past sessions in this directory yet.',
  '这个目录下只有启动探测留下的会话。': 'This directory only has sessions left behind by startup probes.',
  // 「当前会话」在额度那一节已有（同一个词，同一个译法），这里复用同一条。
  '接回': 'Resume',
  '开分支': 'Fork',
  '重启 CLI 并接回这条会话，后续对话继续写进它':
    'Restart the CLI and resume this session; what follows keeps writing to it',
  '拿到它的上下文，但写进一条新会话，原记录不被追写':
    'Take its context but write to a new session, leaving the original untouched',
  '开新会话': 'New session',
  '丢掉当前会话，开一条不带 --resume 的干净会话':
    'Drop the current session and start a fresh one without --resume',

  // —— 记忆面板（取代被 CLI 拒绝的 /memory） ——
  '记忆': 'Memory',
  '这些是本目录下这次会话实际会读到的记忆文件。点「打开」在编辑器里改，改完下次启动生效。':
    'These are the memory files this session actually reads in this directory. Open one to edit it; changes apply on the next start.',
  '没有找到记忆文件。': 'No memory files found.',
  '本项目': 'This project',
  '上级目录': 'Parent directory',
  '用户级': 'User level',
  '自动记忆': 'Auto memory',
  '打开': 'Open',
  '行': 'lines',

  // —— 命令面板（取代被 CLI 拒绝的 /help） ——
  '命令': 'Commands',
  '终端': 'Terminal',
  '重启': 'Restart',
  '中断': 'Interrupt',
  '清屏': 'Clear',
  '复制': 'Copy',
  '粘贴': 'Paste',
  '独立会话': 'Separate session',
  '回到对话': 'Back to chat',
  '回到对话（终端会话继续在后台跑）': 'Back to the chat (the terminal session keeps running)',
  '结束当前这一路 claude 并重开一个': 'End this claude and start a fresh one',
  '发送 Ctrl+C 中断当前命令': 'Send Ctrl+C to interrupt the running command',
  '清空屏幕（不影响正在跑的进程）': 'Clear the screen (the running process is untouched)',
  '复制选中的文本': 'Copy the selected text',
  '把剪贴板内容粘贴进终端': 'Paste the clipboard into the terminal',
  '已重启终端。': 'Terminal restarted.',
  '终端里能用的全部命令': 'every command the terminal accepts',
  '提示词': 'Prompt',
  '点一下跳回这条消息': 'Choose to jump back to this message',
  '点击在编辑器里打开 {path}': 'Choose to open {path} in the editor',
  '提示词在前面，/{cmd} 就不再是命令了——整段会当成一句话发给模型。要执行命令请先清空提示词。':
    'With the prompt in front, /{cmd} stops being a command — the whole thing goes to the model as a sentence. Clear the prompt to run it as a command.',
  '每次发送都拼在内容前面，发完不清空': 'Goes in front of the content on every send, and stays put afterwards',
  '固定提示词，每次发送都拼在内容前面（留空就只发内容）':
    'A prompt that goes in front of the content on every send (leave it empty to send just the content)',
  '这一次要说的内容，Enter 送进终端，Shift+Enter 换行，/ 触发命令补全，@ 引用文件，Esc 打断并把焦点交回终端':
    'What you want to say this time — Enter sends it to the terminal, Shift+Enter adds a line, / completes commands, @ references a file, Esc interrupts and hands focus back to the terminal',
  '标「仅终端」的请切到终端标签用；auth 等子命令见状态栏 ⋯': 'items marked Terminal only work in the Terminal tab; auth and other subcommands live in the status bar ⋯',
  '已在终端里按 shift+tab 切到「{mode}」。': 'Switched to "{mode}" with shift+tab in the terminal.',
  '读不出终端现在是哪一档权限（底栏没露出来，或者有对话框挡着），没敢替你按 shift+tab。':
    'Cannot tell which permission mode the terminal is in (the footer is not showing, or a dialog is covering it), so shift+tab was not pressed for you.',
  '按了 shift+tab 之后底栏没变（这一下可能没被终端收到，或者有对话框挡着），没有继续按下去。':
    'The footer did not change after shift+tab (the key may not have reached the terminal, or a dialog is covering it), so no further presses were sent.',
  '在终端里按 shift+tab 转了一圈也没转到「{mode}」，这一档只能重启终端才进得去。':
    'shift+tab went all the way around in the terminal without reaching "{mode}"; that mode can only be entered by restarting the terminal.',
  '这几项只能重启终端才生效：': 'These only take effect after restarting the terminal: ',
  '（这一档只有起终端时就带上才进得去，原生终端里按 shift+tab 也转不过去）':
    ' (this mode is only reachable if the terminal was started with it; shift+tab cannot reach it in a plain terminal either)',
  '（CLI 里没有任何一档转得到它，只能起终端时带上）':
    ' (no mode in the CLI cycles into this one; it has to be set when the terminal starts)',
  '终端输入行里还有没发完的内容，{cmd} 先没送进去；发出去或清空之后会自动切。':
    'The terminal input line still has unsent text, so {cmd} was held back; it will be applied once you send or clear it.',
  '已在终端里执行 {cmd}；是否存成新会话的默认值，看终端里那行回复。':
    'Ran {cmd} in the terminal. Whether it becomes the default for new sessions is stated in the terminal reply.',
  '重启终端以应用': 'Restart terminal to apply',
  '重开一路 claude 并用当前参数（终端里正在进行的会话会丢）':
    'Start a fresh claude with the current options (whatever is going on in the terminal is lost)',
  '输入内容，Enter 送进终端，Shift+Enter 换行，/ 触发命令补全，Esc 把焦点交回终端':
    'Type here — Enter sends it to the terminal, Shift+Enter adds a line, / completes commands, Esc hands focus back to the terminal',
  '这项只作用于上面的对话会话。终端里是另一路 claude，要改它请在终端里直接用 /model、/effort 等命令。':
    'This only affects the chat session above. The terminal runs a separate claude — change it there with /model, /effort and friends.',
  '没有选中任何文本。': 'Nothing is selected.',
  '已复制选中的文本。': 'Copied the selection.',
  '复制失败：这个环境不允许写剪贴板。': 'Copy failed: this environment does not allow writing to the clipboard.',
  '剪贴板是空的。': 'The clipboard is empty.',
  '粘贴失败：这个环境不允许读剪贴板，用 Ctrl+V 试试。':
    'Paste failed: this environment does not allow reading the clipboard — try Ctrl+V.',
  '这一路 claude 跑的是完整终端界面：起它时从上面这条会话分叉一份，带着上下文开场，之后两边各聊各的。面板里用不了的命令（云端会话、后台任务、账号设置等）在这里都能用。':
    'A claude running the full terminal UI, forked from the conversation above: it opens with that context, '
    + 'then the two go their own ways. '
    + 'Commands the panel cannot run (cloud sessions, background tasks, account settings) all work here.',
  '终端里的进程已退出（退出码 {n}）。点「重启」可以重开一个。':
    'The process in the terminal exited (code {n}). Use Restart to start a new one.',
  '打开终端：跑完整 TUI 的一路 claude，从当前对话分叉，带着上下文':
    'Open a terminal: a full-TUI claude forked from this conversation, carrying its context',
  '按名字或说明筛选': 'Filter by name or description',
  '说明由 CLI 提供。输入框里打 / 也能直接补全这些命令。':
    'Descriptions come from the CLI. Typing / in the composer completes these too.',
  '会话尚未启动，命令清单还没取到。': 'The session has not started, so the command list is not available yet.',
  '这一版 CLI 没有报出命令说明。': 'This CLI version did not report command descriptions.',
  '内置': 'Built-in',
  '插件与技能': 'Plugins and skills',
  '本环境不可用': 'Unavailable here',

  '{command} 的可选值': 'Values available for {command}',
  '← → 选择 · Enter 执行 · Esc 回输入框': '← → to move · Enter to run · Esc back to the composer',

  // —— 文件回滚面板（取代被 CLI 拒绝的 /rewind） ——
  '文件回滚': 'File rollback',
  '这些是 CLI 在改动文件前留下的快照，按时间倒序。还原会覆盖工作区里的文件，但覆盖前的内容会另存一份，路径写在转录里。':
    'These are snapshots the CLI took before changing each file, newest first. Restoring overwrites the file in your workspace, but the current content is saved aside first and the path is written to the transcript.',
  '本会话还没有文件改动记录。': 'No file changes recorded in this session yet.',
  '还原': 'Restore',
  '确定还原': 'Restore it',
  '确定覆盖这个文件？': 'Overwrite this file?',
  '把这个文件覆盖成这一版；覆盖前的内容会另存一份':
    'Overwrite the file with this version; the current content is saved aside first',
  '快照已被清理': 'Snapshot was cleaned up',

  '这里的界面是网页，不是终端 UI。主题、字号与密度在状态栏最右侧的「外观」里改，改完立即生效。':
    'This surface is a web view, not a terminal UI. Theme, font size and density live in Appearance at the far right of the status bar, and take effect immediately.',
  '这条是终端 UI 的设置（键位、滚动、vim 模式、精简/专注视图），在网页界面里没有对应物。外观相关的在状态栏的「外观」里；键位由 VS 自己管。':
    'That command configures the terminal UI (key bindings, scrolling, vim mode, brief/focus views), which has no counterpart in a web view. Appearance settings are in the status bar; key bindings belong to Visual Studio.',
  '把会话交给别的客户端（Chrome 扩展、桌面版、手机）需要服务端把会话搬走，而本扩展驱动的是本机的 claude 子进程，没有那条通道。要用那些客户端请直接打开它们。':
    'Handing the session to another client (the Chrome extension, the desktop app, your phone) requires the server to move the session, and this extension drives a local claude child process, so there is no such channel. Open those clients directly instead.',
  '云端会话与远程环境要服务端托管会话（分享链接、远程环境、云端工作流都属于这一类），本扩展驱动的是本机 claude 子进程，拿不到那条通道。这些请在 claude.ai 或终端里用。':
    'Cloud sessions and remote environments need the server to host the conversation (share links, remote environments and cloud workflows all fall in this group). This extension drives a local claude child process and has no access to that channel. Use claude.ai or a terminal for these.',
  '这是账号级的设置或信息页，改的是服务端状态而不是这个工作区，在浏览器里看更合适。':
    'This is an account-level setting or information page: it changes server-side state rather than this workspace, so a browser is the better place for it.',
  '休息提醒与静默时段是账号级设置，与编码界面无关；要调整请在终端里跑一次这条命令。':
    'Break reminders and quiet hours are account-level settings unrelated to the coding surface. Run this command in a terminal if you want to adjust them.',
  '这里没有终端要腾出来：工具窗本身就在后台跑，你可以直接切到别的窗口。要中断当前这一轮，用输入框旁边的「停止」。':
    'There is no terminal to free here: the tool window already runs in the background, so just switch to another window. To interrupt the current turn, use Stop next to the composer.',
  '关掉这个工具窗即结束会话——宿主会一并收掉 claude 子进程。要清空上下文重新开始，用 /clear。':
    'Closing this tool window ends the session — the host shuts the claude child process down with it. To clear the context and start over, use /clear.',
  '这条要 CLI 的交互式界面才能给出数据（本管线只有 --print 的事件流，拿不到那份列表），所以这里没有对应面板。要用它请在终端里跑。':
    'This one needs the interactive CLI to produce its data (this pipeline only has the --print event stream, which never carries that list), so there is no panel for it. Run it in a terminal instead.',
  '转录里的工具卡片已经渲染了每次改动的彩色 diff；要比较任意两个文件，用 VS 自己的比较器。':
    'The tool cards in the transcript already render a colored diff for every change. To compare two arbitrary files, use Visual Studio own comparison tool.',
  '工作目录跟随 VS 的解决方案：扩展启动时按它设 cwd。要换目录请打开另一个解决方案，当前会话的目录不能中途改。':
    'The working directory follows the Visual Studio solution: the extension sets cwd from it at startup. Open a different solution to work elsewhere; the current session cannot change directory midway.',
  '你已经在 IDE 里了——这条命令在终端里是用来连上 IDE 的。':
    'You are already in the IDE — in a terminal this command is what connects the CLI to one.',
  '本扩展没有独立的侧问通道：想岔一句直接在输入框里问；要另起一路不打扰当前会话，用「会话历史」面板的「开分支」。':
    'There is no separate side-question channel here: just ask in the composer. To start a parallel thread without disturbing this session, use Branch in the Session history panel.',
  '插件改动要新会话才加载。切一次模型或权限模式会重启 claude 子进程，关掉工具窗再打开也一样——本扩展不单独提供「重载插件」。':
    'Plugin changes load with a new session. Switching model or permission mode restarts the claude child process, and closing and reopening the tool window does the same — this extension has no separate reload-plugins action.',
  '循环任务要 CLI 的交互式界面来管理，本管线拿不到那份列表。要用它请在终端里跑。':
    'Loops are managed through the interactive CLI, and this pipeline cannot see that list. Run it in a terminal.',
  '已把最后一条回复复制到剪贴板。':
    'Copied the latest response to the clipboard.',
  '已把整段转录按 Markdown 复制到剪贴板。本扩展不代写文件——粘到你想存的地方即可。':
    'Copied the whole transcript to the clipboard as Markdown. This extension does not write files for you — paste it wherever you want to keep it.',
  '已切到计划模式，状态栏的权限模式同步显示。':
    'Switched to plan mode; the permission mode in the status bar reflects it.',
  '已请求中断当前这一轮。':
    'Requested an interrupt for the current turn.',
  '工作目录之外的可访问目录由 permissions.additionalDirectories 决定，已打开「权限」面板。面板只读，这一项要在编辑器里改。':
    'Directories outside the working directory come from permissions.additionalDirectories, so the Permissions panel is now open. The panel is read-only — edit that entry in the editor.',
  '这条改的是 settings.json 里的一段，已打开「设置文件」面板：它列出四个作用域里现有的文件与配置段，点「打开」在编辑器里改。':
    'This command edits a section of settings.json, so the Settings files panel is now open: it lists the files that exist across the four scopes and the sections in them. Choose Open to edit one in the editor.',
  '已打开「记忆」面板：它列出本次会话真会读到的记忆文件。要停用自动记忆得改 settings.json，本扩展不代改。':
    'The Memory panel is now open: it lists the memory files this session actually reads. Disabling automatic memory means editing settings.json, which this extension will not do for you.',
  '已打开「会话历史」面板：最近的会话在最上面，「接回」继续那条，「开分支」从它岔出一条新的。':
    'The Session history panel is now open: the most recent session is at the top. Resume continues it, Branch forks a new one from it.',
  '还没有可复制的回复。':
    'There is no response to copy yet.',
  '转录还是空的，没有可导出的内容。':
    'The transcript is still empty, so there is nothing to export.',
  '设置文件':
    'Settings files',
  'CLI 的设置分四个作用域，下面是这台机器上实际存在的文件与其中已有的配置段。面板只读，点「打开」在编辑器里改；键名与取值请查官方文档，这里不列可配置项大全。':
    'CLI settings live in four scopes. Below are the files that actually exist on this machine and the sections already in them. The panel is read-only — choose Open to edit one in the editor. For key names and values see the official docs; this panel deliberately does not try to list every option.',
  '（还没有任何配置段）':
    '(no sections yet)',
  '这条命令在当前 CLI 构建里没有注册（打过去只会得到 Unknown command），所以这里也没有对应功能。CLI 升版后可能出现。':
    'This command is not registered in the current CLI build (typing it only yields "Unknown command"), so there is nothing here for it either. A future CLI version may bring it back.',
  '升级或重启 CLI 要在终端里做：本扩展驱动的是它启动时定下的那个 claude 进程，不代跑升级。装好新版后关掉工具窗再打开即可用上。':
    'Upgrading or restarting the CLI belongs in a terminal: this extension drives the claude process it started and will not run an upgrade for you. Install the new version, then close and reopen the tool window.',
  '安装类命令会改这台机器上的东西，本扩展不代跑——请在终端里执行，装完回到这里继续用。':
    'Installer commands change things on this machine, so this extension will not run them for you. Run it in a terminal and come back when it is done.',
  '语音模式是终端 UI 的功能，网页界面里没有对应物。':
    'Voice mode is a terminal UI feature and has no counterpart in a web view.',
  '功能介绍是 CLI 的交互式课程，本管线（--print）拿不到那套交互。想看功能清单可以用 /help 打开「命令」面板。':
    'The feature tour is an interactive CLI lesson, and this pipeline (--print) has no access to that interaction. For a list of what is available, use /help to open the Commands panel.',
  '这条命令在当前 CLI 构建里没有注册，但它想看的东西「状态」面板里都有：CLI 版本、模型、账号、已加载的技能与 MCP 服务器。':
    'This command is not registered in the current CLI build, but everything it would show is in the Status panel: CLI version, model, account, loaded skills and MCP servers.',
  'CLI 的状态行只影响终端界面。本扩展的状态栏是网页自己的：模型、权限模式、强度与额度都在下方那一条里，会话详情看「状态」面板。要配 CLI 的状态行请在终端里跑这条命令。':
    'The CLI status line only affects the terminal. This extension has its own: model, permission mode, effort and usage all live in the bar below, and session details are in the Status panel. Run this command in a terminal if you want to configure the CLI one.',
  '这是计费与额度的信息页，属于账号级。额度用量在下方状态栏实时显示，明细看「状态」面板；要处理套餐或额度请在浏览器或终端里做——本扩展不代跑计费类命令。':
    'This is a billing and usage information page, which is account-level. Usage shows live in the bar below and in detail in the Status panel; handle plans or credits in a browser or a terminal — this extension does not run billing commands for you.',
  '正在把整段转录导出成 Markdown 文件。宿主写完会把路径写在下面，并在编辑器里打开它。':
    'Exporting the whole transcript to a Markdown file. The host writes it and will print the path below, then open the file in the editor.',
  '已把倒数第 {n} 条回复复制到剪贴板。': 'Copied response {n} counting back from the latest.',
  '复制到剪贴板失败（浏览器拒绝了写剪贴板）。用 /export 可以把转录写成文件。':
    'Could not write to the clipboard (the browser refused). Use /export to write the transcript to a file instead.',
  '没有那么多条回复：当前只有 {n} 条。': 'There are not that many responses yet — only {n} so far.',
  '这条命令**不带参数**时在这里是可用的——本扩展把它接成了原生功能。带参数的形式没法截获（参数千变万化，猜错等于把命令改了意思），而 CLI 在本管线下不支持它，所以去掉参数再打一次。':
    'Without arguments this command does work here — the extension wires it to a native feature. The form with arguments cannot be intercepted (arguments vary endlessly, and guessing wrong would change what the command means), and the CLI does not support it in this pipeline, so drop the arguments and try again.',
  '登录、登出与认证配置会改账号状态，本扩展不代跑，也没有对应界面。请在终端里执行；改完回到这里，关掉工具窗再打开即可用上新的账号状态。':
    'Signing in, signing out and reconfiguring authentication change account state. This extension does not run them for you and has no UI for them. Run it in a terminal; afterwards close and reopen the tool window to pick up the new account state.',
  '安装类命令会改这台机器上的东西，本扩展不代跑。请在终端里执行，装完关掉工具窗再打开。':
    'Installer commands change things on this machine, so this extension does not run them for you. Run it in a terminal, then close and reopen the tool window.',
  '套餐与额度的申请属于账号级操作，本扩展不代跑。当前额度在下方状态栏实时显示、明细在「状态」面板；要买或要申请请在浏览器或终端里做。':
    'Requesting plan changes or credits is an account-level operation this extension will not perform for you. Current usage shows live in the bar below and in detail in the Status panel; buy or request through a browser or a terminal.',
  '反馈与报障会把你的会话内容发给 Anthropic，本扩展不代发。请在终端里执行这条命令，那边会让你确认发送什么。':
    'Feedback and bug reports send your conversation to Anthropic, so this extension will not send them for you. Run the command in a terminal — it will ask you what to include.',
  '这几条是随 CLI 打包的技能，只在 CLI 自己的交互式界面里注册——它们依赖 Artifact / Chrome 那套工具，本管线（--print）里没有。要用请切到终端标签，那边的补全里有它们。':
    'These are skills bundled with the CLI that only register in its own interactive interface — they depend on the Artifact / Chrome tooling, which this (--print) pipeline does not have. Switch to the Terminal tab; its completion lists them.',
  '这条命令在本管线下不可用（CLI 的原话在上面）。用 /help 打开「命令」面板可以看到这里真正能用的那些。':
    'This command is unavailable in this pipeline (the CLI wording is above). Use /help to open the Commands panel and see what does work here.',
  // —— 权限面板（取代被 CLI 拒绝的 /permissions 与别名 /allowed-tools） ——
  '这些是各作用域 settings.json 里声明的工具权限规则。面板只读——加规则等于放宽权限，点「打开」在编辑器里改。实际生效还受企业策略、命令行参数与本次会话里的临时批准影响。':
    'These are the tool permission rules declared in each scope settings.json. This panel is read-only: adding a rule widens what the agent may do, so use Open and edit the file. What actually takes effect is also shaped by enterprise policy, command-line flags, and approvals you granted during this session.',
  '没有找到任何 settings.json。': 'No settings.json found.',
  '本项目（未入库）': 'This project (not committed)',
  '企业策略': 'Enterprise policy',
  '允许': 'Allow',
  '拒绝': 'Deny',
  '每次询问': 'Ask every time',
  '默认模式': 'Default mode',
  '附加目录': 'Extra directory',
  '读不出来': 'Could not be read',

  '会话尚未启动，暂无可显示的状态。': 'The session has not started, so there is nothing to show yet.',
  '会话 id': 'Session id',
  '模型': 'Model',
  '权限模式': 'Permission mode',
  'CLI 版本': 'CLI version',
  '订阅': 'Subscription',
  '额度': 'Quota',
  '技能': 'Skills',
  '子代理': 'Subagents',
  '工具': 'Tools',
  '协议能力': 'Protocol capabilities',
  '用量明细（CLI 原文）': 'Usage breakdown (CLI output)',
  '未提供': 'Not provided',
  '无': 'None',

  '跟随 VS': 'Follow VS',
  '微软雅黑': 'Microsoft YaHei',
  '字体': 'Font',
  '字号': 'Size',
  '颜色': 'Colour',

  '实测：本管线下所有权限模式都不提供交互式工具门禁，Bash 与 Write 一律直接执行。唯一真实有效的护栏是 settings.json 里的 permissions.deny，例如 "deny": ["Bash(rm:*)"]，该规则连危险模式都绕不过。':
    'Measured: no permission mode in this pipeline provides interactive tool gating — Bash and Write always run directly. The only guardrail that actually holds is permissions.deny in settings.json, e.g. "deny": ["Bash(rm:*)"], which even Dangerous mode cannot bypass.',

  // —— tab 条 ——
  '正在跑': 'Running',
  '有新输出': 'New output',
  '这个 tab 崩了，点进去看看原因': 'This tab crashed — open it to see why',
  '关闭': 'Close',
  '新建会话': 'New session',
  '确定?': 'Confirm?',
  '再点一次关闭 {title}': 'Click again to close {title}',
};

/** 详情字段的键 → 中文标签。 */
const FIELD_LABELS: Record<string, string> = {
  marketplace: '市场',
  version: '版本',
  scope: '作用域',
  installPath: '安装路径',
  installedAt: '安装时间',
  projectPath: '项目路径',
  source: '来源',
  installCount: '安装次数',
  url: '地址',
  status: '状态',
  session: '会话',
  kind: '形态',
  cwd: '工作目录',
  pid: '进程号',
};

/** 详情字段标签。 */
export function fieldLabel(lang: Lang, key: string): string {
  const zh = FIELD_LABELS[key];
  return zh === undefined ? key : translate(lang, zh);
}

/** 供契约测试比对：字段标签表里的中文标签。 */
export function fieldLabelTexts(): string[] {
  return Object.values(FIELD_LABELS);
}

const TABLES: Record<Lang, Record<string, string>> = {
  zh: {},
  en: EN,
};

/** 取文案。 */
export function translate(lang: Lang, zhText: string, params?: Record<string, string | number>): string {
  const table = TABLES[lang] ?? {};
  let text = table[zhText] ?? zhText;

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      text = text.split(`{${key}}`).join(String(value));
    }
  }

  return text;
}

/**
 * 宿主推来的系统提示。
 *
 * 宿主只会发中文模板 + 取值：语言是面板上的开关，它在预置接回提示那一刻还不知道
 * 用户选的是哪一种。没带模板（子命令原样输出这类）就用 fallback，一个字都不动。
 *
 * 取值也过一遍表：权限模式的说法（「接受编辑（acceptEdits）」）本身就是中文，
 * 直接塞进英文句子里会得到半句中文。路径、id 这类查不到，原样留下。
 */
export function noticeText(
  lang: Lang,
  fallback: string,
  key?: string,
  args?: Record<string, string>): string {
  if (key === undefined || key === '') {
    return fallback;
  }

  const table = TABLES[lang] ?? {};
  const translated: Record<string, string> = {};

  for (const [name, value] of Object.entries(args ?? {})) {
    translated[name] = table[value] ?? value;
  }

  const text = translate(lang, key, translated);
  return text;
}

/** 宿主生成的 tab 标题固定是「会话 N」。认不出的原样返回：记录文件用户可以手改。 */
export function tabTitle(lang: Lang, title: string): string {
  const match = /^会话\s*(\d+)$/.exec((title ?? '').trim());

  if (!match) {
    return title;
  }

  const text = translate(lang, '会话 {n}', { n: match[1] });
  return text;
}

/** 语言偏好在 localStorage 里的键。 */
export const LANG_STORAGE_KEY = 'agentExtension.lang';

const STORAGE_KEY = LANG_STORAGE_KEY;

/** 该取值是不是我们支持的语言。 */
export function isLang(value: unknown): value is Lang {
  return value === 'zh' || value === 'en';
}

/** 初始语言：优先用户上次选的，其次跟随宿主环境，最后退回中文。 */
export function loadLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) {
      return saved;
    }
  } catch {
    // localStorage 在某些宿主配置下会抛（隐私模式、存储被禁）。
  }

  const navigatorLang = typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
  return navigatorLang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** 记住用户选的语言。 */
export function saveLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // 同 loadLang：存储不可用时静默跳过，语言仍在本次会话内生效。
  }
}

/** 供契约测试比对：EN 表里有哪些键。 */
export function englishKeys(): string[] {
  return Object.keys(EN);
}

/** 供契约测试比对：EN 表的完整键值对。 */
export function englishEntries(): [string, string][] {
  return Object.entries(EN);
}
