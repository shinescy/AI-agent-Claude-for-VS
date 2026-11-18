// 「设置」小弹窗：面板入口、需在终端完成的子命令、语言、字体外观。

import { MODEL_BRANDS } from '../models';
import { useEffect, useState } from 'react';
import { SUBCOMMANDS } from '../subcommands';
import type { SubcommandOption } from '../subcommands';
import { useT } from '../LangContext';
import { LANGUAGES } from '../i18n';
import type { Lang } from '../i18n';
import { sendRunCommand } from '../bridge';
import {
  FONT_FAMILIES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  DEFAULT_APPEARANCE,
} from '../appearance';
import type { Appearance } from '../appearance';

interface SettingsDialogProps {
  /** 要列出的原生面板，顺序即展示顺序。 */
  panelMenu: { id: string; label: string }[];
  onOpenPanel: (panelId: string) => void;

  /** 终端是否正占着主视图。 */
  terminalOpen: boolean;
  /** 在终端与对话之间来回切。 */
  onToggleTerminal: () => void;

  lang: Lang;
  onLangChange: (lang: Lang) => void;

  /** 当前品牌 id；不给就不画品牌那一项。 */
  brand?: string;
  onBrandChange?: (brand: string) => void;

  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;

  /** 打开登录弹窗（选登录方式、浏览器授权）。 */
  onLogin: () => void;
  /** 打开退出登录确认框。 */
  onLogout: () => void;

  onClose: () => void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const {
    panelMenu, onOpenPanel, terminalOpen, onToggleTerminal,
    lang, onLangChange, brand, onBrandChange, appearance, onAppearanceChange, onLogin, onLogout, onClose,
  } = props;

  const t = useT();

  /** 选中了不可代跑的子命令时展示的引导文案。 */
  const [guidance, setGuidance] = useState('');

  // 有原生面板的子命令不再从子命令组露出：同一个功能不给两个入口。
  // mcp 的面板在底栏，不在本菜单里，也算有面板
  const panelBackedIds = new Set([...panelMenu.map((entry) => entry.id), 'mcp']);
  const manualSubcommands = SUBCOMMANDS.filter((item) => !panelBackedIds.has(item.id));

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

  function openPanel(panelId: string)
  {
    onClose();

    if (panelId === 'terminal')
    {
      onToggleTerminal();
      return;
    }

    onOpenPanel(panelId);
  }

  function runSubcommand(item: SubcommandOption)
  {
    if (!item.canRunInPanel)
    {
      setGuidance(item.guidance);
      return;
    }

    onClose();
    sendRunCommand(item.id);
  }

  function patch(change: Partial<Appearance>)
  {
    onAppearanceChange({ ...appearance, ...change });
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
      <div className="modal-card settings-dialog" role="dialog" aria-modal="true" aria-label={t('设置')}>
        <div className="modal-header">
          <span className="modal-title">{t('设置')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-section-title">{t('面板')}</div>
          <div className="settings-grid">
            {panelMenu.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="settings-entry"
                data-panel={entry.id}
                onClick={() => openPanel(entry.id)}
              >
                {entry.id === 'terminal' && terminalOpen ? t('回到对话') : entry.label}
              </button>
            ))}
          </div>

          {manualSubcommands.length > 0 && (
            <>
              <div className="modal-section-title">{t('需在终端完成')}</div>
              <div className="settings-grid">
                {manualSubcommands.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="settings-entry"
                    onClick={() => runSubcommand(item)}
                  >
                    {t(item.label)}
                    {!item.canRunInPanel && <span className="subcommand-tag">{t('需终端')}</span>}
                  </button>
                ))}
              </div>
              {guidance && <div className="subcommand-guidance">{t(guidance)}</div>}
            </>
          )}

          <div className="modal-section-title">{t('账号')}</div>
          <div className="settings-grid">
            <button
              type="button"
              className="settings-entry"
              data-account="login"
              onClick={() =>
              {
                onClose();
                onLogin();
              }}
            >
              {t('登录')}
            </button>
            <button
              type="button"
              className="settings-entry"
              data-account="logout"
              onClick={() =>
              {
                onClose();
                onLogout();
              }}
            >
              {t('退出登录')}
            </button>
          </div>

          {/* 品牌单独一层是为将来接入别家产品留的位置；目前只有 Claude，所以收在这里不占工具栏。 */}
          {brand !== undefined && onBrandChange !== undefined && (
            <>
              <div className="modal-section-title">{t('品牌')}</div>
              <select
                className="status-select"
                aria-label={t('品牌')}
                title={t('模型品牌。目前只实现了 Claude 适配器。')}
                value={brand}
                onChange={(e) => onBrandChange(e.target.value)}
              >
                {MODEL_BRANDS.map((b) => (
                  <option key={b.id} value={b.id} disabled={!b.available}>
                    {b.available ? b.label : t('{label}（未接入）', { label: b.label })}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="modal-section-title">{t('语言')}</div>
          <select
            className="status-select"
            aria-label={t('语言')}
            value={lang}
            onChange={(e) => onLangChange(e.target.value as Lang)}
          >
            {LANGUAGES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

          <div className="modal-section-title">{t('字体、字号与文字颜色')}</div>

          <label className="appearance-row">
            <span className="appearance-label">{t('字体')}</span>
            <select
              className="status-select"
              value={appearance.fontFamily}
              onChange={(e) => patch({ fontFamily: e.target.value })}
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.label} value={f.value}>{t(f.label)}</option>
              ))}
            </select>
          </label>

          <label className="appearance-row">
            <span className="appearance-label">{t('字号')}</span>
            <input
              className="appearance-range"
              type="range"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              value={appearance.fontSize}
              onChange={(e) => patch({ fontSize: Number(e.target.value) })}
            />
            <span className="appearance-value">{appearance.fontSize}px</span>
          </label>

          <label className="appearance-row">
            <span className="appearance-label">{t('颜色')}</span>
            <input
              className="appearance-color"
              type="color"
              value={appearance.textColor || '#cccccc'}
              onChange={(e) => patch({ textColor: e.target.value })}
            />
            <button
              type="button"
              className="appearance-reset"
              title={t('跟随 VS 主题')}
              onClick={() => patch({ textColor: '' })}
            >
              {t('跟随主题')}
            </button>
          </label>

          <button
            type="button"
            className="appearance-reset appearance-reset-all"
            onClick={() => onAppearanceChange(DEFAULT_APPEARANCE)}
          >
            {t('全部恢复默认')}
          </button>
        </div>
      </div>
    </div>
  );
}
