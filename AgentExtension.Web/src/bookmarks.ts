// 书签：收藏的回复按会话存在 localStorage，各 tab 同源共享。

/** 一条书签。 */
export interface Bookmark
{
  /** 由回复正文算出的稳定键，也是转录里那块的锚点。 */
  id: string;
  /** 收藏时的回复全文。 */
  text: string;
  /** 回复的时刻，Unix 毫秒；不知道为 0。 */
  at: number;
  /** 收藏的时刻，Unix 毫秒。 */
  savedAt: number;
}

/** 存储键前缀，后面接会话 id。 */
const KEY_PREFIX = 'agentext.bookmarks.';

/** 单条书签最多存这么多字，防止撑爆 localStorage。 */
const MAX_TEXT = 20000;

/** 字符串的 djb2 散列，转成 36 进制。 */
function hash(text: string): string
{
  let value = 5381;

  for (let i = 0; i < text.length; i++)
  {
    value = ((value << 5) + value + text.charCodeAt(i)) | 0;
  }

  const result = (value >>> 0).toString(36);
  return result;
}

/**
 * 一块回复的书签键，只看正文。
 * 不掺时刻：实时块的时刻是宿主收到时打的，回放时换成转录里的，两边对不上。
 */
export function bookmarkId(text: string): string
{
  const id = `bm-${hash(text.trim())}`;
  return id;
}

/** 读出某个会话的书签；坏数据当作没有。 */
export function loadBookmarks(sessionId: string): Bookmark[]
{
  if (sessionId === '')
  {
    return [];
  }

  try
  {
    const raw = localStorage.getItem(KEY_PREFIX + sessionId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed)
      ? parsed.filter((item): item is Bookmark =>
        typeof item?.id === 'string' && typeof item?.text === 'string')
      : [];
    return list;
  }
  catch
  {
    return [];
  }
}

/** 整份写回；空了就删键。 */
export function saveBookmarks(sessionId: string, list: Bookmark[]): void
{
  if (sessionId === '')
  {
    return;
  }

  try
  {
    if (list.length === 0)
    {
      localStorage.removeItem(KEY_PREFIX + sessionId);
      return;
    }

    localStorage.setItem(KEY_PREFIX + sessionId, JSON.stringify(list));
  }
  catch
  {
    // 存不下就只留在内存里，不影响聊天
  }
}

/** 有就去掉、没有就加上，返回新清单（新加的排最前）。 */
export function toggleBookmark(list: Bookmark[], at: number | undefined, text: string, now: number): Bookmark[]
{
  const id = bookmarkId(text);

  if (list.some((item) => item.id === id))
  {
    const removed = list.filter((item) => item.id !== id);
    return removed;
  }

  const added: Bookmark = { id, text: text.slice(0, MAX_TEXT), at: at ?? 0, savedAt: now };
  const next = [added, ...list];
  return next;
}
