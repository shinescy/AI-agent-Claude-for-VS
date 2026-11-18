import { describe, it, expect } from 'vitest';
import { detectUnavailableCommand } from './unavailableCommands';
import { initialState, reducer } from './state';
import type { AgentEvent } from './types';

function evt(partial: Partial<AgentEvent>): AgentEvent {
  return {
    kind: 'AssistantText', content: '', sessionInfo: null, toolCall: null,
    usageData: null, turnResult: null, rateLimitData: null,
    hookName: '', hookPhase: '', ...partial,
  };
}

describe('识别本环境不可用的命令', () => {
  it('认出真实回复里的命令名', () => {
    // 逐字取自 2026-08-17 实测（CLI 2.1.233）
    expect(detectUnavailableCommand("/plugins isn't available in this environment."))
      .toBe('plugins');
  });

  it('命令名带连字符也认得', () => {
    expect(detectUnavailableCommand("/some-command isn't available in this environment."))
      .toBe('some-command');
  });

  it('普通回复不误判', () => {
    expect(detectUnavailableCommand('这是一段正常回复。')).toBeNull();
    expect(detectUnavailableCommand('')).toBeNull();
  });

  it('只是提到不可用但没有命令名时不认', () => {
    expect(detectUnavailableCommand("isn't available in this environment")).toBeNull();
  });

  it('另一种措辞「Unknown command」也要认', () => {
    // 逐字取自 2026-08-18 实测（CLI 2.1.234）：拒绝有两种说法，
    // 「isn't available」是「有这条命令但本模式不给跑」，
    // 「Unknown command」是「压根没有这条命令」——插件卸载后残留在清单里的就是这一种。
    // 只认前一种时，后一种会一直留在补全里不被划掉，用户每次点中都白发一轮。
    expect(detectUnavailableCommand('Unknown command: /pr-comments')).toBe('pr-comments');
  });

  it('「Unknown command」后面紧跟标点也能切干净', () => {
    expect(detectUnavailableCommand('Unknown command: /foo. 试试 /help。')).toBe('foo');
  });

  it('没有前导斜杠的「Unknown command」不认', () => {
    // 普通对话里也可能出现这几个词，命令名必须带斜杠才算判定。
    expect(detectUnavailableCommand('Unknown command: foo')).toBeNull();
  });

  it('两种措辞同时出现时以「isn\'t available」为准', () => {
    // 这一句才是针对用户刚发的那条命令的判定；后半句往往是在推荐替代做法。
    const text = "/resume isn't available in this environment. Unknown command: /other";
    expect(detectUnavailableCommand(text)).toBe('resume');
  });
});

describe('不可用命令进入状态', () => {
  // 样例用 /vim：它在 CLI 管线下被拒，且**没有**被本扩展截获成面板。
  // 原先用的是 /help，2026-08-18 起 /help 被截获成「命令」面板（/resume 与 /memory 同理），
  // 于是它属于「CLI 说它不可用、而这里其实可用」的那一类，按设计不该进这个清单——
  // 这三条测试因此变红，正是它们该做的事。
  // /vim 是刻意不集成的那几条之一（TUI 的编辑模式，在 WebView 里重做一套 vim 键位不值当）。
  it('从回复里学到并记住', () => {
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ content: "/vim isn't available in this environment." }),
    });

    expect(s.unavailableCommands).toEqual(['vim']);
  });

  it('跨增量拼接后才成句也能认出来', () => {
    // 这句话可能被切在两次 flush 里，只看单条增量会漏掉，
    // 所以判定要在累积后的整块文本上做
    let s = reducer(initialState, { type: 'agentEvent', event: evt({ content: "/vim isn't " }) });
    expect(s.unavailableCommands).toEqual([]);

    s = reducer(s, { type: 'agentEvent', event: evt({ content: 'available in this environment.' }) });
    expect(s.unavailableCommands).toEqual(['vim']);
  });

  it('同一条命令不会重复记录', () => {
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ content: "/vim isn't available in this environment." }),
    });
    s = reducer(s, { type: 'agentEvent', event: evt({ kind: 'TurnCompleted' }) });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({ content: "/vim isn't available in this environment." }),
    });

    expect(s.unavailableCommands).toEqual(['vim']);
  });

  it('正常回复不会往里加东西', () => {
    const s = reducer(initialState, { type: 'agentEvent', event: evt({ content: '好的。' }) });
    expect(s.unavailableCommands).toEqual([]);
  });

  it('面板命令不进不可用清单', () => {
    // CLI 说 /plugins 不可用是对的——**在它那条管线里**确实不可用。但本扩展会把它截获成
    // 原生面板，功能是在的。记进去的后果是补全把一条能用的命令划掉，
    // 用户看到划线就不会去用它了。
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ content: "/plugins isn't available in this environment." }),
    });
    s = reducer(s, { type: 'agentEvent', event: evt({ kind: 'TurnCompleted' }) });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({ content: "/mcp isn't available in this environment." }),
    });

    expect(s.unavailableCommands).toEqual([]);
  });
});

describe('最近一次被拒（供界面补一条具体说明）', () => {
  // 与 unavailableCommands 分工不同：那份是补全用的去重集合（同一条只记一次），
  // 而说明要每次都给——用户第二次打 /logout 时同样需要知道该去终端做。
  it('识别到就记下命令与递增序号', () => {
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ content: "/logout isn't available in this environment." }),
    });

    expect(s.lastUnavailable?.command).toBe('logout');
    expect(s.lastUnavailable?.seq).toBe(1);
  });

  it('同一块文本的后续增量不会把序号刷上去', () => {
    // 判定是在**累积后的整块文本**上做的，后续每条增量都会再次命中同一句拒绝。
    // 不防抖的话，一句话能刷出十几条重复说明。
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ content: "/logout isn't available in this environment." }),
    });
    s = reducer(s, { type: 'agentEvent', event: evt({ content: ' 请在终端里执行。' }) });
    s = reducer(s, { type: 'agentEvent', event: evt({ content: '还有一句。' }) });

    expect(s.lastUnavailable?.seq).toBe(1);
  });

  it('换一轮再被拒时序号加一，说明会再给一次', () => {
    let s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ content: "/logout isn't available in this environment." }),
    });
    s = reducer(s, { type: 'agentEvent', event: evt({ kind: 'TurnCompleted' }) });
    s = reducer(s, {
      type: 'agentEvent',
      event: evt({ content: "/logout isn't available in this environment." }),
    });

    expect(s.lastUnavailable?.seq).toBe(2);
    // 补全清单仍然只记一次
    expect(s.unavailableCommands).toEqual(['logout']);
  });

  it('面板命令撞了 CLI 也要记下来——那是「带了参数」的唯一线索', () => {
    // 不带参数的 /resume 根本到不了 CLI（被截获成面板），所以这句拒绝只可能来自
    // 「/resume xxx」这种带参数的形式。不记的话用户一句说明都拿不到。
    const s = reducer(initialState, {
      type: 'agentEvent',
      event: evt({ content: "/resume isn't available in this environment." }),
    });

    expect(s.lastUnavailable?.command).toBe('resume');

    // 但它**不能**进补全的划掉清单：那会让一条其实可用的命令看起来坏了。
    expect(s.unavailableCommands).toEqual([]);
  });

  it('回灌历史不会触发说明', () => {
    // 那是上个会话里发生过的事，重新挂载后再弹一条说明出来只会莫名其妙。
    const s = reducer(initialState, {
      type: 'replay',
      events: [evt({ content: "/logout isn't available in this environment." })],
    });

    expect(s.lastUnavailable).toBeNull();
  });

  it('正常回复不会留下被拒记录', () => {
    const s = reducer(initialState, { type: 'agentEvent', event: evt({ content: '好的。' }) });
    expect(s.lastUnavailable).toBeNull();
  });
});
