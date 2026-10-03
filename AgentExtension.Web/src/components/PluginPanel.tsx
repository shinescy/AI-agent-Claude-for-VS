// 插件面板：顶部三个 tab（已安装 / 市场 / 更新），左侧列表，右侧详情与动作。

import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { PanelItemView } from '../panelState';
import { RestartBanner } from './RestartBanner';
import { domId } from '../domId';
import { useT, useFieldLabel } from '../LangContext';

/** 三个 tab 与面板 id 的对应。 */
export const PLUGIN_TABS: { panelId: string; label: string }[] = [
  { panelId: 'plugin', label: '已安装' },
  { panelId: 'pluginMarket', label: '市场' },
  { panelId: 'pluginUpdates', label: '更新' },
];

interface PluginPanelProps {
  /** 当前是哪个 tab。 */
  panelId: string;
  items: PanelItemView[];
  restartHint: boolean;
  onAction: (actionId: string, values: string[]) => void;
  onDismissRestart: () => void;
  /** 切到另一个 tab（即打开另一个面板）。 */
  onSwitchPanel: (panelId: string) => void;
  /** 取数出错时的原因；为空表示正常。 */
  error?: string;
  /** 请求进行中：动作按钮此时应禁用，防止连点起多个进程。 */
  loading?: boolean;
}

export function PluginPanel(props: PluginPanelProps) {
  const {
    panelId, items, restartHint, onAction, onDismissRestart, onSwitchPanel,
    error = '', loading = false,
  } = props;

  const t = useT();
  const fieldLabel = useFieldLabel();
  const [selectedId, setSelectedId] = useState<string>('');
  const [query, setQuery] = useState('');
  /** 正在等待二次确认的卸载目标。 */
  const [confirmingUninstall, setConfirmingUninstall] = useState('');

  const isMarket = panelId === 'pluginMarket';
  const isUpdates = panelId === 'pluginUpdates';

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = normalizedQuery === ''
    ? items
    : items.filter((item) =>
      item.title.toLowerCase().includes(normalizedQuery) || item.id.toLowerCase().includes(normalizedQuery));

  const selected = visibleItems.find((x) => x.id === selectedId) ?? visibleItems[0];

  // 空态文案：取数本身出错时，顶部（PanelOverlay）已经在报错，这里不该再重复一句
  function emptyText(): string {
    if (loading) {
      return '';
    }

    if (items.length > 0) {
      return t('没有匹配的插件。');
    }

    if (error !== '') {
      return '';
    }

    return isMarket ? t('没有可安装的插件。') : t('没有已装插件。');
  }

  /** 作用域缺失时不能执行带 --scope 的动作。 */
  const selectedScope = selected?.scope ?? '';
  const scopeMissing = selected !== undefined && selectedScope === '';

  function handleListKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (visibleItems.length === 0) {
      return;
    }

    const currentIndex = visibleItems.findIndex((x) => x.id === selected?.id);
    let next: PanelItemView | undefined;

    if (e.key === 'ArrowDown') {
      next = visibleItems[(currentIndex + 1 + visibleItems.length) % visibleItems.length];
    } else if (e.key === 'ArrowUp') {
      next = visibleItems[(currentIndex - 1 + visibleItems.length) % visibleItems.length];
    } else if (e.key === 'Home') {
      next = visibleItems[0];
    } else if (e.key === 'End') {
      next = visibleItems[visibleItems.length - 1];
    }

    if (next === undefined) {
      return;
    }

    e.preventDefault();
    select(next.id);

    document.getElementById(`panel-list-item-${domId(next.id)}`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  function select(id: string) {
    setSelectedId(id);
    // 换了选中项，上一项的卸载确认必须作废——否则「点了 A 的卸载、改选 B、再点确认」
    setConfirmingUninstall('');
  }

  function switchTo(nextPanelId: string) {
    if (nextPanelId === panelId) {
      return;
    }

    setSelectedId('');
    setQuery('');
    setConfirmingUninstall('');
    onSwitchPanel(nextPanelId);
  }

  return (
    <div className="panel-content">
      {restartHint && <RestartBanner onDismiss={onDismissRestart} />}

      {/* tab 条。此前只有一个「市场」按钮，从市场还回不到已装列表——
          用户在市场里点开一个插件后就没有返回路径了。 */}
      <div className="panel-tabs" role="tablist" aria-label={t('插件视图')}>
        {PLUGIN_TABS.map((tab) => (
          <button
            key={tab.panelId}
            type="button"
            role="tab"
            id={`plugin-tab-${tab.panelId}`}
            aria-selected={tab.panelId === panelId}
            className={`panel-tab${tab.panelId === panelId ? ' panel-tab-active' : ''}`}
            disabled={loading}
            onClick={() => switchTo(tab.panelId)}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      {isUpdates && (
        <div className="panel-actions panel-actions-bar">
          <button
            type="button"
            disabled={loading}
            title={t('从各市场的源重新拉取索引。不刷新的话，更新命令拿到的还是本地那份旧索引。')}
            onClick={() => onAction('plugin.marketplaceUpdate', [])}
          >
            {t('刷新市场索引')}
          </button>
          <span className="panel-actions-note">
            {t('CLI 不提供「哪些插件有新版本」的查询，这里如实列出已装版本与上次更新时间。')}
          </span>
        </div>
      )}

      <div className="panel-master-detail">
        {/* 搜索框与列表包进同一个 flex 列容器，整体占据网格左列——
            详情栏才能跟这一整根左列对齐等高，见 styles.css 里 .panel-list-column 的注释。 */}
        <div className="panel-list-column">
          <div className="panel-search">
            <input
              type="search"
              aria-label={isMarket ? t('搜索插件市场') : t('搜索已装插件')}
              placeholder={t('搜索…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleListKeyDown}
            />
          </div>

          <div
            className="panel-list"
            role="listbox"
            tabIndex={0}
            data-empty-text={emptyText()}
            aria-label={visibleItems.length === 0 && emptyText() !== '' ? emptyText() : undefined}
            aria-activedescendant={selected ? `panel-list-item-${domId(selected.id)}` : undefined}
            onKeyDown={handleListKeyDown}
          >
            {visibleItems.map((item) => (
              <div
                key={item.id}
                id={`panel-list-item-${domId(item.id)}`}
                role="option"
                aria-selected={selected?.id === item.id}
                className={`panel-list-item${selected?.id === item.id ? ' panel-list-item-selected' : ''}`}
                onClick={() => select(item.id)}
              >
                <span className={item.enabled ? 'panel-dot-on' : 'panel-dot-off'}>
                  {item.enabled ? '●' : '○'}
                </span>
                <span className="panel-list-item-title">{item.title}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-detail" role="region" aria-label={t('详情')}>
          {selected && (
            <>
              <div className="panel-detail-title">{selected.title}</div>
              <div className="panel-detail-subtitle">{selected.subtitle}</div>

              {/* 市场条目的描述只存在 detail 里（见 PluginMarketParser 对 I7 的处理，
                  不再重复存进 fields）；已装条目没有描述，detail 恒为空串，这里天然不渲染。 */}
              {selected.detail !== '' && (
                <p className="panel-detail-description">{selected.detail}</p>
              )}

              <dl className="panel-fields">
                {Object.entries(selected.fields).map(([key, value]) => (
                  <div key={key}>
                    {/* 键是宿主给的 ASCII 机读名，不是文案，查表出显示标签 */}
                    <dt>{fieldLabel(key)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              {scopeMissing && !isMarket && (
                <div className="panel-detail-warning" role="note">
                  {t('CLI 没有报告这份安装的作用域，无法确定要操作哪一份，相关按钮已停用。')}
                  {' '}
                  {/* 命令本身不翻，它是要照抄进终端的字面量。 */}
                  {t('请在终端执行 {command} 确认后手动处理。', { command: 'claude plugin list' })}
                </div>
              )}

              <div className="panel-actions">
                {/* 传完整 id：显示用的短名不在集合里，会被宿主侧校验拒掉。
                    第二个槽位是作用域，同一 id 可能在多个作用域各装一份，不指定就会改错对象。 */}
                {isMarket && (
                  <button type="button" disabled={loading} onClick={() => onAction('plugin.install', [selected.id])}>
                    {t('安装')}
                  </button>
                )}

                {isUpdates && (
                  <button
                    type="button"
                    disabled={loading || scopeMissing}
                    onClick={() => onAction('plugin.update', [selected.id, selectedScope])}
                  >
                    {t('更新')}
                  </button>
                )}

                {!isMarket && !isUpdates && (
                  <>
                    {selected.enabled ? (
                      <button
                        type="button"
                        disabled={loading || scopeMissing}
                        onClick={() => onAction('plugin.disable', [selected.id, selectedScope])}
                      >
                        {t('禁用')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={loading || scopeMissing}
                        onClick={() => onAction('plugin.enable', [selected.id, selectedScope])}
                      >
                        {t('启用')}
                      </button>
                    )}

                    <button type="button" disabled={loading} onClick={() => onAction('plugin.details', [selected.id])}>
                      {t('详情')}
                    </button>

                    {/* 卸载不可撤销，走两步确认。确认按钮的文案必须自带对象名，
                        否则用户在列表里换过选中项之后，光看「确认」两个字无从判断要卸的是哪个。 */}
                    {confirmingUninstall === selected.id ? (
                      <>
                        <button
                          type="button"
                          className="panel-action-danger"
                          disabled={loading || scopeMissing}
                          onClick={() => {
                            setConfirmingUninstall('');
                            onAction('plugin.uninstall', [selected.id, selectedScope]);
                          }}
                        >
                          {t('确认卸载 {name}', { name: selected.title })}
                        </button>
                        <button type="button" disabled={loading} onClick={() => setConfirmingUninstall('')}>
                          {t('取消')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={loading || scopeMissing}
                        onClick={() => setConfirmingUninstall(selected.id)}
                      >
                        {t('卸载')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {!selected && emptyText() !== '' && (
            <div className="panel-empty">
              {emptyText()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
