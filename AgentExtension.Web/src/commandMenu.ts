// 命令菜单的纯逻辑：快捷动作目录 + slash 命令，按查询过滤并分组。

import type { SlashCommandInfo } from './types';
import { panelIdForCommand } from './panelCommands';

/**
 * 选中之后做什么。快捷动作一律走原生界面，**不往对话里发命令**：
 * insert 填进输入框；panel 打开面板；action 交给宿主做一件事；
 * submenu 展开二级选项；choice 是二级选项里的一项；run 直接执行这条 slash 命令。
 */
export type MenuItemKind =
  'insert' | 'run' | 'panel' | 'action' | 'submenu' | 'choice' | 'attach' | 'mention';

/** 菜单里的一行。 */
export interface MenuItem {
  id: string;
  label: string;
  description: string;
  section: string;
  kind: MenuItemKind;
  /** insert 是命令名；panel 是面板 id；action / submenu 是其 id；choice 是取值。 */
  command: string;
  /** 行尾的灰字（当前值、勾选）。 */
  trailing?: string;
  /** 英文小写关键词：只用来匹配查询，不显示。 */
  keywords?: string[];
}

/** 二级选项里的一项。 */
export interface MenuChoice {
  value: string;
  label: string;
  description: string;
  current: boolean;
}

/** 菜单背后真正做事的一方（由 App 提供）。 */
export interface MenuHost {
  openPanel: (panelId: string) => void;
  /** newSession：开新会话；export：导出转录；account：账号与用量；sessions：会话小弹层。 */
  runAction: (actionId: string) => void;
  /** 取二级选项：model / effort。 */
  choices: (submenuId: string) => MenuChoice[];
  pick: (submenuId: string, value: string) => void;
  /** Ultracode 开关；visible 为假（或不给）时菜单里不列这一项。 */
  ultracode?: { visible: boolean; on: boolean; toggle: () => void };
}

type Translate = (zhText: string) => string;

/** Ultracode 那一行的 id：行尾是开关，选中只切换、不关菜单。 */
export const ULTRACODE_ITEM_ID = 'action:ultracode';

/** 这一行是不是 Ultracode 开关。 */
export function isUltracodeItem(item: MenuItem): boolean {
  return item.id === ULTRACODE_ITEM_ID;
}

/**
 * 快捷动作：不依赖会话是否已启动，进程没起也能列出来。
 * ultracode 为真时在「思考强度」下面多列一行开关。
 */
export function quickActions(t: Translate, ultracode = false): MenuItem[] {
  const context = t('上下文');
  const model = t('模型');
  const customize = t('自定义');
  const settings = t('设置与支持');

  const item = (
    section: string, kind: MenuItemKind, command: string, label: string, description: string,
    keywords: string[] = []): MenuItem => (
    { id: `${kind}:${command}`, label, description, section, kind, command, keywords });

  const ultracodeRow = ultracode
    ? [item(model, 'action', 'ultracode', 'Ultracode', t('每个任务都用动态工作流编排（仅本次会话）'), ['ultracode'])]
    : [];

  return [
    item(context, 'attach', '', t('附加文件…'), t('挑一个文件插入 @ 引用'), ['attach', 'file']),
    item(context, 'mention', '', t('引用项目文件…'), t('输入 @ 搜索并引用项目里的文件'), ['mention', 'file']),
    item(context, 'action', 'newSession', t('清空对话'), t('丢掉上下文，开一条新会话'), ['clear', 'new']),
    item(context, 'action', 'sessions', t('恢复会话…'), t('搜索并接回以前的会话'),
      ['resume', 'continue', 'conversation', 'history']),
    item(context, 'panel', 'fileHistory', t('回滚文件…'), t('把文件还原到之前的版本'),
      ['rewind', 'restore', 'rollback', 'checkpoint', 'undo']),
    item(context, 'action', 'export', t('导出对话'), t('把整段转录导出成 Markdown 文件'), ['export']),
    item(context, 'action', 'background', t('转到后台'), t('把正在跑的命令或子代理转到后台继续'), ['background', 'bg']),
    item(context, 'action', 'btw', t('侧问…'), t('另问一句，不打断当前对话'), ['btw', 'side', 'question']),
    item(context, 'action', 'bookmarks', t('书签'), t('收藏过的回复，点开能跳回原位置'), ['bookmarks', 'bookmark', 'star']),
    item(context, 'action', 'focusView', t('专注视图'), t('隐藏工具调用与思考，只看问与答；再选一次恢复'),
      ['focus', 'hide', 'tools']),

    item(model, 'submenu', 'model', t('切换模型…'), t('更换这条会话使用的模型'), ['model', 'switch']),
    item(model, 'submenu', 'effort', t('思考强度…'), t('调整模型的思考强度'), ['effort', 'thinking']),
    ...ultracodeRow,
    item(model, 'action', 'account', t('账号与用量'), t('登录账号、订阅与额度用量'),
      ['usage', 'account']),

    item(customize, 'panel', 'mcp', t('MCP 服务器'), t('查看与管理 MCP 服务器'), ['mcp', 'servers']),
    item(customize, 'panel', 'plugin', t('插件'), t('安装、启用或停用插件'), ['plugin', 'plugins']),
    item(customize, 'action', 'reloadPlugins', t('重载插件'), t('不重开会话就重新加载插件'), ['reload-plugins', 'reload']),
    item(customize, 'panel', 'agents', t('子代理'), t('查看可用的子代理'), ['agents', 'subagents']),
    item(customize, 'action', 'skills', t('技能'), t('查看技能并逐个开关'), ['skills', 'skill']),
    item(customize, 'action', 'memory', t('记忆'), t('自动记忆开关，以及会读到的说明文件与记忆'), ['memory']),
    item(customize, 'action', 'sandbox', t('沙箱'), t('命令沙箱的支持情况与设置'), ['sandbox']),
    item(customize, 'action', 'permissionRules', t('权限规则'), t('查看并增删允许、拒绝与询问规则'),
      ['permissions', 'rules', 'allowed-tools']),
    item(customize, 'action', 'hooks', t('钩子'), t('查看、添加、编辑与删除钩子'), ['hooks']),
    item(customize, 'panel', 'settingsFiles', t('钩子与设置文件'), t('查看各作用域的 settings.json 与钩子配置'),
      ['hooks', 'settings']),

    item(settings, 'action', 'login', t('登录 / 切换账号'), t('用 Claude 订阅或 Console 账号登录'),
      ['login', 'switch', 'account']),
    item(settings, 'action', 'logout', t('退出登录'), t('清掉这台电脑上保存的登录凭据'), ['logout', 'sign out']),
    item(settings, 'action', 'chrome', t('Chrome 浏览器'), t('让 Claude 操作你的 Chrome 浏览器'), ['chrome', 'browser']),
    item(settings, 'action', 'designLogin', t('Claude Design 登录'), t('授权访问设计系统'), ['design-login', 'design']),
    item(settings, 'action', 'feedback', t('反馈'), t('报告问题或提建议，发送前会确认'), ['bug', 'feedback']),
    item(settings, 'panel', 'doctor', t('诊断'), t('检查 CLI 的安装与配置'), ['doctor', 'diagnose']),
    item(settings, 'panel', 'terminal', t('打开终端'), t('切到完整的终端界面'), ['terminal']),
    item(settings, 'panel', 'commands', t('全部命令'), t('浏览所有 slash 命令及其说明'), ['commands', 'help']),
  ];
}

/** 把二级选项变成菜单行，按查询过滤。 */
export function choiceItems(choices: MenuChoice[], section: string, query: string): MenuItem[] {
  const q = query.trim().toLowerCase();

  return choices
    .filter((choice) => q === ''
      || choice.label.toLowerCase().includes(q) || choice.value.toLowerCase().includes(q))
    .map((choice) => ({
      id: `choice:${choice.value}`,
      label: choice.label,
      description: choice.description,
      section,
      kind: 'choice' as const,
      command: choice.value,
      trailing: choice.current ? '✓' : undefined,
    }));
}
/** 有原生界面的 slash 命令：选中后不发给 CLI。 */
const NATIVE_SLASH: Record<string, { kind: MenuItemKind; command: string }> = {
  model: { kind: 'submenu', command: 'model' },
  effort: { kind: 'submenu', command: 'effort' },
  usage: { kind: 'action', command: 'account' },
  login: { kind: 'action', command: 'login' },
  logout: { kind: 'action', command: 'logout' },
  btw: { kind: 'action', command: 'btw' },
  skills: { kind: 'action', command: 'skills' },
  memory: { kind: 'action', command: 'memory' },
  sandbox: { kind: 'action', command: 'sandbox' },
  'reload-plugins': { kind: 'action', command: 'reloadPlugins' },
  background: { kind: 'action', command: 'background' },
  bg: { kind: 'action', command: 'background' },
  bug: { kind: 'action', command: 'feedback' },
  feedback: { kind: 'action', command: 'feedback' },
  'design-login': { kind: 'action', command: 'designLogin' },
  hooks: { kind: 'action', command: 'hooks' },
  chrome: { kind: 'action', command: 'chrome' },
  permissions: { kind: 'action', command: 'permissionRules' },
  'allowed-tools': { kind: 'action', command: 'permissionRules' },
  clear: { kind: 'action', command: 'newSession' },
  resume: { kind: 'action', command: 'sessions' },
};

/** 按名字取原生去向；只认自己的键，免得 /constructor 之类撞上原型。 */
function nativeOf(name: string): { kind: MenuItemKind; command: string } | undefined {
  return Object.prototype.hasOwnProperty.call(NATIVE_SLASH, name) ? NATIVE_SLASH[name] : undefined;
}

/** 整条输入恰好是一条有原生界面的命令时给出它的去向，否则 null。 */
export function nativeSlashFor(text: string): { kind: MenuItemKind; command: string } | null {
  const match = /^\/([a-z-]+)$/.exec(text.trim());
  return match ? nativeOf(match[1]) ?? null : null;
}

/** 一条 slash 命令的去向（与快捷动作的 id 同形）；没有原生去向时 null。 */
function targetOfName(name: string): string | null {
  const native = nativeOf(name);

  if (native !== undefined)
  {
    return `${native.kind}:${native.command}`;
  }

  if (name === 'export')
  {
    return 'action:export';
  }

  const panelId = panelIdForCommand(`/${name}`);
  return panelId === null ? null : `panel:${panelId}`;
}

/** 与这条快捷动作做同一件事的 slash 命令名；没有则 null。 */
export function slashEquivalent(item: MenuItem, commands: string[]): string | null {
  const name = commands.find((candidate) => targetOfName(candidate) === item.id);
  return name ?? null;
}

/** 这一行是不是 slash 命令（而非快捷动作）。 */
export function isSlashItem(item: MenuItem): boolean {
  return item.id.startsWith('slash:');
}

/** slash 行对应的命令名。 */
export function slashName(item: MenuItem): string {
  return item.id.slice('slash:'.length);
}

/**
 * 参数提示是否意味着必须填参数。
 * 方括号括起的（可嵌套）与写明 optional 的都可不填，如 /compact 的压缩说明。
 */
export function requiresArgs(hint: string): boolean {
  if (hint.trim() === '' || /optional/i.test(hint)) {
    return false;
  }

  let rest = hint;
  let previous = '';

  while (rest !== previous) {
    previous = rest;
    rest = rest.replace(/\[[^[\]]*\]/g, '');
  }

  const required = rest.trim() !== '';
  return required;
}

/**
 * 把命令名清单变成菜单行，说明取 CLI 报的那份。
 * direct 为真时选中即执行（要参数的仍填进输入框）；为假时一律填进输入框。
 */
export function slashItems(
  commands: string[], infos: SlashCommandInfo[], section: string, direct = false): MenuItem[] {
  const known = new Map<string, SlashCommandInfo>();

  for (const info of infos) {
    known.set(info.name, info);
  }

  return commands.map((name) => {
    const info = known.get(name);
    const native = direct ? nativeOf(name) : undefined;
    const needsArgs = requiresArgs(info?.argumentHint ?? '');
    const kind: MenuItemKind = native?.kind ?? (direct && !needsArgs ? 'run' : 'insert');

    return {
      id: `slash:${name}`,
      label: `/${name}`,
      description: info?.description ?? '',
      section,
      kind,
      command: native?.command ?? name,
    };
  });
}

/** 匹配档位：越小越靠前；NO_MATCH 是没命中。 */
const TIER_EXACT = 0;
const TIER_PREFIX = 1;
const TIER_CONTAINS = 2;
const TIER_DESCRIPTION = 3;
const NO_MATCH = 4;

/** 名字拆词用的分隔符。 */
const WORD_BREAK = /[:_\s-]+/;

/** 一行参与匹配的名字：标题（去掉斜杠与省略号）加关键词，全小写。 */
function matchNames(item: MenuItem): string[] {
  const label = item.label.toLowerCase().replace(/^\//, '').replace(/…$/, '');
  return [label, ...(item.keywords ?? [])];
}

/** 一行对查询（已小写、不含斜杠）的匹配档位。 */
export function matchTier(item: MenuItem, q: string): number {
  const names = matchNames(item);

  if (names.some((name) => name === q))
  {
    return TIER_EXACT;
  }

  if (names.some((name) => name.split(WORD_BREAK).some((word) => word.startsWith(q))))
  {
    return TIER_PREFIX;
  }

  if (names.some((name) => name.includes(q)))
  {
    return TIER_CONTAINS;
  }

  return item.description.toLowerCase().includes(q) ? TIER_DESCRIPTION : NO_MATCH;
}

/** slash 行的去向；要填参数的（insert）不算有去向。 */
function slashTarget(item: MenuItem): string | null {
  if (!isSlashItem(item) || item.kind === 'insert')
  {
    return null;
  }

  return item.kind === 'run' ? targetOfName(slashName(item)) : `${item.kind}:${item.command}`;
}

/** 去掉与在列快捷动作同一去向的 slash 行，只留快捷动作。 */
function dropDuplicateSlash(items: MenuItem[]): MenuItem[] {
  const actionIds = new Set(items.filter((item) => !isSlashItem(item)).map((item) => item.id));

  return items.filter((item) =>
  {
    const target = slashTarget(item);
    return target === null || !actionIds.has(target);
  });
}

/** 同档内的先后：同去向命令也命中的快捷动作、slash 命令、其余快捷动作。 */
function orderInTier(item: MenuItem, tier: number, slashTiers: Map<string, number>): number {
  if (isSlashItem(item))
  {
    return 1;
  }

  // 同去向的命令得命中得一样好才算，只靠说明沾边的不算。
  const slashTier = slashTiers.get(item.id);
  return slashTier !== undefined && slashTier <= tier ? 0 : 2;
}

/**
 * 拼出菜单的平铺清单（同一分组的行相邻）。
 *
 * 没有查询时快捷动作在前、slash 命令在后。有查询时按匹配档位排：
 * 全等、词首、子串、说明；分组先后取各组第一条命中的位置。
 * 同档里只靠关键词命中的快捷动作排在 slash 命令后面，免得抢回车。
 */
export function buildMenu(
  actions: MenuItem[],
  commands: string[],
  infos: SlashCommandInfo[],
  query: string,
  slashSection: string,
  direct = false): MenuItem[] {
  const q = query.trim().replace(/^\//, '').toLowerCase();
  const all = [...actions, ...slashItems(commands, infos, slashSection, direct)];

  if (q === '')
  {
    return dropDuplicateSlash(all);
  }

  const matched = all
    .map((item) => ({ item, tier: matchTier(item, q) }))
    .filter((entry) => entry.tier < NO_MATCH);
  const slashTiers = new Map<string, number>();

  for (const entry of matched)
  {
    // 排先后时要填参数的命令也算同去向，只是不会被去掉。
    const target = isSlashItem(entry.item) ? targetOfName(slashName(entry.item)) : null;

    if (target !== null)
    {
      slashTiers.set(target, Math.min(entry.tier, slashTiers.get(target) ?? NO_MATCH));
    }
  }

  // 排序是稳定的：档位与同档先后都相同时保持原顺序。
  const ranked = matched.sort((a, b) =>
    a.tier - b.tier
    || orderInTier(a.item, a.tier, slashTiers) - orderInTier(b.item, b.tier, slashTiers));
  const kept = new Set(dropDuplicateSlash(ranked.map((entry) => entry.item)));
  const sections: string[] = [];

  for (const entry of ranked)
  {
    if (kept.has(entry.item) && !sections.includes(entry.item.section))
    {
      sections.push(entry.item.section);
    }
  }

  const grouped = sections.flatMap((section) =>
    ranked.filter((entry) => kept.has(entry.item) && entry.item.section === section).map((entry) => entry.item));
  return grouped;
}
