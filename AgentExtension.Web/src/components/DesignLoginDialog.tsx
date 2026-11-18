// Claude Design 登录弹窗（/design-login）：用 claude.ai 账号授权设计系统访问。

import { useEffect, useRef, useState } from 'react';
import { onHostMessage, sendDesignLogin } from '../bridge';
import { useT } from '../LangContext';

/** 弹窗所处的步骤。 */
type Stage = 'loading' | 'ready' | 'waiting' | 'url' | 'done';

interface DesignPayload
{
  kind?: string;
  requestId?: string;
  stage?: string;
  error?: string;
  available?: boolean;
  signedIn?: boolean;
  canSignInHere?: boolean;
  message?: string;
  url?: string;
  manualUrl?: string;
  ok?: boolean;
}

interface DesignLoginDialogProps
{
  onClose: () => void;
}

let designSeq = 0;

export function DesignLoginDialog({ onClose }: DesignLoginDialogProps)
{
  const t = useT();
  const [stage, setStage] = useState<Stage>('loading');
  const [status, setStatus] = useState<DesignPayload | null>(null);
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const requestIdRef = useRef('');
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;

  function send(action: string)
  {
    designSeq += 1;
    const requestId = `design-${designSeq}-${Date.now()}`;
    requestIdRef.current = requestId;
    sendDesignLogin(action, requestId);
  }

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as { type?: string; payload?: DesignPayload };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || payload.kind !== 'designLogin' || payload.requestId !== requestIdRef.current)
      {
        return;
      }

      if (payload.stage === 'status')
      {
        setStatus(payload);
        setStage('ready');
        return;
      }

      if (payload.stage === 'pages')
      {
        setUrl(payload.manualUrl || payload.url || '');
        setStage('url');
        return;
      }

      if (payload.stage === 'done')
      {
        setResult({ ok: payload.ok === true, message: payload.message ?? '' });
        setStage('done');
        return;
      }

      setError(payload.error || payload.message || '');
      setStage((current) => (current === 'loading' || current === 'waiting' ? 'ready' : current));
    });

    send('status');

    // 弹窗关掉时，还在进行的登录一并取消
    return () =>
    {
      off();

      if (stageRef.current === 'waiting' || stageRef.current === 'url')
      {
        sendDesignLogin('cancel', '');
      }
    };
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

  function start()
  {
    setError('');
    setResult(null);
    setStage('waiting');
    send('start');
  }

  function submitCode()
  {
    const trimmed = code.trim();

    if (!trimmed.includes('#'))
    {
      setError(t('授权码格式不对：应形如 xxxx#yyyy。'));
      return;
    }

    setError('');
    sendDesignLogin(`code:${trimmed}`, requestIdRef.current);
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
      <div className="modal-card login-dialog" role="dialog" aria-modal="true" aria-label={t('Claude Design 登录')}>
        <div className="modal-header">
          <span className="modal-title">{t('Claude Design 登录')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="login-note">
            {t('用 claude.ai 账号授权访问设计系统。授权保存在这台电脑上，所有会话共用。')}
          </p>

          {error !== '' && <div className="login-error" role="alert">{error}</div>}

          {stage === 'loading' && <p className="modal-muted">{t('正在读取…')}</p>}

          {stage === 'ready' && status !== null && (
            <>
              {!status.available || !status.canSignInHere
                ? <p className="login-text">{status.message || t('这里不能登录 Claude Design。')}</p>
                : (
                  <>
                    <p className="login-text">{status.signedIn ? t('已登录 Claude Design。') : t('还没有登录 Claude Design。')}</p>
                    <button type="button" className="login-button login-button-primary" onClick={start}>
                      {status.signedIn ? t('重新登录') : t('用 claude.ai 账号登录')}
                    </button>
                  </>
                )}
            </>
          )}

          {stage === 'waiting' && <p className="login-text">{t('正在生成登录链接…')}</p>}

          {stage === 'url' && (
            <>
              <div className="login-heading">{t('在浏览器中继续')}</div>
              <p className="login-text">{t('如果浏览器没有自动打开，请访问这个网址：')}</p>
              <input
                type="text"
                readOnly
                className="login-input"
                value={url}
                aria-label={t('登录网址')}
                onClick={(e) => e.currentTarget.select()}
              />
              <p className="login-text">{t('或者手动粘贴授权码：')}</p>
              <form
                onSubmit={(e) =>
                {
                  e.preventDefault();
                  submitCode();
                }}
              >
                <input
                  type="text"
                  className="login-input"
                  value={code}
                  aria-label={t('授权码')}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button type="submit" className="login-button login-button-primary" disabled={code.trim() === ''}>
                  {t('继续')}
                </button>
              </form>
            </>
          )}

          {stage === 'done' && result !== null && (
            <>
              <p className="login-text">
                {result.ok ? t('Claude Design 登录成功。') : t('没有登录成功：{reason}', { reason: result.message || '—' })}
              </p>
              {!result.ok && <button type="button" className="login-button" onClick={start}>{t('重试')}</button>}
            </>
          )}

          <button type="button" className="login-button" onClick={onClose}>{t('关闭')}</button>
        </div>
      </div>
    </div>
  );
}
