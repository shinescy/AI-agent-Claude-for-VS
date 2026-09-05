import { describe, it, expect } from 'vitest';
import { detectSlashQuery, filterCommands } from './slash';

describe('slash 触发检测', () => {
  it('行首斜杠触发', () => { expect(detectSlashQuery('/com', 4)).toBe('com'); });
  it('只有斜杠时查询为空串而非 null', () => { expect(detectSlashQuery('/', 1)).toBe(''); });
  it('句中的斜杠不触发', () => { expect(detectSlashQuery('看 a/b 路径', 5)).toBeNull(); });
  it('新行行首触发', () => {
    const text = '第一行\n/cle';
    expect(detectSlashQuery(text, text.length)).toBe('cle');
  });
  it('斜杠后有空格则不再是命令', () => { expect(detectSlashQuery('/com mit', 8)).toBeNull(); });
  it('光标在斜杠之前不触发', () => { expect(detectSlashQuery('/com', 0)).toBeNull(); });
  it('空文本不触发', () => { expect(detectSlashQuery('', 0)).toBeNull(); });
});

describe('命令过滤', () => {
  const commands = ['compact', 'clear', 'cost', 'superpowers:brainstorming', 'pr-review:review-pr'];

  it('空查询返回全部', () => { expect(filterCommands(commands, '')).toEqual(commands); });
  it('前缀匹配优先于包含匹配', () => { expect(filterCommands(commands, 'c')[0]).toBe('compact'); });
  it('能匹配插件命名空间后半段', () => {
    expect(filterCommands(commands, 'brainstorm')).toContain('superpowers:brainstorming');
  });
  it('大小写不敏感', () => { expect(filterCommands(commands, 'CLEAR')).toContain('clear'); });
  it('无匹配返回空数组', () => { expect(filterCommands(commands, 'zzz')).toEqual([]); });
});
