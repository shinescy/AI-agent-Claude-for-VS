// 转录组件：按 Block.kind 分派渲染。

import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { detectCommandPicker, detectCurrentValue } from '../commandPicker';
import type { CommandPicker } from '../commandPicker';
import { loadPrompt } from '../composerPrompt';
import type { Block, CompactionInfo } from '../state';
import { formatTokens } from '../promptCache';
import { groupTurns, pinnedLabel } from '../turnGroups';
import type { TurnGroup } from '../turnGroups';
import type { AgentTurnResult } from '../types';
import { Markdown } from './Markdown';
import { PinnedTurnBar } from './PinnedTurnBar';
import { UserMessage } from './UserMessage';
import { ImageThumbs } from './ImageLightbox';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';
import { useT, useNoticeText, LangContext } from '../LangContext';
import { focusComposer } from '../optionFocus';
import { bookmarkId } from '../bookmarks';
import { formatClock, formatDay, formatFull, sameDay } from '../timeFormat';

interface TranscriptProps {
  blocks: Block[];
  /** 点选项框里的一项时，把对应命令发出去。 */
  onRunCommand: (text: string) => void;

  /** 代理正在干活：转录末尾显示「✱ 思考中…」。 */
  busy?: boolean;

  /** 藏起来（终端占着主视图时）。 */
  hidden?: boolean;

  /** 专注视图：藏起工具调用、思考与未识别输出，只留问与答。 */
  focusView?: boolean;

  /** 已收藏回复的书签键。 */
  bookmarkedIds?: ReadonlySet<string>;

  /** 点回复下的书签按钮；不给就不显示按钮。 */
  onToggleBookmark?: (block: Block) => void;
}

/** 时间线圆点：工具按成败上色，进行中闪，文字是实心，其余是灰的。 */
export function timelineDot(block: Block): string
{
  switch (block.kind)
  {
    case 'tool':
      return block.streaming ? 'running' : block.tool?.isError ? 'error' : 'ok';

    case 'error':
      return 'error';

    case 'turnEnd':
      return 'none';

    case 'compaction':
      return block.compaction?.phase === 'running' ? 'running' : block.compaction?.phase === 'failed' ? 'error' : 'muted';

    case 'thinking':
    case 'notice':
    case 'raw':
      return 'muted';

    default:
      return 'text';
  }
}

/** 每个思考块用了多久：到下一块开始为止；算不出不给。 */
function thinkingDurations(body: Block[]): Map<number, number>
{
  const durations = new Map<number, number>();

  body.forEach((block, index) =>
  {
    if (block.kind !== 'thinking' || block.streaming || block.at === undefined)
    {
      return;
    }

    const next = body.slice(index + 1).find((later) => later.at !== undefined);

    if (next?.at !== undefined && next.at >= block.at)
    {
      durations.set(block.id, next.at - block.at);
    }
  });

  return durations;
}

/** 干活时末尾那句的说法，每轮换一个。 */
const WORKING_VERBS = ['思考中…', '琢磨中…', '推敲中…', '整理中…', '盘算中…', '斟酌中…'];

/**
 * 要不要在末尾画「干活中」：忙且最后一块不是自带进度的。
 * 正在流出的文字、思考与压缩自己就看得出在动，再画一行就重复了。
 */
export function showWorking(blocks: Block[], busy: boolean): boolean
{
  if (!busy)
  {
    return false;
  }

  const last = blocks[blocks.length - 1];
  const selfEvident = last !== undefined
    && ((last.streaming && (last.kind === 'assistant' || last.kind === 'thinking'))
      || last.compaction?.phase === 'running');
  return !selfEvident;
}

/** 末尾那行「✱ 思考中…」。 */
function WorkingLine({ turn }: { turn: number })
{
  const t = useT();

  return (
    <div className="working-line" role="status">
      <span className="compaction-spinner" aria-hidden="true">✱</span>
      <span>{t(WORKING_VERBS[turn % WORKING_VERBS.length])}</span>
    </div>
  );
}

/**
 * 吸顶该钉哪一条：最后一条整个滚到吸顶栏上方的用户消息；没有给 -1。
 * 点它跳回去后它回到眼前，于是轮到再上一条，一路点下去就能逐条往回走。
 */
export function pickPinned(bottoms: number[], viewTop: number, barHeight: number): number
{
  let picked = -1;

  bottoms.forEach((bottom, index) =>
  {
    if (bottom <= viewTop + barHeight)
    {
      picked = index;
    }
  });

  return picked;
}

/** 一轮里最早的已知时刻；都不知道给 undefined。 */
function groupTime(group: TurnGroup): number | undefined
{
  if (group.head?.at !== undefined)
  {
    return group.head.at;
  }

  const first = group.body.find((block) => block.at !== undefined);
  return first?.at;
}

export function Transcript(
  { blocks, onRunCommand, busy = false, hidden = false, focusView = false, bookmarkedIds, onToggleBookmark }: TranscriptProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const lang = useContext(LangContext);
  const now = Date.now();
  let lastDay: number | undefined;

  const groups = useMemo(() => groupTurns(blocks), [blocks]);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);

  /** 量一遍各条用户消息的位置，定下吸顶钉哪条。 */
  const measure = useCallback(() =>
  {
    const root = rootRef.current;

    if (root === null)
    {
      return;
    }

    const view = root.getBoundingClientRect();

    // 藏起来时量不出矩形，一律不钉
    if (view.height === 0)
    {
      setPinnedKey(null);
      return;
    }

    const heads = Array.from(root.querySelectorAll<HTMLElement>('[data-turn-head]'));
    const barHeight = barRef.current?.offsetHeight ?? 0;
    const index = pickPinned(heads.map((head) => head.getBoundingClientRect().bottom), view.top, barHeight);

    setPinnedKey(index >= 0 ? heads[index].dataset.turnHead ?? null : null);
  }, []);

  // 只在条数或显隐变化时量：流式输出时每个字都量一遍是白白重排；
  // 吸顶只看已滚到上方的消息，下面变长不影响，自动滚到底会触发 onScroll
  useEffect(() =>
  {
    measure();
  }, [blocks.length, hidden, measure]);

  /** 跳回钉住的那条；留出吸顶栏的高度，免得被它挡住。 */
  const reveal = useCallback(() =>
  {
    const heads = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-turn-head]') ?? []);
    heads.find((head) => head.dataset.turnHead === pinnedKey)?.scrollIntoView({ block: 'start' });
  }, [pinnedKey]);

  const pinnedGroup = pinnedKey === null ? undefined : groups.find((group) => group.key === pinnedKey);
  const pinnedText = pinnedGroup?.head ? pinnedLabel(pinnedGroup.head.text, loadPrompt('chat')) : '';

  const className = ['transcript', hidden ? 'is-hidden' : '', focusView ? 'is-focus' : '']
    .filter((name) => name !== '')
    .join(' ');

  return (
    <div className={className} ref={rootRef} onScroll={measure}>
      <div className={pinnedText !== '' ? 'turn-head is-stuck' : 'turn-head'} ref={barRef}>
        {pinnedText !== '' && <PinnedTurnBar text={pinnedText} duplicate onReveal={reveal} />}
      </div>
      {groups.map((group) => {
        const at = groupTime(group);
        const newDay = at !== undefined && (lastDay === undefined || !sameDay(lastDay, at));

        if (at !== undefined)
        {
          lastDay = at;
        }

        return (
          <div className="turn-wrap" key={group.key}>
            {newDay && at !== undefined && (
              <div className="day-divider" role="separator">
                <span>{formatDay(at, now, lang)}</span>
              </div>
            )}
            <TurnSection
              group={group}
              onRunCommand={onRunCommand}
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={onToggleBookmark}
            />
          </div>
        );
      })}
      {showWorking(blocks, busy) && <WorkingLine turn={blocks.filter((b) => b.kind === 'user').length} />}
    </div>
  );
}

interface TurnSectionProps {
  group: TurnGroup;
  onRunCommand: (text: string) => void;
  bookmarkedIds?: ReadonlySet<string>;
  onToggleBookmark?: (block: Block) => void;
}

/** 一轮：领头那条用户消息 + 它之后的所有块。 */
function TurnSection({ group, onRunCommand, bookmarkedIds, onToggleBookmark }: TurnSectionProps) {
  const head = group.head;

  const durations = useMemo(() => thinkingDurations(group.body), [group.body]);

  return (
    <section className="turn">
      {head !== null && (
        <UserBlock text={head.text} images={head.images} at={head.at} turnKey={group.key} />
      )}
      {group.body.length > 0 && (
        <div className="timeline">
          {group.body.map((block) => (
            <div className="timeline-item" key={block.id} data-kind={block.kind} data-dot={timelineDot(block)}>
              <TranscriptBlock
                block={block}
                onRunCommand={onRunCommand}
                bookmarked={block.kind === 'assistant' && !block.streaming && (bookmarkedIds?.size ?? 0) > 0
                  && (bookmarkedIds?.has(bookmarkId(block.text)) ?? false)}
                onToggleBookmark={onToggleBookmark}
                durationMs={durations.get(block.id)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** 消息时刻：显示钟点，悬停看完整时刻。 */
function BlockTime({ at }: { at?: number })
{
  const lang = useContext(LangContext);

  if (at === undefined)
  {
    return null;
  }

  return (
    <time className="block-time" dateTime={new Date(at).toISOString()} title={formatFull(at, lang)}>
      {formatClock(at)}
    </time>
  );
}

/** 一条用户消息。 */
const UserBlock = memo(function UserBlock(
  { text, images, at, turnKey }: { text: string; images?: string[]; at?: number; turnKey?: string })
{
  return (
    <div className="block block-user" data-turn-head={turnKey}>
      <BlockTime at={at} />
      <UserMessage text={text} />
      {images !== undefined && images.length > 0 && (
        <ImageThumbs images={images.map((src, i) => ({ id: i, src }))} />
      )}
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

/** 摘要里单独成行的 XML 式标签（如 system-reminder）只是包装，去掉。 */
function cleanSummary(text: string): string {
  const cleaned = text
    .split('\n')
    .filter((line) => !/^\s*<\/?[\w-]+>\s*$/.test(line))
    .join('\n')
    .trim();
  return cleaned;
}

/** 压缩块：进行中转圈；完成后一行可展开看摘要，下面一条波浪分隔线。 */
const CompactionBlock = memo(function CompactionBlock({ info }: { info: CompactionInfo })
{
  const t = useT();

  if (info.phase === 'running')
  {
    return (
      <div className="block block-compaction is-running" role="status">
        <span className="compaction-spinner" aria-hidden="true">✱</span>
        <span>{t('正在压缩上下文…')}</span>
      </div>
    );
  }

  if (info.phase === 'failed')
  {
    return (
      <div className="block block-compaction is-failed" role="status">
        <span>{info.error !== '' ? t('压缩失败：{error}', { error: info.error }) : t('压缩没有完成。')}</span>
      </div>
    );
  }

  const freed = info.postTokens > 0 && info.preTokens > info.postTokens ? info.preTokens - info.postTokens : 0;
  const parts = [t('已压缩对话')];

  if (info.trigger !== '')
  {
    parts.push(info.trigger === 'auto' ? t('自动') : t('手动'));
  }

  if (freed > 0)
  {
    parts.push(t('释放 {tokens} tokens', { tokens: formatTokens(freed) }));
  }
  else if (info.preTokens > 0)
  {
    parts.push(t('压缩前 {tokens} tokens', { tokens: formatTokens(info.preTokens) }));
  }

  return (
    <div className="block block-compaction is-done">
      <details className="compaction-details">
        <summary className="compaction-line">{parts.join(' · ')}</summary>
        <div className="compaction-body">
          {info.summary !== ''
            ? <Markdown text={cleanSummary(info.summary)} />
            : <p className="modal-muted">{t('摘要还没读到。')}</p>}
        </div>
      </details>
      <div className="compaction-divider" role="separator">
        <span>{t('已压缩')}</span>
      </div>
    </div>
  );
});

interface BlockProps {
  block: Block;
  onRunCommand: (text: string) => void;
  /** 这条回复已收藏。 */
  bookmarked?: boolean;
  onToggleBookmark?: (block: Block) => void;
  /** 思考块用了多久，毫秒。 */
  durationMs?: number;
}

/** 回复底下那一行：时刻与书签按钮；还在流式输出时不显示。 */
function ReplyActions(
  { block, bookmarked, onToggle }: { block: Block; bookmarked: boolean; onToggle?: (block: Block) => void })
{
  const t = useT();

  if (block.streaming)
  {
    return null;
  }

  const label = bookmarked ? t('取消书签') : t('加书签');

  return (
    <div className={bookmarked ? 'block-actions is-bookmarked' : 'block-actions'}>
      <BlockTime at={block.at} />
      {onToggle && (
        <button
          type="button"
          className="block-action-button"
          aria-pressed={bookmarked}
          aria-label={label}
          title={label}
          onClick={() => onToggle(block)}
        >
          {bookmarked ? '★' : '☆'}
        </button>
      )}
    </div>
  );
}

const TranscriptBlock = memo(function TranscriptBlock(
  { block, onRunCommand, bookmarked = false, onToggleBookmark, durationMs }: BlockProps) {
  switch (block.kind)
  {
    case 'user':
    {
      return <UserBlock text={block.text} images={block.images} at={block.at} />;
    }

    case 'assistant':
    {
      const picker = detectCommandPicker(block.text);

      return (
        <div className="block block-assistant" id={block.streaming ? undefined : bookmarkId(block.text)}>
          <Markdown text={block.text} />
          {picker && (
            <CommandOptions
              picker={picker}
              current={detectCurrentValue(block.text)}
              onRun={onRunCommand}
            />
          )}
          <ReplyActions block={block} bookmarked={bookmarked} onToggle={onToggleBookmark} />
        </div>
      );
    }

    case 'thinking':
    {
      return (
        <div className="block block-thinking">
          <ThinkingBlock text={block.text} streaming={block.streaming} durationMs={durationMs} />
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

    case 'raw':
    {
      return <RawBlock text={block.text} />;
    }

    case 'turnEnd':
    {
      return <TurnEndLine turn={block.turn} />;
    }

    case 'compaction':
    {
      return block.compaction ? <CompactionBlock info={block.compaction} /> : null;
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
