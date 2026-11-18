// 会话信息条：输入框底部那一栏。型号选择挪到了上面的状态栏（ModelPicker），品牌收进了「设置」。

import type { AgentSessionInfo } from '../types';
import { useT } from '../LangContext';


interface SessionInfoBarProps {
  session: AgentSessionInfo | null;

  /** 打开 status 面板。 */
  onOpenStatus: () => void;

  /** 子代理总数与正在跑的个数；不给就不画入口。 */
  agents?: { total: number; running: number };
  onOpenAgentMap?: () => void;

  /** 打开 MCP 管理面板；不给就只显示数字。 */
  onOpenMcp?: () => void;
}

/** MCP 那一项的文字与悬停说明：本会话加载的服务器，不是全部已配置的。 */
export function describeMcpServers(
  servers: AgentSessionInfo['mcpServers'],
  t: ReturnType<typeof useT>): { text: string; title: string } {
  const reported = servers.filter((s) => s.status !== '');
  const connected = reported.filter((s) => s.status === 'connected').length;
  const allFine = reported.length === 0 || connected === reported.length;

  const text = allFine
    ? t('MCP {n} 个', { n: servers.length })
    : t('MCP {ok}/{n} 已连接', { ok: connected, n: servers.length });

  const lines = servers.map((s) => (s.status === '' ? s.name : `${s.name} · ${s.status}`));
  const title = [t('本会话加载的 MCP 服务器'), ...lines, '', t('点开管理全部已配置的 MCP 服务器')].join('\n');

  return { text, title };
}

/** 把路径压到能放进一行。 */
export function shortenPath(path: string, maxLength = 40): string {
  if (path.length <= maxLength) {
    return path;
  }

  const separator = path.includes('\\') ? '\\' : '/';
  const parts = path.split(separator).filter((p) => p !== '');
  const kept: string[] = [];
  let length = 0;

  for (let i = parts.length - 1; i >= 0; i--) {
    if (length + parts[i].length + 1 > maxLength - 2) {
      break;
    }

    kept.unshift(parts[i]);
    length += parts[i].length + 1;
  }

  if (kept.length === 0) {
    // 单段就已经超长（比如一个极长的目录名），只能硬截尾部。
    return '…' + path.slice(-(maxLength - 1));
  }

  return '…' + separator + kept.join(separator);
}

export function SessionInfoBar(props: SessionInfoBarProps) {
  const {
    session, onOpenStatus, agents, onOpenAgentMap, onOpenMcp,
  } = props;

  const t = useT();
  return (
    <div className="session-bar" role="status">
      {session === null
        ? <span className="session-bar-item session-bar-hint">{t('会话尚未启动')}</span>
        : <SessionFacts session={session} onOpenMcp={onOpenMcp} />}

      <span className="session-bar-spacer" />

      {agents !== undefined && onOpenAgentMap !== undefined && (
        <button
          type="button"
          className="status-button agents-pill"
          title={agents.running > 0
            ? t('有子代理正在工作，点开看代理图')
            : t('点开看代理图：主对话派出了哪些子代理、起了哪些后台任务')}
          onClick={onOpenAgentMap}
        >
          <span
            className={`agent-map-dot${agents.running > 0 ? ' agent-map-dot-running' : ''}`}
            aria-hidden="true"
          />
          {agents.total === 1 ? t('1 个代理') : t('{n} 个代理', { n: agents.total })}
        </button>
      )}

      {session !== null && (
        <button
          type="button"
          className="status-button"
          title={t('会话状态：会话 id、工作目录、额度等')}
          onClick={onOpenStatus}
        >
          {t('状态')} ›
        </button>
      )}
    </div>
  );
}

/** 会话起来之后才有的那几项事实。 */
function SessionFacts({ session, onOpenMcp }: { session: AgentSessionInfo; onOpenMcp?: () => void }) {
  const t = useT();
  const mcp = describeMcpServers(session.mcpServers, t);

  return (
    <>
      {session.cwd !== '' && (
        <>
          <span className="session-bar-sep">·</span>
          <span className="session-bar-item" title={session.cwd}>{shortenPath(session.cwd)}</span>
        </>
      )}

      <span className="session-bar-sep">·</span>
      {onOpenMcp === undefined
        ? <span className="session-bar-item" title={mcp.title}>{mcp.text}</span>
        : (
          <button type="button" className="status-button session-bar-mcp" title={mcp.title} onClick={onOpenMcp}>
            {mcp.text}
          </button>
        )}

      {session.cliVersion !== '' && (
        <>
          <span className="session-bar-sep">·</span>
          <span className="session-bar-item">CLI {session.cliVersion}</span>
        </>
      )}
    </>
  );
}
