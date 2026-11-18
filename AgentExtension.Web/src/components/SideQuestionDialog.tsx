// 侧问（/btw）：右侧栏里另问一句，不打断当前对话；问答在本 tab 里一直留着。

import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { onHostMessage, sendSideQuestion } from '../bridge';
import { useT } from '../LangContext';
import { Markdown } from './Markdown';

/** 一轮侧问。 */
export interface SideQa
{
  question: string;
  response: string;
  /** 出错时的原因；成功为空串。 */
  error: string;
}

interface SideQuestionDialogProps
{
  /** 这个 tab 里问过的；关掉弹窗也保留。 */
  thread: SideQa[];
  onThreadChange: (next: SideQa[]) => void;
  /** 打开时就要问的（/btw 后面带的话）。 */
  initialQuestion: string;
  /** 每来一次新的 /btw 加一；侧栏开着时靠它再问一句。 */
  askSeq?: number;
  onClose: () => void;
}

let sideSeq = 0;

/** 没答完就关了窗口时记下的原因。 */
const CLOSED_BEFORE_ANSWER = '回答到达前窗口已关闭，这次回答没有保留';

export function SideQuestionDialog(
  { thread, onThreadChange, initialQuestion, askSeq = 1, onClose }: SideQuestionDialogProps)
{
  const t = useT();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const requestIdRef = useRef('');

  // 回包处理器只挂一次，靠 ref 拿最新的问答与回调。
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const onThreadChangeRef = useRef(onThreadChange);
  onThreadChangeRef.current = onThreadChange;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() =>
  {
    const off = onHostMessage((data) =>
    {
      const message = data as { type?: string; payload?: { kind?: string; requestId?: string; response?: string; error?: string } };
      const payload = message?.type === 'context' ? message.payload : undefined;

      if (!payload || payload.kind !== 'sideQuestion' || payload.requestId !== requestIdRef.current)
      {
        return;
      }

      const question = pendingRef.current ?? '';
      requestIdRef.current = '';
      setPending(null);

      const entry: SideQa = { question, response: payload.response ?? '', error: payload.error ?? '' };
      onThreadChangeRef.current([...threadRef.current, entry]);
    });

    return off;
  }, []);

  /** 关窗；没答完的留一条记录，别让这句凭空消失。 */
  function close()
  {
    const unanswered = pendingRef.current;

    if (unanswered !== null)
    {
      const entry: SideQa = { question: unanswered, response: '', error: CLOSED_BEFORE_ANSWER };
      onThreadChangeRef.current([...threadRef.current, entry]);
    }

    onClose();
  }

  // 侧栏不抢全局 Esc：焦点在输入框时 Esc 仍是打断生成，只有焦点在侧栏里才关它。
  function onKeyDown(e: React.KeyboardEvent<HTMLElement>)
  {
    if (e.key === 'Escape')
    {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  // 新问答出来时滚到底
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    const body = bodyRef.current;

    if (body !== null)
    {
      body.scrollTop = body.scrollHeight;
    }
  }, [thread.length, pending]);

  function ask(question: string)
  {
    const trimmed = question.trim();

    if (trimmed === '' || pendingRef.current !== null)
    {
      return;
    }

    sideSeq += 1;
    const requestId = `side-${sideSeq}-${Date.now()}`;
    requestIdRef.current = requestId;
    pendingRef.current = trimmed;
    setPending(trimmed);
    setDraft('');

    // 只把答成功的交给 CLI 当上下文
    const history = threadRef.current
      .filter((qa) => qa.error === '' && qa.response !== '')
      .map((qa) => ({ question: qa.question, response: qa.response }));

    sendSideQuestion(trimmed, history, requestId);
  }

  // 带着问题来的，每个 askSeq 问一次。
  const askedSeq = useRef(0);

  useEffect(() =>
  {
    if (askedSeq.current === askSeq)
    {
      return;
    }

    askedSeq.current = askSeq;

    if (initialQuestion.trim() !== '')
    {
      ask(initialQuestion);
    }
  }, [askSeq]);

  return (
    <aside className="side-panel side-question" aria-label={t('侧问')} onKeyDown={onKeyDown}>
        <div className="side-panel-header">
          <span className="side-panel-title">{t('侧问')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={close}>✕</button>
        </div>

        <div className="side-panel-body" ref={bodyRef}>
          <p className="login-note">{t('另问一句，不打断当前对话，也不写进对话记录。')}</p>

          {thread.map((qa, index) => (
            <div className="side-qa" key={index}>
              <div className="side-qa-question">{qa.question}</div>
              {qa.error !== ''
                ? <div className="login-error" role="alert">{t('没答上来：{reason}', { reason: qa.error === CLOSED_BEFORE_ANSWER ? t('回答到达前窗口已关闭，这次回答没有保留') : qa.error })}</div>
                : qa.response === ''
                  ? <div className="modal-muted">{t('（没有回答）')}</div>
                  : <div className="side-qa-answer"><Markdown text={qa.response} /></div>}
            </div>
          ))}

          {pending !== null && (
            <div className="side-qa">
              <div className="side-qa-question">{pending}</div>
              <div className="modal-muted">{t('正在想…')}</div>
            </div>
          )}
        </div>

        <div className="side-panel-footer">
          <form
            className="side-question-form"
            onSubmit={(e) =>
            {
              e.preventDefault();
              ask(draft);
            }}
          >
            <input
              type="text"
              className="login-input"
              value={draft}
              placeholder={t('问点别的…')}
              aria-label={t('侧问内容')}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="submit"
              className="login-button login-button-primary"
              disabled={draft.trim() === '' || pending !== null}
            >
              {t('提问')}
            </button>
          </form>
        </div>
    </aside>
  );
}
