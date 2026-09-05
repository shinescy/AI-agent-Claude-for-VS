// 输入框：固定提示词 + 这一次的内容两格 + slash 命令补全 + 发送/停止切换。

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { detectSlashQuery, filterCommands } from '../slash';
import { focusLastCommandOptions } from '../optionFocus';
import { useT } from '../LangContext';
import { applyMention, insertPaths } from '../mention';
import { useMentionSearch } from '../useMentionSearch';
import type { FileQueryResults } from '../useMentionSearch';
import { useFilePicker } from '../useFilePicker';
import { sendInterrupt } from '../bridge';
import {
  hasPrompt,
  joinPromptAndContent,
  leadingCommand,
  loadPrompt,
  savePrompt,
} from '../composerPrompt';
import { SlashPopup } from './SlashPopup';
import { MentionPopup } from './MentionPopup';
import { MentionPreviewBar } from './MentionPreviewBar';
import { ComposerGrip, useComposerHeight } from './ComposerGrip';

/** 从 VS 侧塞进来的上下文（选中代码、编译错误等）。 */
export interface ComposerInjection {
  text: string;
  seq: number;
}

/** 待发送的图片附件。 */
export interface Attachment {
  id: number;
  mediaType: string;
  data: string;
  preview: string;
}

interface ComposerProps {
  busy: boolean;
  slashCommands: string[];
  /** 实测在本环境不可用的命令，补全里标出来。 */
  unavailableCommands: string[];

  /** 藏起来（终端占着主视图时）。 */
  hidden?: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  injection: ComposerInjection | null;
  fileResults: FileQueryResults | null;

  /** 宿主报上来的「有文件被拖进面板了」。 */
  droppedFiles: { paths: string[]; seq: number } | null;
}

/** 「固定提示词」那一格的高度存档键。 */
const PROMPT_HEIGHT_KEY = 'agent.chatPromptHeight';

let attachmentIdSeed = 1;

export function Composer(
  { busy, slashCommands, unavailableCommands, onSend, injection, fileResults, droppedFiles,
    hidden = false }: ComposerProps) {
  const t = useT();

  const [prompt, setPrompt] = useState<string>(() => loadPrompt('chat'));
  const [draft, setDraft] = useState('');

  /** 光标位置。 */
  const [caret, setCaret] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const { grip, textareaStyle } = useComposerHeight(textareaRef);
  const promptHeight = useComposerHeight(promptRef, PROMPT_HEIGHT_KEY);

  useEffect(() =>
  {
    savePrompt('chat', prompt);
  }, [prompt]);

  const mention = useMentionSearch(draft, caret, fileResults);

  function insertMention(path: string)
  {
    const element = textareaRef.current;
    const next = applyMention(draft, caret, path);

    setDraft(next.text);
    setCaret(next.caret);
    mention.clear();

    if (element)
    {
      element.focus();
      window.requestAnimationFrame(() =>
      {
        element.selectionStart = next.caret;
        element.selectionEnd = next.caret;
      });
    }
  }

  /** 把若干条路径插进光标处（挑文件 / 拖拽进来的结果共用这一条）。 */
  function insertPathsAtCaret(paths: string[])
  {
    const element = textareaRef.current;
    const next = insertPaths(draft, caret, paths);

    setDraft(next.text);
    setCaret(next.caret);

    if (element)
    {
      element.focus();
      window.requestAnimationFrame(() =>
      {
        element.selectionStart = next.caret;
        element.selectionEnd = next.caret;
      });
    }
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

  /** 从剪贴板或拖放读入一张图片。 */
  function readImageFile(file: File)
  {
    const reader = new FileReader();

    reader.onload = () =>
    {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const comma = dataUrl.indexOf(',');

      if (comma < 0)
      {
        return;
      }

      setAttachments((prev) => [
        ...prev,
        {
          id: attachmentIdSeed++,
          mediaType: file.type,
          data: dataUrl.slice(comma + 1),
          preview: dataUrl,
        },
      ]);
    };

    reader.readAsDataURL(file);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>)
  {
    const items = Array.from(e.clipboardData?.items ?? []);
    const images = items.filter((item) => item.kind === 'file' && item.type.startsWith('image/'));

    if (images.length === 0)
    {
      return;
    }

    e.preventDefault();

    for (const item of images)
    {
      const file = item.getAsFile();
      if (file)
      {
        readImageFile(file);
      }
    }
  }

  function removeAttachment(id: number)
  {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  useEffect(() =>
  {
    if (!injection)
    {
      return;
    }

    setDraft((prev) => (prev.trim().length > 0 ? `${prev}\n\n${injection.text}` : injection.text));

    const element = textareaRef.current;
    if (element)
    {
      element.focus();
      window.requestAnimationFrame(() =>
      {
        element.selectionStart = element.value.length;
        element.selectionEnd = element.value.length;
      });
    }
  }, [injection?.seq]);

  // 光标位置必须是**状态**，不能在渲染时从 DOM 现读。
  const query = detectSlashQuery(draft, caret);
  const candidates = query === null ? [] : filterCommands(slashCommands, query);
  const popupOpen = !dismissed && query !== null && candidates.length > 0;

  useEffect(() =>
  {
    setSelectedIndex(0);
    setDismissed(false);
  }, [query]);

  /** 把光标位置同步进状态。 */
  function syncCaret()
  {
    const element = textareaRef.current;

    if (element)
    {
      setCaret(element.selectionStart ?? 0);
    }
  }

  function handleSend()
  {
    const text = joinPromptAndContent(prompt, draft.trim());

    if ((!text && attachments.length === 0) || busy)
    {
      return;
    }

    onSend(text, attachments);

    setDraft('');
    setCaret(0);
    setAttachments([]);
  }

  /** 提示词那一格的按键。 */
  function handlePromptKeyDown(e: KeyboardEvent<HTMLTextAreaElement>)
  {
    if (e.key === 'Enter' && !e.shiftKey)
    {
      e.preventDefault();
      handleSend();
    }
  }

  /** 用选中的命令替换当前行的 `/查询` 部分，命令后补一个空格。 */
  function insertCommand(command: string)
  {
    const textarea = textareaRef.current;
    const caretPos = textarea?.selectionStart ?? draft.length;
    const beforeCaret = draft.slice(0, caretPos);
    const lineStart = beforeCaret.lastIndexOf('\n') + 1;
    const afterCaret = draft.slice(caretPos);
    const inserted = '/' + command + ' ';
    const newText = draft.slice(0, lineStart) + inserted + afterCaret;

    setDraft(newText);
    setDismissed(true);

    const newCaretPos = lineStart + inserted.length;
    requestAnimationFrame(() =>
    {
      textarea?.setSelectionRange(newCaretPos, newCaretPos);
      textarea?.focus();
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>)
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

    if (e.key === 'ArrowUp' && draft.length === 0 && focusLastCommandOptions())
    {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey)
    {
      e.preventDefault();
      handleSend();
    }
  }

  // 一个会**静默改变语义**的组合：提示词非空时拼出来的是多行文本，而命令只在「独占第一行」时
  const blockedCommand = hasPrompt(prompt) ? leadingCommand(draft) : null;

  const nothingToSend = !hasPrompt(prompt) && !draft.trim() && attachments.length === 0;

  return (
    <div className={hidden ? 'composer is-hidden' : 'composer'}>
      {popupOpen && (
        <SlashPopup
          commands={candidates}
          selectedIndex={selectedIndex}
          onSelect={insertCommand}
          unavailable={unavailableCommands}
          note={t('标「仅终端」的请切到终端标签用；auth 等子命令见状态栏 ⋯')}
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
      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map((a) => (
            <div key={a.id} className="composer-attachment">
              <img src={a.preview} alt={t('附件')} />
              <button
                type="button"
                className="composer-attachment-remove"
                title={t('移除')}
                onClick={() => removeAttachment(a.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
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
          onKeyDown={handlePromptKeyDown}
          placeholder={t('固定提示词，每次发送都拼在内容前面（留空就只发内容）')}
        />
      </div>

      <ComposerGrip {...grip} />
      <div className="composer-row">
        <textarea
          ref={textareaRef}
          className="composer-textarea"
          // 必须连 maxHeight 一起写：CSS 里那条 max-height 会把内联 height 夹回去，
          style={textareaStyle}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setCaret(e.target.selectionStart ?? 0); }}
          onKeyDown={handleKeyDown}
          // 光标只是移动、文本没变时也要同步，否则补全的开合会停在上一次的判断上。
          onSelect={syncCaret}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onFocus={syncCaret}
          onPaste={handlePaste}
          placeholder={t('输入消息，Enter 发送，Shift+Enter 换行，/ 触发命令补全，@ 引用文件，可粘贴图片')}
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
        {busy
          ? (
            <button
              type="button"
              className="composer-button composer-button-stop"
              title={t('停止（Esc）')}
              onClick={sendInterrupt}
            >
              {t('停止')}
            </button>
          )
          : (
            <button
              type="button"
              className="composer-button"
              onClick={handleSend}
              disabled={nothingToSend}
            >
              {t('发送')}
            </button>
          )}
      </div>
    </div>
  );
}
