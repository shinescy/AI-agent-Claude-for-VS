// 会话管理弹窗的筛选与分桶，纯函数。

import type { PanelItemView, SessionGroupView } from './panelState';

/** 弹窗顶上那排开关的状态。 */
export interface SessionFilter {
  query: string;
  /** 只看正开着的（有 CLI 进程在跑）。 */
  onlyActive: boolean;
  showArchived: boolean;
  /** 连只有启动探测、没有对话的会话也列出来。 */
  showProbes: boolean;
}

/** 一个组和它里面的会话；group 为 null 是「未分组」。 */
export interface SessionBucket {
  group: SessionGroupView | null;
  items: PanelItemView[];
}

/** 未分组那一桶在折叠表、拖放目标里用的键。 */
export const UNGROUPED_KEY = '';

export function isArchived(item: PanelItemView): boolean {
  return item.fields['archived'] === '1';
}

/** 有 CLI 进程在跑：聊天 tab 或终端里开着。 */
export function isLive(item: PanelItemView): boolean {
  return item.fields['live'] === '1';
}

/** 「活动 · N」里的 N：不受其它筛选影响，否则数字会跟着搜索词跳。 */
export function activeCount(items: PanelItemView[]): number {
  return items.filter(isLive).length;
}

/** 按顶上的开关和搜索词留下该显示的会话，顺序不变。 */
export function visibleSessions(items: PanelItemView[], filter: SessionFilter): PanelItemView[] {
  const q = filter.query.trim().toLowerCase();

  return items.filter((item) =>
  {
    if (!filter.showProbes && !item.enabled)
    {
      return false;
    }

    if (!filter.showArchived && isArchived(item))
    {
      return false;
    }

    if (filter.onlyActive && !isLive(item))
    {
      return false;
    }

    return q === ''
      || item.title.toLowerCase().includes(q)
      || (item.fields['branch'] ?? '').toLowerCase().includes(q);
  });
}

/** 分桶：用户的组按创建顺序在前，「未分组」垫底；空组也给一桶。 */
export function bucketByGroup(items: PanelItemView[], groups: SessionGroupView[]): SessionBucket[] {
  const known = new Set(groups.map((g) => g.id));
  const buckets: SessionBucket[] = groups.map((group) => ({
    group,
    items: items.filter((item) => item.fields['group'] === group.id),
  }));

  buckets.push({
    group: null,
    items: items.filter((item) => !known.has(item.fields['group'] ?? '')),
  });

  return buckets;
}

/** 网页会话 id 的形状，与 CLI、宿主的校验一致。 */
const CLOUD_ID = /^(?:session|cse)_[A-Za-z0-9_-]{1,120}$/;

/**
 * 从用户贴的内容里认出网页会话 id：id 本身，或 claude.ai/code 的链接。认不出返回空串。
 * 这里只为了早点提示；真正的校验在宿主。
 */
export function parseCloudSessionInput(input: string): string {
  const text = input.trim();

  if (CLOUD_ID.test(text))
  {
    return text;
  }

  let url: URL;

  try
  {
    url = new URL(text);
  }
  catch
  {
    return '';
  }

  const host = url.hostname.toLowerCase();

  if (url.protocol !== 'https:' || (host !== 'claude.ai' && !host.endsWith('.claude.ai')))
  {
    return '';
  }

  const segments = url.pathname.split('/').filter((part) => part !== '').reverse();
  return segments.find((part) => CLOUD_ID.test(part)) ?? '';
}

/** 网页会话的状态代码对应的中文；不认识的原样给。 */
export const CLOUD_STATUS_TEXT: Record<string, string> = {
  running: '运行中',
  idle: '空闲',
  requires_action: '等你处理',
  pending: '启动中',
  failed: '失败',
  archived: '已存档',
};
