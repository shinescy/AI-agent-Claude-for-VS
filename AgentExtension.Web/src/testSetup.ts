import { vi } from 'vitest';

// 测试环境的补位。

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // jsdom 不做布局，没有可滚的东西；空实现即可，断言从不依赖滚动结果。
  };
}

// jsdom 也没有 ResizeObserver（同样属于布局，jsdom 不做布局）。
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {
      // jsdom 不做布局，永远不会有尺寸变化事件。
    }

    unobserve(): void {
    }

    disconnect(): void {
    }
  }

  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom 也没有 IntersectionObserver。
interface FakeObserver {
  callback: (entries: unknown[]) => void;
  targets: Element[];
}

export const fakeObservers: FakeObserver[] = [];

if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    private entry: FakeObserver;

    constructor(callback: (entries: unknown[]) => void) {
      this.entry = { callback, targets: [] };
      fakeObservers.push(this.entry);
    }

    observe(target: Element): void {
      this.entry.targets.push(target);
    }

    unobserve(): void {
    }

    disconnect(): void {
      const at = fakeObservers.indexOf(this.entry);

      if (at >= 0) {
        fakeObservers.splice(at, 1);
      }
    }

    takeRecords(): unknown[] {
      return [];
    }
  }

  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    IntersectionObserverStub;
}

// xterm 在 jsdom 里起不来：它要 matchMedia 量 DPR、要 canvas 量字号，jsdom 两样都没有，
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    write(): void {}
    paste(): void {}
    onData(): { dispose(): void } { return { dispose(): void {} } }
    onScroll(): { dispose(): void } { return { dispose(): void {} } }
    onRender(): { dispose(): void } { return { dispose(): void {} } }
    scrollToLine(): void {}
    registerLinkProvider(provider: unknown) { (globalThis as any).__linkProvider = provider; return { dispose() {} }; }
    attachCustomKeyEventHandler(): void {}
    buffer = { active: { viewportY: 0, length: 0, getLine: () => undefined } };
    open(): void {}
    focus(): void {}
    reset(): void {}
    clear(): void {}
    getSelection(): string { return ''; }
    dispose(): void {}
    loadAddon(): void {}
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
    activate(): void {}
    dispose(): void {}
  },
}));
