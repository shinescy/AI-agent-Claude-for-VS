// 钩子弹窗（/hooks）：按事件列出钩子；命令类钩子可新增、编辑，可改的都能删。

import { useEffect, useState } from 'react';
import { useT } from '../LangContext';
import { useCliDialog } from '../useCliDialog';
import { HOOK_TYPES, buildHookConfig, emptyHookFields, fieldsFromConfig } from '../hookForm';
import type { HookFields, HookType } from '../hookForm';

/** CLI get_hooks_listing 里的一条钩子。 */
export interface HookRow
{
  event: string;
  matcher: string;
  source: string;
  sourceLabel?: string;
  pluginName?: string;
  type: string;
  displayText?: string;
  condition?: string;
  runsInBackground?: boolean;
  disabled?: boolean;
  editable?: { matcher: string; config: Record<string, unknown> };
}

/** 事件目录里的一项。 */
export interface HookEvent
{
  name: string;
  summary?: string;
  supportsMatcher?: boolean;
}

export interface HooksListing
{
  hooks?: HookRow[];
  eventCatalog?: HookEvent[];
  policy?: { disabledByPolicy?: boolean; managedOnly?: boolean; pluginOnly?: boolean; allDisabled?: boolean };
}

/** 能写的三个设置文件。 */
const SOURCES = ['localSettings', 'projectSettings', 'userSettings'];

/** 表单内容；editing 为被编辑的那条，新增时为 null。 */
interface HookForm
{
  event: string;
  matcher: string;
  source: string;
  fields: HookFields;
  /** 打开编辑时请求头那栏的原文；没改过就沿用旧值。 */
  originalHeaders: string;
  editing: HookRow | null;
}

/** 按事件分组，保持清单原顺序。 */
export function groupHooks(hooks: HookRow[]): { event: string; rows: HookRow[] }[]
{
  const groups: { event: string; rows: HookRow[] }[] = [];

  for (const hook of hooks)
  {
    let group = groups.find((g) => g.event === hook.event);

    if (!group)
    {
      group = { event: hook.event, rows: [] };
      groups.push(group);
    }

    group.rows.push(hook);
  }

  return groups;
}

interface HooksDialogProps
{
  onClose: () => void;
}

export function HooksDialog({ onClose }: HooksDialogProps)
{
  const t = useT();
  const { dialog, error, busy, edit } = useCliDialog<HooksListing>('hooks');
  const [form, setForm] = useState<HookForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HookRow | null>(null);

  // 表单提交在途：回包成功才关表单，失败留着让用户改
  const [saving, setSaving] = useState(false);

  useEffect(() =>
  {
    if (!saving || busy)
    {
      return;
    }

    setSaving(false);

    if (error === '')
    {
      setForm(null);
    }
  }, [saving, busy, error]);

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

  const sourceLabels: Record<string, string> = {
    localSettings: t('本项目（不入库）'),
    projectSettings: t('本项目'),
    userSettings: t('用户级'),
  };

  const catalog = dialog?.eventCatalog ?? [];
  const policy = dialog?.policy;
  const supportsMatcher = (name: string) => catalog.find((e) => e.name === name)?.supportsMatcher === true;

  // 表单本地的校验错误（必填项、JSON 格式）
  const [formError, setFormError] = useState('');

  function startAdd()
  {
    setConfirmDelete(null);
    setFormError('');
    setForm({
      event: catalog[0]?.name ?? 'PreToolUse', matcher: '', source: 'localSettings',
      fields: emptyHookFields(), originalHeaders: '', editing: null,
    });
  }

  function startEdit(row: HookRow)
  {
    const fields = fieldsFromConfig(row.editable!.config);
    setConfirmDelete(null);
    setFormError('');
    setForm({
      event: row.event,
      matcher: row.editable?.matcher ?? row.matcher,
      source: row.source,
      fields,
      originalHeaders: fields.headersText,
      editing: row,
    });
  }

  /** 改表单里的一个字段。 */
  function setField<K extends keyof HookFields>(key: K, value: HookFields[K])
  {
    if (form !== null)
    {
      setForm({ ...form, fields: { ...form.fields, [key]: value } });
    }
  }

  function save()
  {
    if (form === null)
    {
      return;
    }

    const old = form.editing;
    const built = buildHookConfig(form.fields, old?.editable?.config, old ? form.originalHeaders : undefined);

    if (built.error !== undefined || built.config === undefined)
    {
      setFormError(built.error ?? '');
      return;
    }

    setFormError('');
    const matcher = supportsMatcher(form.event) ? form.matcher.trim() : '';

    if (old === null)
    {
      edit({ op: 'add', source: form.source, event: form.event, matcher, hook: built.config });
    }
    else
    {
      edit({
        op: 'replace', source: old.source, event: form.event, matcher, hook: built.config,
        target: { event: old.event, matcher: old.editable!.matcher, hook: old.editable!.config },
      });
    }

    setSaving(true);
  }

  const typeLabels: Record<HookType, string> = {
    command: t('运行命令'),
    prompt: t('让模型判断（提示词）'),
    agent: t('交给子代理'),
    http: t('发 HTTP 请求'),
    mcp_tool: t('调用 MCP 工具'),
  };

  function remove(row: HookRow)
  {
    if (confirmDelete !== row)
    {
      setConfirmDelete(row);
      return;
    }

    setConfirmDelete(null);
    edit({
      op: 'remove', source: row.source, event: row.event,
      target: { event: row.event, matcher: row.editable!.matcher, hook: row.editable!.config },
    });
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
      <div className="modal-card skills-dialog" role="dialog" aria-modal="true" aria-label={t('钩子')}>
        <div className="modal-header">
          <span className="modal-title">{t('钩子')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error !== '' && <div className="login-error" role="alert">{error}</div>}
          {dialog === null && busy && <p className="modal-muted">{t('正在读取…')}</p>}

          {policy?.allDisabled && <p className="modal-muted">{t('设置里关掉了全部钩子，下面的钩子都不会运行。')}</p>}
          {policy?.disabledByPolicy && <p className="modal-muted">{t('企业策略禁用了钩子。')}</p>}
          {policy?.managedOnly && <p className="modal-muted">{t('企业策略只允许托管钩子，这里加的不会运行。')}</p>}

          {dialog !== null && form === null && (
            <button type="button" className="login-button" disabled={busy} onClick={startAdd}>{t('添加钩子')}</button>
          )}

          {form !== null && (
            <form
              className="rules-form"
              onSubmit={(e) =>
              {
                e.preventDefault();
                save();
              }}
            >
              <div className="rules-form-row">
                <select
                  aria-label={t('事件')}
                  value={form.event}
                  onChange={(e) => setForm({ ...form, event: e.target.value })}
                >
                  {catalog.map((item) => (
                    <option key={item.name} value={item.name}>{item.name}{item.summary ? ` — ${item.summary}` : ''}</option>
                  ))}
                </select>
                <select
                  aria-label={t('保存到')}
                  value={form.source}
                  disabled={form.editing !== null}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                >
                  {SOURCES.map((value) => <option key={value} value={value}>{sourceLabels[value]}</option>)}
                </select>
              </div>
              {supportsMatcher(form.event) && (
                <input
                  type="text"
                  className="login-input"
                  value={form.matcher}
                  placeholder={t('匹配哪些工具，例如 Bash 或 Edit|Write；留空匹配全部')}
                  aria-label={t('匹配条件')}
                  onChange={(e) => setForm({ ...form, matcher: e.target.value })}
                />
              )}
              <select
                aria-label={t('钩子类型')}
                value={form.fields.type}
                onChange={(e) => setField('type', e.target.value as HookType)}
              >
                {HOOK_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
              </select>

              <HookTypeFields fields={form.fields} setField={setField} />

              <input
                type="text"
                className="login-input"
                value={form.fields.condition}
                placeholder={t('只在这种调用时运行，例如 Bash(git *)；留空为总是')}
                aria-label={t('运行条件')}
                onChange={(e) => setField('condition', e.target.value)}
              />
              <div className="rules-form-row">
                <input
                  type="text"
                  className="login-input"
                  value={form.fields.timeout}
                  placeholder={t('超时秒数（可空）')}
                  aria-label={t('超时秒数')}
                  onChange={(e) => setField('timeout', e.target.value)}
                />
                <input
                  type="text"
                  className="login-input"
                  value={form.fields.statusMessage}
                  placeholder={t('运行时显示的文字（可空）')}
                  aria-label={t('状态文字')}
                  onChange={(e) => setField('statusMessage', e.target.value)}
                />
              </div>

              {formError !== '' && <div className="login-error" role="alert">{t(formError)}</div>}

              <div className="rules-form-row">
                <button type="submit" className="login-button login-button-primary" disabled={busy}>
                  {form.editing === null ? t('添加') : t('保存')}
                </button>
                <button type="button" className="login-button" onClick={() => setForm(null)}>{t('取消')}</button>
              </div>
            </form>
          )}

          {dialog !== null && (dialog.hooks ?? []).length === 0 && <p className="modal-muted">{t('还没有任何钩子。')}</p>}

          {groupHooks(dialog?.hooks ?? []).map((group) => (
            <div key={group.event}>
              <div className="modal-section-title">{group.event}</div>
              <ul className="skills-list">
                {group.rows.map((row, index) => (
                  <li className="skills-row" key={`${row.source}|${row.matcher}|${index}`}>
                    <div className="skills-main">
                      <div className="rules-rule" title={row.displayText}>{row.displayText || row.type}</div>
                      <div className="skills-meta">
                        {[
                          row.matcher ? t('匹配 {m}', { m: row.matcher }) : '',
                          row.condition ? t('条件 {c}', { c: row.condition }) : '',
                          row.runsInBackground ? t('后台运行') : '',
                          row.disabled ? t('已停用') : '',
                          row.pluginName ? t('插件 {p}', { p: row.pluginName }) : (row.sourceLabel ?? row.source),
                        ].filter((part) => part).join(' · ')}
                      </div>
                    </div>
                    {row.editable
                      ? (
                        <span className="hooks-actions">
                          {(HOOK_TYPES as readonly string[]).includes(String(row.editable.config.type)) && (
                            <button type="button" className="skills-state" disabled={busy} onClick={() => startEdit(row)}>
                              {t('编辑')}
                            </button>
                          )}
                          <button
                            type="button"
                            className="skills-state"
                            disabled={busy}
                            aria-label={`${t('删除')} ${row.displayText ?? ''}`}
                            onClick={() => remove(row)}
                          >
                            {confirmDelete === row ? t('确认删除') : t('删除')}
                          </button>
                        </span>
                      )
                      : <span className="skills-lock" title={t('这条不在可改的设置文件里')}>{t('只读')}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 按钩子类型显示各自的字段。 */
function HookTypeFields(
  { fields, setField }: { fields: HookFields; setField: <K extends keyof HookFields>(key: K, value: HookFields[K]) => void })
{
  const t = useT();

  switch (fields.type)
  {
    case 'command':
      return (
        <>
          <textarea
            className="login-input rules-input"
            rows={2}
            value={fields.command}
            placeholder={t('要运行的命令')}
            aria-label={t('命令')}
            onChange={(e) => setField('command', e.target.value)}
          />
          <div className="rules-form-row">
            <select aria-label={t('用哪个 shell')} value={fields.shell} onChange={(e) => setField('shell', e.target.value)}>
              <option value="">{t('默认 shell')}</option>
              <option value="bash">bash</option>
              <option value="powershell">PowerShell</option>
            </select>
            <label className="sandbox-mode">
              <input type="checkbox" checked={fields.async} onChange={(e) => setField('async', e.target.checked)} />
              {t('后台运行')}
            </label>
          </div>
        </>
      );

    case 'prompt':
    case 'agent':
      return (
        <>
          <textarea
            className="login-input rules-input"
            rows={3}
            value={fields.prompt}
            placeholder={fields.type === 'prompt' ? t('让模型据此判断，可用 $ARGUMENTS 引用钩子输入') : t('交给子代理去做的事')}
            aria-label={t('提示词')}
            onChange={(e) => setField('prompt', e.target.value)}
          />
          <div className="rules-form-row">
            <input
              type="text"
              className="login-input"
              value={fields.model}
              placeholder={t('模型（可空，用默认）')}
              aria-label={t('模型')}
              onChange={(e) => setField('model', e.target.value)}
            />
            {fields.type === 'prompt' && (
              <label className="sandbox-mode">
                <input
                  type="checkbox"
                  checked={fields.continueOnBlock}
                  onChange={(e) => setField('continueOnBlock', e.target.checked)}
                />
                {t('拦下后继续')}
              </label>
            )}
          </div>
        </>
      );

    case 'http':
      return (
        <>
          <input
            type="text"
            className="login-input"
            value={fields.url}
            placeholder="https://example.com/hook"
            aria-label={t('网址')}
            onChange={(e) => setField('url', e.target.value)}
          />
          <textarea
            className="login-input rules-input"
            rows={3}
            value={fields.headersText}
            placeholder={t('请求头，JSON 对象（可空），例如 {"Authorization": "Bearer $TOKEN"}')}
            aria-label={t('请求头')}
            onChange={(e) => setField('headersText', e.target.value)}
          />
          <input
            type="text"
            className="login-input"
            value={fields.envVars}
            placeholder={t('允许在请求头里引用的环境变量，逗号分隔（可空）')}
            aria-label={t('允许的环境变量')}
            onChange={(e) => setField('envVars', e.target.value)}
          />
        </>
      );

    case 'mcp_tool':
      return (
        <>
          <div className="rules-form-row">
            <input
              type="text"
              className="login-input"
              value={fields.server}
              placeholder={t('MCP 服务器名')}
              aria-label={t('MCP 服务器')}
              onChange={(e) => setField('server', e.target.value)}
            />
            <input
              type="text"
              className="login-input"
              value={fields.tool}
              placeholder={t('工具名')}
              aria-label={t('工具')}
              onChange={(e) => setField('tool', e.target.value)}
            />
          </div>
          <textarea
            className="login-input rules-input"
            rows={3}
            value={fields.inputText}
            placeholder={t('传给工具的输入，JSON 对象（可空）')}
            aria-label={t('工具输入')}
            onChange={(e) => setField('inputText', e.target.value)}
          />
        </>
      );
  }
}