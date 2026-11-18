// 工具卡片：标题一行；执行类摊开 IN / OUT，查找类只占一行、点开看结果。

import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ImageFileLightbox } from './ImageLightbox';
import { isImagePath } from '../fileRefs';
import type { AgentToolCall } from '../types';
import { summarizeTool, toolInput } from '../toolSummary';
import { DiffView } from './DiffView';
import { useT } from '../LangContext';
import { BackgroundContext } from '../backgroundable';
import { sendOpenFile } from '../bridge';

interface ToolCardProps {
  call: AgentToolCall;
  /** 工具已发起但结果尚未回填。 */
  running: boolean;
}

/** 去掉首尾空行，免得收起时那一行是空的。 */
export function tidyIoText(text: string): string {
  const tidy = text.replace(/^(\s*\n)+/, '').trimEnd();
  return tidy;
}

/** 不止一行：收起时肯定显示不全。 */
export function isMultiLine(text: string): boolean {
  const multi = tidyIoText(text).includes('\n');
  return multi;
}

/** 收起时那一行是否被横向截断。 */
function useOverflow(ref: RefObject<HTMLDivElement | null>, active: boolean): boolean
{
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() =>
  {
    const el = ref.current?.firstElementChild as HTMLElement | null | undefined;

    if (!active || !el)
    {
      return undefined;
    }

    const measure = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    measure();

    // 面板拖宽拖窄后要重算
    if (typeof ResizeObserver === 'undefined')
    {
      return undefined;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, active]);

  return overflow;
}

/** IN / OUT 一格：默认只显示一行；显示不全时右边给「展开」。 */
function IoBox({ label, long, error = false, children }: { label: string; long: boolean; error?: boolean; children: ReactNode })
{
  const t = useT();
  const [full, setFull] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const overflow = useOverflow(contentRef, !full);
  const expandable = long || overflow;
  const clamped = expandable && !full;

  const classes = ['io-box', full ? 'is-full' : '', clamped ? 'is-clamped' : '', error ? 'is-error' : ''];

  return (
    <div className={classes.filter((c) => c !== '').join(' ')}>
      <span className="io-label">{label}</span>
      <div className="io-content" ref={contentRef}>
        {children}
      </div>
      {(expandable || full) && (
        <button type="button" className="io-more" aria-expanded={full} onClick={() => setFull((v) => !v)}>
          {full ? t('收起') : t('展开全部')}
        </button>
      )}
    </div>
  );
}

export function ToolCard({ call, running }: ToolCardProps) {
  const t = useT();
  const summary = summarizeTool(call);
  const io = toolInput(call);
  const [open, setOpen] = useState(!io.compact);
  const [sent, setSent] = useState(false);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const closeImage = useCallback(() => setImagePath(null), []);
  const background = useContext(BackgroundContext);

  // 只有 App 判定为「当前这一轮、还在跑」的调用才给「转到后台」
  const showBackground = background !== null && background.ids.has(call.toolUseId);

  // 转后台失败：恢复按钮，允许再试
  const failedSeq = background?.failed?.id === call.toolUseId ? background.failed.seq : 0;

  useEffect(() =>
  {
    if (failedSeq > 0)
    {
      setSent(false);
    }
  }, [failedSeq]);

  // IN 框已经摊开命令或参数时，标题后面不再重复一遍
  const plainDetail = summary.filePath === '' && io.headline === '' && io.input === '' ? summary.detail : '';
  const hasBody = summary.diff !== null || io.input !== '' || call.resultText !== '';

  return (
    <div className={`tool-card${call.isError ? ' tool-card-error' : ''}`}>
      <div className="tool-card-head">
        <button
          type="button"
          className="tool-card-header"
          aria-expanded={hasBody ? open : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="tool-card-title">{io.headline !== '' && !io.compact ? `${summary.title}:` : summary.title}</span>
          {io.headline !== '' && (
            <span className={io.compact ? 'tool-card-headline is-code' : 'tool-card-headline'}>{io.headline}</span>
          )}
          {summary.filePath !== '' && (
            <span
              className="tool-card-detail tool-card-file"
              role="link"
              title={t('在编辑器里打开 {path}', { path: summary.filePath })}
              onClick={(e) =>
              {
                // 点文件名是打开文件，不是收起卡片
                e.stopPropagation();
                if (isImagePath(summary.filePath))
                {
                  setImagePath(summary.filePath);
                  return;
                }
                sendOpenFile(summary.filePath, 0);
              }}
            >
              {summary.filePath}
            </span>
          )}
          {plainDetail !== '' && <span className="tool-card-detail">{plainDetail}</span>}
          {running && <span className="tool-card-running">{t('执行中…')}</span>}
        </button>
        {showBackground && (
          <button
            type="button"
            className="tool-card-background"
            title={t('把它转到后台继续跑，你可以接着说别的')}
            disabled={sent}
            onClick={() =>
            {
              setSent(true);
              background!.run(call.toolUseId);
            }}
          >
            {sent ? t('已请求转后台') : t('转到后台')}
          </button>
        )}
      </div>
      {open && hasBody && (
        <div className="tool-card-body">
          {summary.diff && (
            <IoBox label="IN" long>
              <DiffView diff={summary.diff} />
            </IoBox>
          )}
          {!summary.diff && io.input !== '' && (
            <IoBox label="IN" long={isMultiLine(io.input)}>
              <pre className="io-text">{tidyIoText(io.input)}</pre>
            </IoBox>
          )}
          {call.resultText !== '' && (
            <IoBox label="OUT" long={isMultiLine(call.resultText)} error={call.isError}>
              <pre className="io-text">{tidyIoText(call.resultText)}</pre>
            </IoBox>
          )}
        </div>
      )}
      {imagePath !== null && <ImageFileLightbox path={imagePath} onClose={closeImage} />}
    </div>
  );
}
