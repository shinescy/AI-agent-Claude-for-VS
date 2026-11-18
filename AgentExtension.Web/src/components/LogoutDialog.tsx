// 退出登录确认框：确认后由宿主跑 claude auth logout。

import { useEffect, useRef, useState } from 'react';
import { onHostMessage, sendLogout } from '../bridge';
import { useT } from '../LangContext';

/** 对话框所处的步骤。 */
type Stage = 'confirm' | 'running' | 'done';

interface LogoutDialogProps
{
  /** 当前账号邮箱；读不到为空串。 */
  email: string;
  /** 退出成功：清掉界面上的账号信息。 */
  onLoggedOut: () => void;
  /** 退出后想换个账号登录。 */
  onLogin: () => void;
  onClose: () => void;
}

let logoutSeq = 0;

export function LogoutDialog({ email, onLoggedOut, onLogin, onClose }: LogoutDialogProps)
{
  const t = useT();
  const [stage, setStage] = useState<Stage>('confirm');
  const [error, setError] = useState('');
  const requestIdRef = useRef('');

  // 回包处理器只挂一次，回调走 ref 拿最新的。
  const onLoggedOutRef = useRef(onLoggedOut);
  onLoggedOutRef.current = onLoggedOut;

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as { type?: string; payload?: { kind?: string; requestId?: string; stage?: string; error?: string } };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || payload.kind !== 'logout' || payload.requestId !== requestIdRef.current)
      {
        return;
      }

      if (payload.stage === 'done')
      {
        setStage('done');
        onLoggedOutRef.current();
        return;
      }

      setError(payload.error ?? '');
      setStage('confirm');
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

  function confirm()
  {
    logoutSeq += 1;
    const requestId = `logout-${logoutSeq}-${Date.now()}`;
    requestIdRef.current = requestId;

    setError('');
    setStage('running');
    sendLogout(requestId);
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
      <div className="modal-card login-dialog" role="dialog" aria-modal="true" aria-label={t('退出登录')}>
        <div className="modal-header">
          <span className="modal-title">{t('退出登录')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error !== '' && (
            <div className="login-error" role="alert">
              {t('退出失败：{reason}', { reason: error })}
            </div>
          )}

          {stage === 'confirm' && (
            <>
              <p className="login-text">
                {email !== ''
                  ? t('确定退出当前账号 {email}？', { email })
                  : t('确定退出当前账号？')}
              </p>
              <p className="login-note">{t('会清掉这台电脑上 Claude Code 保存的登录凭据，终端里的 claude 也要重新登录。')}</p>
              <button type="button" className="login-button login-button-primary" onClick={confirm}>
                {t('退出登录')}
              </button>
              <button type="button" className="login-button" onClick={onClose}>{t('取消')}</button>
            </>
          )}

          {stage === 'running' && <p className="login-text">{t('正在退出…')}</p>}

          {stage === 'done' && (
            <>
              <p className="login-text">{t('已退出登录。')}</p>
              <button type="button" className="login-button login-button-primary" onClick={onLogin}>
                {t('重新登录')}
              </button>
              <button type="button" className="login-button" onClick={onClose}>{t('完成')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
