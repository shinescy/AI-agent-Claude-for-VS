// 反馈弹窗（/bug、/feedback）：写清楚会发什么给谁，也可以只存本机。

import { useEffect, useRef, useState } from 'react';
import { onHostMessage, sendFeedback, sendRevealFeedback } from '../bridge';
import { useT } from '../LangContext';

interface FeedbackDialogProps
{
  /** 打开时预填的内容（/bug 后面带的话）。 */
  initialText: string;
  onClose: () => void;
}

/** 提交后的结果。 */
interface FeedbackResult
{
  feedbackId: string;
  bundlePath: string;
}

let feedbackSeq = 0;

export function FeedbackDialog({ initialText, onClose }: FeedbackDialogProps)
{
  const t = useT();
  const [text, setText] = useState(initialText);
  const [saveLocally, setSaveLocally] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const requestIdRef = useRef('');

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as {
        type?: string;
        payload?: { kind?: string; requestId?: string; error?: string; feedbackId?: string; bundlePath?: string };
      };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || payload.kind !== 'feedback' || payload.requestId !== requestIdRef.current)
      {
        return;
      }

      setBusy(false);

      if (payload.error)
      {
        setError(payload.error);
        return;
      }

      setResult({ feedbackId: payload.feedbackId ?? '', bundlePath: payload.bundlePath ?? '' });
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

  function submit()
  {
    if (busy || text.trim() === '')
    {
      return;
    }

    feedbackSeq += 1;
    const requestId = `feedback-${feedbackSeq}-${Date.now()}`;
    requestIdRef.current = requestId;
    setBusy(true);
    setError('');
    sendFeedback(text.trim(), saveLocally, requestId);
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
      <div className="modal-card login-dialog" role="dialog" aria-modal="true" aria-label={t('反馈')}>
        <div className="modal-header">
          <span className="modal-title">{t('反馈')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error !== '' && <div className="login-error" role="alert">{t('没能提交：{reason}', { reason: error })}</div>}

          {result === null && (
            <>
              <p className="login-note">
                {saveLocally
                  ? t('只把报告存到本机，不会发送给任何人。')
                  : t('提交后，这段描述以及 Claude Code 附带的当前会话内容会发送给 Anthropic。')}
              </p>
              <textarea
                className="login-input rules-input"
                rows={5}
                value={text}
                placeholder={t('出了什么问题，或者想要什么改进…')}
                aria-label={t('反馈内容')}
                autoFocus
                onChange={(e) => setText(e.target.value)}
              />
              <label className="sandbox-mode">
                <input type="checkbox" checked={saveLocally} onChange={(e) => setSaveLocally(e.target.checked)} />
                {t('只保存在本机，不发送')}
              </label>
              <button
                type="button"
                className="login-button login-button-primary"
                disabled={busy || text.trim() === ''}
                onClick={submit}
              >
                {busy ? t('提交中…') : saveLocally ? t('保存报告') : t('发送给 Anthropic')}
              </button>
              <button type="button" className="login-button" onClick={onClose}>{t('取消')}</button>
            </>
          )}

          {result !== null && (
            <>
              {result.bundlePath !== ''
                ? <p className="login-text">{t('报告已保存到 {path}，没有发送任何内容。', { path: result.bundlePath })}</p>
                : <p className="login-text">{t('已收到你的反馈，谢谢！反馈编号：{id}', { id: result.feedbackId || '—' })}</p>}
              {result.bundlePath !== '' && (
                <button type="button" className="login-button" onClick={() => sendRevealFeedback(result.bundlePath)}>
                  {t('在资源管理器中显示')}
                </button>
              )}
              <button type="button" className="login-button login-button-primary" onClick={onClose}>{t('完成')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
