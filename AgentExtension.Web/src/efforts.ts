// 思考强度（effort）档位。

export interface EffortOption {
  value: string;
  label: string;
  description: string;
}

/** CLI 各档位的官方说明。 */
const DESCRIPTIONS: Record<string, string> = {
  low: '快速直接的实现，额外开销最小',
  medium: '折中：常规实现与测试',
  high: '全面实现，包含充分的测试与文档',
  xhigh: '比 high 更深入的推理，略低于最高档',
  max: '最强能力与最深推理。可能消耗过多 token、响应很慢或过度思考，只在最难的任务上用',
  ultracode: 'xhigh 加上动态工作流编排',
  auto: '由 CLI 自行选择档位',
};

/** 中文标签。 */
const LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '很高',
  max: '最高',
  ultracode: 'ultracode',
  auto: '自动',
};

/** 探测失败时的兜底清单。 */
export const FALLBACK_EFFORT_LEVELS = ['low', 'medium', 'high'];

/** 把 CLI 探测到的档位清单变成选项。 */
export function buildEffortOptions(levels: readonly string[]): EffortOption[] {
  const source = levels.length > 0 ? levels : FALLBACK_EFFORT_LEVELS;

  return source.map((value) => ({
    value,
    label: LABELS[value] ?? value,
    description: DESCRIPTIONS[value] ?? '',
  }));
}
