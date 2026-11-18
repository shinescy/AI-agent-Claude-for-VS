import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { SessionManager } from './SessionManager';
import type { SessionManagerHandle } from './SessionManager';
import type { PanelItemView, SessionGroupView } from '../panelState';
import { activeCount, bucketByGroup, parseCloudSessionInput, visibleSessions } from '../sessionManager';

function session(id: string, title: string, fields: Record<string, string> = {}, enabled = true): PanelItemView {
  return { id, title, subtitle: '2020-01-01 10:00', enabled, detail: '', fields, currentProject: true };
}

const G1: SessionGroupView = { id: 'a'.repeat(32), name: '修 bug 的' };
const G2: SessionGroupView = { id: 'b'.repeat(32), name: '空组' };

const ITEMS = [
  session('s1', '当前这条', { live: '1' }),
  session('s2', '登录修复', { group: G1.id }),
  session('s3', '别的 tab 开着', { live: '1' }),
  session('s4', '收起来的', { archived: '1' }),
  session('s5', '命令：/usage', {}, false),
  session('s6', '菜单重构', { branch: 'feature/menu' }),
];

function setup(overrides: Partial<Parameters<typeof SessionManager>[0]> = {}) {
  const onResume = vi.fn();
  const onNewSession = vi.fn();
  const onAction = vi.fn();
  const ref = createRef<SessionManagerHandle>();

  const view = render(
    <SessionManager
      ref={ref}
      items={ITEMS}
      groups={[G1, G2]}
      currentSessionId="s1"
      onResume={onResume}
      onNewSession={onNewSession}
      onAction={onAction}
      {...overrides}
    />);

  const row = (title: string) => screen.getByRole('button', { name: title });
  const group = (name: string) => screen.getByRole('region', { name });
  return { onResume, onNewSession, onAction, ref, row, group, container: view.container };
}

describe('会话管理：筛选与分桶', () => {
  it('默认不列已存档和探测会话，开关打开才列', () => {
    const base = { query: '', onlyActive: false, showArchived: false, showProbes: false };

    expect(visibleSessions(ITEMS, base).map((x) => x.id)).toEqual(['s1', 's2', 's3', 's6']);
    expect(visibleSessions(ITEMS, { ...base, showArchived: true }).map((x) => x.id)).toContain('s4');
    expect(visibleSessions(ITEMS, { ...base, showProbes: true }).map((x) => x.id)).toContain('s5');
  });

  it('只看活动与按标题、分支搜索', () => {
    const base = { query: '', onlyActive: false, showArchived: false, showProbes: false };

    expect(visibleSessions(ITEMS, { ...base, onlyActive: true }).map((x) => x.id)).toEqual(['s1', 's3']);
    expect(visibleSessions(ITEMS, { ...base, query: 'MENU' }).map((x) => x.id)).toEqual(['s6']);
  });

  it('活动数不跟着搜索词变', () => {
    expect(activeCount(ITEMS)).toBe(2);
  });

  it('分桶：用户的组在前，未分组垫底，空组也有一桶，组没了的会话算未分组', () => {
    const orphan = session('s9', '组被删了', { group: 'c'.repeat(32) });
    const buckets = bucketByGroup([ITEMS[1], ITEMS[5], orphan], [G1, G2]);

    expect(buckets.map((b) => b.group?.name ?? '未分组')).toEqual(['修 bug 的', '空组', '未分组']);
    expect(buckets.map((b) => b.items.map((x) => x.id))).toEqual([['s2'], [], ['s6', 's9']]);
  });
});

describe('会话管理弹窗', () => {
  it('按组列出，组名旁边是条数', () => {
    const { group } = setup();

    expect(within(group('修 bug 的')).getByText('登录修复')).toBeTruthy();
    expect(within(group('未分组')).getByText('菜单重构')).toBeTruthy();
    expect(within(group('未分组')).queryByText('登录修复')).toBeNull();
    expect(group('修 bug 的').querySelector('.session-mgr-count')?.textContent).toBe('1');
  });

  it('点一条会话就接回，当前会话点了没反应', () => {
    const { row, onResume } = setup();

    fireEvent.click(row('当前这条'));
    expect(onResume).not.toHaveBeenCalled();

    fireEvent.click(row('菜单重构'));
    expect(onResume).toHaveBeenCalledWith('s6', false);
  });

  it('开分支带 fork 标记，且不触发接回', () => {
    const { row, onResume } = setup();

    fireEvent.click(within(row('菜单重构')).getByRole('button', { name: '开分支' }));

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledWith('s6', true);
  });

  it('开着的会话和当前会话没有改名按钮', () => {
    const { row } = setup();

    expect(within(row('当前这条')).queryByRole('button', { name: '重命名' })).toBeNull();
    expect(within(row('别的 tab 开着')).queryByRole('button', { name: '重命名' })).toBeNull();
    expect(within(row('菜单重构')).getByRole('button', { name: '重命名' })).toBeTruthy();
  });

  it('改名回车后交给宿主', () => {
    const { row, onAction, onResume } = setup();

    fireEvent.click(within(row('菜单重构')).getByRole('button', { name: '重命名' }));
    const box = screen.getByRole('textbox', { name: '新名字' });
    fireEvent.change(box, { target: { value: ' 菜单做完了 ' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(onAction).toHaveBeenCalledWith('session.rename', ['s6', '菜单做完了']);
    expect(onResume).not.toHaveBeenCalled();
  });

  it('改名中外壳问 Esc：只取消改名', () => {
    const { row, ref, onAction } = setup();

    expect(ref.current!.handleEscape()).toBe(false);

    fireEvent.click(within(row('菜单重构')).getByRole('button', { name: '重命名' }));

    let handled = false;
    act(() =>
    {
      handled = ref.current!.handleEscape();
    });

    expect(handled).toBe(true);
    expect(screen.queryByRole('textbox', { name: '新名字' })).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('移到组的菜单：选组发 move，已在的组点不了，可移回未分组', () => {
    const { row, onAction } = setup();

    fireEvent.click(within(row('菜单重构')).getByRole('button', { name: '移到组' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '修 bug 的' }));
    expect(onAction).toHaveBeenCalledWith('session.group.move', ['s6', G1.id]);

    fireEvent.click(within(row('登录修复')).getByRole('button', { name: '移到组' }));
    expect((screen.getByRole('menuitem', { name: '修 bug 的' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: '未分组' }));
    expect(onAction).toHaveBeenCalledWith('session.group.ungroup', ['s2']);
  });

  it('把会话拖到组上就归进那个组，拖回原组不发', () => {
    const { group, onAction } = setup();
    const data = { types: ['application/x-agent-session'], getData: () => 's6', dropEffect: '' };

    fireEvent.drop(group('未分组'), { dataTransfer: data });
    expect(onAction).not.toHaveBeenCalled();

    fireEvent.drop(group('空组'), { dataTransfer: data });
    expect(onAction).toHaveBeenCalledWith('session.group.move', ['s6', G2.id]);
  });

  it('拖到未分组就是移出组', () => {
    const { group, onAction } = setup();
    const data = { types: ['application/x-agent-session'], getData: () => 's2', dropEffect: '' };

    fireEvent.drop(group('未分组'), { dataTransfer: data });

    expect(onAction).toHaveBeenCalledWith('session.group.ungroup', ['s2']);
  });

  it('新建组、改组名', () => {
    const { group, onAction } = setup();

    fireEvent.click(screen.getByRole('button', { name: '＋ 新建组' }));
    const box = screen.getByRole('textbox', { name: '组名' });
    fireEvent.change(box, { target: { value: '重构' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onAction).toHaveBeenCalledWith('session.group.create', ['重构']);

    fireEvent.click(within(group('空组')).getByRole('button', { name: '改组名' }));
    const rename = screen.getByRole('textbox', { name: '组名' });
    fireEvent.change(rename, { target: { value: '待办' } });
    fireEvent.keyDown(rename, { key: 'Enter' });
    expect(onAction).toHaveBeenCalledWith('session.group.rename', [G2.id, '待办']);
  });

  it('删除组要点两次，未分组没有删除', () => {
    const { group, onAction } = setup();
    const remove = within(group('空组')).getByRole('button', { name: '删除组' });

    fireEvent.click(remove);
    expect(onAction).not.toHaveBeenCalled();

    fireEvent.click(remove);
    expect(onAction).toHaveBeenCalledWith('session.group.delete', [G2.id]);
    expect(within(group('未分组')).queryByRole('button', { name: '删除组' })).toBeNull();
  });

  it('活动按钮显示正开着的条数，点了只看它们', () => {
    setup();
    const active = screen.getByRole('button', { name: '活动 · 2' });

    fireEvent.click(active);

    expect(screen.queryByText('菜单重构')).toBeNull();
    expect(screen.getByText('别的 tab 开着')).toBeTruthy();
  });

  it('筛选里打开「显示已存档」才看到已存档，可取消存档', () => {
    const { row, onAction } = setup();

    expect(screen.queryByText('收起来的')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '筛选' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '显示已存档' }));
    fireEvent.click(within(row('收起来的')).getByRole('button', { name: '取消存档' }));

    expect(onAction).toHaveBeenCalledWith('session.unarchive', ['s4']);
  });

  it('存档发 session.archive，当前会话不给存档', () => {
    const { row, onAction } = setup();

    expect(within(row('当前这条')).queryByRole('button', { name: '存档' })).toBeNull();

    fireEvent.click(within(row('菜单重构')).getByRole('button', { name: '存档' }));
    expect(onAction).toHaveBeenCalledWith('session.archive', ['s6']);
  });

  it('搜索时空组不显示', () => {
    setup();

    fireEvent.change(screen.getByRole('textbox', { name: '搜索会话…' }), { target: { value: '菜单' } });

    expect(screen.queryByRole('region', { name: '空组' })).toBeNull();
    expect(screen.getByText('菜单重构')).toBeTruthy();
  });

  it('空态区分「真的没有」与「被筛掉了」，出错时不补空态', () => {
    const { container: empty } = setup({ items: [], groups: [] });
    expect(within(empty).getByText('这个目录下还没有历史会话。')).toBeTruthy();

    const { container: filtered } = setup({ items: [ITEMS[3]], groups: [] });
    expect(within(filtered).getByText(/都被筛掉了/)).toBeTruthy();

    const { container: failed } = setup({ items: [], groups: [], error: '读取失败' });
    expect(within(failed).queryByText('这个目录下还没有历史会话。')).toBeNull();
  });

  it('点开新会话触发 onNewSession', () => {
    const { onNewSession } = setup();

    fireEvent.click(screen.getByRole('button', { name: '开新会话' }));

    expect(onNewSession).toHaveBeenCalledTimes(1);
  });
});

describe('会话管理：Web 页签', () => {
  const WEB = [
    session('session_01A', '修登录', { status: 'idle', repo: 'acme/web', branch: 'claude/fix-login' }),
    session('session_01B', '（没有标题）', { status: 'running', truncated: '1' }),
  ];

  function openWeb(cloud: { loading?: boolean; items?: PanelItemView[]; error?: string } = {}) {
    const onLoadCloud = vi.fn();
    const onTeleport = vi.fn();
    const onOpenWeb = vi.fn();

    const view = setup({
      cloud: { loading: false, items: WEB, error: '', ...cloud },
      onLoadCloud,
      onTeleport,
      onOpenWeb,
    });

    fireEvent.click(within(view.container).getByRole('tab', { name: 'Web' }));
    return { ...view, onLoadCloud, onTeleport, onOpenWeb };
  }

  it('不给网页数据就没有页签，本地照旧', () => {
    setup();

    expect(screen.queryByRole('tab', { name: 'Web' })).toBeNull();
    expect(screen.getByText('菜单重构')).toBeTruthy();
  });

  it('第一次切到 Web 才去读，来回切不重复读', () => {
    const { onLoadCloud } = openWeb();

    expect(onLoadCloud).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('tab', { name: '本地' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Web' }));

    expect(onLoadCloud).toHaveBeenCalledTimes(1);
  });

  it('列出网页会话：标题、仓库分支、状态', () => {
    openWeb();

    expect(screen.getByText('修登录')).toBeTruthy();
    expect(screen.getByText('acme/web · claude/fix-login')).toBeTruthy();
    expect(screen.getByText('空闲')).toBeTruthy();
    expect(screen.getByText('运行中')).toBeTruthy();
    expect(screen.queryByText('菜单重构')).toBeNull();
  });

  it('拉回本机要点两次才发，发的是会话 id', () => {
    const { onTeleport } = openWeb();
    const pull = screen.getAllByRole('button', { name: '拉回本机' })[0];

    fireEvent.click(pull);
    expect(onTeleport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确定?' }));
    expect(onTeleport).toHaveBeenCalledWith('session_01A');
  });

  it('贴链接点接回：原样交给宿主去认', () => {
    const { onTeleport } = openWeb();

    fireEvent.change(screen.getByRole('textbox', { name: '网页会话的链接或 id' }), {
      target: { value: ' https://claude.ai/code/session_01Z ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '接回' }));

    expect(onTeleport).toHaveBeenCalledWith('https://claude.ai/code/session_01Z');
  });

  it('贴的不是会话链接：就地报错，不发', () => {
    const { onTeleport } = openWeb();

    fireEvent.change(screen.getByRole('textbox', { name: '网页会话的链接或 id' }), {
      target: { value: 'https://example.com/code/session_01Z' },
    });
    fireEvent.click(screen.getByRole('button', { name: '接回' }));

    expect(onTeleport).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('不是网页会话');
  });

  it('网页打开用 claude.ai/code 的地址', () => {
    const { onOpenWeb } = openWeb();

    fireEvent.click(screen.getAllByRole('button', { name: '网页打开' })[0]);

    expect(onOpenWeb).toHaveBeenCalledWith('https://claude.ai/code/session_01A');
  });

  it('读不了时把原因显示出来，不说「没有网页会话」', () => {
    openWeb({ items: [], error: 'CLI 拒绝读取：这个 Visual Studio 是从某个 Claude Code 会话里启动的。' });

    expect(screen.getByRole('alert').textContent).toContain('CLI 拒绝读取');
    expect(screen.queryByText('账号下还没有网页会话。')).toBeNull();
  });

  it('读取中、确实为空、没列全各有各的说法', () => {
    const loading = openWeb({ loading: true, items: [] });
    expect(within(loading.container).getByText('正在读取网页会话…')).toBeTruthy();

    const empty = openWeb({ items: [] });
    expect(within(empty.container).getByText('账号下还没有网页会话。')).toBeTruthy();

    const partial = openWeb();
    expect(within(partial.container).getByText(/只列出了最近的一部分/)).toBeTruthy();
  });

  it('刷新再读一次', () => {
    const { onLoadCloud } = openWeb();

    fireEvent.click(screen.getByRole('button', { name: '刷新' }));

    expect(onLoadCloud).toHaveBeenCalledTimes(2);
  });
});

describe('认网页会话的链接与 id', () => {
  it('id 本身和 claude.ai/code 链接都认', () => {
    expect(parseCloudSessionInput('  session_01AbC-x_9 ')).toBe('session_01AbC-x_9');
    expect(parseCloudSessionInput('cse_abc')).toBe('cse_abc');
    expect(parseCloudSessionInput('https://claude.ai/code/session_01A?tab=diff')).toBe('session_01A');
  });

  it('别的站点、http、带空格参数的都不认', () => {
    expect(parseCloudSessionInput('https://evil.example/code/session_01A')).toBe('');
    expect(parseCloudSessionInput('http://claude.ai/code/session_01A')).toBe('');
    expect(parseCloudSessionInput('session_01A --dangerously-skip-permissions')).toBe('');
    expect(parseCloudSessionInput('11111111-1111-1111-1111-111111111111')).toBe('');
    expect(parseCloudSessionInput('')).toBe('');
  });
});
