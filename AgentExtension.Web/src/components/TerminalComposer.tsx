import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MutableRefObject } from 'react';
import type { TerminalHandle } from './TerminalPanel';
import { SlashPopup } from './SlashPopup';
import { MentionPopup } from './MentionPopup';
import { MentionPreviewBar } from './MentionPreviewBar';
import { ComposerGrip, useComposerHeight } from './ComposerGrip';
import { detectSlashQuery, filterCommands } from '../slash';
import { applyMention, insertPaths } from '../mention';
import { useMentionSearch } from '../useMentionSearch';
import type { FileQueryResults } from '../useMentionSearch';
import { useFilePicker } from '../useFilePicker';
import {
  hasPrompt,
  joinPromptAndContent,
  leadingCommand,
  loadPrompt,
  savePrompt,
} from '../composerPrompt';
import { useT } from '../LangContext';

// 终端的输入框。

/** 「固定提示词」那一格的高度存档键。 */
const PROMPT_HEIGHT_KEY = 'agent.terminalPromptHeight';

interface TerminalComposerProps
{
  /** 终端交出来的句柄。 */
  handleRef: MutableRefObject<TerminalHandle | null>;

  /** 可补全的命令，不带前导斜杠。 */
  commands: string[];

  /** **必填**，不给默认值：漏传的表现是终端里敲 @ 什么都不弹，界面上毫无迹象。 */
  fileResults: FileQueryResults | null;

  /** 宿主报上来的「有文件被拖进面板了」。 */
  droppedFiles: { paths: string[]; seq: number } | null;

  /** 藏起来（对话占着主视图时）。 */
  hidden?: boolean;
}

export function TerminalComposer(
  { handleRef, commands, fileResults, droppedFiles, hidden = false }: TerminalComposerProps)
{
  const [prompt, setPrompt] = useState<string>(() => loadPrompt('terminal'));
  const [draft, setDraft] = useState('');

  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const t = useT();

  const promptHeight = useComposerHeight(promptRef, PROMPT_HEIGHT_KEY);
  const { grip, textareaStyle } = useComposerHeight(textareaRef);

  const [caret, setCaret] = useState(0);

  const [selectedIndex, setSelectedIndex] = useState(0);

  // 按过 Esc 主动关掉的弹层，在查询串变化前不再自己弹回来。
  const [dismissed, setDismissed] = useState(false);

  const query = detectSlashQuery(draft, caret);
  const candidates = query === null ? [] : filterCommands(commands, query);
  const popupOpen = !dismissed && query !== null && candidates.length > 0;

  const mention = useMentionSearch(draft, caret, fileResults);

  useEffect(() =>
  {
    setSelectedIndex(0);
    setDismissed(false);
  }, [query]);

  useEffect(() =>
  {
    savePrompt('terminal', prompt);
  }, [prompt]);

  /** 把光标位置同步进状态。 */
  function syncCaret(): void
  {
    const box = textareaRef.current;

    if (box !== null)
    {
      setCaret(box.selectionStart ?? 0);
    }
  }

  function send(): void
  {
    // 只挡空白：终端里**空回车是有意义的**（确认选择、跳过提示），
    const handle = handleRef.current;

    if (handle === null)
    {
      return;
    }

    handle.send(joinPromptAndContent(prompt, draft));

    setDraft('');
    setCaret(0);
  }

  /** 把选中的命令替换掉当前这一行已经敲出来的部分。 */
  function insertCommand(command: string): void
  {
    const box = textareaRef.current;
    const caretPos = box?.selectionStart ?? draft.length;
    const beforeCaret = draft.slice(0, caretPos);
    const lineStart = beforeCaret.lastIndexOf('\n') + 1;
    const afterCaret = draft.slice(caretPos);

    const inserted = `/${command} `;
    const next = draft.slice(0, lineStart) + inserted + afterCaret;

    setDraft(next);
    setDismissed(true);

    const nextCaret = lineStart + inserted.length;
    setCaret(nextCaret);

    requestAnimationFrame(() =>
    {
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
      textareaRef.current?.focus();
    });
  }

  /** 把选中的文件路径替换回草稿：从 @ 到光标那一段换成 `@路径 `。 */
  function insertMention(path: string): void
  {
    const next = applyMention(draft, caret, path);

    setDraft(next.text);
    setCaret(next.caret);
    mention.clear();

    requestAnimationFrame(() =>
    {
      textareaRef.current?.setSelectionRange(next.caret, next.caret);
      textareaRef.current?.focus();
    });
  }

  /** 把若干条路径插进光标处（挑文件 / 拖拽进来的结果共用这一条）。 */
  function insertPathsAtCaret(paths: string[]): void
  {
    const next = insertPaths(draft, caret, paths);

    setDraft(next.text);
    setCaret(next.caret);

    requestAnimationFrame(() =>
    {
      textareaRef.current?.setSelectionRange(next.caret, next.caret);
      textareaRef.current?.focus();
    });
  }

  const pickFile = useFilePicker(insertPathsAtCaret);

  useEffect(() =>
  {
    if (!droppedFiles || hidden)
    {
      return;
    }

    insertPathsAtCaret(droppedFiles.paths);
  }, [droppedFiles?.seq]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void
  {
    if (popupOpen)
    {
      if (e.key === 'ArrowDown')
      {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % candidates.length);
        return;
      }

      if (e.key === 'ArrowUp')
      {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }

      if (e.key === 'Enter' || e.key === 'Tab')
      {
        e.preventDefault();
        insertCommand(candidates[Math.min(selectedIndex, candidates.length - 1)]);
        return;
      }

      if (e.key === 'Escape')
      {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }

    if (!popupOpen && mention.handleKeyDown(e, insertMention))
    {
      return;
    }

    handleSendKeys(e);
  }

  /** 两格共用的送出与退出按键。 */
  function handleSendKeys(e: KeyboardEvent<HTMLTextAreaElement>): void
  {
    if (e.key === 'Enter' && !e.shiftKey)
    {
      e.preventDefault();
      send();
      return;
    }

    if (e.key === 'Escape')
    {
      mention.clear();

      // 这一下 Esc **也要送进 TUI**，而不只是移焦点。
      e.preventDefault();
      handleRef.current?.sendKey('\u001b');

      // 再把焦点还给终端本体：TUI 的很多交互（上下选、Ctrl 组合键）必须打在终端上，
      handleRef.current?.focus();
    }
  }

  const nothingToSend = prompt.trim() === '' && draft === '';

  // 一个会**静默改变语义**的组合：提示词非空时拼出来是多行文本，而 TUI 只认独占第一行的命令，于是它被当成一句话发给模型。
  const blockedCommand = hasPrompt(prompt) ? leadingCommand(draft) : null;

  return (
    <div className={hidden ? 'composer composer-terminal is-hidden' : 'composer composer-terminal'}>
      {popupOpen && (
        <SlashPopup
          commands={candidates}
          selectedIndex={selectedIndex}
          onSelect={insertCommand}
          unavailable={[]}
          note={t('终端里能用的全部命令')}
        />
      )}

      {!popupOpen && mention.matches.length > 0 && (
        <MentionPopup
          matches={mention.matches}
          selectedIndex={mention.selectedIndex}
          onSelect={insertMention}
        />
      )}

      {blockedCommand !== null && (
        <div className="composer-warning" role="status">
          {t('提示词在前面，/{cmd} 就不再是命令了——整段会当成一句话发给模型。要执行命令请先清空提示词。')
            .replace('{cmd}', blockedCommand)}
        </div>
      )}

      <MentionPreviewBar text={draft} />

      <ComposerGrip {...promptHeight.grip} />
      <div className="composer-prompt-row">
        {/* 标一下这格是干什么的。两个长得一样的框叠在一起，光靠占位文字分不清——
            占位文字一开始打字就没了，而这两格的分工是长期存在的。 */}
        <span className="composer-prompt-label" title={t('每次发送都拼在内容前面，发完不清空')}>
          {t('提示词')}
        </span>
        <textarea
          ref={promptRef}
          className="composer-textarea composer-prompt-textarea"
          style={promptHeight.textareaStyle}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleSendKeys}
          placeholder={t('固定提示词，每次发送都拼在内容前面（留空就只发内容）')}
        />
      </div>

      <ComposerGrip {...grip} />
      <div className="composer-row">
        <textarea
          ref={textareaRef}
          className="composer-textarea"
          style={textareaStyle}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setCaret(e.target.selectionStart ?? 0); }}
          onKeyDown={handleKeyDown}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onSelect={syncCaret}
          onFocus={syncCaret}
          placeholder={t('这一次要说的内容，Enter 送进终端，Shift+Enter 换行，/ 触发命令补全，@ 引用文件，Esc 打断并把焦点交回终端')}
        />
        <button
          type="button"
          className="composer-attach"
          title={t('挑一个文件插入 @ 引用')}
          aria-label={t('挑文件')}
          onClick={pickFile}
        >
          ◧
        </button>
        <button
          type="button"
          className="composer-button"
          onClick={send}
          disabled={nothingToSend}
        >
          {t('发送')}
        </button>
      </div>
    </div>
  );
}
