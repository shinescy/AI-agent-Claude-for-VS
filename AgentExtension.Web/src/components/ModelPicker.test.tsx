import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelPicker } from './ModelPicker';
import { DEFAULT_MODEL } from '../models';
import type { AgentSessionInfo } from '../types';

function setup(overrides: { selectedModel?: string; availableModels?: string[]; model?: string } = {}) {
  const onModelChange = vi.fn();

  render(
    <ModelPicker
      session={overrides.model === undefined ? null : { model: overrides.model } as AgentSessionInfo}
      selectedModel={overrides.selectedModel ?? DEFAULT_MODEL}
      onModelChange={onModelChange}
      reportedModels={[]}
      availableModels={overrides.availableModels ?? []}
    />);

  return { onModelChange };
}

describe('型号选择', () => {
  it('会话没起来也能先选型号，且不因生成而禁用', () => {
    // 型号是 CLI 的启动参数；换型号走控制请求，生成中也能切
    setup();

    expect((screen.getByRole('button', { name: /型号/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('型号选项框显示 CLI 探到的具体模型名', () => {
    setup({ availableModels: ['opus', 'sonnet'], selectedModel: 'opus' });

    expect(screen.getByText('Opus')).toBeTruthy();
  });

  it('实际在跑的模型放进 title', () => {
    // 选「默认」且 /model 探测失败时，标签上只有「默认」三个字，
    // 到底跑的是哪个模型只能从这里看到。
    setup({ model: 'Opus 5 (1M context)' });

    expect(screen.getByTitle('CLI 实际使用：Opus 5 (1M context)')).toBeTruthy();
  });

  it('选中型号后上报请求值', () => {
    const { onModelChange } = setup({ availableModels: ['opus', 'sonnet'], selectedModel: 'opus' });

    fireEvent.click(screen.getByRole('button', { name: /型号/ }));
    fireEvent.click(screen.getByText('Sonnet'));

    expect(onModelChange).toHaveBeenCalledWith('sonnet');
  });
});

describe('型号弹窗里的强度与 Ultracode', () => {
  function open(extra: Partial<Parameters<typeof ModelPicker>[0]> = {}) {
    const onEffortChange = vi.fn();
    const onUltracodeChange = vi.fn();

    const view = render(
      <ModelPicker
        session={null}
        selectedModel="default"
        onModelChange={() => undefined}
        reportedModels={[]}
        availableModels={[]}
        effort="high"
        onEffortChange={onEffortChange}
        effortLevels={['low', 'medium', 'high']}
        ultracode={{ visible: true, on: false }}
        onUltracodeChange={onUltracodeChange}
        {...extra}
      />);

    fireEvent.click(view.container.querySelector('.picker-trigger')!);
    return { container: view.container, onEffortChange, onUltracodeChange };
  }

  it('弹窗带标题，底部有强度滑轨并写明当前档', () => {
    const { container } = open();

    expect(screen.getByText('选择模型')).toBeTruthy();
    expect(container.querySelector('.picker-footer [role="slider"]')).not.toBeNull();
    expect(screen.getByText('推理强度（高）')).toBeTruthy();
  });

  it('触发按钮上带着当前强度，不用点开也看得到', () => {
    const { container } = open();

    expect(container.querySelector('.picker-trigger .picker-suffix')?.textContent).toBe('高');
  });

  it('点「默认」交回模型默认强度，弹窗不收起', () => {
    const { container, onEffortChange } = open();

    fireEvent.click(screen.getByRole('button', { name: '默认' }));

    expect(onEffortChange).toHaveBeenCalledWith('auto');
    expect(container.querySelector('.picker-panel')).not.toBeNull();
  });

  it('Ultracode 开关在弹窗里可切', () => {
    const { onUltracodeChange } = open();

    fireEvent.click(screen.getByRole('switch'));

    expect(onUltracodeChange).toHaveBeenCalledWith(true);
  });

  it('模型不支持调强度时不画强度那一行', () => {
    const { container } = open({ effortLevels: null, ultracode: { visible: false, on: false } });

    expect(container.querySelector('.picker-footer')).toBeNull();
  });
});
