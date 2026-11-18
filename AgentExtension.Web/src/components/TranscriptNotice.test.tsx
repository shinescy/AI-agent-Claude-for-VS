import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Transcript } from './Transcript';
import { LangContext } from '../LangContext';
import type { Block } from '../state';

/** 一条带模板的系统提示，就是宿主推过来的那个形状。 */
function noticeBlock(text: string, textKey?: string, textArgs?: Record<string, string>): Block {
  return { id: 1, kind: 'notice', text, textKey, textArgs, streaming: false };
}

function renderNotice(lang: 'zh' | 'en', block: Block) {
  render(
    <LangContext.Provider value={lang}>
      <Transcript blocks={[block]} onRunCommand={vi.fn()} />
    </LangContext.Provider>);
}

describe('转录里的系统提示', () => {
  it('英文模式下按模板翻出来，而不是照抄宿主发的中文', () => {
    renderNotice('en', noticeBlock('已开一条新会话，上下文清空。', '已开一条新会话，上下文清空。'));

    expect(screen.getByText('Started a new session; the context is cleared.')).toBeTruthy();
    expect(screen.queryByText('已开一条新会话，上下文清空。')).toBeNull();
  });

  it('占位取值一起带过去', () => {
    renderNotice('en', noticeBlock(
      '打不开 src\\a.ts：在工作目录下找不到这个文件。',
      '打不开 {path}：在工作目录下找不到这个文件。',
      { path: 'src\\a.ts' }));

    expect(screen.getByText('Cannot open src\\a.ts: no such file under the working directory.')).toBeTruthy();
  });

  it('中文模式下显示宿主填好的那句', () => {
    renderNotice('zh', noticeBlock('已开一条新会话，上下文清空。', '已开一条新会话，上下文清空。'));

    expect(screen.getByText('已开一条新会话，上下文清空。')).toBeTruthy();
  });

  it('没有模板的原样显示，不吞成空白', () => {
    // 子命令输出走这条：CLI 吐什么就是什么。
    renderNotice('en', noticeBlock('claude doctor: 一切正常'));

    expect(screen.getByText('claude doctor: 一切正常')).toBeTruthy();
  });
});
