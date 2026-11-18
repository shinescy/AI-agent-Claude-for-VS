// 小开关：一条轨道加一个圆钮，开着时轨道是强调色。

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** 读屏用的名字。 */
  label: string;
  title?: string;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, label, title, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      className={checked ? 'toggle-switch is-on' : 'toggle-switch'}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-switch-knob" aria-hidden="true" />
    </button>
  );
}
