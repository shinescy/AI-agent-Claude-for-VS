import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PanelOverlay } from './PanelOverlay';

function setup(overrides: Partial<React.ComponentProps<typeof PanelOverlay>> = {}) {
  const onClose = vi.fn();
  const onRefresh = vi.fn();

  render(
    <PanelOverlay
      title="插件" loading={false} error="" rawText=""
      onClose={onClose} onRefresh={onRefresh} {...overrides}
    >
      <div>内容</div>
    </PanelOverlay>,
  );

  return { onClose, onRefresh };
}

describe('覆盖层外壳', () => {
  it('显示标题与内容', () => {
    setup();
    expect(screen.getByText('插件')).toBeTruthy();
    expect(screen.getByText('内容')).toBeTruthy();
  });

  it('按 Esc 关闭', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('执行中显示提示', () => {
    setup({ loading: true });
    expect(screen.getByText(/执行中/)).toBeTruthy();
  });

  it('出错时显示原因', () => {
    setup({ error: '不在当前列表里，请刷新面板后重试。' });
    expect(screen.getByText(/刷新面板后重试/)).toBeTruthy();
  });

  it('解析不了时原样显示原始输出', () => {
    // 不静默丢弃 CLI 输出：宁可显示看不懂的文本，也不能给一片空白。
    setup({ error: '解析失败', rawText: 'some unparseable output' });
    expect(screen.getByText(/some unparseable output/)).toBeTruthy();
  });

  it('showsRawText 为真时，无错误也会渲染 rawText（查询型动作/doctor）', () => {
    // plugin.details / mcp.get 是纯查询，命令的 stdout 本身就是结果，不是解析失败的兜底，
    // 必须在没有 error 的情况下也显示出来。
    // 这条测试此前只靠"error 是空的 && rawText 不是空的"来断言，P1 之后改为显式意图标记
    // showsRawText——不再是弱化：旧断言只覆盖了"该显示"这一半，新断言额外要求宿主显式
    // 声明意图，且下面补了它的反面（成功取数时不显示），两条合起来比原来那条更严格。
    setup({
      error: '', showsRawText: true,
      rawText: 'context7\n  Upstash Context7 MCP server\n  Source: context7@claude-plugins-official',
    });
    expect(screen.getByText(/Upstash Context7 MCP server/)).toBeTruthy();
  });

  it('正常取数成功（无 error、showsRawText 为假）时不渲染 rawText，即使 rawText 非空', () => {
    // P1：这是此前缺失的断言。ClaudePanelService.FetchAsync 即使解析成功也会把整段原始
    // stdout 存进 RawText（诊断用途，不丢弃），但那不代表前端该把它糊在列表上方——
    // 插件市场实测 271 条、约 130KB JSON，渲染成 <pre> 会占几万像素，把列表挤到看不见。
    setup({ error: '', rawText: '["整段原始 JSON，仅供诊断，不该被渲染"]' });

    expect(document.querySelector('.panel-raw-standalone')).toBeNull();
  });

  it('点刷新触发回调', () => {
    const { onRefresh } = setup();
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('loading 为 true 时刷新按钮禁用，防止连点起多个进程', () => {
    setup({ loading: true });
    expect((screen.getByRole('button', { name: '刷新' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('关闭按钮任何时候都不禁用，用户随时能退出面板', () => {
    setup({ loading: true });
    expect((screen.getByRole('button', { name: '关闭（Esc）' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('关闭按钮的可访问名称包含操作说明，与可见文案不脱节', () => {
    // 可见文案是「Esc」，语音输入用户会说「点击 Esc」；aria-label 若只是「关闭」，
    // 与可见文案不一致（label-in-name 违规），语音指令会命中失败。
    setup();
    expect(screen.getByRole('button', { name: '关闭（Esc）' })).toBeTruthy();
  });

  it('加载提示带 role=status 便于播报', () => {
    setup({ loading: true });
    const el = screen.getByText('执行中…');
    expect(el.getAttribute('role')).toBe('status');
  });

  it('执行超过若干秒后显示已耗时秒数', () => {
    // 不读秒的话，「在跑」和「卡死了」在界面上长得完全一样，用户会去点第二次——
    // 而安装/更新/移除这些命令不幂等。
    vi.useFakeTimers();

    try
    {
      setup({ loading: true });
      expect(screen.getByText('执行中…')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(4000);
      });

      expect(screen.getByText(/已 4 秒/)).toBeTruthy();
    }
    finally
    {
      vi.useRealTimers();
    }
  });

  it('宿主说有输出但输出是空的时候，明说而不是留一片空白', () => {
    // showsRawText 是宿主的显式意图：「这次的结果就是 stdout」。stdout 恰好为空时，
    // 此前正文整块是白的，用户只能理解成「点了没反应」。命令成功但没话说是正常结局，
    // 但必须说出来。
    setup({ showsRawText: true, rawText: '' });

    expect(screen.getByText(/没有任何输出/)).toBeTruthy();
  });

  it('输出非空时不显示空输出提示', () => {
    setup({ showsRawText: true, rawText: '有内容' });

    expect(screen.queryByText(/没有任何输出/)).toBeNull();
    expect(screen.getByText('有内容')).toBeTruthy();
  });

  it('加载中不把空输出当成结论', () => {
    // 还在跑的时候 rawText 当然是空的，那不代表「没有输出」。
    setup({ showsRawText: true, rawText: '', loading: true });

    expect(screen.queryByText(/没有任何输出/)).toBeNull();
  });

  it('出错时保留的旧列表要标出是旧的', () => {
    // 保留旧列表本身是对的（清空会让人以为东西都没了），但不标注更糟：
    // 那些启用/禁用圆点看着仍然权威，实际可能早就不对了。
    setup({ error: '命令返回 1。', staleItems: true });

    expect(screen.getByText(/可能已经过期/)).toBeTruthy();
  });

  it('没有旧列表可保留时不显示过期提示', () => {
    setup({ error: '命令返回 1。', staleItems: false });

    expect(screen.queryByText(/可能已经过期/)).toBeNull();
  });

  it('关闭时把焦点还给打开面板前的元素', () => {
    // 不还的话焦点停在 body 上，之后用户直接打字会被整个吞掉，
    // 表现为「面板关了以后键盘失灵」——而按 Esc 每次都走这条路径。
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <PanelOverlay title="插件" loading={false} error="" rawText="" onClose={() => {}} onRefresh={() => {}}>
        <div>内容</div>
      </PanelOverlay>,
    );

    expect(document.activeElement).not.toBe(trigger);

    unmount();

    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it('错误提示带 role=alert 便于立即播报', () => {
    // 错误该打断播报而不是排队等下一次空闲，role 用 alert（assertive）而非 status（polite）。
    setup({ error: '命令失败' });
    const el = screen.getByText('命令失败').closest('.panel-error');
    expect(el?.getAttribute('role')).toBe('alert');
  });

  it('onEscapeCapture 返回 true 时不关闭面板', () => {
    const onEscapeCapture = vi.fn(() => true);
    const { onClose } = setup({ onEscapeCapture });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscapeCapture).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('onEscapeCapture 返回 false 时仍然关闭面板', () => {
    const onEscapeCapture = vi.fn(() => false);
    const { onClose } = setup({ onEscapeCapture });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('不传 onEscapeCapture 时行为与此前一致', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab 焦点陷阱：在末项按 Tab 循环回首个可聚焦元素', () => {
    setup();

    const buttons = screen.getAllByRole('button');
    const last = buttons[buttons.length - 1];
    last.focus();

    fireEvent.keyDown(last, { key: 'Tab' });

    expect(document.activeElement).toBe(buttons[0]);
  });

  it('Tab 焦点陷阱：在首项按 Shift+Tab 循环到末个可聚焦元素', () => {
    setup();

    const buttons = screen.getAllByRole('button');
    const first = buttons[0];
    first.focus();

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it('Tab 焦点陷阱：开面板后焦点落在 shell 自身，此时立刻 Shift+Tab 不会逃出覆盖层', () => {
    // 复现路径：面板刚打开、用户还没点过任何按钮，焦点停在 tabIndex=-1 的 shell 上——
    // 它既不是 first 也不是 last，此前的判据（active===first || !root.contains(active)）
    // 认不出这种情况，Shift+Tab 会被浏览器直接送到覆盖层背后的输入框。
    setup();

    // PanelOverlay 挂载时会把焦点移进 shell 自身，无需手动 focus。
    const shell = document.querySelector('.panel-shell') as HTMLElement;
    expect(document.activeElement).toBe(shell);

    const buttons = screen.getAllByRole('button');
    fireEvent.keyDown(shell, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });
});
