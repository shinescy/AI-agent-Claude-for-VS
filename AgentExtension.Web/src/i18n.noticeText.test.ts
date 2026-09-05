// 宿主推来的系统提示：模板 + 取值 → 当前语言的一句话。

import { describe, it, expect } from 'vitest';
import { noticeText } from './i18n';

describe('noticeText', () => {
  it('英文下按模板查表并填占位', () => {
    const text = noticeText('en', '已开一条新会话，上下文清空。', '已开一条新会话，上下文清空。');

    expect(text).toBe('Started a new session; the context is cleared.');
  });

  it('占位取值填进英文句子', () => {
    const text = noticeText(
      'en', '转录已导出到 C:\\a.md', '转录已导出到 {path}', { path: 'C:\\a.md' });

    expect(text).toBe('Transcript exported to C:\\a.md');
  });

  it('中文下也走模板，句子和宿主填的一致', () => {
    const text = noticeText(
      'zh', '转录已导出到 C:\\a.md', '转录已导出到 {path}', { path: 'C:\\a.md' });

    expect(text).toBe('转录已导出到 C:\\a.md');
  });

  it('取值本身是中文的也翻', () => {
    // 权限模式的说法是中文，不翻的话英文句子里会夹半句中文。
    const text = noticeText(
      'en',
      '权限模式已切换为 计划模式（plan），已保留上下文。',
      '权限模式已切换为 {mode}，已保留上下文。',
      { mode: '计划模式（plan）' });

    expect(text).toBe('Permission mode switched to plan mode (plan); the context was kept.');
  });

  it('没有模板就原样用宿主给的文本', () => {
    // 子命令的输出是 CLI 原样吐出来的，翻不了也不该动。
    expect(noticeText('en', 'claude doctor 的输出')).toBe('claude doctor 的输出');
    expect(noticeText('en', 'claude doctor 的输出', '')).toBe('claude doctor 的输出');
  });

  it('模板查不到就退回中文，绝不显示成空白', () => {
    const text = noticeText('en', '宿主比前端新，出了条没翻的话。', '宿主比前端新，出了条没翻的话。');

    expect(text).toBe('宿主比前端新，出了条没翻的话。');
  });

  it('id 缺失时那条模板不留下多余空格', () => {
    const withId = noticeText(
      'en', '', '已接回上次会话{id}。以下是上次会话的本地回放。', { id: ' 24fd646d' });
    const without = noticeText(
      'en', '', '已接回上次会话{id}。以下是上次会话的本地回放。', { id: '' });

    expect(withId).toBe('Resumed the previous session 24fd646d. Below is a local replay of it.');
    expect(without).toBe('Resumed the previous session. Below is a local replay of it.');
  });
});
