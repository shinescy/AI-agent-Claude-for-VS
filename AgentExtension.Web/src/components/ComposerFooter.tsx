// 输入框底栏：当前文件标签。上下文圆环挪到了工具栏（ContextRing）。

import { useT } from '../LangContext';

/** 底栏属性。 */
export interface ComposerFooterProps
{
  activeFile: { path: string; name: string } | null;
  attached: boolean;
  onToggleAttach: () => void;
}

/** 发送前给正文加当前文件的 @ 前缀；斜杠命令与无路径时原样返回。 */
export function withActiveFile(text: string, path: string | null): string
{
  if (!path || text.trimStart().startsWith('/'))
  {
    return text;
  }

  return `@${path} ${text}`;
}

/** 输入框下面那一行；没开文档时整行不画，省一行高度。 */
export function ComposerFooter({ activeFile, attached, onToggleAttach }: ComposerFooterProps)
{
  const t = useT();

  if (!activeFile)
  {
    return null;
  }

  const chipTitle = attached
    ? t('发送时会附加 {path}，单击取消', { path: activeFile.path })
    : t('单击附加当前文件：{path}', { path: activeFile.path });

  return (
    <div className="composer-footer">
      <button
        type="button"
        className={attached ? 'active-file-chip is-attached' : 'active-file-chip'}
        title={chipTitle}
        aria-label={chipTitle}
        aria-pressed={attached}
        onClick={onToggleAttach}
      >
        {activeFile.name}
      </button>
    </div>
  );
}
