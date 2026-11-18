// MCP 面板：列表 + 动作 + 新增远程服务器表单。

import { forwardRef, useImperativeHandle, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { PanelItemView } from '../panelState';
import { domId } from '../domId';
import { useT, useFieldLabel } from '../LangContext';

interface McpPanelProps {
  items: PanelItemView[];
  onAction: (actionId: string, values: string[]) => void;
  /** 取数出错时的原因；为空表示正常。 */
  error?: string;
  /** 请求进行中：动作按钮此时应禁用，防止连点起多个进程。 */
  loading?: boolean;
}

/** 供 PanelOverlay 通过 ref 调用的命令式接口。 */
export interface McpPanelHandle {
  /** Esc 按下时调用。 */
  handleEscape: () => boolean;
}

export const McpPanel = forwardRef<McpPanelHandle, McpPanelProps>(function McpPanel(
  { items, onAction, error = '', loading = false }, ref) {
  const t = useT();
  const fieldLabel = useFieldLabel();
  const [selectedId, setSelectedId] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const nameLooksValid = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/.test(name);
  const urlLooksValid = /^https?:\/\/\S+$/.test(url);
  const canSubmit = nameLooksValid && urlLooksValid;

  const selected = items.find((x) => x.id === selectedId) ?? items[0];

  // 取数本身出错时顶部已经在报错，这里不该再重复一句「没有已配置的 MCP 服务器」——
  const emptyText = error === '' && !loading ? t('没有已配置的 MCP 服务器。') : '';

  useImperativeHandle(ref, () => ({
    handleEscape: () => {
      if (adding) {
        setAdding(false);
        return true;
      }
      return false;
    },
  }));

  function handleListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (items.length === 0) {
      return;
    }

    const currentIndex = items.findIndex((x) => x.id === selected?.id);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = items[(currentIndex + 1 + items.length) % items.length];
      setSelectedId(next.id);
      setAdding(false);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = items[(currentIndex - 1 + items.length) % items.length];
      setSelectedId(prev.id);
      setAdding(false);
    }
  }

  return (
    <div className="panel-content">
      {/* 与 PluginPanel 的「市场」按钮位置对齐：全局动作放左栏上方，
          避免被误认为是针对当前选中项的操作。 */}
      {!adding && (
        <div className="panel-actions">
          <button type="button" disabled={loading} onClick={() => setAdding(true)}>{t('新增远程服务器')}</button>
        </div>
      )}

      <div className="panel-master-detail">
        <div
          className="panel-list"
          role="listbox"
          tabIndex={0}
          data-empty-text={emptyText}
          aria-label={items.length === 0 && emptyText !== '' ? emptyText : undefined}
          aria-activedescendant={selected ? `panel-list-item-${domId(selected.id)}` : undefined}
          onKeyDown={handleListKeyDown}
        >
          {items.map((item) => (
            <div
              key={item.id}
              id={`panel-list-item-${domId(item.id)}`}
              role="option"
              aria-selected={selected?.id === item.id}
              className={`panel-list-item${selected?.id === item.id ? ' panel-list-item-selected' : ''}`}
              onClick={() => {
                setSelectedId(item.id);
                setAdding(false);
              }}
            >
              <span className={item.enabled ? 'panel-dot-on' : 'panel-dot-off'}>
                {item.enabled ? '●' : '○'}
              </span>
              <span className="panel-list-item-title">{item.title}</span>
            </div>
          ))}
        </div>

        <div className="panel-detail" role="region" aria-label={t('详情')}>
          {selected && !adding && (
            <>
              <div className="panel-detail-title">{selected.title}</div>
              <div className="panel-detail-subtitle">{selected.subtitle}</div>

              <dl className="panel-fields">
                {Object.entries(selected.fields).map(([key, value]) => (
                  <div key={key}>
                    {/* 键是宿主给的 ASCII 机读名，不是文案，查表出显示标签 */}
                    <dt>{fieldLabel(key)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="panel-actions">
                <button type="button" disabled={loading} onClick={() => onAction('mcp.get', [selected.id])}>{t('详情')}</button>
                <button type="button" disabled={loading} onClick={() => onAction('mcp.remove', [selected.id])}>{t('移除')}</button>
                <button type="button" disabled={loading} onClick={() => onAction('mcp.logout', [selected.id])}>{t('退出登录')}</button>
              </div>

              {/* OAuth 登录是交互式流程，面板通道起不了这类进程（stdin 立刻关闭，转圈后被 Kill）。
                  命令本身不翻——它是要照抄进终端的字面量。 */}
              <p className="panel-note">
                {t('需要登录 MCP 服务器请在终端执行 {command}。', { command: `claude mcp login ${selected.id}` })}
              </p>
            </>
          )}

          {items.length === 0 && !adding && emptyText !== '' && (
            <div className="panel-empty">{emptyText}</div>
          )}

          {adding && (
            <div className="panel-form">
              <label>
                {t('名称')}
                <input aria-label={t('名称')} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                {t('地址')}
                <input aria-label={t('地址')} value={url} onChange={(e) => setUrl(e.target.value)} />
              </label>

              {/* 说清楚而不是假装不支持——不然用户会以为面板坏了 */}
              <p className="panel-note">
                {t('只支持 http/https 远程服务器。本机命令（stdio）形态请在终端用 {command} 配置。', { command: 'claude mcp add' })}
              </p>

              {/* 说清楚为什么「添加」按不动，而不是给一个灰掉的按钮让人猜。 */}
              {name !== '' && !nameLooksValid && (
                <p className="panel-note panel-note-warning">{t('名称只能是字母、数字、下划线、连字符，1–64 位，且不能以连字符开头。')}</p>
              )}
              {url !== '' && !urlLooksValid && (
                <p className="panel-note panel-note-warning">{t('地址必须是 http:// 或 https:// 开头的完整地址，且不含空格。')}</p>
              )}

              <div className="panel-actions">
                <button
                  type="button"
                  disabled={loading || !canSubmit}
                  onClick={() => {
                    onAction('mcp.addRemote', [name, url]);
                    // **不清空草稿**：这里不知道宿主会不会拒（名称重复、地址不可达等），
                    setAdding(false);
                  }}
                >
                  {t('添加')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // 明确取消才丢草稿——这是用户自己说的「不要了」。
                    setAdding(false);
                    setName('');
                    setUrl('');
                  }}
                >
                  {t('取消')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
