import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PluginPanel } from './PluginPanel';
import type { PanelItemView } from '../panelState';

const ITEMS: PanelItemView[] = [
  { id: 'context7@m#user#', title: 'context7', subtitle: '1.0.0 · user', enabled: true, detail: '', fields: { version: '1.0.0' }, currentProject: false, scope: 'user' },
  { id: 'code-review@m#user#', title: 'code-review', subtitle: 'unknown · user', enabled: false, detail: '', fields: {}, currentProject: false, scope: 'user' },
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof PluginPanel>> = {}) {
  const onAction = vi.fn();
  const onDismissRestart = vi.fn();
  const onSwitchPanel = vi.fn();

  render(
    <PluginPanel
      panelId="plugin" items={ITEMS} restartHint={false}
      onAction={onAction} onDismissRestart={onDismissRestart} onSwitchPanel={onSwitchPanel}
      {...overrides}
    />,
  );

  return { onAction, onDismissRestart, onSwitchPanel };
}

function setup(restartHint = false) {
  return renderPanel({ restartHint });
}

// 首项标题会同时出现在左侧列表和右侧详情里，getByText 等全局查询会因此产生歧义，
// 所以列表内的查询一律限定在 listbox 区域，详情内的查询限定在详情区域。
function getList() {
  return screen.getByRole('listbox');
}

function getDetail() {
  return screen.getByRole('region', { name: '详情' });
}

describe('插件面板：三个 tab', () => {
  it('三个 tab 都在，当前 tab 标记为选中', () => {
    renderPanel({ panelId: 'pluginMarket' });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['已安装', '市场', '更新']);
    expect(screen.getByRole('tab', { name: '市场' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '已安装' }).getAttribute('aria-selected')).toBe('false');
  });

  it('点另一个 tab 会请求切换面板', () => {
    // tab 不是纯前端视图切换：每个 tab 有各自的取数命令与动作白名单，都在 C# 目录里。
    const { onSwitchPanel } = renderPanel({ panelId: 'plugin' });

    fireEvent.click(screen.getByRole('tab', { name: '更新' }));

    expect(onSwitchPanel).toHaveBeenCalledWith('pluginUpdates');
  });

  it('点当前 tab 不重复取数', () => {
    const { onSwitchPanel } = renderPanel({ panelId: 'plugin' });

    fireEvent.click(screen.getByRole('tab', { name: '已安装' }));

    expect(onSwitchPanel).not.toHaveBeenCalled();
  });

  it('从市场可以切回已安装（此前市场是死路，进去就出不来）', () => {
    const { onSwitchPanel } = renderPanel({ panelId: 'pluginMarket' });

    fireEvent.click(screen.getByRole('tab', { name: '已安装' }));

    expect(onSwitchPanel).toHaveBeenCalledWith('plugin');
  });

  it('加载中禁用 tab，避免切换请求互相踩踏', () => {
    renderPanel({ panelId: 'plugin', loading: true });

    expect((screen.getByRole('tab', { name: '市场' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('插件面板：已安装', () => {
  it('列出全部插件', () => {
    setup();
    const list = getList();
    expect(within(list).getByText('context7')).toBeTruthy();
    expect(within(list).getByText('code-review')).toBeTruthy();
  });

  it('打开即显示首项详情，无需点击', () => {
    setup();
    const list = getList();
    const detail = getDetail();

    // 首项在列表里已标记为选中（本仓库未接入 jest-dom，直接读原生属性）
    const firstOption = within(list).getByText('context7').closest('[role="option"]');
    expect(firstOption?.getAttribute('aria-selected')).toBe('true');
    // 右侧详情不需要用户先点击就已经显示首项内容
    expect(within(detail).getByText('context7')).toBeTruthy();
    expect(within(detail).getByText('1.0.0')).toBeTruthy();
  });

  it('选中后详情区显示字段', () => {
    setup();
    fireEvent.click(within(getList()).getByText('code-review'));
    const detail = getDetail();
    expect(within(detail).getByText('code-review')).toBeTruthy();
  });

  it('已启用的插件给禁用按钮，且带上作用域', () => {
    // 作用域**必须**一起传：同一个 id 会在多个作用域各装一份，CLI 的 --scope 默认
    // auto-detect，不指定就可能禁掉另一行那份，而界面上没有任何迹象。
    const { onAction } = setup();
    fireEvent.click(within(getDetail()).getByRole('button', { name: '禁用' }));

    expect(onAction).toHaveBeenCalledWith('plugin.disable', ['context7@m#user#', 'user']);
  });

  it('已禁用的插件给启用按钮，且带上作用域', () => {
    const { onAction } = setup();
    fireEvent.click(within(getList()).getByText('code-review'));
    fireEvent.click(within(getDetail()).getByRole('button', { name: '启用' }));

    expect(onAction).toHaveBeenCalledWith('plugin.enable', ['code-review@m#user#', 'user']);
  });

  it('传出去的是完整 id 而不是显示用的短名', () => {
    // 短名不在集合里，会被 C# 侧校验拒掉，表现为「点了没反应还报错」。
    const { onAction } = setup();
    fireEvent.click(within(getDetail()).getByRole('button', { name: '禁用' }));

    expect(onAction.mock.calls[0][1][0]).toBe('context7@m#user#');
  });

  it('详情按钮只传 id（该命令没有作用域参数）', () => {
    const { onAction } = setup();
    fireEvent.click(within(getDetail()).getByRole('button', { name: '详情' }));

    expect(onAction).toHaveBeenCalledWith('plugin.details', ['context7@m#user#']);
  });

  it('CLI 没报作用域时，需要作用域的按钮一律停用并说明原因', () => {
    // 宁可停用也不能赌 auto-detect：赌错的后果是改掉另一份安装，且毫无迹象。
    renderPanel({
      items: [{ ...ITEMS[0], scope: '' }],
    });

    const detail = getDetail();
    expect((within(detail).getByRole('button', { name: '禁用' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(detail).getByRole('button', { name: '卸载' }) as HTMLButtonElement).disabled).toBe(true);
    // 详情是只读查询，不需要作用域，不该被连坐停用。
    expect((within(detail).getByRole('button', { name: '详情' }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(detail).getByText(/没有报告这份安装的作用域/)).toBeTruthy();
  });

  it('旧回包不带 scope 字段时按缺失处理，而不是把 undefined 拼进命令行', () => {
    const item = { ...ITEMS[0] };
    delete (item as { scope?: string }).scope;

    renderPanel({ items: [item] });

    expect((within(getDetail()).getByRole('button', { name: '禁用' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('插件面板：卸载确认', () => {
  it('第一次点卸载只进入确认态，不执行', () => {
    const { onAction } = setup();
    fireEvent.click(within(getDetail()).getByRole('button', { name: '卸载' }));

    expect(onAction).not.toHaveBeenCalled();
    // 确认按钮必须自带对象名，否则光看「确认」两个字无从判断要卸的是哪个。
    expect(within(getDetail()).getByRole('button', { name: /确认卸载 context7/ })).toBeTruthy();
  });

  it('确认后才执行，且带上作用域', () => {
    const { onAction } = setup();
    fireEvent.click(within(getDetail()).getByRole('button', { name: '卸载' }));
    fireEvent.click(within(getDetail()).getByRole('button', { name: /确认卸载/ }));

    expect(onAction).toHaveBeenCalledWith('plugin.uninstall', ['context7@m#user#', 'user']);
  });

  it('取消后回到未确认态', () => {
    const { onAction } = setup();
    fireEvent.click(within(getDetail()).getByRole('button', { name: '卸载' }));
    fireEvent.click(within(getDetail()).getByRole('button', { name: '取消' }));

    expect(onAction).not.toHaveBeenCalled();
    expect(within(getDetail()).getByRole('button', { name: '卸载' })).toBeTruthy();
  });

  it('换选中项会作废上一项的确认，不会卸错插件', () => {
    // 「点了 A 的卸载 → 改选 B → 再点确认」若不作废，卸掉的是用户根本没打算动的那个。
    const { onAction } = setup();
    fireEvent.click(within(getDetail()).getByRole('button', { name: '卸载' }));
    fireEvent.click(within(getList()).getByText('code-review'));

    expect(within(getDetail()).queryByRole('button', { name: /确认卸载/ })).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('插件面板：更新', () => {
  it('更新 tab 给「更新」按钮并带作用域，不给启用/禁用/卸载', () => {
    const { onAction } = renderPanel({ panelId: 'pluginUpdates' });

    const detail = getDetail();
    expect(within(detail).queryByRole('button', { name: '禁用' })).toBeNull();
    expect(within(detail).queryByRole('button', { name: '卸载' })).toBeNull();

    fireEvent.click(within(detail).getByRole('button', { name: '更新' }));
    expect(onAction).toHaveBeenCalledWith('plugin.update', ['context7@m#user#', 'user']);
  });

  it('提供「刷新市场索引」且不带任何槽位值', () => {
    // 市场索引不刷新的话，update 拿到的还是本地那份旧索引。
    const { onAction } = renderPanel({ panelId: 'pluginUpdates' });

    fireEvent.click(screen.getByRole('button', { name: '刷新市场索引' }));

    expect(onAction).toHaveBeenCalledWith('plugin.marketplaceUpdate', []);
  });

  it('明说 CLI 不提供可更新清单，而不是让人以为功能没做', () => {
    renderPanel({ panelId: 'pluginUpdates' });

    expect(screen.getByText(/不提供「哪些插件有新版本」的查询/)).toBeTruthy();
  });

  it('其它 tab 不出现「刷新市场索引」', () => {
    renderPanel({ panelId: 'plugin' });
    expect(screen.queryByRole('button', { name: '刷新市场索引' })).toBeNull();
  });
});

describe('插件面板：市场', () => {
  it('市场 tab 详情区只显示「安装」', () => {
    renderPanel({ panelId: 'pluginMarket' });

    const detail = getDetail();
    expect(within(detail).getByRole('button', { name: '安装' })).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: '启用' })).toBeNull();
    expect(within(detail).queryByRole('button', { name: '禁用' })).toBeNull();
    expect(within(detail).queryByRole('button', { name: '详情' })).toBeNull();
    expect(within(detail).queryByRole('button', { name: '卸载' })).toBeNull();
  });

  it('市场 tab 显示描述（描述只存在 detail 里，不在 fields 里）', () => {
    // PluginMarketParser（I7）把描述只存进 detail，不再重复存一份进 fields——
    // 面板必须渲染 detail，否则描述会从界面上彻底消失（终端里也看不到，纯静默丢失）。
    const marketItems: PanelItemView[] = [
      {
        id: 'context7@m', title: 'context7', subtitle: 'claude-plugins-official',
        enabled: true, detail: 'Upstash Context7 MCP server for up-to-date documentation lookup.',
        fields: {}, currentProject: false, scope: '',
      },
    ];

    renderPanel({ panelId: 'pluginMarket', items: marketItems });

    expect(within(getDetail()).getByText(/Upstash Context7 MCP server/)).toBeTruthy();
  });

  it('市场条目没有作用域，但不该因此停用「安装」', () => {
    // install 的作用域由 CLI 默认（user），不是我们要挑的那份已有安装，
    // 所以这里没有「可能改错对象」的问题，不能连坐停用。
    renderPanel({
      panelId: 'pluginMarket',
      items: [{ ...ITEMS[0], scope: '' }],
    });

    expect((within(getDetail()).getByRole('button', { name: '安装' }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(getDetail()).queryByText(/没有报告这份安装的作用域/)).toBeNull();
  });

  it('市场 tab 点「安装」时 onAction 收到完整 id', () => {
    // 短名不在集合里，会被 C# 侧校验拒掉，必须断言数组内容而非只断言被调用过。
    const { onAction } = renderPanel({ panelId: 'pluginMarket' });

    fireEvent.click(within(getDetail()).getByRole('button', { name: '安装' }));

    expect(onAction).toHaveBeenCalledWith('plugin.install', ['context7@m#user#']);
  });

  it('市场 tab 也提供搜索框', () => {
    renderPanel({ panelId: 'pluginMarket' });

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索插件市场' }), { target: { value: 'context7' } });

    expect(within(getDetail()).getByText('context7')).toBeTruthy();
    expect(within(getList()).queryByText('code-review')).toBeNull();
  });
});

describe('插件面板：空态与横幅', () => {
  it('items 为空时不崩', () => {
    renderPanel({ items: [] });

    // 列表空、selected 为 undefined，既有的 {selected && (...)} 守卫应挡住详情内容
    expect(screen.getByRole('listbox').children.length).toBe(0);
    expect(within(getDetail()).queryByRole('button')).toBeNull();
  });

  it('items 为空时两栏都不是一个字都没有', () => {
    // 设计 §7 要求「不给空白」：左栏空态用 CSS 内容承载（不占真实 DOM 子节点，
    // 不破坏上面「children.length 为 0」的断言），右栏给出真实的提示文字。
    renderPanel({ items: [] });

    expect(screen.getByRole('listbox').getAttribute('data-empty-text')).toBeTruthy();
    expect(within(getDetail()).getByText(/没有已装插件/)).toBeTruthy();
    // 空态内容走 CSS 伪元素生成，屏幕阅读器读不到，靠这个 aria-label 补一份同样的文案——
    // 此前只加了属性没有测试断言过，删掉它 237 条测试照样全绿（纸面覆盖）。
    expect(screen.getByRole('listbox').getAttribute('aria-label')).toBe('没有已装插件。');
  });

  it('还在加载时不下「没有已装插件」这种结论', () => {
    // 首屏取数期间列表当然是空的，那不代表「没有」。mcp list 实测能跑到 17 秒，
    // 这段时间里一直声称「没有」是在说一件尚未成立的事。
    renderPanel({ items: [], loading: true });

    expect(within(getDetail()).queryByText(/没有已装插件/)).toBeNull();
    expect(screen.getByRole('listbox').getAttribute('data-empty-text')).toBe('');
  });

  it('需要重启时显示横幅', () => {
    setup(true);
    expect(screen.getByText(/下个会话/)).toBeTruthy();
  });

  it('不需要重启时不显示横幅', () => {
    setup(false);
    expect(screen.queryByText(/下个会话/)).toBeNull();
  });

  it('已装插件没有描述时不渲染空的描述段落', () => {
    // 已装条目的 detail 恒为空串（PluginListParser 不填它），不该渲染出一个空 <p>。
    setup();
    const detail = getDetail();
    expect(detail.querySelector('.panel-detail-description')).toBeNull();
  });

  it('有错误且列表为空时，详情区不再显示与错误横幅矛盾的空态文案', () => {
    renderPanel({ items: [], error: '命令失败' });

    expect(within(getDetail()).queryByText(/没有已装插件/)).toBeNull();
    expect(screen.getByRole('listbox').getAttribute('data-empty-text')).toBe('');
  });

  it('loading 为 true 时动作按钮禁用，防止连点起多个进程', () => {
    renderPanel({ loading: true });

    expect((within(getDetail()).getByRole('button', { name: '禁用' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(getDetail()).getByRole('button', { name: '详情' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('插件面板：键盘与搜索', () => {
  it('方向键在列表项间循环移动选中', () => {
    setup();
    const list = getList();

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(within(getDetail()).getByText('code-review')).toBeTruthy();

    // 到底后继续按下应循环回首项
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(within(getDetail()).getByText('context7')).toBeTruthy();

    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(within(getDetail()).getByText('code-review')).toBeTruthy();
  });

  it('Home / End 直达首尾', () => {
    setup();
    const list = getList();

    fireEvent.keyDown(list, { key: 'End' });
    expect(within(getDetail()).getByText('code-review')).toBeTruthy();

    fireEvent.keyDown(list, { key: 'Home' });
    expect(within(getDetail()).getByText('context7')).toBeTruthy();
  });

  it('在搜索框里按方向键也能选（焦点不必先挪到列表上）', () => {
    // 此前搜索框里按方向键完全无效：焦点在 input 上，列表收不到按键，
    // 用户打完关键词必须先用鼠标点一下列表才能用键盘继续。
    setup();
    const search = screen.getByRole('searchbox', { name: '搜索已装插件' });

    fireEvent.keyDown(search, { key: 'ArrowDown' });

    expect(within(getDetail()).getByText('code-review')).toBeTruthy();
  });

  it('方向键换选中项时作废卸载确认', () => {
    const { onAction } = setup();
    fireEvent.click(within(getDetail()).getByRole('button', { name: '卸载' }));
    fireEvent.keyDown(getList(), { key: 'ArrowDown' });

    expect(within(getDetail()).queryByRole('button', { name: /确认卸载/ })).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('列表容器可用 Tab 聚焦，且 aria-activedescendant 指向当前选中项', () => {
    setup();
    const list = getList();

    expect(list.tabIndex).toBe(0);

    const firstOption = within(list).getByText('context7').closest('[role="option"]') as HTMLElement;
    expect(list.getAttribute('aria-activedescendant')).toBe(firstOption.id);

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    const secondOption = within(list).getByText('code-review').closest('[role="option"]') as HTMLElement;
    expect(list.getAttribute('aria-activedescendant')).toBe(secondOption.id);
  });

  it('复合 Id 含空格时 aria-activedescendant 仍指向合法的 DOM id', () => {
    // PluginListParser 把 Id 复合成 id#scope#projectPath，projectPath 常见形如
    // "C:\Program Files\Foo"，含空格。HTML5 规定 id 属性值不能含空白，直接拼进去会生成
    // 非法 IDREF——浏览器不报错，但 aria-activedescendant 静默失效，见 P4。
    const spacedItems: PanelItemView[] = [
      {
        id: 'foo@m#local#C:\\Program Files\\Foo',
        title: 'foo',
        subtitle: '1.0.0 · local',
        enabled: true,
        detail: '',
        fields: {},
        currentProject: false,
        scope: 'local',
      },
    ];

    renderPanel({ items: spacedItems });

    const list = getList();
    const option = within(list).getByText('foo').closest('[role="option"]') as HTMLElement;

    // 渲染出来的真实 DOM id 本身就不该再含空白符。
    expect(option.id).not.toMatch(/\s/);
    // aria-activedescendant 引用的 id 必须逐字等于该选项真实的 DOM id，才能被正确解读为指向它。
    expect(list.getAttribute('aria-activedescendant')).toBe(option.id);
  });

  it('搜索框按标题过滤列表（大小写不敏感）', () => {
    setup();
    const search = screen.getByRole('searchbox', { name: '搜索已装插件' });

    fireEvent.change(search, { target: { value: 'CODE' } });

    const list = getList();
    expect(within(list).queryByText('context7')).toBeNull();
    expect(within(list).getByText('code-review')).toBeTruthy();
  });

  it('搜索无匹配时列表与详情都给出不矛盾的提示', () => {
    setup();
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索已装插件' }), { target: { value: 'zzz-does-not-exist' } });

    expect(getList().children.length).toBe(0);
    expect(within(getDetail()).getByText(/没有匹配/)).toBeTruthy();
  });

  it('列表项标题使用可省略溢出的样式类', () => {
    setup();
    const title = within(getList()).getByText('context7');
    expect(title.className).toContain('panel-list-item-title');
  });
});
