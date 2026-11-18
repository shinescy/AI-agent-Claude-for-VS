// 权限模式选项。

export interface PermissionModeOption {
  value: string;
  label: string;
  /** 弹层里名称下面的一行说明：这个模式是干什么的。 */
  description: string;
  /** 鼠标悬停提示，写实测已知的差异，不写猜测。 */
  hint: string;
}

export const PERMISSION_MODES: PermissionModeOption[] = [
  {
    value: 'acceptEdits',
    label: '接受编辑',
    description: '改文件不再逐次询问，直接写入；运行命令等其它操作仍按规则来。适合日常开发',
    hint: '默认。语义上最保守的合法取值。实测本管线下仍无工具门禁。',
  },
  {
    value: 'auto',
    label: '自动',
    description: '由 Claude 自己判断：通过安全检查的操作直接执行，有风险的会停下来问你',
    hint: '由 CLI 自行决定。实测无工具门禁。',
  },
  {
    value: 'bypassPermissions',
    label: '绕过权限',
    description: '所有操作都不询问，包括删除文件、执行任意命令。只在随时能回滚的环境里用',
    hint: '绕过全部权限检查。实测与「危险模式」最终等效。',
  },
  {
    value: 'manual',
    label: '手动',
    description: '每次改文件、运行命令前都先问你，同意了才执行。最稳妥，也最慢',
    hint: 'CLI 自己给 default 起的名字，两个值等价。终端底栏写作 manual mode。',
  },
  {
    value: 'dontAsk',
    label: '不询问',
    description: '不弹询问：没有事先允许的操作一律直接拒绝。适合无人值守时防止越权',
    hint: '实测无工具门禁。',
  },
  {
    value: 'plan',
    label: '计划模式',
    description: '只读代码、不改文件，先给出完整方案；你确认后再切到其它模式动手',
    hint: '让代理先给出方案。实测该模式下它仍能直接写文件。',
  },
  {
    value: 'dangerously',
    label: '危险模式',
    description: '启动时就关闭全部权限检查，效果等同「绕过权限」',
    hint: '--dangerously-skip-permissions。实测 CLI 回报为 bypassPermissions，两者等效。',
  },
];

export const DEFAULT_PERMISSION_MODE = 'acceptEdits';

/** 这些取值等同于完全放开，界面上要用危险色标出来。 */
export const WIDE_OPEN_MODES: ReadonlySet<string> = new Set(['dangerously', 'bypassPermissions']);
