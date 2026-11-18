// 回复正文里的 markdown 链接、工具卡片标题里的文件名：点了都在 IDE 里打开。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { Markdown } from './Markdown';
import { ToolCard } from './ToolCard';
import type { AgentToolCall } from '../types';

const posted: Record<string, unknown>[] = [];

beforeEach(() =>
{
  posted.length = 0;
  (window as unknown as { chrome?: unknown }).chrome = {
    webview: {
      postMessage: (m: Record<string, unknown>) => { posted.push(m); },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  };
});

afterEach(() =>
{
  delete (window as unknown as { chrome?: unknown }).chrome;
});

/** 点一个链接；返回值里 defaultPrevented 表示面板本身没被带走。 */
function clickLink(container: HTMLElement, text: string): { defaultPrevented: boolean }
{
  const anchor = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === text)!;
  const notPrevented = fireEvent.click(anchor);
  return { defaultPrevented: !notPrevented };
}

describe('正文里的 markdown 链接', () =>
{
  it('指向文件的链接在 IDE 里打开，面板不跳走', () =>
  {
    const view = render(<Markdown text="已改好 [domains-and-servers.md](docs/memory/domains-and-servers.md) 和 [app.ts](src/app.ts#L42)" />);

    const first = clickLink(view.container, 'domains-and-servers.md');
    clickLink(view.container, 'app.ts');

    expect(first.defaultPrevented).toBe(true);
    expect(posted).toEqual([
      expect.objectContaining({ option: 'openFile', value: 'docs/memory/domains-and-servers.md', line: 0 }),
      expect.objectContaining({ option: 'openFile', value: 'src/app.ts', line: 42 }),
    ]);
  });

  it('网页链接交给系统浏览器', () =>
  {
    const view = render(<Markdown text="看 [文档](https://code.claude.com/docs)" />);

    const event = clickLink(view.container, '文档');

    expect(event.defaultPrevented).toBe(true);
    expect(posted).toEqual([expect.objectContaining({ option: 'openWebLink', value: 'https://code.claude.com/docs' })]);
  });
});

describe('图片链接在面板里预览，不交给 VS 图片编辑器', () =>
{
  it('点图片链接只向宿主要图，不发 openFile；读到后弹出大图，Esc 关掉', () =>
  {
    let emit: ((data: unknown) => void) | null = null;
    (window as unknown as { chrome: { webview: Record<string, unknown> } }).chrome.webview.addEventListener =
      (_t: string, handler: (e: MessageEvent) => void) => { emit = (data) => handler({ data } as MessageEvent); };

    const view = render(<Markdown text="截图在 [exp-shot.png](exp-shot.png)" />);
    clickLink(view.container, 'exp-shot.png');

    const query = posted.find((m) => m.option === 'fileContent')!;
    expect(query).toMatchObject({ value: 'exp-shot.png' });
    expect(posted.some((m) => m.option === 'openFile')).toBe(false);

    act(() =>
    {
      emit?.({ type: 'context', payload: { kind: 'fileContent', requestId: query.requestId, path: 'exp-shot.png', image: 'data:image/png;base64,AAAA', text: '', error: '', size: 4 } });
    });

    expect(document.querySelector('.image-lightbox-img')!.getAttribute('src')).toBe('data:image/png;base64,AAAA');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.image-lightbox')).toBeNull();
  });

  it('读不到时说原因，并能改在 VS 里打开', () =>
  {
    let emit: ((data: unknown) => void) | null = null;
    (window as unknown as { chrome: { webview: Record<string, unknown> } }).chrome.webview.addEventListener =
      (_t: string, handler: (e: MessageEvent) => void) => { emit = (data) => handler({ data } as MessageEvent); };

    const view = render(<Markdown text="[big.png](big.png)" />);
    clickLink(view.container, 'big.png');
    const query = posted.find((m) => m.option === 'fileContent')!;

    act(() =>
    {
      emit?.({ type: 'context', payload: { kind: 'fileContent', requestId: query.requestId, path: 'big.png', image: '', text: '', error: '图片超过 2 MB', size: 0 } });
    });

    expect(document.querySelector('.image-lightbox-note')!.textContent).toContain('图片超过 2 MB');

    fireEvent.click(document.querySelector('.image-lightbox-note button')!);
    expect(posted.some((m) => m.option === 'openFile' && m.value === 'big.png')).toBe(true);
  });
});

describe('工具卡片标题里的文件名', () =>
{
  const call: AgentToolCall = {
    toolUseId: 't1', name: 'Edit',
    inputJson: JSON.stringify({ file_path: 'F:\\Work\\docs\\a.md', old_string: 'x', new_string: 'y' }),
    resultText: '', isError: false,
  } as AgentToolCall;

  it('点文件名打开文件，卡片不跟着收起', () =>
  {
    const view = render(<ToolCard call={call} running={false} />);

    fireEvent.click(view.container.querySelector('.tool-card-file')!);

    expect(posted).toEqual([expect.objectContaining({ option: 'openFile', value: 'F:\\Work\\docs\\a.md' })]);
    expect(view.container.querySelector('.tool-card-body')).not.toBeNull();
  });
});
