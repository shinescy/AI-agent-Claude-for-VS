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
        <Field label={t('会话 id')} value={session.sessionId} />
        <Field label={t('模型')} value={session.model} />
        <Field label={t('思考强度')} value={session.effortLevel} />
        <Field label={t('权限模式')} value={session.permissionMode} />
        <Field label={t('工作目录')} value={session.cwd} />
        <Field label={t('CLI 版本')} value={session.cliVersion} />
        <Field label={t('订阅')} value={session.subscriptionType} />
      </Section>

      <Section title={t('额度')}>
        {session.usageWindows.length === 0
          ? <div className="status-panel-none">{t('额度用量获取中…')}</div>
          : <UsageRows windows={session.usageWindows} />}
      </Section>

      {/* 长列表默认折叠：tools 实测几十项，铺开会把上面的关键信息推出可视区。
          数量写在标题上，这样不展开也知道有没有、有多少。 */}
      <CollapsibleList title={t('MCP 服务器')} items={session.mcpServers.map(describeMcp)} />
      <CollapsibleList title={t('技能')} items={session.skills} />
      <CollapsibleList title={t('子代理')} items={session.subAgents} />
      <CollapsibleList title={t('工具')} items={session.tools} />
      <CollapsibleList title={t('协议能力')} items={session.capabilities} />

      {/* /usage 后半段那些「Last 24h · 3322 requests」「Top MCP servers: …」原样展示：
          信息量很大但结构松散，解析成结构化数据的收益不如原文呈现，
          而且 CLI 一改格式，解析器就会静默漏掉内容。 */}
      {session.usageRawText !== '' && (
        <CollapsibleText title={t('用量明细（CLI 原文）')} text={session.usageRawText} />
      )}
    </div>
  );
}

/** MCP 服务器一行的描述。 */
function describeMcp(server: { name: string; status: string }): string {
  return server.status === '' ? server.name : `${server.name} · ${server.status}`;
}

/** 额度行。 */
function UsageRows({ windows }: { windows: UsageWindow[] }) {
  const t = useT();
  const nowSeconds = useNowSeconds(windows.some((w) => w.resetsAtUnix > 0));

  return (
    <>
      {windows.map((w) => (
        <div className="status-panel-usage" key={w.label}>
          <span className="status-panel-usage-label">{formatWindowLabel(w, t)}</span>
          <span className="status-panel-usage-percent">{w.percentUsed}%</span>
          <span className="status-panel-usage-reset">{formatReset(w, nowSeconds, t)}</span>
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

function CollapsibleList({ title, items }: { title: string; items: string[] }) {
  const t = useT();
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
        <span className="status-panel-count">{items.length}</span>
      </button>

      {open && (
        items.length === 0
          ? <div className="status-panel-none">{t('无')}</div>
          : (
            <ul className="status-panel-list">
              {items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )
      )}
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
