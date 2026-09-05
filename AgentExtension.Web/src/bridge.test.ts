// 跨语言契约测试：openPanel / runPanelAction 发给宿主的消息形状必须与
// C# 侧 BridgeMessageTypes.cs + ReadString(root, "requestId") 逐字对上。
//
// 这条守卫是 fail-open 设计（前端/后端任一侧 requestId 为空就放行，见 panelState.ts
// 与 App.tsx 里的 isPanelReplyCurrent），所以把 requestId 改名成 reqId 之类的后果是：
// 守卫悄悄失效、界面照常运作、237 条既有测试全绿——没有任何东西会报错。
// 本文件把发出去的消息原样捕获下来，逐字段断言键名与取值，堵住这个只能靠肉眼比对才能
// 发现的静默失效点。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openPanel, onHostMessage, runPanelAction } from './bridge';
import { INBOUND } from './protocol';

/** 桩出 window.chrome.webview，只关心 postMessage 收到了什么。 */
function stubWebViewHost() {
  const postMessage = vi.fn();
  (window as unknown as { chrome: unknown }).chrome = {
    webview: {
      postMessage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  };
  return postMessage;
}

describe('桥接：面板请求的跨语言契约', () => {
  let postMessage: ReturnType<typeof stubWebViewHost>;

  beforeEach(() => {
    postMessage = stubWebViewHost();
  });

  afterEach(() => {
    delete (window as unknown as { chrome?: unknown }).chrome;
  });

  it('openPanel 发出的消息是扁平结构，无 payload 层，字段名逐字为 type/panelId/requestId', () => {
    openPanel('plugin', 'r1');

    expect(postMessage).toHaveBeenCalledTimes(1);
    const message = postMessage.mock.calls[0][0];

    expect(message).toEqual({
      type: INBOUND.PanelOpen,
      panelId: 'plugin',
      requestId: 'r1',
    });
  });

  it('runPanelAction 发出的消息是扁平结构，字段名逐字为 type/panelId/actionId/values/requestId', () => {
    runPanelAction('mcp', 'mcp.remove', ['context7'], 'r2');

    expect(postMessage).toHaveBeenCalledTimes(1);
    const message = postMessage.mock.calls[0][0];

    expect(message).toEqual({
      type: INBOUND.PanelAction,
      panelId: 'mcp',
      actionId: 'mcp.remove',
      values: ['context7'],
      requestId: 'r2',
    });
  });

  it('requestId 键名必须逐字为 requestId——C# 侧靠 ReadString(root, "requestId") 取值，改名会静默取空', () => {
    openPanel('plugin', 'r1');
    runPanelAction('plugin', 'plugin.enable', ['context7@m'], 'r3');

    for (const call of postMessage.mock.calls) {
      const message = call[0] as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(message, 'requestId')).toBe(true);
      // 不是嵌套在某个 payload/options 之类的对象里——直接是顶层字符串字段。
      expect(typeof message.requestId).toBe('string');
    }
  });
});

// F2：onHostMessage 必须返回退订函数，且真的能摘掉 handler——
// StrictMode 下 effect 会 mount→unmount→remount 各跑一次，不退订的话两次 mount
// 各自注册的 handler 都会留着，同一条宿主消息被 dispatch 两次。
describe('onHostMessage 退订（F2）', () => {
  afterEach(() => {
    delete (window as unknown as { chrome?: unknown }).chrome;
    delete (window as unknown as { __agentDevHost?: unknown }).__agentDevHost;
  });

  it('宿主存在时，退订函数会调用 host.removeEventListener 摘掉当初注册的那个 listener', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    (window as unknown as { chrome: unknown }).chrome = {
      webview: { postMessage: vi.fn(), addEventListener, removeEventListener },
    };

    const handler = vi.fn();
    const unsubscribe = onHostMessage(handler);

    expect(addEventListener).toHaveBeenCalledTimes(1);
    const registeredListener = addEventListener.mock.calls[0][1];

    unsubscribe();

    expect(removeEventListener).toHaveBeenCalledTimes(1);
    // 摘掉的必须是当初 addEventListener 注册的同一个函数引用，
    // 换一个新建的匿名函数会因为引用不同而摘不掉。
    expect(removeEventListener.mock.calls[0][1]).toBe(registeredListener);
  });

  it('开发期注入入口下，调用退订函数后再 emit，handler 不再被调用', () => {
    // 不设 window.chrome：触发开发期的 __agentDevHost 注入分支，
    // 对应 CLAUDE.md 里 `npm run dev` + Playwright 的调试路径。
    const handler = vi.fn();
    const unsubscribe = onHostMessage(handler);

    const devHost = (window as unknown as { __agentDevHost?: { emit(data: unknown): void } }).__agentDevHost;
    expect(devHost).toBeTruthy();

    devHost!.emit({ hello: 'world' });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    devHost!.emit({ hello: 'again' });

    // 仍是 1 次：退订之后这条消息不该再送达这个 handler。
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('StrictMode 下 mount→unmount→remount 不会让同一条消息被 dispatch 两次', () => {
    // 第一次注册后立刻退订（模拟 StrictMode 的探测性 unmount），
    // 第二次注册留存（模拟 remount）。emit 一条消息应该只被留存的那个 handler 收到一次。
    const handlerA = vi.fn();
    const unsubscribeA = onHostMessage(handlerA);
    unsubscribeA();

    const handlerB = vi.fn();
    onHostMessage(handlerB);

    const devHost = (window as unknown as { __agentDevHost?: { emit(data: unknown): void } }).__agentDevHost;
    devHost!.emit({ tick: 1 });

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledTimes(1);
  });
});
