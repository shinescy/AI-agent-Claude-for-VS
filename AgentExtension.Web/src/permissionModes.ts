// 权限模式选项。

export interface PermissionModeOption {
  value: string;
  label: string;
  /** 鼠标悬停提示，写实测已知的差异，不写猜测。 */
  hint: string;
}

export const PERMISSION_MODES: PermissionModeOption[] = [
  {
    value: 'acceptEdits',
    label: '接受编辑',
    hint: '默认。语义上最保守的合法取值。实测本管线下仍无工具门禁。',
  },
  {
    value: 'auto',
    label: '自动',
    hint: '由 CLI 自行决定。实测无工具门禁。',
  },
  {
    value: 'bypassPermissions',
    label: '绕过权限',
    hint: '绕过全部权限检查。实测与「危险模式」最终等效。',
  },
  {
    value: 'manual',
    label: '手动',
    hint: 'CLI 自己给 default 起的名字，两个值等价。终端底栏写作 manual mode。',
  },
  {
    value: 'dontAsk',
    label: '不询问',
    hint: '实测无工具门禁。',
  },
  {
    value: 'plan',
    label: '计划模式',
    hint: '让代理先给出方案。实测该模式下它仍能直接写文件。',
  },
  {
    value: 'dangerously',
    label: '危险模式',
    hint: '--dangerously-skip-permissions。实测 CLI 回报为 bypassPermissions，两者等效。',
  },
];

export const DEFAULT_PERMISSION_MODE = 'acceptEdits';
