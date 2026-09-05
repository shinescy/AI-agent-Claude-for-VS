// 面板覆盖层外壳：标题栏、Esc 关闭、加载/错误态、焦点陷阱。

import { useEffect, useRef, useState } from 'react';
import { useT } from '../LangContext';

/** 过了多少秒才开始报读秒。 */
const ELAPSED_VISIBLE_AFTER_SECONDS = 3;

interface PanelOverlayProps {
  title: string;
  loading: boolean;
  error: string;
  rawText: string;
  /** 宿主的显式意图标记（对应 C# 侧 PanelResult.ShowsRawText）：只有 doctor 这类纯文本面板、 */
  showsRawText?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  /** Esc 按下时先问一问：子组件（目前只有 McpPanel 的新增表单）想不想自己接管这次 Esc。 */
  onEscapeCapture?: () => boolean;
  /** 出错时下方仍在展示的是上一次取到的列表。 */
  staleItems?: boolean;
  children: React.ReactNode;
}

export function PanelOverlay(props: PanelOverlayProps) {
  const {
    title, loading, error, rawText, showsRawText = false,
    onClose, onRefresh, onEscapeCapture, staleItems = false, children,
  } = props;
  const t = useT();
  const shellRef = useRef<HTMLDivElement>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return;
    }

    setElapsedSeconds(0);
    const timer = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  const loadingText = elapsedSeconds >= ELAPSED_VISIBLE_AFTER_SECONDS
    ? t('执行中… 已 {n} 秒', { n: elapsedSeconds })
    : t('执行中…');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (onEscapeCapture && onEscapeCapture()) {
          return;
        }
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, onEscapeCapture]);

  // 开面板时把焦点移进来，否则键盘还停在输入框上；关闭时**必须还回去**。
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    shellRef.current?.focus();

    return () => {
      if (previous && document.activeElement === document.body && document.contains(previous)) {
        previous.focus();
      }
    };
  }, []);

  /** 焦点陷阱：Tab / Shift+Tab 在面板内的可聚焦元素间循环，不让键盘用户跑到背后的 */
  function onShellKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') {
      return;
    }

    const root = shellRef.current;
    if (!root) {
      return;
    }

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hasAttribute('disabled'));

    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || active === root || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || active === root) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="panel-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="panel-shell" ref={shellRef} tabIndex={-1} onKeyDown={onShellKeyDown}>
        <div className="panel-header">
          <span className="panel-title">{title}</span>
          <div className="panel-header-actions">
            {/* loading 时禁用：请求进行中再点等于连点起第二个进程，见 A-6。关闭按钮不禁用——
                用户任何时候都该能退出面板，即便一次请求还没回来。 */}
            <button type="button" onClick={onRefresh} disabled={loading}>{t('刷新')}</button>
            {/* 可见文案「Esc」与 aria-label 必须一致：语音输入用户说「点击 Esc」应该能命中。
                Esc 是键名不是词，两种语言下都不翻。 */}
            <button type="button" onClick={onClose} aria-label={t('关闭（Esc）')}>Esc</button>
          </div>
        </div>

        {/* role="status" 让加载这类不打断的增量更新能被屏幕阅读器播报，不必用户主动去找。
            读秒不是装饰：不显示秒数时，「在跑」和「卡死了」在界面上长得一模一样。 */}
        {loading && <div className="panel-loading" role="status">{loadingText}</div>}

        {/* role="alert"（assertive）而非 status（polite）：这是错误，不是常态增量更新，
            该立刻打断屏幕阅读器播报，而不是排队等下一次空闲。 */}
        {error !== '' && (
          <div className="panel-error" role="alert">
            <div>{error}</div>
            {/* 解析不了时把原始输出原样带出来，不给空白 */}
            {rawText !== '' && <pre className="panel-raw">{rawText}</pre>}
            {/* 保留旧列表就必须说清它是旧的，否则那些开关圆点看着仍然权威。 */}
            {staleItems && (
              <div className="panel-stale-note">{t('下面是上一次取到的列表，可能已经过期；点「刷新」重取。')}</div>
            )}
          </div>
        )}

        {/* 无错误但 showsRawText 为真：查询型动作（plugin.details / mcp.get）或纯文本面板，
            stdout 本身就是结果，必须原样显示——保持缩进，这类输出靠缩进表达层级。
            不再只凭"rawText 非空"推断意图：正常取数成功时 rawText 也可能非空（诊断用的
            原始 JSON 副本），那种情况不该被糊在列表上方，见 P1。 */}
        {error === '' && showsRawText && rawText !== '' && (
          <pre className="panel-raw panel-raw-standalone">{rawText}</pre>
        )}

        {/* 宿主说了「这次的结果就是 stdout」，而 stdout 是空的。
            不说破的话正文整块是白的，用户只会认为「点了没反应」——doctor 没输出、
            某个插件的 details 为空时都会走到这里。命令成功但没话说，是个正常结局，
            但必须说出来，不能拿空白假装。 */}
        {error === '' && showsRawText && rawText === '' && !loading && (
          <div className="panel-empty-output" role="status">{t('命令执行完成，但没有任何输出。')}</div>
        )}

        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}
