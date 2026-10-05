// 钉在顶部那一条：这一屏内容是在回答哪句话。

import { useT } from '../LangContext';

interface PinnedTurnBarProps
{
  /** 已经折成一行的消息文本。 */
  text: string;

  /** 点一下跳回原消息。 */
  onReveal: () => void;

  /** 这条钉住的内容在页面上已经有一份可读的原件（对话侧的转录块）。 */
  duplicate?: boolean;
}

export function PinnedTurnBar({ text, onReveal, duplicate = false }: PinnedTurnBarProps)
{
  const t = useT();

  const title = text + '\n' + t('点一下跳回这条消息');

  return (
    <button
      type="button"
      className="pinned-turn"
      title={title}
      onClick={onReveal}
      aria-hidden={duplicate ? true : undefined}
      tabIndex={duplicate ? -1 : undefined}
    >
      <span className="pinned-turn-mark" aria-hidden="true">›</span>
      <span className="pinned-turn-text">{text}</span>
    </button>
  );
}
