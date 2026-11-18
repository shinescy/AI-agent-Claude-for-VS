import { describe, it, expect } from 'vitest';
import { panelReducer } from './panelState';
import type { PanelResultPayload } from './panelState';

function data(partial: Partial<PanelResultPayload>): PanelResultPayload {
  return {
    panelId: 'plugin', items: [], error: '', rawText: '',
    restartHint: false, ...partial,
  };
}

describe('面板状态', () => {
  it('打开时进入加载态', () => {
    const s = panelReducer(null, { type: 'open', panelId: 'plugin' });

    expect(s?.panelId).toBe('plugin');
    expect(s?.loading).toBe(true);
  });

  it('收到数据后退出加载态', () => {
    let s = panelReducer(null, { type: 'open', panelId: 'plugin' });
    s = panelReducer(s, { type: 'data', payload: data({ items: [
      { id: 'a@m', title: 'a', subtitle: '1 · user', enabled: true, detail: '', fields: {}, currentProject: false },
    ] }) });

    expect(s?.loading).toBe(false);
    expect(s?.items).toHaveLength(1);
  });

  it('重新开始加载时清掉上一次的错误与原始输出', () => {
    // 不清的话，「执行中…」会和上一次失败的红色 alert 同屏，
    // 用户分不清那条报错是这次的还是上次的——最自然的解读是「这次也失败了还在转」。
    let s = panelReducer(null, { type: 'open', panelId: 'plugin' });
    s = panelReducer(s, { type: 'data', payload: data({ error: '命令返回 1。', rawText: '诊断信息', showsRawText: true }) });

    expect(s?.error).not.toBe('');

    s = panelReducer(s, { type: 'loading', requestId: '2' });

    expect(s?.loading).toBe(true);
    expect(s?.error).toBe('');
    expect(s?.rawText).toBe('');
    expect(s?.showsRawText).toBe(false);
  });

  it('重新加载时不清空已有条目', () => {
    // 与上一条配套：清错误是对的，清列表不是——刷新时先闪成空白比不给反馈还差。
    let s = panelReducer(null, { type: 'open', panelId: 'plugin' });
    s = panelReducer(s, { type: 'data', payload: data({ items: [
      { id: 'a@m', title: 'a', subtitle: '1 · user', enabled: true, detail: '', fields: {}, currentProject: false },
    ] }) });

    s = panelReducer(s, { type: 'loading', requestId: '2' });

    expect(s?.items).toHaveLength(1);
  });

  it('超时文案要劝阻直接重试而不是催促重试', () => {
    // 走到超时说明等待已经超过宿主最坏耗时，命令很可能已经执行了。
    // 而安装/更新/移除不幂等，一句「请重试」会诱导用户把它跑第二遍。
    let s = panelReducer(null, { type: 'open', panelId: 'plugin', requestId: '1' });
    s = panelReducer(s, { type: 'timeout', requestId: '1' });

    expect(s?.loading).toBe(false);
    expect(s?.error).toMatch(/刷新/);
    expect(s?.error).toMatch(/可能已经执行/);
  });

  it('showsRawText 原样透传，缺省时按 false 处理（兼容旧回包）', () => {
    // 对应 C# 侧 PanelResult.ShowsRawText：宿主用它显式标出"该不该把 rawText 单独渲染成一块"，
    // 前端不该再靠"error 是空的 && rawText 不是空的"去推断意图，见 P1。
    let s = panelReducer(null, { type: 'open', panelId: 'plugin' });
    s = panelReducer(s, { type: 'data', payload: data({ showsRawText: true, rawText: 'raw' }) });
    expect(s?.showsRawText).toBe(true);

    s = panelReducer(s, { type: 'data', payload: data({ rawText: 'raw' }) });
    expect(s?.showsRawText).toBe(false);
  });

  it('关闭后回到无面板', () => {
    let s = panelReducer(null, { type: 'open', panelId: 'plugin' });
    s = panelReducer(s, { type: 'close' });

    expect(s).toBeNull();
  });

  it('别的面板的数据不会串台', () => {
    // 快速切面板时旧请求可能后到，串台会把 MCP 的数据画进插件面板。
    let s = panelReducer(null, { type: 'open', panelId: 'plugin' });
    s = panelReducer(s, { type: 'data', payload: data({ panelId: 'mcp', items: [
      { id: 'x', title: 'x', subtitle: '', enabled: true, detail: '', fields: {}, currentProject: false },
    ] }) });

    expect(s?.items).toHaveLength(0);
    expect(s?.loading).toBe(true);
  });

  it('错误进入状态且不清空原有条目', () => {
    let s = panelReducer(null, { type: 'open', panelId: 'plugin' });
    s = panelReducer(s, { type: 'data', payload: data({ items: [
      { id: 'a@m', title: 'a', subtitle: '', enabled: true, detail: '', fields: {}, currentProject: false },
    ] }) });
    s = panelReducer(s, { type: 'data', payload: data({ error: '不在当前列表里，请刷新面板后重试。' }) });

    // 动作被拒时列表还是原来那份，清空会让人以为插件都没了。
    expect(s?.error).toContain('刷新');
    expect(s?.items).toHaveLength(1);
  });

  it('重启提示可以单独消掉', () => {
    let s = panelReducer(null, { type: 'open', panelId: 'plugin' });
    s = panelReducer(s, { type: 'data', payload: data({ restartHint: true }) });
    expect(s?.restartHint).toBe(true);

    s = panelReducer(s, { type: 'dismissRestart' });
    expect(s?.restartHint).toBe(false);
  });

  it('loading 动作只置加载态不清空已有条目', () => {
    // 刷新/动作按钮点完到数据回来之间要有反馈，但不能像 open 那样把列表先闪成空白。
    let s = panelReducer(null, { type: 'open', panelId: 'plugin' });
    s = panelReducer(s, { type: 'data', payload: data({ items: [
      { id: 'a@m', title: 'a', subtitle: '', enabled: true, detail: '', fields: {}, currentProject: false },
    ] }) });

    s = panelReducer(s, { type: 'loading' });

    expect(s?.loading).toBe(true);
    expect(s?.items).toHaveLength(1);
  });

  it('无面板时收到数据不建面板', () => {
    expect(panelReducer(null, { type: 'data', payload: data({}) })).toBeNull();
  });

  it('过期的旧请求结果不会覆盖新请求的状态（requestId 守卫）', () => {
    // 复现 A-1 的故障组合：点了动作又立刻点刷新，更轻的刷新请求先回来，
    // 动作那条更晚回来的重取结果必须被丢弃，否则「被删除的东西又出现了」。
    let s = panelReducer(null, { type: 'open', panelId: 'plugin', requestId: 'r1' });
    s = panelReducer(s, { type: 'data', payload: data({
      requestId: 'r1',
      items: [{ id: 'a@m', title: 'a', subtitle: '', enabled: true, detail: '', fields: {}, currentProject: false }],
    }) });
    expect(s?.items).toHaveLength(1);
    expect(s?.loading).toBe(false);

    // 用户点了刷新，发出第二个请求 r2，还没收到回包
    s = panelReducer(s, { type: 'loading', requestId: 'r2' });
    expect(s?.loading).toBe(true);

    // r1 的结果这时候才后到：必须被丢弃，不能覆盖 r2 尚未回来的状态
    s = panelReducer(s, { type: 'data', payload: data({ requestId: 'r1', items: [] }) });
    expect(s?.loading).toBe(true);
    expect(s?.items).toHaveLength(1);

    // r2 的结果到达才真正更新
    s = panelReducer(s, { type: 'data', payload: data({ requestId: 'r2', items: [] }) });
    expect(s?.loading).toBe(false);
    expect(s?.items).toHaveLength(0);
  });

  it('没有 requestId 时行为与此前一致（向后兼容）', () => {
    let s = panelReducer(null, { type: 'open', panelId: 'plugin' });
    s = panelReducer(s, { type: 'data', payload: data({
      items: [{ id: 'a@m', title: 'a', subtitle: '', enabled: true, detail: '', fields: {}, currentProject: false }],
    }) });

    expect(s?.loading).toBe(false);
    expect(s?.items).toHaveLength(1);
  });

  it('加载超时后转入错误态并退出加载', () => {
    let s = panelReducer(null, { type: 'open', panelId: 'plugin', requestId: 'r1' });
    s = panelReducer(s, { type: 'timeout', requestId: 'r1' });

    expect(s?.loading).toBe(false);
    expect(s?.error).toContain('超时');
  });

  it('新请求已经覆盖等待目标时，旧请求的超时不生效', () => {
    let s = panelReducer(null, { type: 'open', panelId: 'plugin', requestId: 'r1' });
    s = panelReducer(s, { type: 'data', payload: data({ requestId: 'r1' }) });
    s = panelReducer(s, { type: 'loading', requestId: 'r2' });

    // r1 的超时计时器比 r2 的数据更早触发，但此刻等待的已经是 r2
    s = panelReducer(s, { type: 'timeout', requestId: 'r1' });

    expect(s?.loading).toBe(true);
    expect(s?.error).toBe('');
  });

  it('数据已经到达后，迟到的超时不会覆盖正常状态', () => {
    let s = panelReducer(null, { type: 'open', panelId: 'plugin', requestId: 'r1' });
    s = panelReducer(s, { type: 'data', payload: data({ requestId: 'r1' }) });

    // 兜底：即便 App.tsx 没能及时清掉计时器，reducer 自己也不该在非加载态下响应超时
    s = panelReducer(s, { type: 'timeout', requestId: 'r1' });

    expect(s?.loading).toBe(false);
    expect(s?.error).toBe('');
  });
});
