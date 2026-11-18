// 固定提示词与内容的拼接。两个输入框（对话 / 终端）共用这一份。
//
// 拼接是这件事里唯一有歧义的地方：两边各自为空时该发什么、中间隔几行、
// 提示词末尾的空白算不算。这几条错了都不报错，只会让送出去的东西
// 和你以为的差一点——而终端里多一个换行就是多按一次回车。

import { describe, it, expect } from 'vitest';
import {
  hasPrompt,
  joinPromptAndContent,
  leadingCommand,
  loadPrompt,
  savePrompt,
} from './composerPrompt';
import type { StorageLike } from './composerPrompt';

/** 一个内存存储，免得用例互相污染。 */
function memory(initial: Record<string, string> = {}): StorageLike
{
  const map = new Map(Object.entries(initial));

  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
  };
}

describe('提示词与内容拼接', () =>
{
  it('提示词在前，内容在后', () =>
  {
    expect(joinPromptAndContent('用中文回答', '解释这段代码')).toBe('用中文回答\n解释这段代码');
  });

  it('只用一个换行分开，不留空行', () =>
  {
    // TUI 的输入区按行显示，多一个空行只是把可视区往上顶。
    const joined = joinPromptAndContent('前缀', '正文');

    expect(joined.split('\n')).toEqual(['前缀', '正文']);
  });

  it('提示词末尾的空白削掉', () =>
  {
    // 编辑模板时很容易多留一个换行，不削的话内容前面会平白多出一个空行，
    // 而你在框里看不出来。
    expect(joinPromptAndContent('前缀\n\n  ', '正文')).toBe('前缀\n正文');
  });

  it('提示词为空就只发内容，不带头一个换行', () =>
  {
    // 带一个孤零零的换行等于在终端里多按一次回车。
    expect(joinPromptAndContent('', '正文')).toBe('正文');
    expect(joinPromptAndContent('   \n ', '正文')).toBe('正文');
  });

  it('内容为空就只发提示词', () =>
  {
    expect(joinPromptAndContent('前缀', '')).toBe('前缀');
  });

  it('两边都空就是空串——空回车在 TUI 里是有意义的', () =>
  {
    expect(joinPromptAndContent('', '')).toBe('');
  });

  it('内容里的换行原样保留', () =>
  {
    // 多行提示词是常见用法，拼接不该动内容本身。
    expect(joinPromptAndContent('前缀', '第一行\n第二行')).toBe('前缀\n第一行\n第二行');
  });

  it('内容开头的空白不动', () =>
  {
    // 缩进可能是内容的一部分（贴一段代码），削掉就改了用户要发的东西。
    expect(joinPromptAndContent('前缀', '    缩进')).toBe('前缀\n    缩进');
  });
});

describe('提示词存取', () =>
{
  it('存下来能读回去', () =>
  {
    const store = memory();
    savePrompt('terminal', '用中文回答', store);

    expect(loadPrompt('terminal', store)).toBe('用中文回答');
  });

  it('两格各存各的，互不串味', () =>
  {
    // 混成一份的表现是：在一边改了模板，另一边下一次发送悄悄跟着变。
    // 这种「我没动过它」的变化最难查，所以这条得钉死。
    const store = memory();

    savePrompt('terminal', '终端的模板', store);
    savePrompt('chat', '对话的模板', store);

    expect(loadPrompt('terminal', store)).toBe('终端的模板');
    expect(loadPrompt('chat', store)).toBe('对话的模板');
  });

  it('终端那条存档键不许改名', () =>
  {
    // 它已经躺在用户的 localStorage 里了。改名等于把人家存了很久的模板悄悄清空，
    // 而且不报错，只是打开面板发现那格空了。
    const store = memory({ 'agent.terminalPrompt': '早就存好的' });

    expect(loadPrompt('terminal', store)).toBe('早就存好的');
  });

  it('没存过读到空串，不是 null', () =>
  {
    // null 塞进 textarea 的 value 会让它变成非受控组件，React 会在控制台报一句
    // 而界面照常显示——又是一次不容易注意到的失效。
    expect(loadPrompt('terminal', memory())).toBe('');
    expect(loadPrompt('chat', memory())).toBe('');
  });

  it('存储抛异常也不炸', () =>
  {
    // localStorage 可能被策略禁用，访问本身就会抛。为一段提示词让整个面板起不来不值得。
    const broken: StorageLike = {
      getItem: () => { throw new Error('禁用了'); },
      setItem: () => { throw new Error('禁用了'); },
    };

    expect(loadPrompt('chat', broken)).toBe('');
    expect(() => savePrompt('chat', 'x', broken)).not.toThrow();
  });
});

describe('开头那条命令', () =>
{
  it('认出独占开头的命令', () =>
  {
    expect(leadingCommand('/help')).toBe('help');
    expect(leadingCommand('/model opus')).toBe('model');
    expect(leadingCommand('/superpowers:brainstorming 想想')).toBe('superpowers:brainstorming');
  });

  it('只看第一行', () =>
  {
    // 拼上提示词之后命令就不在第一行了，那时它本来也不会被当成命令。
    expect(leadingCommand('先说一句\n/help')).toBeNull();
  });

  it('路径不算命令', () =>
  {
    // 命令名后面必须是空白或结尾。路径在这儿会再来一个斜杠，因此不匹配——
    // 否则「看一下 /c/Users/x」这种再普通不过的话会弹出一条莫名其妙的警告。
    expect(leadingCommand('/c/Users/x 看一下')).toBeNull();
    expect(leadingCommand('/usr/bin/env')).toBeNull();
  });

  it('形状对就算，不拿命令清单去核', () =>
  {
    // 故意只看形状。核过一版，结果是警告在最该出现的时候不出现：
    // CLI 报的清单里压根没有 help（只有 ralph-loop:help）。
    // 漏报要花真钱，误报只多一行字，两边代价差着量级。
    expect(leadingCommand('/nonesuch 试试')).toBe('nonesuch');
  });

  it('普通文本不算', () =>
  {
    expect(leadingCommand('看一下 src/App.tsx')).toBeNull();
    expect(leadingCommand('')).toBeNull();
    expect(leadingCommand('/')).toBeNull();
  });
});

describe('提示词判空', () =>
{
  it('末尾空白不算有内容', () =>
  {
    expect(hasPrompt('')).toBe(false);
    expect(hasPrompt('   ' + '\n')).toBe(false);
    expect(hasPrompt('前缀')).toBe(true);
  });
});
