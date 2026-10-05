import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { Composer } from './Composer';
import { UserMessage } from './UserMessage';

afterEach(cleanup);

interface HostMessage {
  type?: string;
  option?: string;
  value?: string;
  requestId?: string;
}

/**
 * 会真的分发消息的假宿主。
 * <p>
 * 与 TerminalComposer.test.tsx 里那个只收不发的 captureHost 不同：预览与挑文件都是
 * **请求-响应**，而且订阅方是组件自己（一次可能开着好几张卡片各等各的回包），
 * 所以这里必须支持多个 listener 并真把消息发回去。
 * </p>
 */
function fakeHost()
{
  const sent: HostMessage[] = [];
  const listeners = new Set<(event: MessageEvent) => void>();
  const previous = window.chrome;

  window.chrome = {
    webview: {
      postMessage: (message: unknown) => { sent.push(message as HostMessage); },
      addEventListener: (_type: 'message', handler: (event: MessageEvent) => void) =>
      {
        listeners.add(handler);
      },
      removeEventListener: (_type: 'message', handler: (event: MessageEvent) => void) =>
      {
        listeners.delete(handler);
      },
    },
  };

  return {
    sent,
    listenerCount: () => listeners.size,
    emit(payload: unknown)
    {
      act(() =>
      {
        listeners.forEach((h) => h({ data: payload } as MessageEvent));
      });
    },
    restore() { window.chrome = previous; },
  };
}

function renderComposer()
{
  return render(
    <Composer
      onSend={vi.fn()}
      busy={false}
      slashCommands={[]}
      unavailableCommands={[]}
      injection={null}
      fileResults={null}
      droppedFiles={null}
    />);
}

function box(view: ReturnType<typeof render>): HTMLTextAreaElement
{
  return view.container.querySelector('.composer-row textarea') as HTMLTextAreaElement;
}

function chips(view: ReturnType<typeof render>): HTMLElement[]
{
  return Array.from(view.container.querySelectorAll('.mention-chip')) as HTMLElement[];
}

/** 最近一次预览请求。 */
function lastPreviewQuery(sent: HostMessage[]): HostMessage | null
{
  const found = sent.filter((m) => m.type === 'query' && m.option === 'fileContent');
  return found.length > 0 ? found[found.length - 1] : null;
}

function reply(host: ReturnType<typeof fakeHost>, requestId: string, patch: Record<string, unknown>)
{
  host.emit({
    type: 'context',
    payload: {
      kind: 'fileContent',
      requestId,
      path: '',
      text: '',
      image: '',
      truncated: false,
      totalLines: 0,
      size: 0,
      error: '',
      ...patch,
    },
  });
}

describe('输入框里的 @ 引用能就地预览', () =>
{
  it('打出一条引用，上面就出现一枚徽标', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.change(box(view), { target: { value: '看看 @src/App.tsx 为什么慢' } });

      const names = chips(view).map((c) => c.textContent);

      // 徽标上只留文件名：一排徽标里目录前缀全是重复的。
      expect(names.some((n) => n?.includes('App.tsx'))).toBe(true);
    }
    finally
    {
      host.restore();
    }
  });

  it('点开才去要内容——没点之前不白读一次盘', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.change(box(view), { target: { value: '@src/App.tsx ' } });

      expect(lastPreviewQuery(host.sent)).toBeNull();

      fireEvent.mouseDown(chips(view)[0]);

      const query = lastPreviewQuery(host.sent);
      expect(query).not.toBeNull();
      expect(query!.value).toBe('src/App.tsx');
      expect(query!.requestId).not.toBe('');
    }
    finally
    {
      host.restore();
    }
  });

  it('回包的内容就地显示出来', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.change(box(view), { target: { value: '@src/App.tsx ' } });
      fireEvent.mouseDown(chips(view)[0]);

      const id = lastPreviewQuery(host.sent)!.requestId!;
      reply(host, id, { path: 'src/App.tsx', text: 'export const x = 1;', totalLines: 1, size: 19 });

      const body = view.container.querySelector('.file-preview-body');
      expect(body?.textContent).toContain('export const x = 1;');
    }
    finally
    {
      host.restore();
    }
  });

  it('读不到就把原因说出来，不留一块空白', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.change(box(view), { target: { value: '@../../Windows/win.ini ' } });
      fireEvent.mouseDown(chips(view)[0]);

      const id = lastPreviewQuery(host.sent)!.requestId!;
      reply(host, id, { error: '这个文件不在工作区里，也不是你挑进来的，出于安全不预览。' });

      const error = view.container.querySelector('.file-preview-error');
      expect(error?.textContent).toContain('不在工作区');
    }
    finally
    {
      host.restore();
    }
  });

  it('过期的回包不覆盖新的', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.change(box(view), { target: { value: '@a.ts @b.ts ' } });

      fireEvent.mouseDown(chips(view)[0]);
      const first = lastPreviewQuery(host.sent)!.requestId!;

      // 第一条还没回来就切去看第二个文件
      fireEvent.mouseDown(chips(view)[1]);
      const second = lastPreviewQuery(host.sent)!.requestId!;
      expect(second).not.toBe(first);

      reply(host, second, { path: 'b.ts', text: 'B 的内容', totalLines: 1 });
      reply(host, first, { path: 'a.ts', text: 'A 的内容', totalLines: 1 });

      const body = view.container.querySelector('.file-preview-body');
      expect(body?.textContent).toContain('B 的内容');
      expect(body?.textContent).not.toContain('A 的内容');
    }
    finally
    {
      host.restore();
    }
  });

  it('把引用从草稿里删掉，徽标和预览一起收起', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.change(box(view), { target: { value: '@src/App.tsx ' } });
      fireEvent.mouseDown(chips(view)[0]);

      const id = lastPreviewQuery(host.sent)!.requestId!;
      reply(host, id, { path: 'src/App.tsx', text: 'x', totalLines: 1 });
      expect(view.container.querySelector('.file-preview')).not.toBeNull();

      fireEvent.change(box(view), { target: { value: '算了' } });

      expect(chips(view)).toHaveLength(0);
      expect(view.container.querySelector('.file-preview')).toBeNull();
    }
    finally
    {
      host.restore();
    }
  });

  it('图片直接显示出来，不当文本读', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.change(box(view), { target: { value: '@docs/shot.png ' } });
      fireEvent.mouseDown(chips(view)[0]);

      const id = lastPreviewQuery(host.sent)!.requestId!;
      reply(host, id, { path: 'docs/shot.png', image: 'data:image/png;base64,AAA', size: 3 });

      const img = view.container.querySelector('.file-preview-image') as HTMLImageElement;
      expect(img).not.toBeNull();
      expect(img.src).toBe('data:image/png;base64,AAA');
    }
    finally
    {
      host.restore();
    }
  });

  it('内容被截断时明说，不让人以为文件就这么短', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.change(box(view), { target: { value: '@big.txt ' } });
      fireEvent.mouseDown(chips(view)[0]);

      const id = lastPreviewQuery(host.sent)!.requestId!;
      reply(host, id, { path: 'big.txt', text: 'a\nb', truncated: true, totalLines: 9000, size: 1024 });

      expect(view.container.textContent).toContain('只显示了前一部分');
      expect(view.container.querySelector('.file-preview-meta')?.textContent).toContain('9000');
    }
    finally
    {
      host.restore();
    }
  });
});

describe('挑文件按钮', () =>
{
  it('点一下向宿主要一次原生对话框', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.click(view.container.querySelector('.composer-attach')!);

      const pick = host.sent.filter((m) => m.type === 'query' && m.option === 'pickFile').pop();

      expect(pick).toBeTruthy();
      expect(pick!.requestId).not.toBe('');
    }
    finally
    {
      host.restore();
    }
  });

  it('挑回来的路径插进草稿，并且立刻长出徽标', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.change(box(view), { target: { value: '看看' } });
      fireEvent.click(view.container.querySelector('.composer-attach')!);

      const pick = host.sent.filter((m) => m.option === 'pickFile').pop()!;

      host.emit({
        type: 'context',
        payload: { kind: 'pickedFiles', requestId: pick.requestId, results: ['src/App.tsx'] },
      });

      expect(box(view).value).toBe('看看 @src/App.tsx ');
      expect(chips(view)).toHaveLength(1);
    }
    finally
    {
      host.restore();
    }
  });

  it('用户点了取消就什么都不动', () =>
  {
    const host = fakeHost();

    try
    {
      const view = renderComposer();
      fireEvent.change(box(view), { target: { value: '原样' } });
      fireEvent.click(view.container.querySelector('.composer-attach')!);

      const pick = host.sent.filter((m) => m.option === 'pickFile').pop()!;

      host.emit({
        type: 'context',
        payload: { kind: 'pickedFiles', requestId: pick.requestId, results: [] },
      });

      expect(box(view).value).toBe('原样');
    }
    finally
    {
      host.restore();
    }
  });
});

describe('发出去之后的消息里也能点开看', () =>
{
  it('转录里的 @ 引用是可点的徽标，点开就去要内容', () =>
  {
    const host = fakeHost();

    try
    {
      // 发出去之后转录里只剩一行纯文本路径，你没法确认引的到底是哪个文件。
      const view = render(<UserMessage text="看看 @src/App.tsx 为什么慢" />);

      const chip = view.container.querySelector('.mention-chip')!;
      expect(chip.textContent).toContain('App.tsx');

      // 徽标之外的原文要留着
      expect(view.container.querySelector('.block-text')?.textContent).toContain('为什么慢');

      fireEvent.mouseDown(chip);

      const query = lastPreviewQuery(host.sent);
      expect(query?.value).toBe('src/App.tsx');
    }
    finally
    {
      host.restore();
    }
  });

  it('没有引用的消息原样是一段纯文本', () =>
  {
    const view = render(<UserMessage text="就是一句话" />);

    expect(view.container.querySelector('.mention-chip')).toBeNull();
    expect(view.container.querySelector('.block-text')?.textContent).toBe('就是一句话');
  });
});
