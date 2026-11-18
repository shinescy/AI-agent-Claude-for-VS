// status 面板：`/status` 在本管线下被 CLI 拒（实测 "isn't available in this environment"），

import { useState } from 'react';
import type { AgentSessionInfo, UsageWindow } from '../types';
import { useT } from '../LangContext';
import { formatReset, formatWindowLabel } from '../usageFormat';
import { useNowSeconds } from '../useNowSeconds';

interface StatusPanelProps {
  session: AgentSessionInfo | null;
}

export function StatusPanel({ session }: StatusPanelProps) {
  const t = useT();

  if (!session) {
    return <div className="panel-empty">{t('会话尚未启动，暂无可显示的状态。')}</div>;
  }

  return (
    <div className="panel-plain status-panel">
      <Section title={t('会话')}>
        {/* 模型、子代理在工具栏，MCP 在底栏，技能、工具在设置里，这里不重复 */}
        <Field label={t('会话 id')} value={session.sessionId} />
        <Field label={t('工作目录')} value={session.cwd} />
        <Field label={t('CLI 版本')} value={session.cliVersion} />
        <Field label={t('订阅')} value={session.subscriptionType} />
      </Section>

      <Section title={t('额度')}>
        {session.usageWindows.length === 0
          ? <div className="status-panel-none">{t('额度用量获取中…')}</div>
          : <UsageRows windows={session.usageWindows} />}
      </Section>

      {/* /usage 后半段那些「Last 24h · 3322 requests」「Top MCP servers: …」原样展示：
          信息量很大但结构松散，解析成结构化数据的收益不如原文呈现，
          而且 CLI 一改格式，解析器就会静默漏掉内容。 */}
      {session.usageRawText !== '' && (
        <CollapsibleText title={t('用量明细（CLI 原文）')} text={session.usageRawText} />
      )}
    </div>
  );
}

/** 用到这个比例就把进度条标成警示色。 */
const WARN_PERCENT = 75;

/** 额度行：名字、比例、重置时间，下面一条进度条。 */
function UsageRows({ windows }: { windows: UsageWindow[] }) {
  const t = useT();
  const nowSeconds = useNowSeconds(windows.some((w) => w.resetsAtUnix > 0));

  return (
    <>
      {windows.map((w) => (
        <div
          className={`status-panel-usage-item${w.percentUsed >= WARN_PERCENT ? ' account-usage-loud' : ''}`}
          key={w.label}
        >
          <div className="status-panel-usage">
            <span className="status-panel-usage-label">{formatWindowLabel(w, t)}</span>
            <span className="status-panel-usage-percent account-usage-percent">{w.percentUsed}%</span>
            <span className="status-panel-usage-reset">{formatReset(w, nowSeconds, t)}</span>
          </div>
          <div
            className="account-usage-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, w.percentUsed)}
            aria-label={formatWindowLabel(w, t)}
          >
            <span className="account-usage-fill" style={{ width: `${Math.min(100, w.percentUsed)}%` }} />
          </div>
        </div>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="status-panel-section">
      <div className="status-panel-section-title">{title}</div>
      {children}
    </div>
  );
}

/** 单值字段。 */
function Field({ label, value }: { label: string; value: string }) {
  const t = useT();

  return (
    <div className="status-panel-field">
      <span className="status-panel-field-label">{label}</span>
      <span className={`status-panel-field-value${value === '' ? ' status-panel-field-missing' : ''}`}>
        {value === '' ? t('未提供') : value}
      </span>
    </div>
  );
}

function CollapsibleText({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="status-panel-section">
      <button
        type="button"
        className="status-panel-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="status-panel-caret">{open ? '▾' : '▸'}</span>
        {title}
      </button>

      {/* pre-wrap：这段输出靠缩进表达层级，过 markdown 会把行首空格吃掉、层级压平。 */}
      {open && <pre className="status-panel-raw">{text}</pre>}
    </div>
  );
}
