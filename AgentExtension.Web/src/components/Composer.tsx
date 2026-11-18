// 输入框：固定提示词 + 这一次的内容两格 + slash 命令补全 + 发送。

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { detectSlashQuery } from '../slash';
import {
  buildMenu, choiceItems, isSlashItem, isUltracodeItem, nativeSlashFor, quickActions, slashEquivalent, slashName,
} from '../commandMenu';
import type { MenuHost, MenuItem } from '../commandMenu';
import type { SlashCommandInfo } from '../types';
import { focusLastCommandOptions } from '../optionFocus';
import { useT } from '../LangContext';
import { applyMention, insertPaths } from '../mention';
import { useMentionSearch } from '../useMentionSearch';
import type { FileQueryResults } from '../useMentionSearch';
import { useFilePicker } from '../useFilePicker';
import { sendTitleHint } from '../bridge';
import { useElementWidth } from './useElementWidth';
import {
  hasPrompt,
  joinPromptAndContent,
  leadingCommand,
  loadPrompt,
  savePrompt,
} from '../composerPrompt';
import { CommandMenu } from './CommandMenu';
import { EffortSlider } from './EffortSlider';
import { ToggleSwitch } from './ToggleSwitch';
import { MentionPopup } from './MentionPopup';
import { MentionPreviewBar } from './MentionPreviewBar';
import { ComposerGrip, useComposerHeight } from './ComposerGrip';
import { useAutoGrow } from './useAutoGrow';
import { ImageThumbs } from './ImageLightbox';
import { ComposerFooter, withActiveFile } from './ComposerFooter';

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
  slashCommands: string[];
  /** CLI 报的命令说明；会话没起时为空。 */
  commandInfos?: SlashCommandInfo[];
  /** 菜单里的快捷动作由它来做；不给时快捷动作不出现，只剩 slash 命令。 */
  menuHost?: MenuHost;
  /** 实测在本环境不可用的命令，补全里标出来。 */
  unavailableCommands: string[];

  /** 藏起来（终端占着主视图时）。 */
  hidden?: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  injection: ComposerInjection | null;
  fileResults: FileQueryResults | null;

  /** 宿主报上来的「有文件被拖进面板了」。 */
  droppedFiles: { paths: string[]; seq: number } | null;

  /** VS 当前活动文档；没开文档为 null。 */
  activeFile?: { path: string; name: string } | null;
}


/** 会打开弹窗的动作：弹窗要自己拿焦点，输入框不能抢回去。 */
const DIALOG_ACTIONS = new Set(['sessions', 'account', 'login', 'logout', 'btw', 'skills', 'permissionRules', 'memory', 'sandbox', 'feedback', 'designLogin', 'hooks', 'chrome']);

/** 没给命令说明时共用的空表。 */
const NO_INFOS: SlashCommandInfo[] = [];

let attachmentIdSeed = 1;

export function Composer(
  { slashCommands, commandInfos = NO_INFOS, menuHost, unavailableCommands, onSend, injection, fileResults,
    droppedFiles, hidden = false, activeFile = null }: ComposerProps) {
  const t = useT();
  const [actionsRef, actionsWidth] = useElementWidth<HTMLDivElement>();

  const [prompt, setPrompt] = useState<string>(() => loadPrompt('chat'));
  const [draft, setDraft] = useState('');

  /** 发送时是否附加当前文件；跨发送保持，文档全关时失效。 */
  const [attachActive, setAttachActive] = useState(false);

  useEffect(() =>
  {
    if (!activeFile)
    {
      setAttachActive(false);
    }
  }, [activeFile]);

  /** 光标位置。 */
  const [caret, setCaret] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  /** 从「/」按钮打开的菜单：自带筛选框，与打字触发的那种互斥。 */
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFilter, setMenuFilter] = useState('');

  /** 正展开着的二级选项（model / effort）；null 是主菜单。 */
  const [submenu, setSubmenu] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const { grip, textareaStyle } = useComposerHeight(textareaRef);
  useAutoGrow(promptRef, prompt);

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
  // 二级选项的那两行，行尾带上当前值。
  const ultracodeListed = menuHost?.ultracode?.visible === true;
  const actions: MenuItem[] = menuHost === undefined ? [] : quickActions(t, ultracodeListed).map((item) =>
  {
    if (item.kind !== 'submenu')
    {
      return item;
    }

    const current = menuHost.choices(item.command).find((choice) => choice.current);

    // 强度那一行行尾是滑轨，当前档写在标题里。
    if (item.command === 'effort')
    {
      const label = current ? `${item.label.replace(/…$/, '')}（${current.label}）` : item.label;
      return { ...item, label };
    }

    return { ...item, trailing: current?.label };
  });
  const direct = menuHost !== undefined;
  const slashSection = t('斜杠命令');
  const typedItems = query === null ? [] : buildMenu(actions, slashCommands, commandInfos, query, slashSection, direct);
  const submenuTitle = actions.find((item) => item.kind === 'submenu' && item.command === submenu)?.label ?? '';

  let candidates = typedItems;

  if (menuOpen)
  {
    candidates = submenu !== null && menuHost !== undefined
      ? choiceItems(menuHost.choices(submenu), submenuTitle, menuFilter)
      : buildMenu(actions, slashCommands, commandInfos, menuFilter, slashSection, direct);
  }

  const typedOpen = !dismissed && query !== null && typedItems.length > 0;
  const popupOpen = menuOpen || typedOpen;

  useEffect(() =>
  {
    setSelectedIndex(0);
    setDismissed(false);
  }, [query]);

  useEffect(() =>
  {
    setSelectedIndex(0);
  }, [menuFilter, menuOpen, submenu]);

  function closeMenu()
  {
    setMenuOpen(false);
    setMenuFilter('');
    setSubmenu(null);
  }

  function toggleMenu()
  {
    if (menuOpen)
    {
      closeMenu();
      return;
    }

    setMenuFilter('');
    setMenuOpen(true);
  }

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
    // 有原生界面的命令（/model /effort /usage /clear /resume）不发给 CLI。
    const native = menuHost !== undefined && attachments.length === 0 ? nativeSlashFor(draft) : null;

    if (native !== null)
    {
      setDraft('');
      setCaret(0);

      if (native.kind === 'submenu')
      {
        setMenuFilter('');
        setSubmenu(native.command);
        setMenuOpen(true);
      }
      else
      {
        menuHost?.runAction(native.command);
      }

      return;
    }

    const body = attachActive && draft.trim() ? withActiveFile(draft.trim(), activeFile?.path ?? null) : draft.trim();
    const text = joinPromptAndContent(prompt, body);

    // 忙时也能发：CLI 会把这句排进当前这一轮，打断只走 Esc
    if (!text && attachments.length === 0)
    {
      return;
    }

    onSend(text, attachments);
    sendTitleHint(draft.trim());

    setDraft('');
    setCaret(0);
    setAttachments([]);
  }

  /** Ctrl+Enter 发送，单独 Enter 是换行。 */
  function isSendKey(e: KeyboardEvent<HTMLTextAreaElement>)
  {
    return e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey;
  }

  /** 提示词那一格的按键。 */
  function handlePromptKeyDown(e: KeyboardEvent<HTMLTextAreaElement>)
  {
    if (isSendKey(e))
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

  /** 把当前行的 `/查询` 换成别的文本（空串即删掉），光标落在其后。 */
  function replaceSlashToken(replacement: string, refocus = true)
  {
    const textarea = textareaRef.current;
    const caretPos = textarea?.selectionStart ?? draft.length;
    const lineStart = draft.slice(0, caretPos).lastIndexOf('\n') + 1;
    const newText = draft.slice(0, lineStart) + replacement + draft.slice(caretPos);
    const newCaretPos = lineStart + replacement.length;

    setDraft(newText);
    setCaret(newCaretPos);

    // 接着要把焦点交给筛选框时不能抢回来：筛选框一失焦菜单就关了。
    if (!refocus)
    {
      return;
    }

    requestAnimationFrame(() =>
    {
      textarea?.setSelectionRange(newCaretPos, newCaretPos);
      textarea?.focus();
    });
  }

  /** 在光标处插一段文本（从按钮菜单选中时用，那时没有 `/查询` 可换）。 */
  function insertAtCaret(text: string)
  {
    const textarea = textareaRef.current;
    const newText = draft.slice(0, caret) + text + draft.slice(caret);
    const newCaretPos = caret + text.length;

    setDraft(newText);
    setCaret(newCaretPos);

    requestAnimationFrame(() =>
    {
      textarea?.setSelectionRange(newCaretPos, newCaretPos);
      textarea?.focus();
    });
  }

  /** 强度那一行的行尾放滑轨，Ultracode 那一行放开关；调它们都不关菜单。 */
  function renderTrailing(item: MenuItem)
  {
    if (menuHost?.ultracode !== undefined && isUltracodeItem(item))
    {
      const host = menuHost.ultracode;
      const toggle = (
        <ToggleSwitch
          checked={host.on}
          label="Ultracode"
          title={item.description}
          onChange={() => host.toggle()}
        />
      );
      return toggle;
    }

    if (menuHost === undefined || item.kind !== 'submenu' || item.command !== 'effort' || isSlashItem(item))
    {
      return null;
    }

    const choices = menuHost.choices('effort');
    const current = choices.find((choice) => choice.current);
    const slider = (
      <EffortSlider
        compact
        options={choices.map((choice) => ({ ...choice }))}
        value={current?.value ?? ''}
        onSelect={(value) => menuHost.pick('effort', value)}
      />
    );
    return slider;
  }

  /** 选中菜单里的一行。 */
  function chooseItem(chosen: MenuItem, complete = false)
  {
    const fromButton = menuOpen;

    // 开关行：点行或回车都只切换，菜单留着好看见结果。
    if (isUltracodeItem(chosen))
    {
      menuHost?.ultracode?.toggle();
      return;
    }

    // Tab 是补全：slash 命令只填进输入框，不执行。生成中照常发，CLI 排在这轮之后
    const fillOnly = isSlashItem(chosen) && complete;
    let item: MenuItem = fillOnly ? { ...chosen, kind: 'insert', command: slashName(chosen) } : chosen;

    // 快捷动作按 Tab 同样只填对应的命令，不执行（清空对话不可撤销）。
    if (complete && !isSlashItem(chosen) && (chosen.kind === 'action' || chosen.kind === 'panel'))
    {
      const name = slashEquivalent(chosen, slashCommands);

      if (name !== null)
      {
        item = { ...chosen, kind: 'insert', command: name };
      }
      else if (chosen.kind === 'action')
      {
        return;
      }
    }

    if (item.kind === 'submenu')
    {
      // 二级选项统一用带筛选框的那种菜单展示；打字触发的先把斜杠拿掉。
      if (!fromButton)
      {
        replaceSlashToken('', false);
      }

      setMenuFilter('');
      setSubmenu(item.command);
      setMenuOpen(true);
      return;
    }

    if (item.kind === 'choice')
    {
      const target = submenu;
      closeMenu();
      textareaRef.current?.focus();

      if (target !== null)
      {
        menuHost?.pick(target, item.command);
      }

      return;
    }

    if (fromButton)
    {
      closeMenu();
    }

    switch (item.kind)
    {
      case 'panel':
      case 'action':
        if (!fromButton)
        {
          replaceSlashToken('', item.kind === 'panel' || !DIALOG_ACTIONS.has(item.command));
        }

        if (item.kind === 'panel')
        {
          menuHost?.openPanel(item.command);
        }
        else
        {
          menuHost?.runAction(item.command);
        }

        return;

      case 'run':
        if (!fromButton)
        {
          replaceSlashToken('');
        }

        onSend(`/${item.command}`, []);
        return;

      case 'insert':
        if (!fromButton)
        {
          insertCommand(item.command);
          return;
        }

        // 命令只有独占第一行才算命令，所以放到最前面，原有草稿当实参。
        setDraft(`/${item.command} ${draft}`);
        setDismissed(true);
        requestAnimationFrame(() =>
        {
          const end = item.command.length + 2;
          textareaRef.current?.setSelectionRange(end, end);
          textareaRef.current?.focus();
        });
        return;

      case 'attach':
        if (!fromButton)
        {
          replaceSlashToken('');
        }

        pickFile();
        return;

      case 'mention':
        if (fromButton)
        {
          insertAtCaret('@');
        }
        else
        {
          replaceSlashToken('@');
        }

        return;
    }
  }

  /** 筛选框里的按键：上下移动、回车选中、Esc 关闭。 */
  function handleFilterKeyDown(e: KeyboardEvent<HTMLInputElement>)
  {
    if (e.key === 'ArrowDown' && candidates.length > 0)
    {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % candidates.length);
      return;
    }

    if (e.key === 'ArrowUp' && candidates.length > 0)
    {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + candidates.length) % candidates.length);
      return;
    }

    if ((e.key === 'Enter' || e.key === 'Tab') && candidates.length > 0)
    {
      e.preventDefault();
      chooseItem(candidates[Math.min(selectedIndex, candidates.length - 1)], e.key === 'Tab');
      return;
    }

    if (e.key === 'Escape')
    {
      e.preventDefault();

      // 在二级选项里先退回主菜单。
      if (submenu !== null)
      {
        setSubmenu(null);
        setMenuFilter('');
        return;
      }

      closeMenu();
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>)
  {
    if (typedOpen && !menuOpen)
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
        chooseItem(candidates[Math.min(selectedIndex, candidates.length - 1)], e.key === 'Tab');
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

    if (isSendKey(e))
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
        <CommandMenu
          items={candidates}
          selectedIndex={selectedIndex}
          onSelect={(item) => chooseItem(item)}
          onHover={setSelectedIndex}
          renderTrailing={renderTrailing}
          unavailable={unavailableCommands}
          filter={menuOpen
            ? { value: menuFilter, onChange: setMenuFilter, onKeyDown: handleFilterKeyDown, onBlur: closeMenu }
            : undefined}
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
        <ImageThumbs
          images={attachments.map((a) => ({ id: a.id, src: a.preview }))}
          onRemove={(id) => removeAttachment(id as number)}
        />
      )}
      <div className="composer-prompt-row">
        <textarea
          ref={promptRef}
          className="composer-textarea composer-prompt-textarea"
          rows={1}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handlePromptKeyDown}
          placeholder={t('固定提示词，每次发送都拼在内容前面（留空就只发内容）')}
        />
        {/* 标签放右边，与下面那排按钮同宽，两个框右缘对齐 */}
        <span
          className="composer-prompt-label"
          style={actionsWidth > 0 ? { width: actionsWidth } : undefined}
          title={t('每次发送都拼在内容前面，发完不清空')}
        >
          {t('提示词')}
        </span>
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
          placeholder={t('输入消息，Ctrl+Enter 发送，Enter 换行，/ 触发命令补全，@ 引用文件，可粘贴图片')}
        />
        <div className="composer-actions" ref={actionsRef}>
          {/* 小按钮叠在发送上方 */}
          <div className="composer-tools">
            <button
              type="button"
              className={menuOpen ? 'composer-menu-button is-open' : 'composer-menu-button'}
              title={t('命令菜单')}
              aria-label={t('命令菜单')}
              aria-expanded={menuOpen}
              // 按下时不抢焦点：筛选框失焦会先关菜单，接着的 click 又把它打开。
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleMenu}
            >
              /
            </button>
            <button
              type="button"
              className="composer-attach"
              title={t('挑一个文件插入 @ 引用')}
              aria-label={t('挑文件')}
              onClick={pickFile}
            >
              ◧
            </button>
          </div>
          {/* 不设停止按钮：中断只走 Esc */}
          <button
            type="button"
            className="composer-button"
            onClick={handleSend}
            disabled={nothingToSend}
          >
            {t('发送')}
          </button>
        </div>
      </div>
      <ComposerFooter
        activeFile={activeFile}
        attached={attachActive}
        onToggleAttach={() => setAttachActive((v) => !v)}
      />
    </div>
  );
}
