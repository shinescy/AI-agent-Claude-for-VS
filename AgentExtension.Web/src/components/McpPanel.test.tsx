import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { McpPanel } from './McpPanel';
import type { McpPanelHandle } from './McpPanel';
import type { PanelItemView } from '../panelState';

const ITEMS: PanelItemView[] = [
  { id: 'context7', title: 'context7', subtitle: 'https://mcp.context7.com/mcp', enabled: true, detail: '', fields: {}, currentProject: false },
  { id: 'vs-debug', title: 'vs-debug', subtitle: 'powershell …', enabled: false, detail: '', fields: { status: '✘ Failed to connect' }, currentProject: false },
];

function setup() {
  const onAction = vi.fn();
  render(<McpPanel items={ITEMS} onAction={onAction} />);
  return { onAction };
}

// 首项标题会同时出现在左侧列表和右侧详情里，getByText 等全局查询会因此产生歧义——
// 与 PluginPanel.test.tsx 同样的坑，同样的解法：列表内查询限定在 listbox，详情内查询限定在详情区域。
function getList() {
  return screen.getByRole('listbox');
}

function getDetail() {
  return screen.getByRole('region', { name: '详情' });
}

describe('MCP 面板', () => {
  it('列出服务器与连接状态', () => {
    setup();
    const list = getList();
    expect(within(list).getByText('context7')).toBeTruthy();
    expect(within(list).getByText('vs-debug')).toBeTruthy();
  });

  it('打开即显示首项详情，无需点击', () => {
    setup();
    const list = getList();
    const detail = getDetail();

    // 首项在列表里已标记为选中
    const firstOption = within(list).getByText('context7').closest('[role="option"]');
    expect(firstOption?.getAttribute('aria-selected')).toBe('true');
    // 右侧详情不需要用户先点击就已经显示首项内容
    expect(within(detail).getByText('context7')).toBeTruthy();
    expect(within(detail).getByText('https://mcp.context7.com/mcp')).toBeTruthy();
  });

  it('点击其它项后详情切过去', () => {
    setup();
    fireEvent.click(within(getList()).getByText('vs-debug'));
    const detail = getDetail();
    expect(within(detail).getByText('vs-debug')).toBeTruthy();
  });

  it('移除动作传服务器名', () => {
    const { onAction } = setup();
    // context7 是首项，默认已选中，这里显式点一次不改变结果，但覆盖「点击已选中项」的路径
    fireEvent.click(within(getList()).getByText('context7'));
    fireEvent.click(within(getDetail()).getByRole('button', { name: '移除' }));

    expect(onAction).toHaveBeenCalledWith('mcp.remove', ['context7']);
  });

  it('新增远程服务器传名字与地址两个槽位', () => {
    const { onAction } = setup();

    fireEvent.click(screen.getByRole('button', { name: '新增远程服务器' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'my-server' } });
    fireEvent.change(screen.getByLabelText('地址'), { target: { value: 'https://mcp.example.com/mcp' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    expect(onAction).toHaveBeenCalledWith('mcp.addRemote', ['my-server', 'https://mcp.example.com/mcp']);
  });

  it('详情区渲染字段——连接失败的原因看得见', () => {
    // McpListParser 把 "✘ Failed to connect" 写进 Fields["状态"]，此前面板不渲染 fields，
    // 连接失败的原因在界面上完全看不到（终端里看得到）。
    setup();
    fireEvent.click(within(getList()).getByText('vs-debug'));
    const detail = getDetail();
    expect(within(detail).getByText('✘ Failed to connect')).toBeTruthy();
  });

  it('不再提供登录按钮，改为提示去终端执行', () => {
    // OAuth 登录是交互式流程，面板通道（stdin 立刻关闭、CreateNoWindow）起不了这类进程，
    // 转圈 60 秒后会被 Kill，因此撤掉这条动作，改为引导到终端。
    setup();
    const detail = getDetail();
    expect(within(detail).queryByRole('button', { name: '登录' })).toBeNull();
    expect(within(detail).getByText(/claude mcp login/)).toBeTruthy();
  });

  it('点「添加」后收起表单，但保留草稿', () => {
    // 提交时前端并不知道宿主会不会拒（名称重复、地址不可达等）。提交即清空的话，
    // 被拒之后用户得把两个字段重新打一遍——而错误横幅上只写了原因，没有他刚填的内容。
    // 草稿留着，重开表单就能接着改；真要丢弃有「取消」。
    const { onAction } = setup();

    fireEvent.click(screen.getByRole('button', { name: '新增远程服务器' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'my-server' } });
    fireEvent.change(screen.getByLabelText('地址'), { target: { value: 'https://mcp.example.com/mcp' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    expect(onAction).toHaveBeenCalledWith('mcp.addRemote', ['my-server', 'https://mcp.example.com/mcp']);
    // 表单已收起，不再显示输入框
    expect(screen.queryByLabelText('名称')).toBeNull();

    // 再次打开表单，刚才填的内容还在
    fireEvent.click(screen.getByRole('button', { name: '新增远程服务器' }));
    expect((screen.getByLabelText('名称') as HTMLInputElement).value).toBe('my-server');
    expect((screen.getByLabelText('地址') as HTMLInputElement).value).toBe('https://mcp.example.com/mcp');
  });

  it('明显不合法的输入不让提交，并就地说明原因', () => {
    // 宿主侧校验才是安全边界，这里只是不让用户白跑一趟——那次往返要等一个真实进程起落。
    // 但灰掉的按钮必须说明理由，否则用户只能猜是哪一栏有问题。
    setup();

    fireEvent.click(screen.getByRole('button', { name: '新增远程服务器' }));
    expect((screen.getByRole('button', { name: '添加' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '-bad' } });
    expect(screen.getByText(/名称只能是/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'ok-name' } });
    fireEvent.change(screen.getByLabelText('地址'), { target: { value: 'ftp://x' } });
    expect(screen.getByText(/地址必须是/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '添加' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('地址'), { target: { value: 'https://mcp.example.com/mcp' } });
    expect((screen.getByRole('button', { name: '添加' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('点「取消」后表单复位', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: '新增远程服务器' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'my-server' } });
    fireEvent.change(screen.getByLabelText('地址'), { target: { value: 'https://mcp.example.com/mcp' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByLabelText('名称')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '新增远程服务器' }));
    expect((screen.getByLabelText('名称') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('地址') as HTMLInputElement).value).toBe('');
  });

  it('说明 stdio 形态要去终端配置', () => {
    // 从面板配置一条任意本机命令正是白名单要防的，得说清楚而不是假装不支持
    setup();
    fireEvent.click(screen.getByRole('button', { name: '新增远程服务器' }));
    expect(screen.getByText(/终端/)).toBeTruthy();
  });

  it('items 为空时不崩，且不渲染空的详情骨架', () => {
    const onAction = vi.fn();
    render(<McpPanel items={[]} onAction={onAction} />);

    expect(screen.getByRole('listbox').children.length).toBe(0);
    // 「新增远程服务器」是独立于选中项的全局动作，仍然存在
    expect(screen.getByRole('button', { name: '新增远程服务器' })).toBeTruthy();
    // 没有条目时详情区不该渲染标题/字段这类骨架
    expect(within(getDetail()).queryByText(/https?:\/\//)).toBeNull();
  });

  it('items 为空时两栏都不是一个字都没有', () => {
    // 设计 §7 要求「不给空白」：左栏空态用 CSS 内容承载（不占真实 DOM 子节点，
    // 不破坏上面「children.length 为 0」的断言），右栏给出真实的提示文字。
    const onAction = vi.fn();
    render(<McpPanel items={[]} onAction={onAction} />);

    expect(screen.getByRole('listbox').getAttribute('data-empty-text')).toBeTruthy();
    expect(within(getDetail()).getByText(/没有已配置的 MCP 服务器/)).toBeTruthy();
    // 空态内容走 CSS 伪元素生成，屏幕阅读器读不到，靠这个 aria-label 补一份同样的文案——
    // 此前只加了属性没有测试断言过，删掉它 237 条测试照样全绿（纸面覆盖）。
    expect(screen.getByRole('listbox').getAttribute('aria-label')).toBe('没有已配置的 MCP 服务器。');
  });

  it('方向键在列表项间循环移动选中', () => {
    setup();
    const list = getList();

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(within(getDetail()).getByText('vs-debug')).toBeTruthy();

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(within(getDetail()).getByText('context7')).toBeTruthy();
  });

  it('列表容器可用 Tab 聚焦，且 aria-activedescendant 指向当前选中项', () => {
    setup();
    const list = getList();

    expect(list.tabIndex).toBe(0);

    const firstOption = within(list).getByText('context7').closest('[role="option"]') as HTMLElement;
    expect(list.getAttribute('aria-activedescendant')).toBe(firstOption.id);
  });

  it('有错误且列表为空时，详情区不再显示与错误横幅矛盾的空态文案', () => {
    const onAction = vi.fn();
    render(<McpPanel items={[]} onAction={onAction} error="命令失败" />);

    expect(within(getDetail()).queryByText(/没有已配置的 MCP 服务器/)).toBeNull();
    expect(screen.getByRole('listbox').getAttribute('data-empty-text')).toBe('');
  });

  it('loading 为 true 时动作按钮禁用，防止连点起多个进程', () => {
    const onAction = vi.fn();
    render(<McpPanel items={ITEMS} onAction={onAction} loading />);

    expect((within(getDetail()).getByRole('button', { name: '移除' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '新增远程服务器' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('列表项标题使用可省略溢出的样式类', () => {
    setup();
    const title = within(getList()).getByText('context7');
    expect(title.className).toContain('panel-list-item-title');
  });

  it('新增表单开着时，handleEscape 只收起表单并返回 true', () => {
    const onAction = vi.fn();
    const ref = createRef<McpPanelHandle>();
    render(<McpPanel ref={ref} items={ITEMS} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: '新增远程服务器' }));
    expect(screen.getByLabelText('名称')).toBeTruthy();

    let handled: boolean | undefined;
    act(() => {
      handled = ref.current?.handleEscape();
    });

    expect(handled).toBe(true);
    // 表单已收起，草稿被静默丢弃这件事本身没有发生——用户还能重新打开
    expect(screen.queryByLabelText('名称')).toBeNull();
  });

  it('没有打开新增表单时，handleEscape 返回 false，交给外层按普通 Esc 处理', () => {
    const onAction = vi.fn();
    const ref = createRef<McpPanelHandle>();
    render(<McpPanel ref={ref} items={ITEMS} onAction={onAction} />);

    expect(ref.current?.handleEscape()).toBe(false);
  });
});
