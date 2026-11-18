import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolsDialog, groupTools } from './ToolsDialog';

describe('工具对话框', () => {
  it('内置的一组，MCP 的按服务器分组并去掉前缀', () => {
    expect(groupTools(['Bash', 'mcp__context7__query-docs', 'Read', 'mcp__context7__resolve', 'mcp__vs__build']))
      .toEqual({
        builtIn: ['Bash', 'Read'],
        mcp: [
          { server: 'context7', tools: ['query-docs', 'resolve'] },
          { server: 'vs', tools: ['build'] },
        ],
      });
  });

  it('列出工具，组标题带数量', () => {
    render(<ToolsDialog tools={['Bash', 'mcp__vs__build']} onClose={() => undefined} />);

    expect(screen.getByText('Bash')).toBeTruthy();
    expect(screen.getByText('build')).toBeTruthy();
    expect(screen.getByText('MCP · vs')).toBeTruthy();
  });

  it('还没清单时说明要等第一条消息，而不是一片空白', () => {
    render(<ToolsDialog tools={[]} onClose={() => undefined} />);

    expect(screen.getByText(/第一条消息/)).toBeTruthy();
  });
});
