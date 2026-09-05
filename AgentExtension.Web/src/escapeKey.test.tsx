// Esc 的去处：在 VS 里它由宿主一律抢下来先给网页（不抢就会被 VS 当成「从工具窗回编辑器」
// 吃掉，补全弹层和命令选项框在 VS 里退不出去）。代价是「Esc 回编辑器」会消失，所以网页
// 用不上时必须把它退回宿主。这里驱动的就是这条回路。
//
// 挂真实的 App，并装一个假的 window.chrome.webview 观察出站消息——出站是这条回路的
// 唯一可见结果，mock 掉 ./bridge 就等于把被测的东西 mock 掉了。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import App from './App';
import { INBOUND } from './protocol';
import { LANG_STORAGE_KEY } from './i18n';

type Posted = { type?: string };

let posted: Posted[] = [];
let hostHandlers: Set<(event: MessageEvent) => void>;

beforeEach(() => {
  window.localStorage.setItem(LANG_STORAGE_KEY, 'zh');

  posted = [];
  hostHandlers = new Set();

  (window as unknown as { chrome?: unknown }).chrome = {
    webview: {
      postMessage: (message: unknown) => { posted.push(message as Posted); },
      addEventListener: (_type: string, handler: (event: MessageEvent) => void) => { hostHandlers.add(handler); },
      removeEventListener: (_type: string, handler: (event: MessageEvent) => void) => { hostHandlers.delete(handler); },
    },
  };
});

afterEach(() => {
  window.localStorage.removeItem(LANG_STORAGE_KEY);
  delete (window as unknown as { chrome?: unknown }).chrome;
});

function emit(data: unknown) {
  act(() => { hostHandlers.forEach((handler) => handler({ data } as MessageEvent)); });
}

/** 让前端进入「会话已启动、有可用斜杠命令」的状态，补全弹层才有候选可弹。 */
function startSession() {
  emit({
    type: 'event',
    payload: {
      kind: 'SessionStarted',
      content: '',
      toolCall: null, usageData: null, turnResult: null, rateLimitData: null,
      hookName: '', hookPhase: '',
      sessionInfo: {
        sessionId: 's1', model: 'Opus 5', cwd: 'F:/proj',
        permissionMode: 'acceptEdits', cliVersion: '2.1.234',
        tools: [], slashCommands: ['model', 'effort', 'usage'], terminalSlashCommands: [],
        skills: [], subAgents: [], mcpServers: [], capabilities: [], models: [],
        subscriptionType: 'Claude Max', effortLevel: 'high',
        availableModels: [], effortLevels: [],
        usageWindows: [], usageRawText: '',
      },
    },
  });
}

function escapeMessages(): Posted[] {
  return posted.filter((message) => message.type === INBOUND.EscapeUnhandled);
}

function interruptMessages(): Posted[] {
  return posted.filter((message) => message.type === INBOUND.Interrupt);
}

/** 发一条消息让前端进入忙碌态（userSent 就是 busy 的唯一入口）。 */
function sendSomething() {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    '.composer:not(.composer-terminal) .composer-row textarea')!;
  fireEvent.change(textarea, { target: { value: '在忙', selectionStart: 2, selectionEnd: 2 } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

describe('没被用掉的 Esc 退回宿主', () => {
  it('网页没人处理时，退回宿主去激活文档窗口', () => {
    render(<App />);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(escapeMessages()).toHaveLength(1);
  });

  it('补全弹层用掉了这一下 Esc，就不退回去', () => {
    // 这里必须走真实的消费方：弹层的 Esc 处理调了 preventDefault，
    // 而本回路正是靠 defaultPrevented 判断「网页用不上」。
    render(<App />);
    startSession();

    // 得点名要哪一个：首屏默认停在终端（见 panelState 的 initialPanel），
    // 而对话那格输入框仍并排留在树里（藏而不卸，为的是草稿）。
    // jsdom 不加载样式表，`display:none` 不生效，所以 getByRole('textbox') 会一次命中一堆。
    // 还得点名要「具体内容」那一格：两个输入框现在各自都分成了两格，
    // 而补全只挂在内容那格上——取到提示词那格的话，敲什么都不会弹。
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '.composer:not(.composer-terminal) .composer-row textarea')!;
    fireEvent.change(textarea, { target: { value: '/mo', selectionStart: 3, selectionEnd: 3 } });
    expect(document.querySelector('.slash-popup')).not.toBeNull();

    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(document.querySelector('.slash-popup')).toBeNull();
    expect(escapeMessages()).toHaveLength(0);
  });

  it('别的键不会触发这条回路', () => {
    render(<App />);

    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(escapeMessages()).toHaveLength(0);
  });
});

describe('正忙时 Esc 是打断', () => {
  // 补于 2026-08-21，用户反馈「esc 打断失效」。此前 Esc 根本没绑过打断：
  // 唯一入口是「停止」按钮，而忙时按 Esc 会一路落到「退回宿主」，
  // 把焦点交回编辑器——想打断，结果人被踢出面板，而且什么都没停下。
  it('忙的时候按 Esc 发出中断', () => {
    render(<App />);
    startSession();
    sendSomething();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(interruptMessages()).toHaveLength(1);
  });

  it('打断优先于「退回宿主」——不能把焦点交回编辑器', () => {
    render(<App />);
    startSession();
    sendSomething();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(escapeMessages()).toHaveLength(0);
  });

  it('不忙的时候仍旧退回宿主，不发中断', () => {
    render(<App />);
    startSession();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(interruptMessages()).toHaveLength(0);
    expect(escapeMessages()).toHaveLength(1);
  });

  it('弹层开着时先归弹层，既不打断也不退回', () => {
    // 三者的优先级：弹层 > 打断 > 退回宿主。中间这一档是新加的，
    // 加错位置就会变成「补全退不出去」或「Esc 永远打断不了」。
    render(<App />);
    startSession();
    sendSomething();

    const textarea = document.querySelector<HTMLTextAreaElement>(
      '.composer:not(.composer-terminal) .composer-row textarea')!;
    fireEvent.change(textarea, { target: { value: '/mo', selectionStart: 3, selectionEnd: 3 } });
    expect(document.querySelector('.slash-popup')).not.toBeNull();

    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(document.querySelector('.slash-popup')).toBeNull();
    expect(interruptMessages()).toHaveLength(0);
    expect(escapeMessages()).toHaveLength(0);
  });
});
