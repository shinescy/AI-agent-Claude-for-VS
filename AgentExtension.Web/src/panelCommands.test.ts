import { describe, it, expect } from 'vitest';
import { panelIdForCommand, withPanelCommands, PANEL_COMMAND_NAMES } from './panelCommands';

describe('slash 命令截获', () => {
  it('认出面板命令及其别名', () => {
    expect(panelIdForCommand('/plugins')).toBe('plugin');
    expect(panelIdForCommand('/plugin')).toBe('plugin');
    expect(panelIdForCommand('/mcp')).toBe('mcp');
    expect(panelIdForCommand('/agents')).toBe('agents');
    expect(panelIdForCommand('/doctor')).toBe('doctor');
  });

  it('容忍首尾空白', () => {
    expect(panelIdForCommand('  /plugins  ')).toBe('plugin');
  });

  it('带参数时不截获', () => {
    // 带参数的用法交给 CLI，面板处理不了，截住等于把功能吃掉。
    expect(panelIdForCommand('/plugin install foo')).toBeNull();
  });

  it('非面板命令不截获', () => {
    expect(panelIdForCommand('/context')).toBeNull();
    expect(panelIdForCommand('/model')).toBeNull();
    expect(panelIdForCommand('普通消息')).toBeNull();
    expect(panelIdForCommand('')).toBeNull();
  });

  it('不误伤前缀相同的命令', () => {
    expect(panelIdForCommand('/mcp-something')).toBeNull();
  });

  it('防止 Object.prototype 污染', () => {
    // Object.prototype 上的属性会被普通对象字面量继承。
    // 若不过滤，hasOwnProperty/constructor/toString 等会被当成命令名而返回函数引用，
    // 导致调用方按 `if (panelId)` 判断时被骗认为命中面板，但拿到的不是字符串 id，
    // 既打不开真实面板（id 对不上 C# 侧目录），又不会把命令转发给 CLI。
    // 结果是「输了没反应，也没报错」——这正是项目明令要防的静默故障。
    expect(panelIdForCommand('/constructor')).toBeNull();
    expect(panelIdForCommand('/__proto__')).toBeNull();
    expect(panelIdForCommand('/toString')).toBeNull();
    expect(panelIdForCommand('/hasOwnProperty')).toBeNull();
    expect(panelIdForCommand('/valueOf')).toBeNull();
  });

  it('resume 与 memory 与 help 都被截获成原生面板', () => {
    // 2026-08-18 逐条实测：这三条在 CLI 那边都回「isn't available in this environment」，
    // 而它们要做的事（挑一条历史会话接回、看改记忆文件、查命令说明）在 IDE 里更好办。
    // 不截获的话，用户打完发出去只会拿到那句拒绝。
    expect(panelIdForCommand('/resume')).toBe('sessions');
    expect(panelIdForCommand('/sessions')).toBe('sessions');
    expect(panelIdForCommand('/memory')).toBe('memory');
    expect(panelIdForCommand('/help')).toBe('commands');
    expect(panelIdForCommand('/commands')).toBe('commands');
  });

  it('补全里出现的是用户熟悉的名字而不是内部面板 id', () => {
    // 面板 id 是 sessions / commands，但用户在终端里记住的是 /resume 与 /help。
    // 补全里给内部 id 等于让人重新学一套名字。
    const merged = withPanelCommands([]);

    expect(merged).toContain('resume');
    expect(merged).toContain('memory');
    expect(merged).toContain('help');
    expect(merged).not.toContain('sessions');
    expect(merged).not.toContain('commands');
  });

  it('CLI 报来的别名不会与补进去的规范名重复', () => {
    // CLI 哪天开始报 /plugins 或 /resume 时，补全里不该并排出现两个同义项。
    const merged = withPanelCommands(['plugins', 'resume', 'context']);

    expect(merged.filter((c) => c === 'resume')).toHaveLength(1);
    expect(merged).not.toContain('plugins');
    expect(merged).toContain('context');
  });

  it('每个补进补全的名字都真的能被截获', () => {
    // 两处清单分开维护：漏了一处的表现是补全里有这条命令、点了却发给 CLI 被拒。
    for (const name of PANEL_COMMAND_NAMES) {
      expect(panelIdForCommand('/' + name)).not.toBeNull();
    }
  });
});
