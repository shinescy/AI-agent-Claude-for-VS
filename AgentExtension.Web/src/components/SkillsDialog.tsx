// 技能对话框（/skills）：列出全部技能，逐个切换「开 / 只给名字 / 仅限你调用 / 关」。

import { useEffect, useRef, useState } from 'react';
import { onHostMessage, sendSetSkillState, sendSkillsQuery } from '../bridge';
import { useT } from '../LangContext';

/** CLI get_skills_dialog 里的一行。 */
export interface SkillRow
{
  name: string;
  display_name?: string;
  description?: string;
  source?: string;
  tokens?: number;
  state: string;
  locked_by?: string;
  handles?: unknown;
}

/** 状态的切换顺序，与 VS Code 版一致。 */
export const SKILL_STATES = ['on', 'name-only', 'user-invocable-only', 'off'];

/** 点一下切到的下一个状态。 */
export function nextSkillState(state: string): string
{
  const index = SKILL_STATES.indexOf(state);
  const next = SKILL_STATES[(index + 1) % SKILL_STATES.length];
  return next;
}

/** 按名字、说明、来源筛。 */
export function filterSkills(skills: SkillRow[], query: string): SkillRow[]
{
  const q = query.trim().toLowerCase();

  if (q === '')
  {
    return skills;
  }

  return skills.filter((skill) =>
    [skill.name, skill.display_name ?? '', skill.description ?? '', skill.source ?? '']
      .some((text) => text.toLowerCase().includes(q)));
}

interface SkillsDialogProps
{
  onClose: () => void;
}

let skillsSeq = 0;

export function SkillsDialog({ onClose }: SkillsDialogProps)
{
  const t = useT();
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  /** 说明已展开的技能名。 */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const requestIdRef = useRef('');

  function toggleExpanded(name: string)
  {
    setExpanded((current) =>
    {
      const next = new Set(current);

      if (!next.delete(name))
      {
        next.add(name);
      }

      return next;
    });
  }

  const stateLabels: Record<string, string> = {
    'on': t('开'),
    'name-only': t('只给名字'),
    'user-invocable-only': t('仅限你调用'),
    'off': t('关'),
  };

  const stateHints: Record<string, string> = {
    'on': t('Claude 看得到并会主动用，你也能用 / 调用'),
    'name-only': t('Claude 只看到名字、看不到说明'),
    'user-invocable-only': t('只有你能用 / 调用，Claude 看不到'),
    'off': t('Claude 和命令列表里都不出现'),
  };

  const lockHints: Record<string, string> = {
    'plugin': t('随插件管理'),
    'author': t('由技能文件自己设定'),
    'policy': t('由更高优先级的配置设定'),
    'flag': t('由更高优先级的配置设定'),
    'reserved-name': t('这个名字没法写进设置，要改技能的文件夹或文件名'),
  };

  function request(send: (requestId: string) => void)
  {
    skillsSeq += 1;
    const requestId = `skills-${skillsSeq}-${Date.now()}`;
    requestIdRef.current = requestId;
    send(requestId);
  }

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as { type?: string; payload?: { kind?: string; requestId?: string; dialog?: string; error?: string } };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || payload.kind !== 'skills' || payload.requestId !== requestIdRef.current)
      {
        return;
      }

      setBusy(null);
      setError(payload.error ?? '');

      if (payload.dialog)
      {
        try
        {
          const parsed = JSON.parse(payload.dialog) as { skills?: SkillRow[] };
          setSkills(parsed.skills ?? []);
        }
        catch
        {
          setError(t('技能清单格式不对，读不了。'));
        }
      }
      else
      {
        setSkills((current) => current ?? []);
      }
    });

    request(sendSkillsQuery);
    return off;
  }, []);

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

  function cycle(skill: SkillRow)
  {
    if (busy !== null)
    {
      return;
    }

    setBusy(skill.name);
    setError('');
    const edit = { name: skill.name, state: nextSkillState(skill.state), handles: skill.handles };
    request((requestId) => sendSetSkillState(edit, requestId));
  }

  const shown = filterSkills(skills ?? [], query);

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
      <div className="modal-card skills-dialog" role="dialog" aria-modal="true" aria-label={t('技能')}>
        <div className="modal-header">
          <span className="modal-title">{t('技能')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="login-note">{t('点状态按钮切换：开 → 只给名字 → 仅限你调用 → 关。改动会写进设置文件。')}</p>

          <input
            type="text"
            className="login-input"
            value={query}
            placeholder={t('筛选技能…')}
            aria-label={t('筛选技能')}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />

          {error !== '' && <div className="login-error" role="alert">{error}</div>}

          {skills === null && <p className="modal-muted">{t('正在读取技能清单…')}</p>}

          {skills !== null && shown.length === 0 && (
            <p className="modal-muted">{query.trim() === '' ? t('没有技能。') : t('没有匹配的技能。')}</p>
          )}

          <ul className="skills-list">
            {shown.map((skill) => (
              <li className="skills-row" key={skill.name}>
                <div className="skills-main">
                  <div className="skills-name" title={skill.name}>{skill.display_name || skill.name}</div>
                  <div className="skills-meta">
                    {[skill.source, skill.tokens !== undefined ? t('约 {n} token', { n: skill.tokens }) : '']
                      .filter((part) => part)
                      .join(' · ')}
                  </div>
                  {skill.description && (
                    <button
                      type="button"
                      className={expanded.has(skill.name) ? 'skills-desc is-expanded' : 'skills-desc'}
                      aria-expanded={expanded.has(skill.name)}
                      title={expanded.has(skill.name) ? t('点击收起') : t('点击看完整说明')}
                      onClick={() => toggleExpanded(skill.name)}
                    >
                      {skill.description}
                    </button>
                  )}
                </div>

                {skill.locked_by
                  ? (
                    <span className="skills-lock" title={lockHints[skill.locked_by] ?? skill.locked_by}>
                      {stateLabels[skill.state] ?? skill.state} · {t('已锁定')}
                    </span>
                  )
                  : (
                    <button
                      type="button"
                      className="skills-state"
                      data-state={skill.state}
                      title={`${stateHints[skill.state] ?? ''}${t('。点击切换。')}`}
                      aria-label={`${skill.display_name || skill.name}: ${stateLabels[skill.state] ?? skill.state}`}
                      disabled={busy !== null}
                      onClick={() => cycle(skill)}
                    >
                      {busy === skill.name ? t('保存中…') : (stateLabels[skill.state] ?? skill.state)}
                    </button>
                  )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
