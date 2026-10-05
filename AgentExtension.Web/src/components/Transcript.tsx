// 转录组件：按 Block.kind 分派渲染。

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Ref, RefObject } from 'react';
import { detectCommandPicker, detectCurrentValue } from '../commandPicker';
import type { CommandPicker } from '../commandPicker';
import { loadPrompt } from '../composerPrompt';
import type { Block } from '../state';
import { groupTurns, pinnedLabel } from '../turnGroups';
import type { TurnGroup } from '../turnGroups';
import type { AgentTurnResult } from '../types';
import { Markdown } from './Markdown';
import { PinnedTurnBar } from './PinnedTurnBar';
import { UserMessage } from './UserMessage';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';
import { useT, useNoticeText } from '../LangContext';
import { focusComposer } from '../optionFocus';

interface TranscriptProps {
  blocks: Block[];
  /** 点选项框里的一项时，把对应命令发出去。 */
  onRunCommand: (text: string) => void;

  /** 藏起来（终端占着主视图时）。 */
  hidden?: boolean;
}

export function Transcript({ blocks, onRunCommand, hidden = false }: TranscriptProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div className={hidden ? 'transcript is-hidden' : 'transcript'} ref={rootRef}>
      {groupTurns(blocks).map((group) => (
        <TurnSection
          key={group.key}
          group={group}
          rootRef={rootRef}
          onRunCommand={onRunCommand}
        />
      ))}
    </div>
  );
}

interface TurnSectionProps {
  group: TurnGroup;
  rootRef: RefObject<HTMLDivElement | null>;
  onRunCommand: (text: string) => void;
}

/** 一轮：领头那条用户消息 + 它之后的所有块。 */
function TurnSection({ group, rootRef, onRunCommand }: TurnSectionProps) {
  const head = group.head;
  const headRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() =>
  {
    const anchor = anchorRef.current;
    const root = rootRef.current;

    if (anchor === null || root === null || typeof IntersectionObserver === 'undefined')
    {
      return;
    }

    const observer = new IntersectionObserver((entries) =>
    {
      for (const entry of entries)
      {
        const bounds = entry.rootBounds;

        if (bounds === null)
        {
          setStuck(false);
          continue;
        }

        setStuck(!entry.isIntersecting && entry.boundingClientRect.top <= bounds.top);
      }
    }, { root, threshold: 0 });

    observer.observe(anchor);

    return () =>
    {
      observer.disconnect();
    };
  }, [rootRef]);

  const label = useMemo(
    () => (head === null ? '' : pinnedLabel(head.text, loadPrompt('chat'))),
    [head],
  );

  return (
    <section className="turn">
      {head !== null && (
        <>
          <div className={stuck ? 'turn-head is-stuck' : 'turn-head'}>
            <PinnedTurnBar
              text={label}
              duplicate
              onReveal={() => headRef.current?.scrollIntoView({ block: 'start' })}
            />
          </div>
          <UserBlock text={head.text} innerRef={headRef} />
          {/* 锚点：它一从上边出去，就说明原件已经看不见了，该把头钉出来。
              放在消息**之后**——放前面的话消息还整条在屏幕上就先钉上了。 */}
          <div className="turn-anchor" ref={anchorRef} />
        </>
      )}
      {group.body.map((block) => (
        <TranscriptBlock key={block.id} block={block} onRunCommand={onRunCommand} />
      ))}
    </section>
  );
}

/** 一条用户消息。 */
const UserBlock = memo(function UserBlock(
  { text, innerRef }: { text: string; innerRef?: Ref<HTMLDivElement> })
{
  return (
    <div className="block block-user" ref={innerRef}>
      <UserMessage text={text} />
    </div>
  );
});

/**
 * 中性提示，视觉上必须与错误块区分开：这类消息说的是「已切换/已重启」。
 *
 * 单独成组件是为了拿 useNoticeText——它是 hook，进不了上面 switch 的分支。
 * 顺带换语言时这一块会跟着重画，不必等下一条消息。
 */
const NoticeBlock = memo(function NoticeBlock({ block }: { block: Block })
{
  const notice = useNoticeText();

  return (
    <div className="block block-notice">
      <span className="block-notice-icon">ℹ</span>
      <span className="block-text">{notice(block.text, block.textKey, block.textArgs)}</span>
    </div>
  );
});

interface BlockProps {
  block: Block;
  onRunCommand: (text: string) => void;
}

const TranscriptBlock = memo(function TranscriptBlock({ block, onRunCommand }: BlockProps) {
  switch (block.kind)
  {
    case 'user':
    {
      return <UserBlock text={block.text} />;
    }

    case 'assistant':
    {
      const picker = detectCommandPicker(block.text);

      return (
        <div className="block block-assistant">
          <Markdown text={block.text} />
          {picker && (
            <CommandOptions
              picker={picker}
              current={detectCurrentValue(block.text)}
              onRun={onRunCommand}
            />
          )}
        </div>
      );
    }

    case 'thinking':
    {
      return (
        <div className="block block-thinking">
          <ThinkingBlock text={block.text} />
        </div>
      );
    }

    case 'tool':
    {
      return (
        <div className="block block-tool">
          {block.tool && <ToolCard call={block.tool} running={block.streaming} />}
        </div>
      );
    }

    case 'error':
    {
      return (
        <div className="block block-error">
          <span className="block-error-icon">✖</span>
          <span className="block-text">{block.text}</span>
        </div>
      );
    }

    case 'notice':
    {
      return <NoticeBlock block={block} />;
    }

    case 'hook':
    {
      return (
        <div className="block block-hook">
          <span className="block-hook-icon">⚙</span>
          <span>{block.text}</span>
        </div>
      );
    }

    case 'raw':
    {
      return <RawBlock text={block.text} />;
    }

    case 'turnEnd':
    {
      return <TurnEndLine turn={block.turn} />;
    }

    default:
    {
      return null;
    }
  }
});

/** 用法串还原出来的选项框。 */
function CommandOptions(
  { picker, current, onRun }:
  { picker: CommandPicker; current: string; onRun: (text: string) => void }) {
  const t = useT();
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const currentIndex = Math.max(0, picker.options.indexOf(current));
  const [focusIndex, setFocusIndex] = useState(currentIndex);

  /** 焦点在组内时才显示按键提示。 */
  const [showHint, setShowHint] = useState(false);

  // 选项会随新的用法串变化（换了命令、CLI 改了清单），越界的下标要收回来，
  const safeIndex = Math.min(focusIndex, picker.options.length - 1);

  function move(next: number)
  {
    const count = picker.options.length;

    if (count === 0)
    {
      return;
    }

    const wrapped = ((next % count) + count) % count;

    setFocusIndex(wrapped);
    buttonsRef.current[wrapped]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>)
  {
    switch (e.key)
    {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(safeIndex + 1);
        break;

      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(safeIndex - 1);
        break;

      case 'Home':
        e.preventDefault();
        move(0);
        break;

      case 'End':
        e.preventDefault();
        move(picker.options.length - 1);
        break;

      case 'Escape':
        e.preventDefault();
        focusComposer();
        break;

      default:
        break;
    }
  }

  return (
    <div
      className="command-options"
      role="toolbar"
      aria-orientation="horizontal"
      aria-label={t('{command} 的可选值', { command: '/' + picker.command })}
      onKeyDown={onKeyDown}
      onFocus={() => setShowHint(true)}
      onBlur={(e) =>
      {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
        {
          setShowHint(false);
        }
      }}
    >
      {picker.options.map((option, index) => (
        <button
          key={option}
          ref={(el) => { buttonsRef.current[index] = el; }}
          type="button"
          className={`command-option${option === current ? ' command-option-current' : ''}`}
          tabIndex={index === safeIndex ? 0 : -1}
          aria-pressed={option === current}
          onFocus={() => setFocusIndex(index)}
          onClick={() => onRun(`/${picker.command} ${option}`)}
        >
          {option}
        </button>
      ))}

      {/* 只在焦点进到组内时出现：常驻会变成一行永远在那儿的噪音，
          而键盘用户恰好在需要它的那一刻能看到。 */}
      {showHint && (
        <span className="command-options-hint">
          {t('← → 选择 · Enter 执行 · Esc 回输入框')}
        </span>
      )}
    </div>
  );
}

/** 未被专门处理的原始输出行。 */
function RawBlock({ text }: { text: string }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  let label = text.slice(0, 80);
  try
  {
    const parsed = JSON.parse(text);
    const type = typeof parsed?.type === 'string' ? parsed.type : t('未知');
    const subtype = typeof parsed?.subtype === 'string' ? `/${parsed.subtype}` : '';
    label = `${type}${subtype}`;
  }
  catch
  {
  }

  return (
    <div className="block block-raw">
      <button type="button" className="block-raw-header" onClick={() => setExpanded((v) => !v)}>
        <span className="block-raw-caret">{expanded ? '▾' : '▸'}</span>
        <span className="block-raw-label">{label}</span>
        <span className="block-raw-tag">{t('未识别')}</span>
      </button>
      {expanded && <pre className="block-raw-body">{text}</pre>}
    </div>
  );
}

/** 轮次结尾行：耗时 / token / 成本，中断与权限拒绝时追加提示。 */
function TurnEndLine({ turn }: { turn?: AgentTurnResult }) {
  const t = useT();

  if (!turn)
  {
    return null;
  }

  const usage = turn.usage;
  const deniedNames = turn.permissionDenials.map((d) => d.toolName);

  return (
    <div className="block block-turnend">
      {usage && (
        <>
          <span>{(usage.durationMs / 1000).toFixed(1)}s</span>
          <span className="turnend-sep">·</span>
          <span>{usage.outputTokens} tokens</span>
          <span className="turnend-sep">·</span>
          {/* 明确标成「≈ … API 等价」：CLI 给的 total_cost_usd 是按 API 标价折算的，
              订阅制下并不据此扣费。实测一个只产出 4 个 token 的轮次报到 $0.22，
              绝大部分来自缓存写入与读取——不加限定词会让人以为真花了这么多钱。 */}
          <span
            title={
              t('按 API 标价折算的等价成本，含缓存写入与读取。')
              + '\n'
              + t('订阅制下不据此扣费，实际用量看窗口顶部那条额度栏。')
            }
          >
            {t('≈${amount} API 等价', { amount: usage.costUsd.toFixed(4) })}
          </span>
        </>
      )}
      {turn.wasInterrupted && <span className="turnend-interrupted">{t('已中断')}</span>}
      {deniedNames.length > 0 && (
        <span className="turnend-denied">
          {t('被拒：{tools}', { tools: deniedNames.join(t('、')) })}
        </span>
      )}
    </div>
  );
}
