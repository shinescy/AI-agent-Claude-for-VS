// 工具对话框：这个会话里 Claude 能调用的工具，内置的与各 MCP 服务器的分开列。

import { useEffect } from 'react';
import { useT } from '../LangContext';

/** 按来源分好的工具：内置一组，MCP 按服务器各一组。 */
export interface ToolGroups
{
  builtIn: string[];
  mcp: { server: string; tools: string[] }[];
}

/** MCP 工具名形如 mcp__服务器__工具。 */
const MCP_TOOL = /^mcp__(.+?)__(.+)$/;

/** 把 CLI 报的工具名分成内置与各 MCP 服务器。 */
export function groupTools(tools: string[]): ToolGroups
{
  const builtIn: string[] = [];
  const byServer = new Map<string, string[]>();

  for (const tool of tools)
  {
    const match = MCP_TOOL.exec(tool);

    if (match === null)
    {
      builtIn.push(tool);
      continue;
    }

    const list = byServer.get(match[1]) ?? [];
    list.push(match[2]);
    byServer.set(match[1], list);
  }

  const mcp = Array.from(byServer, ([server, list]) => ({ server, tools: list }));
  return { builtIn, mcp };
}

interface ToolsDialogProps
{
  /** CLI 报的工具名；还没报时为空。 */
  tools: string[];
  onClose: () => void;
}

export function ToolsDialog({ tools, onClose }: ToolsDialogProps)
{
  const t = useT();
  const groups = groupTools(tools);

  // 捕获阶段接 Esc：只关弹窗，不让它继续传去打断生成。
  useEffect(() =>
  {
    function onKeyDown(e: KeyboardEvent)
    {
      if (e.key === 'Escape')
      {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) =>
      {
        if (e.target === e.currentTarget)
        {
          onClose();
        }
      }}
    >
      <div className="modal-card skills-dialog" role="dialog" aria-modal="true" aria-label={t('工具')}>
        <div className="modal-header">
          <span className="modal-title">{t('工具')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="login-note">{t('这个会话里 Claude 能调用的工具。MCP 服务器提供的按服务器分组。')}</p>

          {tools.length === 0 && (
            <p className="modal-muted">{t('还没有工具清单：CLI 要等这个会话发出第一条消息才报。')}</p>
          )}

          {groups.builtIn.length > 0 && (
            <ToolGroup title={t('内置')} tools={groups.builtIn} />
          )}

          {groups.mcp.map((group) => (
            <ToolGroup key={group.server} title={`MCP · ${group.server}`} tools={group.tools} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolGroup({ title, tools }: { title: string; tools: string[] })
{
  return (
    <div className="tools-group">
      <div className="modal-section-title">
        {title}
        <span className="status-panel-count">{tools.length}</span>
      </div>
      <ul className="tools-list">
        {tools.map((tool) => <li key={tool}>{tool}</li>)}
      </ul>
    </div>
  );
}
