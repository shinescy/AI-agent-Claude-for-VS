import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBar } from './StatusBar';
import { reducer, initialState } from '../state';
import type { TranscriptState } from '../state';
import type { AgentEvent, AgentRemoteControl } from '../types';

function remote(data: Partial<AgentRemoteControl>): AgentEvent {
  const payload: AgentRemoteControl = { state: 'off', detail: '', sessionUrl: '', ...data };
  return { kind: 'RemoteControlChanged', content: '', remoteControlData: payload } as unknown as AgentEvent;
}

function apply(...events: AgentEvent[]): TranscriptState {
  return events.reduce((state, event) => reducer(state, { type: 'agentEvent', event }), initialState);
}

const POLICY = "Remote Control is disabled by your organization's policy. Contact your organization admin for access.";

describe('远程控制状态以 CLI 回话为准', () => {
  it('被组织策略禁用：状态记失败，转录里说原因；状态消息与回包各来一次也只说一句', () => {
    // 实测：CLI 先推 bridge_state=policy_disabled，再回 error，两条原因相同
    const state = apply(
      remote({ state: 'policy_disabled', detail: POLICY }), remote({ state: 'failed', detail: POLICY }));

    expect(state.remoteControl.state).toBe('failed');
    const notices = state.blocks.filter((b) => b.kind === 'notice');
    expect(notices.length).toBe(1);
    expect(notices[0].text).toContain('organization');
  });

  it('连上了给出网页地址；再关掉说一句已关闭', () => {
    const on = apply(remote({ state: 'connected', sessionUrl: 'https://claude.ai/code/s1' }));
    expect(on.remoteControl.state).toBe('connected');
    expect(on.blocks[0].text).toContain('https://claude.ai/code/s1');

    const off = reducer(on, { type: 'agentEvent', event: remote({ state: 'off' }) });
    expect(off.blocks.map((b) => b.text)).toEqual([on.blocks[0].text, '远程控制已关闭。']);
  });

  it('连点几次开、关，每次都在聊天区说一句（用户报：点了好几下只有一条）', () => {
    // 真机：CLI 在回话之前先推了中间状态，原先的「状态真变了才说」把关闭那句吞掉了
    const click = (state: TranscriptState) => reducer(state, { type: 'remoteRequested' });
    const push = (state: TranscriptState, data: Partial<AgentRemoteControl>) =>
      reducer(state, { type: 'agentEvent', event: remote(data) });

    let state = click(initialState);
    state = push(state, { state: 'connected', sessionUrl: 'https://claude.ai/code/s1' });
    state = push(state, { state: 'connected', sessionUrl: 'https://claude.ai/code/s1', requested: true });

    state = click(state);
    state = push(state, { state: 'disconnected' });
    state = push(state, { state: 'off', requested: true });

    state = click(state);
    state = push(state, { state: 'connected', sessionUrl: 'https://claude.ai/code/s1', requested: true });

    state = click(state);
    state = push(state, { state: 'off', requested: true });

    const notices = state.blocks.filter((b) => b.kind === 'notice').map((b) => b.text);
    expect(notices).toEqual([
      '远程控制已开启，可在手机或网页继续：https://claude.ai/code/s1',
      '远程控制已关闭。',
      '远程控制已开启，可在手机或网页继续：https://claude.ai/code/s1',
      '远程控制已关闭。',
    ]);
    expect(state.remoteControl.pending).toBe(false);
  });

  it('重试时同样的失败原因也再说一次：不然用户以为没点上', () => {
    const click = (state: TranscriptState) => reducer(state, { type: 'remoteRequested' });
    const fail = (state: TranscriptState) =>
      reducer(state, { type: 'agentEvent', event: remote({ state: 'failed', detail: POLICY, requested: true }) });

    const state = fail(click(fail(click(initialState))));

    expect(state.blocks.filter((b) => b.kind === 'notice').length).toBe(2);
  });

  it('点了之后 CLI 先推的同一原因不重复说：策略禁用时只说一句', () => {
    // 实测：CLI 先推 bridge_state=policy_disabled，再回 error
    let state = reducer(initialState, { type: 'remoteRequested' });
    state = reducer(state, { type: 'agentEvent', event: remote({ state: 'policy_disabled', detail: POLICY }) });
    state = reducer(state, { type: 'agentEvent', event: remote({ state: 'failed', detail: POLICY, requested: true }) });

    expect(state.blocks.filter((b) => b.kind === 'notice').length).toBe(1);
  });

  it('等回话期间按钮保持「请稍候」，CLI 的中间状态不收起它；回话到了才收', () => {
    let state = reducer(initialState, { type: 'remoteRequested' });
    state = reducer(state, { type: 'agentEvent', event: remote({ state: 'connecting' }) });
    expect(state.remoteControl.pending).toBe(true);

    state = reducer(state, { type: 'agentEvent', event: remote({ state: 'connected', requested: true }) });
    expect(state.remoteControl.pending).toBe(false);
  });

  it('等太久宿主没回话：超时收起，不让按钮一直不能点', () => {
    let state = reducer(initialState, { type: 'remoteRequested' });
    state = reducer(state, { type: 'remoteRequestExpired' });

    expect(state.remoteControl.pending).toBe(false);
  });

  it('没人点时 CLI 自己推的断线照旧说一句', () => {
    const on = apply(remote({ state: 'connected' }));
    const dropped = reducer(on, { type: 'agentEvent', event: remote({ state: 'failed', detail: '网络断了' }) });

    expect(dropped.blocks[dropped.blocks.length - 1].text).toBe('远程控制没开起来：网络断了');
  });

  it('本来就关着时再报关闭（换进程）不刷屏', () => {
    const state = apply(remote({ state: 'off' }));

    expect(state.blocks.length).toBe(0);
    expect(state.remoteControl.seq).toBe(1);
  });
});

describe('远程控制按钮', () => {
  function bar(props: Partial<Parameters<typeof StatusBar>[0]>) {
    const onRemoteControlChange = vi.fn();
    render(
      <StatusBar
        permissionMode="acceptEdits"
        onPermissionModeChange={() => undefined}
        ultracode={{ visible: false, on: false }}
        onUltracodeChange={() => undefined}
        remoteControl={false}
        onRemoteControlChange={onRemoteControlChange}
        promptCache={null}
        onOpenSettings={() => undefined}
        {...props}
      />);
    const button = screen.getByRole('button', { name: /远程控制：/ }) as HTMLButtonElement;
    return { button, onRemoteControlChange };
  }

  it('按钮上只有红绿点、不写状态字；点一下直接发请求，不弹面板', () => {
    const { button, onRemoteControlChange } = bar({});

    expect(button.textContent).toBe('远程●');
    expect(button.querySelector('.remote-dot-off')).not.toBeNull();

    fireEvent.click(button);

    expect(onRemoteControlChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('等回话时点是黄的，按钮不能点', () => {
    const { button } = bar({ remotePending: true });

    expect(button.querySelector('.remote-dot-pending')).not.toBeNull();
    expect(button.disabled).toBe(true);
  });

  it('没开起来：点是红的，再点一下就是重试', () => {
    const { button, onRemoteControlChange } = bar({ remoteState: { state: 'failed', detail: POLICY, sessionUrl: '' } });

    expect(button.querySelector('.remote-dot-failed')).not.toBeNull();
    fireEvent.click(button);
    expect(onRemoteControlChange).toHaveBeenCalledWith(true);
  });

  it('已开启：点是绿的，点一下关闭', () => {
    const { button, onRemoteControlChange } = bar({
      remoteControl: true,
      remoteState: { state: 'connected', detail: '', sessionUrl: 'https://claude.ai/code/s1' },
    });

    expect(button.querySelector('.remote-dot-on')).not.toBeNull();
    fireEvent.click(button);
    expect(onRemoteControlChange).toHaveBeenCalledWith(false);
  });
});
