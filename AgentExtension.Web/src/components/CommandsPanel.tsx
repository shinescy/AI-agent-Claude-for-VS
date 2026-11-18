// 命令面板：取代在本管线下被 CLI 拒绝的 /help。

import { useMemo, useState } from 'react';
import type { AgentSessionInfo } from '../types';
import { useT } from '../LangContext';

interface CommandsPanelProps {
  session: AgentSessionInfo | null;
  /** 实测在本环境用不了的命令，划掉并给出说明。 */
  unavailableCommands: string[];
}

export function CommandsPanel({ session, unavailableCommands }: CommandsPanelProps) {
  const t = useT();
  const [query, setQuery] = useState('');

  const infos = session?.slashCommandInfos ?? [];
  const unavailable = new Set(unavailableCommands);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (q === '') {
      return infos;
    }

    return infos.filter((c) =>
      c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [infos, query]);

  const builtin = filtered.filter((c) => !c.name.includes(':'));
  const plugin = filtered.filter((c) => c.name.includes(':'));

  function renderGroup(title: string, list: typeof filtered) {
    if (list.length === 0) {
      return null;
    }

    return (
      <>
        <div className="panel-group-title">{title} <span className="panel-row-size">{list.length}</span></div>
        {list.map((c) => (
          <div key={c.name} className="panel-row">
            <span className={unavailable.has(c.name) ? 'panel-row-title panel-row-struck' : 'panel-row-title'}>
              /{c.name}
            </span>
            {c.argumentHint !== '' && (
              <span className="panel-row-hint">{c.argumentHint}</span>
            )}
            <span className="panel-row-desc" title={c.description}>{c.description}</span>
            {unavailable.has(c.name) && (
              <span className="panel-row-scope">{t('本环境不可用')}</span>
            )}
          </div>
        ))}
      </>
    );
  }

  return (
    <div className="panel-plain">
      {/* 会话还没起来时命令清单本来就是空的，不能说成「没有命令」 */}
      {session === null ? (
        <div className="panel-empty">{t('会话尚未启动，命令清单还没取到。')}</div>
      ) : (
        <>
          {/* 结构与 MCP 面板的搜索框一致：外层容器带边框与内边距，样式挂在容器上 */}
          <div className="panel-search">
            <input
              type="search"
              placeholder={t('按名字或说明筛选')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="panel-hint">
            {t('说明由 CLI 提供。输入框里打 / 也能直接补全这些命令。')}
          </div>

          {infos.length === 0 && (
            <div className="panel-empty">{t('这一版 CLI 没有报出命令说明。')}</div>
          )}

          {renderGroup(t('内置'), builtin)}
          {renderGroup(t('插件与技能'), plugin)}
        </>
      )}
    </div>
  );
}
