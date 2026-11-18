// 沙箱弹窗（/sandbox）：看本机支不支持；支持时可选模式、开关回退、加排除命令。

import { useEffect, useState } from 'react';
import { useT } from '../LangContext';
import { useCliDialog } from '../useCliDialog';
import { ToggleSwitch } from './ToggleSwitch';

/** CLI get_sandbox_dialog 回包里用到的部分。 */
export interface SandboxDialogData
{
  supported: boolean;
  unsupported_reason?: string;
  locked?: boolean;
  mode?: string;
  auto_allow_available?: boolean;
  no_sandbox_allowed?: boolean;
  unsandboxed_fallback?: boolean;
  overrides_locked?: boolean;
  excluded_commands?: string[];
}

interface SandboxDialogProps
{
  onClose: () => void;
}

export function SandboxDialog({ onClose }: SandboxDialogProps)
{
  const t = useT();
  const { dialog, error, busy, edit } = useCliDialog<SandboxDialogData>('sandbox');
  const [command, setCommand] = useState('');

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

  const reasons: Record<string, string> = {
    platform: t('当前平台（Windows）不支持命令沙箱。'),
    wsl1: t('WSL1 不支持命令沙箱，需要 WSL2。'),
    excluded_platform: t('这个平台被排除在沙箱支持之外。'),
  };

  const modes = [
    { value: 'auto-allow', label: t('沙箱运行，自动放行'), show: dialog?.auto_allow_available === true },
    { value: 'regular', label: t('沙箱运行，照常询问权限'), show: true },
    { value: 'disabled', label: t('不用沙箱'), show: dialog?.no_sandbox_allowed !== false },
  ];

  const editable = dialog !== null && dialog.supported && dialog.locked !== true;

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
      <div className="modal-card login-dialog" role="dialog" aria-modal="true" aria-label={t('沙箱')}>
        <div className="modal-header">
          <span className="modal-title">{t('沙箱')}</span>
          <button type="button" className="modal-close" aria-label={t('关闭')} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error !== '' && <div className="login-error" role="alert">{error}</div>}
          {dialog === null && busy && <p className="modal-muted">{t('正在读取…')}</p>}

          {dialog !== null && !dialog.supported && (
            <p className="login-text">
              {reasons[dialog.unsupported_reason ?? ''] ?? t('本机不支持命令沙箱（{reason}）。', { reason: dialog.unsupported_reason ?? '' })}
            </p>
          )}

          {dialog !== null && dialog.supported && dialog.locked === true && (
            <p className="modal-muted">{t('沙箱设置被更高优先级的配置锁定，这里不能改。')}</p>
          )}

          {editable && (
            <>
              <div className="modal-section-title">{t('模式')}</div>
              {modes.filter((mode) => mode.show).map((mode) => (
                <label className="sandbox-mode" key={mode.value}>
                  <input
                    type="radio"
                    name="sandbox-mode"
                    checked={dialog!.mode === mode.value}
                    disabled={busy}
                    onChange={() => edit({ mode: mode.value })}
                  />
                  {mode.label}
                </label>
              ))}

              <div className="memory-toggle">
                <div className="skills-main">
                  <div className="skills-name">{t('允许不进沙箱的回退')}</div>
                  <div className="skills-meta">{t('沙箱里跑不了的命令改为在沙箱外运行（仍会询问权限）')}</div>
                </div>
                <ToggleSwitch
                  checked={dialog!.unsandboxed_fallback === true}
                  disabled={busy || dialog!.overrides_locked === true}
                  label={t('允许不进沙箱的回退')}
                  onChange={(next) => edit({ allowUnsandboxedCommands: next })}
                />
              </div>

              <div className="modal-section-title">{t('排除的命令')}</div>
              <ul className="skills-list">
                {(dialog!.excluded_commands ?? []).map((item) => <li className="skills-row" key={item}><code>{item}</code></li>)}
              </ul>
              <form
                className="side-question-form"
                onSubmit={(e) =>
                {
                  e.preventDefault();

                  if (command.trim() !== '')
                  {
                    edit({ excludeCommand: command.trim() });
                    setCommand('');
                  }
                }}
              >
                <input
                  type="text"
                  className="login-input"
                  value={command}
                  placeholder={t('例如 docker')}
                  aria-label={t('要排除的命令')}
                  onChange={(e) => setCommand(e.target.value)}
                />
                <button type="submit" className="login-button login-button-primary" disabled={busy || command.trim() === ''}>
                  {t('添加')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
