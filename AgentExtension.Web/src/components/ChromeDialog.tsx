// Chrome 弹窗（/chrome）：看能不能用、本会话接入或断开浏览器、选浏览器、默认启用开关。

import { useEffect, useRef, useState } from 'react';
import { onHostMessage, sendChromeBrowsers, sendChromeConnect, sendOpenLink } from '../bridge';
import { useT } from '../LangContext';
import { useCliDialog } from '../useCliDialog';
import { ToggleSwitch } from './ToggleSwitch';

/** CLI get_chrome_dialog 回包。 */
export interface ChromeDialogData
{
  allowed?: boolean;
  wsl?: boolean;
  subscriber?: boolean;
  installed?: boolean;
  connected?: boolean;
  enabled_by_default?: boolean;
  urls?: { install?: string; permissions?: string; reconnect?: string };
}

/** 一个可选的浏览器。 */
interface Browser
{
  device_id: string;
  name: string;
  current?: boolean;
}

/** 不能用的原因；能用返回空串。 */
export function chromeBlockedReason(data: ChromeDialogData): string
{
  if (data.allowed === false)
  {
    return '你的组织关掉了 Chrome 功能。';
  }

  if (data.wsl === true)
  {
    return 'WSL 里不支持 Chrome 功能。';
  }

  if (data.subscriber === false)
  {
    return 'Chrome 功能需要 claude.ai 订阅。';
  }

  return '';
}

interface ChromeDialogProps
{
  onClose: () => void;
}

let chromeSeq = 0;

export function ChromeDialog({ onClose }: ChromeDialogProps)
{
  const t = useT();
  const { dialog, error, busy, edit } = useCliDialog<ChromeDialogData>('chrome');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [browsers, setBrowsers] = useState<Browser[]>([]);
  const [opError, setOpError] = useState('');
  const [working, setWorking] = useState(false);
  const requestIdRef = useRef('');

  function nextId(): string
  {
    chromeSeq += 1;
    const requestId = `chrome-${chromeSeq}-${Date.now()}`;
    requestIdRef.current = requestId;
    return requestId;
  }

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as {
        type?: string;
        payload?: { kind?: string; requestId?: string; error?: string; connected?: boolean; browsers?: string };
      };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || payload.requestId !== requestIdRef.current)
      {
        return;
      }

      if (payload.kind === 'chromeConnect')
      {
        setWorking(false);
        setOpError(payload.error ?? '');

        // 失败时实际状态说不准：退回以 CLI 报的为准
        if (payload.error)
        {
          setConnected(null);
          setBrowsers([]);
          return;
        }

        setConnected(payload.connected === true);

        if (payload.connected === true)
        {
          setWorking(true);
          sendChromeBrowsers(null, nextId());
        }
        else
        {
          setBrowsers([]);
        }
      }

      if (payload.kind === 'chromeBrowsers')
      {
        setWorking(false);
        setOpError(payload.error ?? '');

        try
        {
          const parsed = payload.browsers ? (JSON.parse(payload.browsers) as { browsers?: Browser[] }) : {};
          setBrowsers(parsed.browsers ?? []);
        }
        catch
        {
          setBrowsers([]);
        }
      }
    });

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

  const isConnected = connected ?? dialog?.connected === true;
  const blocked = dialog ? chromeBlockedReason(dialog) : '';

  function connect(on: boolean)
  {
    setWorking(true);
    setOpError('');
    sendChromeConnect(on, nextId());
  }

  function choose(browser: Browser)
  {
    setWorking(true);
    setOpError('');
    sendChromeBrowsers(browser.device_id, nextId());
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
      <div className="modal-card login-dialog" role="dialog" aria-modal="true" aria-label="Chrome">
        <div className="modal-header">
          <span className="modal-title">Claude in Chrome</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="login-note">{t('让 Claude 通过 Chrome 扩展操作你的浏览器：打开网页、点击、填表、读页面内容。')}</p>

          {(error !== '' || opError !== '') && <div className="login-error" role="alert">{opError || error}</div>}
          {dialog === null && busy && <p className="modal-muted">{t('正在读取…')}</p>}

          {dialog !== null && blocked !== '' && <p className="login-text">{t(blocked)}</p>}

          {dialog !== null && blocked === '' && (
            <>
              {dialog.installed === false && (
                <>
                  <p className="login-text">{t('还没检测到 Chrome 扩展。')}</p>
                  {dialog.urls?.install && (
                    <button type="button" className="login-button login-button-primary" onClick={() => sendOpenLink(dialog.urls!.install!)}>
                      {t('安装 Chrome 扩展')}
                    </button>
                  )}
                </>
              )}

              <p className="login-text">
                {isConnected ? t('本会话已接入浏览器。') : t('本会话还没有接入浏览器。')}
              </p>
              <button
                type="button"
                className={isConnected ? 'login-button' : 'login-button login-button-primary'}
                disabled={working}
                onClick={() => connect(!isConnected)}
              >
                {working ? t('处理中…') : isConnected ? t('断开浏览器') : t('在本会话接入浏览器')}
              </button>

              {isConnected && browsers.length > 0 && (
                <>
                  <div className="modal-section-title">{t('使用哪个浏览器')}</div>
                  <ul className="skills-list">
                    {browsers.map((browser) => (
                      <li className="skills-row" key={browser.device_id}>
                        <div className="skills-main"><div className="skills-name">{browser.name}</div></div>
                        {browser.current
                          ? <span className="skills-lock">{t('正在用')}</span>
                          : (
                            <button type="button" className="skills-state" disabled={working} onClick={() => choose(browser)}>
                              {t('改用这个')}
                            </button>
                          )}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="memory-toggle">
                <div className="skills-main">
                  <div className="skills-name">{t('新会话默认启用')}</div>
                  <div className="skills-meta">{t('全局设置：这台电脑上之后开的所有会话都会生效，不只是这个编辑器。')}</div>
                </div>
                <ToggleSwitch
                  checked={dialog.enabled_by_default === true}
                  disabled={busy}
                  label={t('新会话默认启用')}
                  onChange={(next) => edit({ enabledByDefault: next })}
                />
              </div>

              {dialog.urls?.permissions && (
                <button type="button" className="modal-link rules-full-link" onClick={() => sendOpenLink(dialog.urls!.permissions!)}>
                  {t('在浏览器里调整网站权限')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
