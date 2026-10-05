// 输入框的「固定提示词」：存取与拼接规则。

/** 提示词属于哪一格。 */
export type PromptScope = 'terminal' | 'chat';

/** 存档键。终端那条不能改名：用户的模板就存在这个键下，改名等于把它悄悄清空且不报错。 */
const PROMPT_KEYS: Record<PromptScope, string> = {
  terminal: 'agent.terminalPrompt',
  chat: 'agent.chatPrompt',
};

/** 只用到的那几个 Storage 方法。 */
export interface StorageLike
{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const NULL_STORAGE: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
};

/** 默认存储。 */
export function defaultStorage(): StorageLike
{
  try
  {
    if (typeof window !== 'undefined' && window.localStorage)
    {
      return window.localStorage;
    }
  }
  catch
  {
    // localStorage 可能被策略禁用，访问本身就会抛。
  }

  return NULL_STORAGE;
}

export function loadPrompt(scope: PromptScope, storage: StorageLike = defaultStorage()): string
{
  try
  {
    const raw = storage.getItem(PROMPT_KEYS[scope]);
    return typeof raw === 'string' ? raw : '';
  }
  catch
  {
    return '';
  }
}

export function savePrompt(
  scope: PromptScope, prompt: string, storage: StorageLike = defaultStorage()): void
{
  try
  {
    storage.setItem(PROMPT_KEYS[scope], prompt);
  }
  catch
  {
  }
}

/** 把提示词和内容拼成真正送出去的那一段。 */
export function joinPromptAndContent(prompt: string, content: string): string
{
  const head = prompt.replace(/\s+$/, '');

  if (head === '')
  {
    return content;
  }

  if (content === '')
  {
    return head;
  }

  return `${head}\n${content}`;
}

/** 取内容开头那条命令的名字；开头不是命令就返回 null。 */
export function leadingCommand(content: string): string | null
{
  const firstLine = content.split('\n', 1)[0];
  const match = /^\/([A-Za-z][\w:-]*)(?:\s|$)/.exec(firstLine);

  return match === null ? null : match[1];
}

/** 提示词是不是「有内容」的。 */
export function hasPrompt(prompt: string): boolean
{
  return prompt.replace(/\s+$/, '') !== '';
}
