// 落点表。
//
// 「被拒命令都有落点」那条完整性断言在 C# 侧（RejectedCommandCoverageTests：它能直接读实测台账的
// fixture，而 vite 的 glob 到不了仓库根）。这里管三件前端自己的事：
//  1. 取落点的规则（带参数不截获、原型属性不误判）；
//  2. 三类落点各自的形状对得上（动作有 action、面板有 panelId、说明只有 note）；
//  3. **每条说明都有英文**——说明是给用户看的正文，缺翻译会让英文界面悄悄退回中文。

import { describe, it, expect } from 'vitest';
import { fallbackFor, hasFallback, rejectionNoteFor, rejectionNoteNames, FALLBACK_COMMAND_NAMES } from './commandFallbacks';
import { panelIdForCommand } from './panelCommands';
import { englishKeys } from './i18n';

describe('取落点的规则', () => {
  it('认得出动作型落点', () => {
    expect(fallbackFor('/copy')?.action).toBe('copyLast');
    // /export 现在真落盘（宿主写文件），/copy 才是剪贴板
    expect(fallbackFor('/export')?.action).toBe('exportTranscript');
    expect(fallbackFor('/plan')?.action).toBe('planMode');
    expect(fallbackFor('/stop')?.action).toBe('interrupt');
  });

  it('认得出面板型落点', () => {
    expect(fallbackFor('/hooks')?.panelId).toBe('settingsFiles');
    expect(fallbackFor('/sandbox')?.panelId).toBe('settingsFiles');
    expect(fallbackFor('/add-dir')?.panelId).toBe('permissions');
    expect(fallbackFor('/branch')?.panelId).toBe('sessions');
    expect(fallbackFor('/pause-memory')?.panelId).toBe('memory');
  });

  it('说明型落点只有 note，不带动作也不带面板', () => {
    const fallback = fallbackFor('/ide');

    expect(fallback).not.toBeNull();
    expect(fallback?.action).toBeUndefined();
    expect(fallback?.panelId).toBeUndefined();
    expect(fallback?.note.length).toBeGreaterThan(10);
  });

  it('前后空白照样认，前缀不是斜杠就不认', () => {
    expect(fallbackFor('  /copy  ')?.action).toBe('copyLast');
    expect(fallbackFor('copy')).toBeNull();
    expect(fallbackFor('请帮我 /copy')).toBeNull();
  });

  it('带参数的交给 CLI——落点处理不了参数，截住等于把功能吃掉', () => {
    expect(fallbackFor('/export file.md')).toBeNull();
    expect(fallbackFor('/hooks add')).toBeNull();
    expect(fallbackFor('/plan now')).toBeNull();
  });

  it('/copy N 是唯一例外：参数校验成正整数，只当本地转录的下标用', () => {
    // 为什么敢开这个例外：这个数字不进命令行、不进路径，只用来在本地转录里数第几条。
    // 换成会写文件或拼命令行的动作就不能这么放行。
    expect(fallbackFor('/copy 2')).toEqual({
      action: 'copyLast',
      arg: 2,
      note: '已把倒数第 {n} 条回复复制到剪贴板。',
    });
    expect(fallbackFor('/copy 1')?.arg).toBe(1);
    expect(fallbackFor('/copy 10')?.arg).toBe(10);
  });

  it('/copy 的非正整数参数照旧交给 CLI', () => {
    for (const text of ['/copy 0', '/copy -1', '/copy abc', '/copy 2 3', '/copy 1.5', '/copy 99999']) {
      expect(fallbackFor(text), text).toBeNull();
    }
  });

  it('数字参数只对 /copy 有效，别的命令照旧不截获', () => {
    for (const text of ['/export 2', '/plan 1', '/stop 3', '/hooks 1']) {
      expect(fallbackFor(text), text).toBeNull();
    }
  });

  it('原型属性不会被误判成落点', () => {
    // 表用 Object.create(null) 起底。若用普通字面量，/constructor 会拿到函数对象（truthy），
    // 调用方按真值判断就会以为命中落点，既不发给 CLI 也不做事——「输了没反应」。
    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(fallbackFor('/' + name)).toBeNull();
    }
  });

  it('hasFallback 把「已做成面板」也算作有落点', () => {
    expect(hasFallback('permissions')).toBe(true);   // 面板表里
    expect(hasFallback('ide')).toBe(true);           // 落点表里
    expect(hasFallback('模型')).toBe(false);
  });
});

describe('补全只推荐真能做事的落点', () => {
  it('列进补全的每一条都确实是动作或面板', () => {
    for (const name of FALLBACK_COMMAND_NAMES) {
      const fallback = fallbackFor('/' + name);
      expect(fallback, name).not.toBeNull();
      expect(
        fallback?.action !== undefined || fallback?.panelId !== undefined,
        `${name} 只有说明，不该出现在补全里`,
      ).toBe(true);
    }
  });

  it('只有说明的命令不进补全（死胡同不当功能推荐）', () => {
    for (const name of ['ide', 'cd', 'diff', 'chrome', 'stickers']) {
      expect(FALLBACK_COMMAND_NAMES).not.toContain(name);
    }
  });
});

describe('说明文案有英文', () => {
  it('每条 note 都能查到英文，不会让英文界面退回中文', () => {
    const keys = new Set(englishKeys());

    // 这些名字覆盖了全部说明常量与内联说明（每组取一条即可，同组共用同一份文案）。
    const samples = [
      'copy', 'export', 'plan', 'stop',
      'add-dir', 'hooks', 'pause-memory', 'branch', 'subtask',
      'theme', 'keybindings', 'chrome', 'remote', 'stickers', 'wellbeing',
      'background', 'exit', 'tasks', 'loops', 'diff', 'cd', 'ide', 'btw', 'reload-plugins',
    ];

    const missing = samples.filter((name) => {
      const note = fallbackFor('/' + name)?.note ?? '';
      return note !== '' && !keys.has(note);
    });

    expect(missing, `这些命令的说明缺英文词条：${missing.join(', ')}`).toEqual([]);
  });
});

describe('与面板表不重叠', () => {
  it('同一个名字不会两张表都收（否则落点表那条永远不生效）', () => {
    for (const name of ['copy', 'hooks', 'ide', 'plan', 'branch']) {
      expect(panelIdForCommand('/' + name), name).toBeNull();
    }
  });
});

describe('CLI 拒了之后补的说明', () => {
  it('那批故意不拦的命令各有专门说明', () => {
    // 这些命令会改账号 / 改这台机器 / 把数据发出去，没实测过，所以不拦——
    // 照常发给 CLI，拒了才解释。硬拦的风险是「它其实能用，被我们吃掉了」。
    const cases: [string, RegExp][] = [
      ['logout', /终端/],
      ['login', /账号状态/],
      ['setup-bedrock', /认证/],
      ['install', /这台机器/],
      ['install-github-app', /这台机器/],
      ['upgrade', /套餐/],
      ['usage-credits', /额度/],
      ['bug', /Anthropic/],
      ['feedback', /Anthropic/],
    ];

    for (const [name, pattern] of cases) {
      expect(rejectionNoteFor(name), name).toMatch(pattern);
    }
  });

  it('不认得的命令也给一条通用说明，不留一句干话', () => {
    const note = rejectionNoteFor('某个以后才出现的命令');

    expect(note).toMatch(/\/help/);
    expect(note.length).toBeGreaterThan(10);
  });

  it('每条专门说明都有英文', () => {
    const keys = new Set(englishKeys());
    const missing = rejectionNoteNames()
      .map((name) => rejectionNoteFor(name))
      .filter((note) => !keys.has(note));

    expect(missing).toEqual([]);
  });

  it('通用说明也有英文', () => {
    expect(new Set(englishKeys()).has(rejectionNoteFor('不存在的命令'))).toBe(true);
  });
});

describe('带参数撞上 CLI 拒绝时的说明', () => {
  // 带参数的形式一律不截获（参数千变万化，猜错等于把命令改了意思），于是它会真的发给 CLI
  // 并被拒。此时给通用说明是**误导**：那句话说「用 /help 看这里能用的」，
  // 而这条命令本来就能用——只是不能带参数。
  it('本来可用的命令（面板 / 落点）给「去掉参数再打一次」', () => {
    for (const name of ['permissions', 'resume', 'memory', 'copy', 'plan', 'hooks']) {
      expect(rejectionNoteFor(name), name).toMatch(/不带参数/);
    }
  });

  it('真的用不了的命令仍然给专门说明或通用说明', () => {
    expect(rejectionNoteFor('logout')).toMatch(/终端/);
    expect(rejectionNoteFor('某个没听过的命令')).toMatch(/\/help/);
  });

  it('「去掉参数再打一次」也有英文', () => {
    expect(new Set(englishKeys()).has(rejectionNoteFor('permissions'))).toBe(true);
  });
});
