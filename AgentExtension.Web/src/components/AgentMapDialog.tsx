// 「代理图」小弹窗：左边主对话，右边它派出的子代理，下面是后台任务；点一个看详情。

import { useEffect, useState } from 'react';
import { formatDuration } from '../agentMap';
import type { AgentMap, AgentNode, AgentStatus } from '../agentMap';
import { formatTokens } from '../promptCache';
import { useT } from '../LangContext';

interface AgentMapDialogProps {
  map: AgentMap;
  /** 主对话在用的模型，给人看的名字。 */
  modelName: string;
  /** 主对话上下文里的 token 数；不知道为 0。 */
  contextTokens: number;
  busy: boolean;
  onClose: () => void;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  running: '正在跑',
  done: '已完成',
  failed: '失败',
  stopped: '已中断',
  background: '在后台跑',
};

export function AgentMapDialog({ map, modelName, contextTokens, busy, onClose }: AgentMapDialogProps) {
  const t = useT();

  /** 展开看详情的那一个的 id；空串表示都收着。 */
  const [openId, setOpenId] = useState('');

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

  const mainParts = [modelName];

  if (contextTokens > 0)
  {
    mainParts.push(t('上下文 {n} token', { n: formatTokens(contextTokens) }));
  }

  /** 子代理名字下面那行：类型、耗时、token、工具调用数。 */
  function agentSubtitle(agent: AgentNode): string
  {
    const parts: string[] = [t(STATUS_LABEL[agent.status])];

    if (agent.agentType !== '')
    {
      parts.push(agent.agentType);
    }

    if (agent.durationMs > 0)
    {
      parts.push(formatDuration(agent.durationMs));
    }

    if (agent.totalTokens > 0)
    {
      parts.push(`${formatTokens(agent.totalTokens)} tokens`);
    }

    if (agent.toolUses > 0)
    {
      parts.push(t('{n} 次工具调用', { n: agent.toolUses }));
    }

    return parts.join(' · ');
  }

  function toggle(id: string)
  {
    setOpenId((current) => (current === id ? '' : id));
  }

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
      <div className="modal-card agent-map" role="dialog" aria-modal="true" aria-label={t('代理图')}>
        <div className="modal-header">
          <span className="modal-title">{t('代理图')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-muted">
            {map.agents.length === 0
              ? t('这个会话还没有派出过子代理。Claude 把任务分给子代理时，会显示在这里。')
              : t('{n} 个子代理 · 点一个看它的任务和结果', { n: map.agents.length })}
          </div>

          <div className="agent-map-tree">
            <div className="agent-map-node agent-map-main">
              <span className={`agent-map-dot${busy ? ' agent-map-dot-running' : ''}`} aria-hidden="true" />
              <span className="agent-map-text">
                <span className="agent-map-name">{t('主对话')}</span>
                <span className="agent-map-sub">{mainParts.filter((part) => part !== '').join(' · ')}</span>
              </span>
            </div>

            {map.agents.length > 0 && (
              <div className="agent-map-children">
                {map.agents.map((agent) => (
                  <div className="agent-map-child" key={agent.id}>
                    <button
                      type="button"
                      className="agent-map-node"
                      aria-expanded={openId === agent.id}
                      onClick={() => toggle(agent.id)}
                    >
                      <span className={`agent-map-dot agent-map-dot-${agent.status}`} aria-hidden="true" />
                      <span className="agent-map-text">
                        <span className="agent-map-name">{agent.title}</span>
                        <span className="agent-map-sub">{agentSubtitle(agent)}</span>
                      </span>
                    </button>

                    {openId === agent.id && (
                      <div className="agent-map-detail">
                        <div className="agent-map-detail-title">{t('派给它的任务')}</div>
                        <pre>{agent.prompt === '' ? t('（没有记录）') : agent.prompt}</pre>
                        <div className="agent-map-detail-title">{t('它交回的结果')}</div>
                        <pre>{agent.result === '' ? t('（还没有结果）') : agent.result}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {map.tasks.length > 0 && (
            <>
              <div className="modal-section-title">
                {t('{n} 个后台任务 · 点一个看命令', { n: map.tasks.length })}
              </div>
              <div className="modal-muted">
                {t('这些命令被放到后台运行。面板读不到它们现在是否还在跑。')}
              </div>
              {map.tasks.map((task) => (
                <div className="agent-map-child agent-map-task" key={task.id}>
                  <button
                    type="button"
                    className="agent-map-node"
                    aria-expanded={openId === task.id}
                    onClick={() => toggle(task.id)}
                  >
                    <span className="agent-map-dot agent-map-dot-background" aria-hidden="true" />
                    <span className="agent-map-text">
                      <span className="agent-map-name">{task.title}</span>
                      <span className="agent-map-sub">shell</span>
                    </span>
                  </button>

                  {openId === task.id && (
                    <div className="agent-map-detail">
                      <div className="agent-map-detail-title">{t('命令')}</div>
                      <pre>{task.command}</pre>
                      {task.result !== '' && (
                        <>
                          <div className="agent-map-detail-title">{t('启动时的回话')}</div>
                          <pre>{task.result}</pre>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
