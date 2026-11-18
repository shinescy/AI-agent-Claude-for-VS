// 权限规则弹窗（/permissions）：按允许 / 询问 / 拒绝分组列规则，可新增和删除；末尾列工作目录与默认模式。

import { useEffect, useRef, useState } from 'react';
import { onHostMessage, sendEditPermissionRules, sendPermissionRulesQuery } from '../bridge';
import { useT } from '../LangContext';

/** CLI list_permission_rules 里的一条规则。 */
export interface PermissionRuleRow
{
  rule: string;
  behavior: string;
  source: string;
}

/** 工作目录一栏的一行：source 为 original 表示会话起始目录。 */
export interface WorkspaceDirectoryRow
{
  path: string;
  source: string;
}

/** 默认模式一栏的一行：某个设置文件里写的 defaultMode。 */
export interface DefaultModeRow
{
  mode: string;
  source: string;
}

/** 能写入、也就能删的三个设置文件。 */
export const EDITABLE_SOURCES = ['localSettings', 'projectSettings', 'userSettings'];

/** 分组顺序，与 CLI 自己的面板一致。 */
export const BEHAVIORS = ['allow', 'ask', 'deny'];

/** 把每行一条的输入拆成规则列表。 */
export function splitRules(text: string): string[]
{
  const rules = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
  return rules;
}

interface PermissionRulesDialogProps
{
  /** 打开「设置文件」面板，去编辑器里改规则以外的配置。 */
  onOpenSettingsFiles: () => void;
  onClose: () => void;
}

let rulesSeq = 0;

/** 解析宿主给的 JSON 数组；坏了当空。 */
function parseRows<T>(json: string | undefined): T[]
{
  try
  {
    const rows = json ? (JSON.parse(json) as T[]) : [];
    return Array.isArray(rows) ? rows : [];
  }
  catch
  {
    return [];
  }
}

export function PermissionRulesDialog({ onOpenSettingsFiles, onClose }: PermissionRulesDialogProps)
{
  const t = useT();
  const [rules, setRules] = useState<PermissionRuleRow[] | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceDirectoryRow[]>([]);
  const [defaultModes, setDefaultModes] = useState<DefaultModeRow[]>([]);
  const [managedOnly, setManagedOnly] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // 正在哪一组里加规则；空串表示没开输入框
  const [adding, setAdding] = useState('');
  const [draft, setDraft] = useState('');
  const [destination, setDestination] = useState('localSettings');
  const requestIdRef = useRef('');

  // 这次请求是新增：成功后才收起输入框。
  const clearDraftOnSuccessRef = useRef(false);

  const sectionLabels: Record<string, string> = { allow: t('允许'), ask: t('每次询问'), deny: t('拒绝') };

  const destinationLabels: Record<string, string> = {
    userSettings: t('用户级'),
    projectSettings: t('本项目'),
    localSettings: t('本项目（不入库）'),
  };

  const fromLabels: Record<string, string> = {
    userSettings: t('来自用户级设置'),
    projectSettings: t('来自项目设置'),
    localSettings: t('来自项目本地设置'),
    policySettings: t('来自企业策略'),
    session: t('仅本次会话'),
    cliArg: t('来自命令行参数'),
    flagSettings: t('来自命令行参数'),
    command: t('来自命令'),
    original: t('原始工作目录'),
  };

  function request(send: (requestId: string) => void)
  {
    rulesSeq += 1;
    const requestId = `rules-${rulesSeq}-${Date.now()}`;
    requestIdRef.current = requestId;
    setBusy(true);
    send(requestId);
  }

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as {
        type?: string;
        payload?: {
          kind?: string; requestId?: string; state?: string; warnings?: string; error?: string;
          workspace?: string; defaultModes?: string;
        };
      };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || payload.kind !== 'permissionRules' || payload.requestId !== requestIdRef.current)
      {
        return;
      }

      setBusy(false);
      setError(payload.error ?? '');

      try
      {
        setWarnings(payload.warnings ? (JSON.parse(payload.warnings) as string[]) : []);
      }
      catch
      {
        setWarnings([]);
      }

      setWorkspace(parseRows<WorkspaceDirectoryRow>(payload.workspace));
      setDefaultModes(parseRows<DefaultModeRow>(payload.defaultModes));

      // 成功了才收起输入框；失败留着让用户改
      if (!payload.error && clearDraftOnSuccessRef.current)
      {
        setDraft('');
        setAdding('');
      }

      clearDraftOnSuccessRef.current = false;

      if (!payload.state)
      {
        return;
      }

      try
      {
        const parsed = JSON.parse(payload.state) as { rules?: PermissionRuleRow[]; managedOnly?: boolean };
        setRules(parsed.rules ?? []);
        setManagedOnly(parsed.managedOnly === true);
      }
      catch
      {
        setError(t('规则清单格式不对，读不了。'));
      }
    });

    request(sendPermissionRulesQuery);
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

  function openAdd(behavior: string)
  {
    setAdding(behavior);
    setDraft('');
  }

  function add()
  {
    const list = splitRules(draft);

    if (list.length === 0 || busy || adding === '')
    {
      return;
    }

    setError('');
    clearDraftOnSuccessRef.current = true;
    request((requestId) => sendEditPermissionRules({ op: 'add', rules: list, behavior: adding, destination }, requestId));
  }

  function remove(row: PermissionRuleRow)
  {
    if (busy)
    {
      return;
    }

    setError('');
    request((requestId) =>
      sendEditPermissionRules({ op: 'remove', rule: row.rule, behavior: row.behavior, source: row.source }, requestId));
  }

  function renderAddForm(behavior: string)
  {
    return (
      <form
        className="rules-form"
        onSubmit={(e) =>
        {
          e.preventDefault();
          add();
        }}
      >
        <textarea
          className="login-input rules-input"
          value={draft}
          rows={2}
          autoFocus
          placeholder={t('规则写法如 Bash(npm run test:*)、Read(./src/**)、WebFetch(domain:example.com)，一行一条。')}
          aria-label={t('新规则')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) =>
          {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
            {
              e.preventDefault();
              add();
            }
          }}
        />
        <div className="rules-form-row">
          <span className="rules-form-label">{t('保存到')}</span>
          <select aria-label={t('保存到')} value={destination} onChange={(e) => setDestination(e.target.value)}>
            {EDITABLE_SOURCES.map((value) => <option key={value} value={value}>{destinationLabels[value]}</option>)}
          </select>
          <button type="button" className="login-button" onClick={() => setAdding('')}>{t('取消')}</button>
          <button
            type="submit"
            className="login-button login-button-primary"
            disabled={busy || splitRules(draft).length === 0}
            aria-label={`${t('添加')} ${sectionLabels[behavior]}`}
          >
            {t('添加')}
          </button>
        </div>
      </form>
    );
  }

  function renderSection(behavior: string)
  {
    const rows = (rules ?? []).filter((row) => row.behavior === behavior);

    return (
      <section className="rules-section" key={behavior}>
        <div className="rules-section-head">
          <span className="rules-section-title">{sectionLabels[behavior]} ({rows.length})</span>
          {adding !== behavior && (
            <button
              type="button"
              className="modal-link rules-add-link"
              aria-label={`${t('添加规则…')} ${sectionLabels[behavior]}`}
              onClick={() => openAdd(behavior)}
            >
              {t('添加规则…')}
            </button>
          )}
        </div>

        {adding === behavior && renderAddForm(behavior)}

        {rows.length > 0 && (
          <ul className="rules-box">
            {rows.map((row, index) => (
              <li className="rules-item" key={`${row.source}|${row.rule}|${index}`}>
                <span className="rules-rule" title={row.rule}>{row.rule}</span>
                <span className="rules-source">{fromLabels[row.source] ?? row.source}</span>
                {EDITABLE_SOURCES.includes(row.source)
                  ? (
                    <button
                      type="button"
                      className="rules-remove"
                      aria-label={`${t('删除')} ${row.rule}`}
                      disabled={busy}
                      onClick={() => remove(row)}
                    >
                      {t('删除')}
                    </button>
                  )
                  : <span className="rules-readonly" title={t('这条不在可改的设置文件里')}>{t('只读')}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
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
      <div className="modal-card skills-dialog rules-dialog" role="dialog" aria-modal="true" aria-label={t('权限规则')}>
        <div className="modal-header">
          <span className="modal-title">{t('权限规则')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {managedOnly && <p className="modal-muted">{t('企业策略限定只认托管规则，这里加的规则可能不生效。')}</p>}

          {error !== '' && <div className="login-error" role="alert">{error}</div>}
          {warnings.map((warning, index) => <div className="modal-muted" key={index}>⚠ {warning}</div>)}

          {rules === null && busy && <p className="modal-muted">{t('正在读取规则…')}</p>}

          {BEHAVIORS.map((behavior) => renderSection(behavior))}

          {workspace.length > 0 && (
            <section className="rules-section">
              <div className="rules-section-head">
                <span className="rules-section-title">{t('工作区目录')} ({workspace.length})</span>
              </div>
              <ul className="rules-box">
                {workspace.map((row, index) => (
                  <li className="rules-item" key={`${row.source}|${row.path}|${index}`}>
                    <span className="rules-rule" title={row.path}>{row.path}</span>
                    <span className="rules-source">{fromLabels[row.source] ?? row.source}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {defaultModes.length > 0 && (
            <section className="rules-section">
              <div className="rules-section-head">
                <span className="rules-section-title">{t('默认模式')} ({defaultModes.length})</span>
              </div>
              <ul className="rules-box">
                {defaultModes.map((row, index) => (
                  <li className="rules-item" key={`${row.source}|${row.mode}|${index}`}>
                    <span className="rules-rule" title={row.mode}>{row.mode}</span>
                    <span className="rules-source">{fromLabels[row.source] ?? row.source}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="rules-footnote">
            {t('规则取自正在运行的会话，包括只对本次会话生效的批准和启动时设置的规则。在这里添加或删除的规则会写进你选的设置文件。工作区目录列的是会话起始目录和设置文件里的附加目录；默认模式是新会话的起始档位，排在前面的优先，当前档位以状态栏为准。')}
          </p>

          <button type="button" className="modal-link rules-full-link" onClick={onOpenSettingsFiles}>
            {t('在编辑器里打开设置文件…')}
          </button>
        </div>
      </div>
    </div>
  );
}
