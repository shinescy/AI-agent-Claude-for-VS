// 远程控制：一个带红绿点的按钮，点一下就开或关。详情（链接、失败原因）写在聊天区里。

import { useT } from '../LangContext';
import type { AgentRemoteControl } from '../types';

interface RemoteControlButtonProps
{
  /** CLI 确认已连上。 */
  on: boolean;
  /** 发出去了还没回话。 */
  pending: boolean;
  /** CLI 报的状态与原因。 */
  remote?: AgentRemoteControl;
  onChange: (on: boolean) => void;
}

/** 远程控制处在哪种情况。 */
export type RemoteKind = 'pending' | 'on' | 'failed' | 'off';

/** 由确认过的状态得出该怎么显示。 */
export function remoteKind(on: boolean, pending: boolean, remote?: AgentRemoteControl): RemoteKind
{
  if (pending)
  {
    return 'pending';
  }

  if (on)
  {
    return 'on';
  }

  const failed = remote !== undefined && (remote.state === 'failed' || remote.state === 'policy_disabled');
  return failed ? 'failed' : 'off';
}

/** 悬停提示与读屏用的说法；按钮上不写字，只有点的颜色。 */
const STATUS_TEXT: Record<RemoteKind, string> = {
  pending: '请稍候…',
  on: '已开启，点一下关闭',
  failed: '没开起来，点一下重试（原因见聊天区）',
  off: '未开启，点一下开启',
};

export function RemoteControlButton({ on, pending, remote, onChange }: RemoteControlButtonProps)
{
  const t = useT();
  const kind = remoteKind(on, pending, remote);
  const status = t(STATUS_TEXT[kind]);

  return (
    <button
      type="button"
      className="status-button remote-button"
      aria-pressed={on}
      aria-label={t('远程控制：{status}', { status })}
      title={t('远程控制：{status}', { status })}
      disabled={pending}
      onClick={() => onChange(!on)}
    >
      {t('远程')}
      <span className={`remote-dot remote-dot-${kind}`} aria-hidden="true">●</span>
    </button>
  );
}
