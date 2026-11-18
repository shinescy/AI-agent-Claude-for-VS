// 「账号与用量」小弹窗：居中浮在界面上，不占整屏。

import { useEffect } from 'react';
import type { AgentSessionInfo, UsageWindow } from '../types';
import { useT } from '../LangContext';
import { formatReset, formatWindowLabel } from '../usageFormat';
import { useNowSeconds } from '../useNowSeconds';

/** 用量到这个比例就该提醒了。 */
const WARN_PERCENT = 75;

interface AccountDialogProps {
  session: AgentSessionInfo | null;
  /** 重新读一次额度。 */
  onRefresh: () => void;
  onClose: () => void;
}

/** 用量构成里的一个时间段。 */
export interface UsagePeriod {
  title: string;
  lines: string[];
}

/** 从 `/usage` 原文里切出「用量构成」那一段。 */
export function splitUsageBehaviors(raw: string): UsagePeriod[] {
  const lines = raw.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((line) => /contributing to your limits usage/i.test(line));
  const periods: UsagePeriod[] = [];

  if (start < 0)
  {
    return periods;
  }

  for (const line of lines.slice(start + 1))
  {
    if (line.trim() === '')
    {
      continue;
    }

    if (/^Last\s/i.test(line))
    {
      periods.push({ title: line.trim(), lines: [] });
      continue;
    }

    // 缩进行归到它上面那个时间段。
    if (/^\s/.test(line) && periods.length > 0)
    {
      periods[periods.length - 1].lines.push(line.trim());
    }
  }

  return periods;
}

export function AccountDialog({ session, onRefresh, onClose }: AccountDialogProps) {
  const t = useT();
  const windows = session?.usageWindows ?? [];
  const nowSeconds = useNowSeconds(windows.some((w) => w.resetsAtUnix > 0));
  const periods = splitUsageBehaviors(session?.usageRawText ?? '');

  // 捕获阶段接 Esc：只关弹窗，不让它继续传去打断生成。
  useEffect(() =>
  {
    function onKeyDown(e: KeyboardEvent)
    {
      if (e.key === 'Escape')
      {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) =>
      {
        if (e.target === e.currentTarget)
        {
          onClose();
        }
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={t('账号与用量')}>
        <div className="modal-header">
          <span className="modal-title">{t('账号与用量')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-section-title">{t('账号')}</div>
          {session === null
            ? <div className="modal-muted">{t('会话尚未启动，暂时读不到账号信息。')}</div>
            : (
              <div className="account-rows">
                <AccountRow label={t('邮箱')} value={session.accountEmail ?? ''} />
                <AccountRow label={t('组织')} value={session.accountOrganization ?? ''} />
                <AccountRow label={t('订阅')} value={session.subscriptionType} />
                <AccountRow label={t('CLI 版本')} value={session.cliVersion} />
              </div>
            )}

          <div className="modal-section-title">
            {t('用量')}
            <button
              type="button"
              className="modal-link"
              title={t('重新读取额度用量。该命令不消耗额度。')}
              onClick={onRefresh}
            >
              {t('刷新')}
            </button>
          </div>
          {windows.length === 0
            ? <div className="modal-muted">{t('额度用量获取中…')}</div>
            : windows.map((w) => <UsageRow key={w.label} window={w} nowSeconds={nowSeconds} />)}

          {periods.length > 0 && (
            <>
              <div className="modal-section-title">{t('用量构成')}</div>
              <div className="modal-muted">{t('按本机的会话估算，不含其它设备与 claude.ai。')}</div>
              {periods.map((period) => (
                <div className="account-period" key={period.title}>
                  <div className="account-period-title">{period.title}</div>
                  <ul className="account-period-lines">
                    {period.lines.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 账号信息的一行；没有值就不画。 */
function AccountRow({ label, value }: { label: string; value: string }) {
  if (value === '')
  {
    return null;
  }

  return (
    <div className="account-row">
      <span className="account-row-label">{label}</span>
      <span className="account-row-value">{value}</span>
    </div>
  );
}

/** 一个额度窗口：名字、已用比例、进度条、何时重置。 */
function UsageRow({ window: w, nowSeconds }: { window: UsageWindow; nowSeconds: number }) {
  const t = useT();
  const loud = w.percentUsed >= WARN_PERCENT;

  return (
    <div className={`account-usage${loud ? ' account-usage-loud' : ''}`}>
      <div className="account-usage-head">
        <span>{formatWindowLabel(w, t)}</span>
        <span className="account-usage-percent">{t('已用 {n}%', { n: w.percentUsed })}</span>
      </div>
      <div className="account-usage-bar" aria-hidden="true">
        <span className="account-usage-fill" style={{ width: `${Math.min(100, w.percentUsed)}%` }} />
      </div>
      <div className="account-usage-reset">{formatReset(w, nowSeconds, t)}</div>
    </div>
  );
}
