// 登录对话框：选登录方式 → 浏览器里授权 → 可手动粘授权码。

import { useEffect, useRef, useState } from 'react';
import { onHostMessage, sendLogin, sendLoginCode, sendOpenLoginDocs } from '../bridge';
import { useT } from '../LangContext';

/** 对话框所处的步骤。 */
type Stage = 'choose' | 'waiting' | 'url' | 'done';

interface LoginDialogProps
{
  onClose: () => void;
}

/** 宿主回来的登录进度。 */
interface LoginPayload
{
  kind?: string;
  requestId?: string;
  stage?: string;
  url?: string;
  error?: string;
}

let loginSeq = 0;

export function LoginDialog({ onClose }: LoginDialogProps)
{
  const t = useT();
  const [stage, setStage] = useState<Stage>('choose');
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  // 只认本次登录的回包；点「返回」后旧回包作废。
  const requestIdRef = useRef('');

  // 回包处理器只挂一次，靠它读到最新步骤。
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as { type?: string; payload?: LoginPayload };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || payload.kind !== 'login' || payload.requestId !== requestIdRef.current)
      {
        return;
      }

      if (payload.stage === 'url')
      {
        setUrl(payload.url ?? '');
        setStage('url');
        return;
      }

      if (payload.stage === 'done')
      {
        setError('');
        setStage('done');
        return;
      }

      if (payload.stage === 'error')
      {
        // 已经登录成功的不再被迟到的报错翻掉。
        if (stageRef.current === 'done')
        {
          return;
        }

        setError(payload.error ?? '');
        // 授权码填错时留在当前页重填；其余退回选择页。
        setStage(stageRef.current === 'url' ? 'url' : 'choose');
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

  function start(method: 'claudeai' | 'console')
  {
    loginSeq += 1;
    const requestId = `login-${loginSeq}-${Date.now()}`;
    requestIdRef.current = requestId;

    setError('');
    setUrl('');
    setCode('');
    setStage('waiting');
    sendLogin(method, requestId);
  }

  function submitCode()
  {
    const trimmed = code.trim();

    if (trimmed === '')
    {
      return;
    }

    setError('');
    sendLoginCode(trimmed, requestIdRef.current);
  }

  function back()
  {
    requestIdRef.current = '';
    setError('');
    setStage('choose');
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
      <div className="modal-card login-dialog" role="dialog" aria-modal="true" aria-label={t('登录')}>
        <div className="modal-header">
          <span className="modal-title">{t('登录')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error !== '' && (
            <div className="login-error" role="alert">
              {t('登录失败：{reason}', { reason: error })}
            </div>
          )}

          {stage === 'choose' && (
            <>
              <p className="login-text">
                {t('Claude Code 可以用 Claude 订阅登录，也可以用 Console 账号按 API 用量计费。')}
              </p>
              <p className="login-text">{t('用哪种方式登录？')}</p>

              <button type="button" className="login-button login-button-primary" onClick={() => start('claudeai')}>
                {t('Claude.ai 订阅')}
              </button>
              <p className="login-note">{t('使用 Claude Pro、Max、Team 或 Enterprise 订阅')}</p>

              <button type="button" className="login-button" onClick={() => start('console')}>
                Anthropic Console
              </button>
              <p className="login-note">{t('按 API 用量通过 Console 账号付费')}</p>

              <button type="button" className="login-button" onClick={sendOpenLoginDocs}>
                Bedrock, Foundry, or Vertex ↗
              </button>
              <p className="login-note">{t('使用 API Key 或第三方服务商的说明（在浏览器中打开）')}</p>

              <button type="button" className="login-button" onClick={onClose}>{t('取消')}</button>
            </>
          )}

          {stage === 'waiting' && (
            <>
              <p className="login-text">{t('正在生成登录链接…')}</p>
              <button type="button" className="login-button" onClick={back}>{t('返回')}</button>
            </>
          )}

          {stage === 'url' && (
            <>
              <div className="login-heading">{t('在浏览器中继续')}</div>
              <p className="login-text">{t('如果浏览器没有自动打开，请访问这个网址：')}</p>
              <div className="login-url-row">
                <input
                  type="text"
                  readOnly
                  className="login-input"
                  value={url}
                  aria-label={t('登录网址')}
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  className="login-copy"
                  title={t('复制')}
                  onClick={() => { void navigator.clipboard.writeText(url).catch(() => undefined); }}
                >
                  {t('复制')}
                </button>
              </div>

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
                  placeholder="012345"
                  aria-label={t('授权码')}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button
                  type="submit"
                  className="login-button login-button-primary"
                  disabled={code.trim() === ''}
                >
                  {t('继续')}
                </button>
              </form>

              <button type="button" className="login-button" onClick={back}>{t('返回')}</button>
            </>
          )}

          {stage === 'done' && (
            <>
              <p className="login-text">{t('登录成功，账号信息已刷新。')}</p>
              <button type="button" className="login-button login-button-primary" onClick={onClose}>
                {t('完成')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
