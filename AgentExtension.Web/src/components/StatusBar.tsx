// 选项状态栏：显示并切换思考强度与权限模式，以及子命令菜单、语言与外观。

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PERMISSION_MODES } from '../permissionModes';
import { buildEffortOptions } from '../efforts';
import { EffortSlider } from './EffortSlider';
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

interface StatusBarProps {
  effort: string;
  onEffortChange: (effort: string) => void;

  /** `/effort` 探测到的可选档位；空数组表示没探到，用兜底清单。 */
  effortLevels: string[];

  permissionMode: string;
  onPermissionModeChange: (mode: string) => void;

  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;

  /** 生成过程中禁用会重启进程的那些选项。 */
  busy: boolean;

  /** 打开原生面板（插件 / MCP / 后台代理 / 健康检查）。 */
  onOpenPanel: (panelId: string) => void;

  /** 终端是否正占着主视图。 */
  terminalOpen: boolean;

  /** 在终端与对话之间来回切。 */
  onToggleTerminal: () => void;

  /** 「⋯」菜单里要列出的原生面板，顺序即展示顺序。 */
  panelMenu: { id: string; label: string }[];

  /** 界面语言。 */
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}

/** 这些权限取值等同于完全放开，值得在状态栏上标出来。 */
const WIDE_OPEN_MODES = new Set(['dangerously', 'bypassPermissions']);

/** 弹出面板的外壳。 */
function DropdownPanel({ children }: { children: ReactNode })
{
  const ref = useRef<HTMLDivElement>(null);
  const [alignLeft, setAlignLeft] = useState(false);

  useLayoutEffect(() =>
  {
    const el = ref.current;

    if (!el)
    {
      return;
    }

    setAlignLeft(el.getBoundingClientRect().left < 4);
  }, []);

  return (
    <div ref={ref} className={`appearance-panel${alignLeft ? ' appearance-panel-left' : ''}`}>
      {children}
    </div>
  );
}

export function StatusBar(props: StatusBarProps) {
  const {
    effort, onEffortChange, effortLevels,
    permissionMode, onPermissionModeChange,
    appearance, onAppearanceChange,
    busy,
    onOpenPanel, panelMenu, lang, onLangChange, terminalOpen, onToggleTerminal,
  } = props;

  const t = useT();

  // 有原生面板的子命令一律不再从子命令组露出：同一个功能给两个入口，
  const panelBackedIds = new Set(panelMenu.map((entry) => entry.id));
  const manualSubcommands = SUBCOMMANDS.filter((item) => !panelBackedIds.has(item.id));

  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  /** 选中了不可代跑的子命令时展示的引导文案。 */
  const [guidance, setGuidance] = useState('');

  useEffect(() =>
  {
    if (!menuOpen)
    {
      return;
    }

    function onPointerDown(e: MouseEvent)
    {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
      {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  function runSubcommand(item: SubcommandOption)
  {
    if (!item.canRunInPanel)
    {
      setGuidance(item.guidance);
      return;
    }

    setGuidance('');
    setMenuOpen(false);
    sendRunCommand(item.id);
  }

  const currentMode = PERMISSION_MODES.find((m) => m.value === permissionMode);

  const effortOptions = buildEffortOptions(effortLevels);
  const wideOpen = WIDE_OPEN_MODES.has(permissionMode);

  useEffect(() =>
  {
    if (!panelOpen)
    {
      return;
    }

    function onPointerDown(e: MouseEvent)
    {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
      {
        setPanelOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [panelOpen]);

  function patch(change: Partial<Appearance>)
  {
    onAppearanceChange({ ...appearance, ...change });
  }

  return (
    <div className="status-bar" role="status">
      {/* 强度用横向滑轨而非下拉：档位本身是有序的（low → max），
          滑轨能表达这个次序，下拉不能。CLI 与官方插件也是这个交互。 */}
      <EffortSlider
        options={effortOptions}
        value={effort}
        onSelect={onEffortChange}
        disabled={busy}
      />

      {/* 强度与权限之间原先有一条竖线分隔。控件放大之后强度组变宽，窄面板下权限组被挤到
          第二行，那条竖线就孤零零留在第一行末尾，看着像多打了一个字符。分组改由间距表达
          （.effort 的右侧留白），间距不会因为换行而变成孤儿。 */}
      <label
        className="status-item"
        title={currentMode ? t(currentMode.hint) : ''}
      >
        <span className="status-caption">{t('权限')}</span>
        <select
          className={`status-select${wideOpen ? ' status-select-danger' : ''}`}
          value={permissionMode}
          disabled={busy}
          onChange={(e) => onPermissionModeChange(e.target.value)}
        >
          {PERMISSION_MODES.map((m) => (
            <option key={m.value} value={m.value} title={t(m.hint)}>
              {t(m.label)}
            </option>
          ))}
        </select>
      </label>

      <span
        className={`status-warning${wideOpen ? ' status-warning-loud' : ''}`}
        title={t('实测：本管线下所有权限模式都不提供交互式工具门禁，Bash 与 Write 一律直接执行。唯一真实有效的护栏是 settings.json 里的 permissions.deny，例如 "deny": ["Bash(rm:*)"]，该规则连危险模式都绕不过。')}
      >
        ⚠
      </span>

      <span className="status-spacer" />

      {/* 额度用量已经移到窗口顶部那条专门的栏里（数据来自 /usage，含模型专属窗口）。
          这里不再显示：rate_limit_event 与 /usage 报的不是同一个窗口（实测重置时刻差三天），
          两处都叫「额度」却给不同的数，只会让人不知道该信哪个。
          state.rateLimits 仍在收集，留给将来需要区分两种口径时用。 */}

      {/*
        终端单独占一个按钮，不埋进「⋯」菜单里。
        理由：它是本管线用不了的那批命令（云端会话、后台任务、账号设置等）的**唯一出口**，
        而菜单里的项要点两下才看得见。上一版只做了 /terminal 这条 slash 命令，
        结果就是「找不到从哪里进入」——入口要一眼看见才算入口。
      */}
      {/* 字必须跟着状态变。原先恒是「终端」且恒走 open：终端已经开着时再点一下，
          界面纹丝不动，看着就是按钮坏了；而按钮上写的又永远是「终端」，
          用户从它身上看不出自己现在在哪一边。按钮上的字应当说的是**点下去会发生什么**。 */}
      <button
        type="button"
        className="status-button"
        title={terminalOpen
          ? t('回到对话（终端会话继续在后台跑）')
          : t('打开终端：跑完整 TUI 的一路 claude，从当前对话分叉，带着上下文')}
        onClick={onToggleTerminal}
      >
        {terminalOpen ? t('回到对话') : t('终端')}
      </button>

      {/* CLI 子命令。这些不是 slash 命令，会话内发不出去，只能起独立进程。 */}
      <div className="status-appearance" ref={menuRef}>
        <button
          type="button"
          className="status-button"
          title={t('CLI 子命令（doctor / MCP / 插件 / 认证）')}
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen((v) => !v); setGuidance(''); }}
        >
          ⋯
        </button>

        {menuOpen && (
          <DropdownPanel>
            {/* 分两组并各自带标题。此前这里是一串没有分组的按钮，其中「插件」开面板、
                「已装插件」却走老的子命令路径往转录里倒文本——两个长得都像插件的入口并排放着，
                点中下面那个就没有弹窗，看起来像坏了。现在凡是有原生面板的一律走面板，
                子命令组只保留没有面板可走的那些。 */}
            <div className="subcommand-group-title">{t('面板')}</div>
            {panelMenu.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="subcommand-item"
                onClick={() => { setMenuOpen(false); onOpenPanel(entry.id); }}
              >
                {entry.label}
              </button>
            ))}

            {manualSubcommands.length > 0 && (
              <>
                <div className="subcommand-group-title">{t('需在终端完成')}</div>
                {manualSubcommands.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`subcommand-item${item.canRunInPanel ? '' : ' subcommand-item-manual'}`}
                    onClick={() => runSubcommand(item)}
                  >
                    {t(item.label)}
                    {!item.canRunInPanel && <span className="subcommand-tag">{t('需终端')}</span>}
                  </button>
                ))}
              </>
            )}

            {guidance && <div className="subcommand-guidance">{t(guidance)}</div>}
          </DropdownPanel>
        )}
      </div>

      {/* 语言。放在外观旁边：两者都是「界面怎么显示」，与模型/权限那些会影响代理行为的
          选项不是一回事，混在一起会让人以为切语言也要重启会话。 */}
      <label className="status-item" title={t('语言')}>
        <span className="status-caption">{t('语言')}</span>
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
      </label>

      <div className="status-appearance" ref={panelRef}>
        <button
          type="button"
          className="status-button"
          title={t('字体、字号与文字颜色')}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          Aa
        </button>

        {panelOpen && (
          <DropdownPanel>
            <label className="appearance-row">
              <span className="appearance-label">{t('字体')}</span>
              <select
                className="status-select"
                value={appearance.fontFamily}
                onChange={(e) => patch({ fontFamily: e.target.value })}
              >
                {/* 字体名是专有名词，只有「跟随 VS」这类说明性标签需要翻译；
                    查不到的键（Consolas 等）会原样返回，正合适。 */}
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
                title="跟随 VS 主题"
                onClick={() => patch({ textColor: '' })}
              >
                跟随主题
              </button>
            </label>

            <button
              type="button"
              className="appearance-reset appearance-reset-all"
              onClick={() => onAppearanceChange(DEFAULT_APPEARANCE)}
            >
              全部恢复默认
            </button>
          </DropdownPanel>
        )}
      </div>
    </div>
  );
}
