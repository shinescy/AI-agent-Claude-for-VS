// 被 CLI 拒掉的命令的落点表。

import { panelIdForCommand } from './panelCommands';

/** 能真做的事。 */
export type FallbackAction = 'copyLast' | 'copyTranscript' | 'exportTranscript' | 'planMode' | 'interrupt';

export interface Fallback {
  /** 打开哪个面板；与 action 二者最多有一个。 */
  panelId?: string;

  /** 动作的数字实参（目前只有 `/copy N`：倒数第 N 条回复）。 */
  arg?: number;
  /** 执行哪个动作。 */
  action?: FallbackAction;
  /** 写进转录的说明。 */
  note: string;
}

// —— 说明文案。

const N_APPEARANCE =
  '这里的界面是网页，不是终端 UI。主题、字号与密度在状态栏最右侧的「外观」里改，改完立即生效。';

const N_TUI_ONLY =
  '这条是终端 UI 的设置（键位、滚动、vim 模式、精简/专注视图），在网页界面里没有对应物。外观相关的在状态栏的「外观」里；键位由 VS 自己管。';

const N_HANDOFF =
  '把会话交给别的客户端（Chrome 扩展、桌面版、手机）需要服务端把会话搬走，而本扩展驱动的是本机的 claude 子进程，没有那条通道。要用那些客户端请直接打开它们。';

const N_CLOUD =
  '云端会话与远程环境要服务端托管会话（分享链接、远程环境、云端工作流都属于这一类），本扩展驱动的是本机 claude 子进程，拿不到那条通道。这些请在 claude.ai 或终端里用。';

const N_ACCOUNT =
  '这是账号级的设置或信息页，改的是服务端状态而不是这个工作区，在浏览器里看更合适。';

const N_WELLBEING =
  '休息提醒与静默时段是账号级设置，与编码界面无关；要调整请在终端里跑一次这条命令。';

const N_BACKGROUND =
  '这里没有终端要腾出来：工具窗本身就在后台跑，你可以直接切到别的窗口。要中断当前这一轮，用输入框旁边的「停止」。';

const N_EXIT =
  '关掉这个工具窗即结束会话——宿主会一并收掉 claude 子进程。要清空上下文重新开始，用 /clear。';

const N_INTERACTIVE =
  '这条要 CLI 的交互式界面才能给出数据（本管线只有 --print 的事件流，拿不到那份列表），所以这里没有对应面板。要用它请在终端里跑。';

const N_DIFF =
  '转录里的工具卡片已经渲染了每次改动的彩色 diff；要比较任意两个文件，用 VS 自己的比较器。';

const N_CD =
  '工作目录跟随 VS 的解决方案：扩展启动时按它设 cwd。要换目录请打开另一个解决方案，当前会话的目录不能中途改。';

const N_IDE = '你已经在 IDE 里了——这条命令在终端里是用来连上 IDE 的。';

const N_BTW =
  '本扩展没有独立的侧问通道：想岔一句直接在输入框里问；要另起一路不打扰当前会话，用「会话历史」面板的「开分支」。';

const N_RELOAD =
  '插件改动要新会话才加载。切一次模型或权限模式会重启 claude 子进程，关掉工具窗再打开也一样——本扩展不单独提供「重载插件」。';

const N_LOOPS =
  '循环任务要 CLI 的交互式界面来管理，本管线拿不到那份列表。要用它请在终端里跑。';

const N_NOT_REGISTERED =
  '这条命令在当前 CLI 构建里没有注册（打过去只会得到 Unknown command），所以这里也没有对应功能。CLI 升版后可能出现。';

const N_UPGRADE_CLI =
  '升级或重启 CLI 要在终端里做：本扩展驱动的是它启动时定下的那个 claude 进程，不代跑升级。装好新版后关掉工具窗再打开即可用上。';

const N_INSTALLER =
  '安装类命令会改这台机器上的东西，本扩展不代跑——请在终端里执行，装完回到这里继续用。';

const N_VOICE =
  '语音模式是终端 UI 的功能，网页界面里没有对应物。';

const N_LESSONS =
  '功能介绍是 CLI 的交互式课程，本管线（--print）拿不到那套交互。想看功能清单可以用 /help 打开「命令」面板。';

const N_STATUSLINE =
  'CLI 的状态行只影响终端界面。本扩展的状态栏是网页自己的：模型、权限模式、强度与额度都在下方那一条里，会话详情看「状态」面板。要配 CLI 的状态行请在终端里跑这条命令。';

const N_BILLING =
  '这是计费与额度的信息页，属于账号级。额度用量在下方状态栏实时显示，明细看「状态」面板；要处理套餐或额度请在浏览器或终端里做——本扩展不代跑计费类命令。';



/** 命令名（不含前导斜杠）→ 落点。 */
const FALLBACKS: Record<string, Fallback> = Object.create(null);

function put(names: string, fallback: Fallback): void {
  for (const name of names.split(' ')) {
    FALLBACKS[name] = fallback;
  }
}

// —— 真做事的 ——
put('copy', { action: 'copyLast', note: '已把最后一条回复复制到剪贴板。' });
put('export', {
  action: 'exportTranscript',
  note: '正在把整段转录导出成 Markdown 文件。宿主写完会把路径写在下面，并在编辑器里打开它。',
});
put('plan', { action: 'planMode', note: '已切到计划模式，状态栏的权限模式同步显示。' });
put('stop', { action: 'interrupt', note: '已请求中断当前这一轮。' });

// —— 落到原生面板的 ——
put('add-dir', {
  panelId: 'permissions',
  note: '工作目录之外的可访问目录由 permissions.additionalDirectories 决定，已打开「权限」面板。面板只读，这一项要在编辑器里改。',
});
put('hooks sandbox', {
  panelId: 'settingsFiles',
  note: '这条改的是 settings.json 里的一段，已打开「设置文件」面板：它列出四个作用域里现有的文件与配置段，点「打开」在编辑器里改。',
});
put('pause-memory memory-pause toggle-memory', {
  panelId: 'memory',
  note: '已打开「记忆」面板：它列出本次会话真会读到的记忆文件。要停用自动记忆得改 settings.json，本扩展不代改。',
});
put('branch fork continue', {
  panelId: 'sessions',
  note: '已打开「会话历史」面板：最近的会话在最上面，「接回」继续那条，「开分支」从它岔出一条新的。',
});
put('subtask', { panelId: 'sessions', note: N_BTW });

// —— 只能给说明的 ——
put('theme color tui', { note: N_APPEARANCE });
put('keybindings scroll-speed vim terminal-setup brief focus', { note: N_TUI_ONLY });
put('chrome desktop app mobile ios android', { note: N_HANDOFF });
put('remote remote-control remote-env rc session share teleport tp ultrareview ultraplan workflows web-setup',
  { note: N_CLOUD });
put('privacy-settings release-notes stickers advisor radio artifacts', { note: N_ACCOUNT });
put('wellbeing breaks break-reminder downtime', { note: N_WELLBEING });
put('background bg', { note: N_BACKGROUND });
put('exit quit', { note: N_EXIT });
put('tasks bashes autofix-pr', { note: N_INTERACTIVE });
put('loops passes', { note: N_LOOPS });
put('diff', { note: N_DIFF });
put('cd', { note: N_CD });
put('ide', { note: N_IDE });
put('btw', { note: N_BTW });
put('reload-plugins', { note: N_RELOAD });

// 以下不是「被 CLI 拒」，而是另外两种同样会让用户碰壁的情况，一并落地：
put('version skill-doctor', {
  panelId: 'status',
  note: '这条命令在当前 CLI 构建里没有注册，但它想看的东西「状态」面板里都有：CLI 版本、模型、账号、已加载的技能与 MCP 服务器。',
});
put('daemon mcp__', { note: N_NOT_REGISTERED });
put('update restart', { note: N_UPGRADE_CLI });
// 只拦 /install-slack-app：它的声明里 supportsNonInteractive: false，可判定被拒。
put('install-slack-app', { note: N_INSTALLER });
put('voice', { note: N_VOICE });
put('powerup', { note: N_LESSONS });

// 这三条是 2026-08-20 经用户授权后实测的（三条都回「isn't available in this environment.」）。
put('statusline', { note: N_STATUSLINE });
put('pro-trial-expired rate-limit-options', { note: N_BILLING });

// 第二层：不拦，但「CLI 拒了就解释」。

const R_AUTH =
  '登录、登出与认证配置会改账号状态，本扩展不代跑，也没有对应界面。请在终端里执行；改完回到这里，关掉工具窗再打开即可用上新的账号状态。';

const R_INSTALLER =
  '安装类命令会改这台机器上的东西，本扩展不代跑。请在终端里执行，装完关掉工具窗再打开。';

const R_BILLING_ACTION =
  '套餐与额度的申请属于账号级操作，本扩展不代跑。当前额度在下方状态栏实时显示、明细在「状态」面板；要买或要申请请在浏览器或终端里做。';

const R_BUNDLED_SKILL =
  '这几条是随 CLI 打包的技能，只在 CLI 自己的交互式界面里注册——它们依赖 Artifact / Chrome 那套工具，本管线（--print）里没有。要用请切到终端标签，那边的补全里有它们。';

const R_FEEDBACK =
  '反馈与报障会把你的会话内容发给 Anthropic，本扩展不代发。请在终端里执行这条命令，那边会让你确认发送什么。';

const R_BARE_FORM =
  '这条命令**不带参数**时在这里是可用的——本扩展把它接成了原生功能。带参数的形式没法截获（参数千变万化，猜错等于把命令改了意思），而 CLI 在本管线下不支持它，所以去掉参数再打一次。';

const R_GENERIC =
  '这条命令在本管线下不可用（CLI 的原话在上面）。用 /help 打开「命令」面板可以看到这里真正能用的那些。';

/** CLI 拒绝之后才给的说明。 */
const REJECTION_NOTES: Record<string, string> = Object.create(null);

function putRejection(names: string, note: string): void {
  for (const name of names.split(' ')) {
    REJECTION_NOTES[name] = note;
  }
}

putRejection('login logout design-login setup-bedrock setup-vertex', R_AUTH);
putRejection('install install-github-app', R_INSTALLER);
putRejection('upgrade extra-usage usage-credits', R_BILLING_ACTION);
putRejection('bug feedback', R_FEEDBACK);
// 这四条不是 CLI 的内置命令，是随 claude.exe 打包的技能：TUI 菜单里有（2026-08-21 实测），
putRejection('artifact-capabilities artifact-design artifact-diagramming claude-in-chrome', R_BUNDLED_SKILL);

/** CLI 拒了某条命令之后要补的说明。 */
export function rejectionNoteFor(name: string): string {
  const specific = REJECTION_NOTES[name];

  if (specific !== undefined)
  {
    return specific;
  }

  // 这条命令本身在这里是可用的（被截获成面板或落点），撞上 CLI 的拒绝只能是因为带了参数。
  if (hasFallback(name))
  {
    return R_BARE_FORM;
  }

  return R_GENERIC;
}

/** 有专门说明的命令名（供契约测试比对，别在界面上用）。 */
export function rejectionNoteNames(): string[] {
  return Object.keys(REJECTION_NOTES);
}

/** 补全里要出现的落点命令。 */
export const FALLBACK_COMMAND_NAMES: string[] = [
  'copy', 'export', 'plan', 'stop', 'add-dir', 'hooks', 'branch',
];

/** 这个名字有没有落点（面板 / 动作 / 说明都算）。 */
export function hasFallback(name: string): boolean {
  return FALLBACKS[name] !== undefined || panelIdForCommand('/' + name) !== null;
}

/** 取落点；没有则返回 null，照常发给 CLI。 */
export function fallbackFor(text: string): Fallback | null {
  const trimmed = text.trim();

  if (!trimmed.startsWith('/')) {
    return null;
  }

  const rest = trimmed.slice(1);

  if (!rest) {
    return null;
  }

  if (/\s/.test(rest)) {
    return numericFallback(rest);
  }

  return FALLBACKS[rest] ?? null;
}

/** `/copy 2` 这一种：命令名 + 一个正整数。 */
function numericFallback(rest: string): Fallback | null {
  const match = /^([a-z-]+)\s+(\d{1,4})$/i.exec(rest);

  if (!match) {
    return null;
  }

  const base = FALLBACKS[match[1]];
  const index = Number(match[2]);

  if (base?.action !== 'copyLast' || index < 1) {
    return null;
  }

  return { action: 'copyLast', arg: index, note: '已把倒数第 {n} 条回复复制到剪贴板。' };
}
