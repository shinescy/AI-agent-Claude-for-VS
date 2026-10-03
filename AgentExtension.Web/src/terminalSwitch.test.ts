// 终端里「直接切」的判定：什么值敢发进 TUI，以及输入行到底空不空。
//
// 这两件事错了都不报错，只是花钱：敢发的判错，TUI 认不出的 /xxx 会被当成一句话
// 交给模型；判空判错，命令会和用户打了一半的句子拼在一起，整段发出去。

import { describe, it, expect } from 'vitest';
import {
  canSwitchLive,
  composerIsEmpty,
  isCyclablePermission,
  isRuleLine,
  normalizePermission,
  readPermissionMode,
  switchCommand,
} from './terminalSwitch';

describe('敢不敢直接发进终端', () =>
{
  it('值在 CLI 自报的清单里才发', () =>
  {
    expect(canSwitchLive('xhigh', ['low', 'medium', 'high', 'xhigh'])).toBe(true);
    expect(canSwitchLive('turbo', ['low', 'medium', 'high', 'xhigh'])).toBe(false);
  });

  it('清单为空时一律不发', () =>
  {
    // 握手没拿到清单。这时候发命令等于拿用户的额度赌 CLI 认不认这个值——
    // 宁可留一条「重启以应用」。
    expect(canSwitchLive('xhigh', [])).toBe(false);
  });

  it('空串不发：TUI 里没有「把参数撤掉」这回事', () =>
  {
    expect(canSwitchLive('', ['low', ''])).toBe(false);
  });

  it('拼出来的就是终端里那一行', () =>
  {
    expect(switchCommand('effort', 'xhigh')).toBe('/effort xhigh');
    expect(switchCommand('model', 'sonnet')).toBe('/model sonnet');
  });
});

describe('输入框判空', () =>
{
  it('只有提示符算空', () =>
  {
    expect(composerIsEmpty(['>  '])).toBe(true);
    expect(composerIsEmpty(['\u276f '])).toBe(true);
  });

  it('提示符后面有字就不算空', () =>
  {
    expect(composerIsEmpty(['> 帮我看看'])).toBe(false);
  });

  it('多行草稿里只要有一行有字就不算空', () =>
  {
    // 实测过的坑：两行草稿按 Ctrl+E、Ctrl+U 只杀掉光标那一行，剩下的会和命令拼在一起。
    // 所以判空要看整个框，不能只看光标那一行。
    expect(composerIsEmpty(['   ', '> q1'])).toBe(false);
  });

  it('一行都没读到时不算空', () =>
  {
    // 没找到输入框的上边框，说明这一屏没看懂。此时「不敢动」才是安全的方向。
    expect(composerIsEmpty([])).toBe(false);
  });

  it('缩进不算空', () =>
  {
    expect(composerIsEmpty(['>     贴进来的代码'])).toBe(false);
  });
});

describe('输入框的边框', () =>
{
  it('认出那条横线', () =>
  {
    expect(isRuleLine('\u2500'.repeat(40))).toBe(true);
    expect(isRuleLine('  ' + '\u2500'.repeat(12) + '  ')).toBe(true);
  });

  it('普通文字不是边框', () =>
  {
    expect(isRuleLine('> 帮我看看')).toBe(false);
    expect(isRuleLine('---------------')).toBe(false);
    expect(isRuleLine('')).toBe(false);
  });

  it('太短的不算——转录里的分隔符可能只有几个字符', () =>
  {
    expect(isRuleLine('\u2500\u2500\u2500')).toBe(false);
  });
});

describe('从底栏读权限模式', () =>
{
  // 前四行逐字取自真机（2026-08-21，CLI 2.1.238）。
  // 后两行按 CLI 自己那张表补的：底栏统一画成「<图标> <indicator> on…」，
  // 六档的 indicator 依次是 manual mode / plan mode / accept edits /
  // bypass permissions / don't ask / auto mode（读的是 2026-08-22 那版 claude.exe）。
  const FOOTER = {
    acceptEdits: '  ⏵⏵ accept edits on (shift+tab to cycle)              /rc',
    plan: '  ⏸ plan mode on (shift+tab to cycle)                    /rc',
    auto: '  ⏵⏵ auto mode on (shift+tab to cycle)                /rc',
    manual: '  ⏸ manual mode on · ? for shortcuts                   /rc',
    bypass: '  ⏵⏵ bypass permissions on (shift+tab to cycle)         /rc',
    dontAsk: "  ⏵⏵ don't ask on · ? for shortcuts                      /rc",
  };

  it('六档都认得出来', () =>
  {
    expect(readPermissionMode([FOOTER.acceptEdits])).toBe('acceptEdits');
    expect(readPermissionMode([FOOTER.plan])).toBe('plan');
    expect(readPermissionMode([FOOTER.auto])).toBe('auto');
    expect(readPermissionMode([FOOTER.manual])).toBe('manual');
    expect(readPermissionMode([FOOTER.bypass])).toBe('bypassPermissions');
    expect(readPermissionMode([FOOTER.dontAsk])).toBe('dontAsk');
  });

  it('弯引号的 don’t ask 也认——终端字体里这个撇号两种写法都出现过', () =>
  {
    expect(readPermissionMode(['  ⏵⏵ don’t ask on'])).toBe('dontAsk');
  });

  it('少认一档就等于整条转档路哑掉', () =>
  {
    // 这两档原先不在表里，读出来是 null。而「读不出当前档」在转档那条路上
    // 直接 return——下拉动了、终端一动不动、且一个字都不提示。
    expect(readPermissionMode([FOOTER.bypass])).not.toBeNull();
    expect(readPermissionMode([FOOTER.dontAsk])).not.toBeNull();
  });

  it('没有底栏图标的行不算——转录里随便一句话都可能带上这些字样', () =>
  {
    // 这个值会被拿去决定要不要继续按键，认错了就是替用户改设置。
    expect(readPermissionMode(['> 讲讲 plan mode 是干什么的'])).toBeNull();
    expect(readPermissionMode(['⏸ 说明里提到 accept edits 但这行没模式字样'])).toBe('acceptEdits');
  });

  it('读不出来就是 null，不猜一个默认值', () =>
  {
    expect(readPermissionMode([])).toBeNull();
    expect(readPermissionMode(['', '  ', '> '])).toBeNull();
  });

  it('取最靠下的那一行——底栏在屏幕最下面', () =>
  {
    expect(readPermissionMode([FOOTER.plan, FOOTER.auto])).toBe('auto');
  });
});

describe('哪些权限模式转得到', () =>
{
  // 环的形状抄自 CLI 自己的换档函数（2026-08-22 那版 claude.exe）：
  // manual → acceptEdits → plan →（有的话）bypassPermissions →（有的话）auto → manual。
  it('这几档任何会话里都转得到', () =>
  {
    expect(isCyclablePermission('acceptEdits')).toBe(true);
    expect(isCyclablePermission('plan')).toBe(true);
    expect(isCyclablePermission('manual')).toBe(true);
    // auto 另有开关，外面看不出来：先当它在环上，转不到再落回重启。
    expect(isCyclablePermission('auto')).toBe(true);
  });

  it('绕过权限只在「起终端时就带着它」的会话里才上环', () =>
  {
    // CLI 里 isBypassPermissionsModeAvailable = 起时就是 bypassPermissions
    // 或带了 --dangerously-skip-permissions。真机复核：以 acceptEdits 起的终端，
    // 环是 accept edits → plan mode → manual mode → accept edits，没有 bypass 这一站。
    expect(isCyclablePermission('bypassPermissions', 'acceptEdits')).toBe(false);
    expect(isCyclablePermission('bypassPermissions', 'plan')).toBe(false);
    expect(isCyclablePermission('bypassPermissions', 'bypassPermissions')).toBe(true);
  });

  it('危险模式就是绕过权限那一档，两边都归一', () =>
  {
    // 只是启动参数写法不同（--dangerously-skip-permissions），进程起来底栏写的是同一句。
    expect(normalizePermission('dangerously')).toBe('bypassPermissions');
    expect(normalizePermission('plan')).toBe('plan');
    expect(isCyclablePermission('dangerously', 'bypassPermissions')).toBe(true);
    expect(isCyclablePermission('bypassPermissions', 'dangerously')).toBe(true);
    expect(isCyclablePermission('dangerously', 'acceptEdits')).toBe(false);
  });

  it('dontAsk 转不到——CLI 里没有任何一档转得过去，只能靠启动参数进', () =>
  {
    expect(isCyclablePermission('dontAsk', 'acceptEdits')).toBe(false);
    expect(isCyclablePermission('dontAsk', 'dontAsk')).toBe(false);
    expect(isCyclablePermission('')).toBe(false);
  });
});
