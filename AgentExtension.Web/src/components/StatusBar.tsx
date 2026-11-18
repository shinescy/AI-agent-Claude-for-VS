// 选项状态栏：权限模式、远程操控，以及「设置」入口。强度收进了型号弹窗。

import { WIDE_OPEN_MODES } from '../permissionModes';
import { PermissionModePopup } from './PermissionModePopup';
import { useT } from '../LangContext';
import { CacheIndicator } from './CacheIndicator';
import { RemoteControlButton } from './RemoteControlButton';
import type { PromptCacheRecord } from '../promptCache';
import type { AgentRemoteControl } from '../types';
import type { ReactNode } from 'react';

interface StatusBarProps {
  /** 排在最前面的控件：型号选择。 */
  leading?: ReactNode;

  /** 靠右、远程按钮之前：上下文圆环。 */
  contextRing?: ReactNode;

  permissionMode: string;
  onPermissionModeChange: (mode: string) => void;

  /** Ultracode 开关；visible 为假时哪儿都不画。 */
  ultracode: { visible: boolean; on: boolean };
  onUltracodeChange: (on: boolean) => void;

  /** 提示缓存记录；没有就不画那个小时钟。 */
  promptCache: PromptCacheRecord | null;

  /** 远程控制：CLI 确认已连上。 */
  remoteControl: boolean;
  /** 发出去了还没回话。 */
  remotePending?: boolean;
  /** CLI 报的状态、原因与网页地址。 */
  remoteState?: AgentRemoteControl;
  onRemoteControlChange: (on: boolean) => void;

  /** 打开「设置」小弹窗。 */
  onOpenSettings: () => void;
}

export function StatusBar(props: StatusBarProps) {
  const {
    leading, contextRing,
    permissionMode, onPermissionModeChange,
    ultracode, onUltracodeChange,
    remoteControl, remotePending = false, remoteState, onRemoteControlChange,
    promptCache, onOpenSettings,
  } = props;

  const t = useT();

  const wideOpen = WIDE_OPEN_MODES.has(permissionMode);

  return (
    <div className="status-bar" role="status">
      {leading}

      <span className="status-item">
        <span className="status-caption">{t('权限')}</span>
        <PermissionModePopup
          mode={permissionMode}
          onModeChange={onPermissionModeChange}
          ultracode={ultracode}
          onUltracodeChange={onUltracodeChange}
        />
      </span>

      <span
        className={`status-warning${wideOpen ? ' status-warning-loud' : ''}`}
        title={t('实测：本管线下所有权限模式都不提供交互式工具门禁，Bash 与 Write 一律直接执行。唯一真实有效的护栏是 settings.json 里的 permissions.deny，例如 "deny": ["Bash(rm:*)"]，该规则连危险模式都绕不过。')}
      >
        ⚠
      </span>

      <CacheIndicator record={promptCache} />

      <span className="status-spacer" />

      {contextRing}

      {/* 远程控制：红绿点表示状态，点一下开关；详情写在聊天区 */}
      <RemoteControlButton
        on={remoteControl}
        pending={remotePending}
        remote={remoteState}
        onChange={onRemoteControlChange}
      />

      {/* 面板、终端、语言、字体都收在「设置」小弹窗里。 */}
      <button
        type="button"
        className="status-button"
        title={t('设置：面板、终端、语言、字体')}
        aria-label={t('设置')}
        onClick={onOpenSettings}
      >
        ⋯
      </button>
    </div>
  );
}
