// 型号选择：状态栏最左边那个按钮，弹窗里连带推理强度与 Ultracode。

import { useState } from 'react';
import type { AgentModelInfo, AgentSessionInfo } from '../types';
import { buildModelOptions, matchModelValue } from '../models';
import { OptionPicker } from './OptionPicker';
import { EffortSlider } from './EffortSlider';
import { ToggleSwitch } from './ToggleSwitch';
import { DEFAULT_EFFORT, buildEffortOptions } from '../efforts';
import { sliderEffortLevels } from '../ultracode';
import { useT } from '../LangContext';

export interface ModelPickerProps {
  session: AgentSessionInfo | null;

  /** 当前选中的模型请求值。 */
  selectedModel: string;
  onModelChange: (model: string) => void;

  /** CLI 握手时汇报的模型清单；空数组表示没拿到，退回内置静态清单。 */
  reportedModels: AgentModelInfo[];

  /** 探测到的可选模型取值；空数组表示没探到。 */
  availableModels: string[];

  /** 终端视图下转录里读到的实际型号；空串不显示。 */
  terminalModel?: string;

  /** 当前思考强度；不给就不画强度那一行。 */
  effort?: string;
  onEffortChange?: (effort: string) => void;
  /** 当前模型可选的档位；null 表示这个模型不支持调强度；空数组用兜底清单。 */
  effortLevels?: string[] | null;

  /** Ultracode 开关；visible 为假时不画。 */
  ultracode?: { visible: boolean; on: boolean };
  onUltracodeChange?: (on: boolean) => void;
}

export function ModelPicker(props: ModelPickerProps) {
  const {
    session, selectedModel, onModelChange, reportedModels, availableModels, terminalModel = '',
    effort, onEffortChange, effortLevels = null, ultracode, onUltracodeChange,
  } = props;

  const t = useT();
  const [modelOpen, setModelOpen] = useState(false);
  const modelOptions = buildModelOptions(availableModels, reportedModels, selectedModel);
  // 选的是全名（claude-opus-5-5）而清单里是别名（opus）时，也要打上勾。
  const checked = matchModelValue(modelOptions.map((m) => m.value), selectedModel, reportedModels) || selectedModel;

  // 开关可见时滑轨不再列 ultracode 那一档：两个入口说的是一件事。
  const ultracodeVisible = ultracode?.visible === true;
  const effortOptions = effort === undefined || onEffortChange === undefined || effortLevels === null
    ? null
    : buildEffortOptions(sliderEffortLevels(effortLevels, ultracodeVisible, effort));
  const effortCurrent = effortOptions?.find((o) => o.value === effort);
  const effortName = effortCurrent ? t(effortCurrent.label) : t('默认');
  const ultracodeHint = t('每个任务都用动态工作流编排（仅本次会话）');

  const footer = effortOptions === null && !ultracodeVisible ? undefined : (
    <>
      {effortOptions !== null && (
        <div className="picker-row">
          <span className="picker-row-label">{t('推理强度（{level}）', { level: effortName })}</span>
          <EffortSlider compact options={effortOptions} value={effort ?? ''} onSelect={onEffortChange!} />
          <button
            type="button"
            className="effort-default"
            disabled={effort === DEFAULT_EFFORT || effort === ''}
            title={t('不指定强度，交回当前模型的默认值。只作用于这条会话，不改设置文件。')}
            onClick={() => onEffortChange!(DEFAULT_EFFORT)}
          >
            {t('默认')}
          </button>
        </div>
      )}
      {ultracodeVisible && onUltracodeChange !== undefined && (
        <div className="picker-row" title={ultracodeHint}>
          <span className="picker-row-label">Ultracode</span>
          <ToggleSwitch
            checked={ultracode!.on}
            label="Ultracode"
            title={ultracodeHint}
            onChange={onUltracodeChange}
          />
        </div>
      )}
    </>
  );

  // 型号用选项框而非裸下拉：每一项都要带说明，原生 select 装不下。面板向上展开。
  // 实际在跑的模型放进 title：选「默认」且探测失败时，标签上只有「默认」这三个字。
  return (
    <div
      className="status-item model-picker"
      title={terminalModel !== ''
        ? t('从终端转录里读到的、最近一条回复实际用的型号')
        : session?.model ? t('CLI 实际使用：{model}', { model: session.model }) : ''}
    >
      <OptionPicker
        caption={t('型号')}
        options={modelOptions.map((m) => ({ value: m.value, label: t(m.label), description: t(m.hint) }))}
        value={checked}
        onSelect={onModelChange}
        width={300}
        open={modelOpen}
        onToggle={setModelOpen}
        display={terminalModel}
        heading={t('选择模型')}
        suffix={effortOptions !== null && effortCurrent ? effortName : undefined}
        footer={footer}
      />
    </div>
  );
}
