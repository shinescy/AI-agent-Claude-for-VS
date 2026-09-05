// 一枚 @ 引用的小徽标。

import { useT } from '../LangContext';

interface MentionChipProps {
  path: string;
  active: boolean;
  onToggle: () => void;
}

export function MentionChip({ path, active, onToggle }: MentionChipProps) {
  const t = useT();

  const name = path.split('/').pop() || path;

  return (
    <button
      type="button"
      className={active ? 'mention-chip is-active' : 'mention-chip'}
      title={t('预览 {path}', { path })}
      aria-pressed={active}
      onMouseDown={(e) => { e.preventDefault(); onToggle(); }}
    >
      <span className="mention-chip-icon" aria-hidden="true">◧</span>
      <span className="mention-chip-name">{name}</span>
    </button>
  );
}
