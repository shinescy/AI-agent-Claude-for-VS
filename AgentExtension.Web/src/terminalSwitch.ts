// 终端里的「直接切」：型号与强度走 TUI 自己的 /model、/effort，不必重启进程。

/** 能在跑着的 TUI 里直接切的两项。 */
export type LiveField = 'model' | 'effort';

/** 一套 CLI 启动参数。 */
export interface TerminalLaunchSelection
{
  model: string;
  effort: string;
  permissionMode: string;
}

/** CLI 自己报上来的可选值。 */
export interface KnownValues
{
  models: readonly string[];
  efforts: readonly string[];
}

/** 一项待生效的切换。 */
export interface LiveSwitch
{
  field: LiveField;
  value: string;

  /** 送进终端的那一行，例如 <c>/effort xhigh</c>。 */
  command: string;
}

export interface SwitchPlan
{
  /** 能直接在终端里切的。 */
  live: LiveSwitch[];

  /** 要靠 shift+tab 转过去的权限模式；不需要转就是 null。 */
  cycle: string | null;

  /** 只能重启才生效的，已经是可以直接显示的句子。 */
  restart: string[];
}

/** 这个值能不能直接发进 TUI。 */
export function canSwitchLive(value: string, known: readonly string[]): boolean
{
  return value.length > 0 && known.indexOf(value) >= 0;
}

/** 拼出送进终端的那一行。 */
export function switchCommand(field: LiveField, value: string): string
{
  return '/' + field + ' ' + value;
}

/** 把「栏里选的」和「终端进程正在用的」摆到一起，分成能直接切的和只能重启的两堆。 */
export function planSwitch(
  selected: TerminalLaunchSelection | undefined,
  launched: TerminalLaunchSelection | null,
  known: KnownValues,
  t: (text: string) => string,
  unreachable = ''): SwitchPlan
{
  const plan: SwitchPlan = { live: [], cycle: null, restart: [] };

  if (selected === undefined || launched === null)
  {
    return plan;
  }

  classify('model', t('型号'), selected.model, launched.model, known.models);
  classify('effort', t('强度'), selected.effort, launched.effort, known.efforts);

  if (normalizePermission(selected.permissionMode) !== normalizePermission(launched.permissionMode))
  {
    // 在 shift+tab 的环里就转过去；不在环里（或者转过一圈没转到）就只能重启。
    if (isCyclablePermission(selected.permissionMode, launched.permissionMode)
      && selected.permissionMode !== unreachable)
    {
      plan.cycle = selected.permissionMode;
    }
    else
    {
      plan.restart.push(
        line(t('权限'), launched.permissionMode, selected.permissionMode, t)
        + why(selected.permissionMode, t));
    }
  }

  return plan;

  function classify(
    field: LiveField,
    label: string,
    now: string,
    running: string,
    values: readonly string[]): void
  {
    if (now === running)
    {
      return;
    }

    if (canSwitchLive(now, values))
    {
      plan.live.push({ field, value: now, command: switchCommand(field, now) });
      return;
    }

    // 切回「默认」（空串）也走这里：TUI 里没有「把参数撤掉」这回事，只能重起一个进程。
    plan.restart.push(line(label, running, now, t));
  }
}

/**
 * 这一档为什么非重启不可。
 *
 * 只说事先就知道的两种；「转了一圈才发现转不到」那种由面板在转完之后自己说。
 * 不说的话，用户看到的只有「只能重启终端才生效」——而他刚在原生终端里按 shift+tab
 * 换过档，合理的结论就是这个界面做得不对。
 */
function why(mode: string, t: (text: string) => string): string
{
  const want = normalizePermission(mode);

  if (want === 'bypassPermissions')
  {
    return t('（这一档只有起终端时就带上才进得去，原生终端里按 shift+tab 也转不过去）');
  }

  if (want === 'dontAsk')
  {
    return t('（CLI 里没有任何一档转得到它，只能起终端时带上）');
  }

  return '';
}

function line(label: string, from: string, to: string, t: (text: string) => string): string
{
  return label + ' ' + display(from, t) + ' → ' + display(to, t);
}

/** 空串统一说成「默认」而不是留白。 */
function display(value: string, t: (text: string) => string): string
{
  return value.length > 0 ? value : t('默认');
}

// ── 终端输入行里有没有还没发出去的东西 ───────────────────────────────────────

/** TUI 输入框的上下边框，形如 ─────────。 */
const RULE = /^[\u2500-\u257f]{8,}$/;

/** 输入行开头的提示符。 */
const PROMPT = /^\s*[>\u276f\u203a]\s*/;

export function isRuleLine(text: string): boolean
{
  return RULE.test(text.trim());
}

/** 输入框里是不是空的。 */
export function composerIsEmpty(rows: readonly string[]): boolean
{
  return rows.length > 0 && rows.every((row) => row.replace(PROMPT, '').trim() === '');
}

// ── 权限模式：读底栏、按 shift+tab ────────────────────────────────────────────

/** shift+tab。 */
export const CYCLE_KEY = '\u001b[Z';

/**
 * 底栏上的模式字样 → 下拉里的取值。
 *
 * 逐条对着 CLI 自己那张表抄的（claude.exe 里的 indicator 字段，2026-08-22 那版）：
 * 底栏画的是「<图标> <indicator> on…」，六档一档不少。原先只列了四档，
 * 少的那两档（bypass permissions / don't ask）**读出来是 null**，
 * 于是「终端现在在哪一档」认不出来，按 shift+tab 转档那条路整条哑掉。
 */
const FOOTER_MODES: ReadonlyArray<{ marker: string; value: string }> = [
  { marker: 'accept edits', value: 'acceptEdits' },
  { marker: 'bypass permissions', value: 'bypassPermissions' },
  { marker: "don't ask", value: 'dontAsk' },
  { marker: '’t ask', value: 'dontAsk' },
  { marker: 'plan mode', value: 'plan' },
  { marker: 'auto mode', value: 'auto' },
  { marker: 'manual mode', value: 'manual' },
];

/** 底栏那两个小图标：⏵（放行）与 ⏸（暂停）。 */
const FOOTER_GLYPH = /[⏵⏸]/;

/** 从屏幕上读出终端当前的权限模式；读不出来返回 null。 */
export function readPermissionMode(rows: readonly string[]): string | null
{
  for (let i = rows.length - 1; i >= 0; i--)
  {
    const row = rows[i];

    if (!FOOTER_GLYPH.test(row))
    {
      continue;
    }

    const hit = FOOTER_MODES.find((mode) => row.indexOf(mode.marker) >= 0);

    if (hit !== undefined)
    {
      return hit.value;
    }
  }

  return null;
}

/**
 * 「危险模式」和「绕过权限」在 TUI 里是同一档，只是名字两个：
 * 前者是 <c>--dangerously-skip-permissions</c>，进程起来之后底栏一样写 bypass permissions。
 * 不归一的话，用危险模式起的终端会永远显示一条切不掉的漂移提示。
 */
export function normalizePermission(value: string): string
{
  return value === 'dangerously' ? 'bypassPermissions' : value;
}

/**
 * shift+tab 的环。抄自 CLI 自己的换档函数：
 * manual → acceptEdits → plan →（有的话）bypassPermissions →（有的话）auto → manual。
 *
 * 这三档任何会话里都在环上。auto 另有开关（外面看不出来），先当它在、
 * 按键转一圈让终端自己回答，转不到再落回「重启才生效」。
 * dontAsk 一档都不在——CLI 里没有任何一档转得到它。
 */
const CYCLE_RING: readonly string[] = [
  'manual',
  'acceptEdits',
  'plan',
  'auto',
];

/**
 * 这一档能不能靠 shift+tab 转过去。
 *
 * <c>launched</c> 是起这一路终端时用的档位，bypassPermissions 要看它：CLI 里
 * <c>isBypassPermissionsModeAvailable = 起时就是 bypassPermissions 或带了
 * --dangerously-skip-permissions</c>，只有这样它才上环。所以从别的档按 shift+tab
 * **永远**转不到这一档——原生终端里也一样，不是这个界面缺了什么。
 * 真机复核（2026-08-22）：以 acceptEdits 起的终端，环就是
 * accept edits → plan mode → manual mode → accept edits，没有 bypass 这一站。
 */
export function isCyclablePermission(value: string, launched = ''): boolean
{
  const want = normalizePermission(value);

  if (want === 'bypassPermissions')
  {
    return normalizePermission(launched) === 'bypassPermissions';
  }

  return CYCLE_RING.indexOf(want) >= 0;
}

/** 环最长五档；多给一倍余量，够转回原处，也不至于失手时一直按下去。 */
export const MAX_CYCLE_PRESSES = 12;
