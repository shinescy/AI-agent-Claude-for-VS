import { describe, it, expect } from 'vitest';
import { buildHookConfig, emptyHookFields, fieldsFromConfig } from './hookForm';

describe('钩子表单转配置', () => {
  it('五种类型各自的必填项', () => {
    expect(buildHookConfig({ ...emptyHookFields('command') }).error).toBe('命令不能为空');
    expect(buildHookConfig({ ...emptyHookFields('prompt') }).error).toBe('提示词不能为空');
    expect(buildHookConfig({ ...emptyHookFields('agent') }).error).toBe('提示词不能为空');
    expect(buildHookConfig({ ...emptyHookFields('http') }).error).toBe('网址不能为空');
    expect(buildHookConfig({ ...emptyHookFields('mcp_tool'), server: 's' }).error).toBe('服务器和工具都不能为空');
  });

  it('prompt：带模型与拦下后继续；公共字段条件、超时、状态文字', () => {
    const result = buildHookConfig({
      ...emptyHookFields('prompt'), prompt: ' 检查 ', model: 'haiku', continueOnBlock: true,
      condition: 'Bash(git *)', timeout: '30', statusMessage: '检查中',
    });

    expect(result.config).toEqual({
      type: 'prompt', prompt: '检查', model: 'haiku', continueOnBlock: true,
      if: 'Bash(git *)', timeout: 30, statusMessage: '检查中',
    });
  });

  it('http：请求头与环境变量；JSON 不对时报错', () => {
    const ok = buildHookConfig({
      ...emptyHookFields('http'), url: 'https://h', headersText: '{"A":"b"}', envVars: 'TOKEN, X ',
    });
    expect(ok.config).toEqual({ type: 'http', url: 'https://h', headers: { A: 'b' }, allowedEnvVars: ['TOKEN', 'X'] });

    expect(buildHookConfig({ ...emptyHookFields('http'), url: 'https://h', headersText: '{oops' }).error)
      .toBe('请求头不是有效的 JSON');
    expect(buildHookConfig({ ...emptyHookFields('http'), url: 'https://h', headersText: '[1]' }).error)
      .toBe('请求头必须是 JSON 对象');
  });

  it('编辑 http：请求头没动过就沿用旧值，不拿界面上的覆盖（防止抹掉密钥）', () => {
    const old = { type: 'http', url: 'https://h', headers: { Authorization: 'secret' } };
    const fields = fieldsFromConfig({ type: 'http', url: 'https://h', headers: { Authorization: '' } });
    const original = fields.headersText;

    const result = buildHookConfig({ ...fields, url: 'https://new' }, old, original);
    expect(result.config).toEqual({ type: 'http', url: 'https://new', headers: { Authorization: 'secret' } });
  });

  it('编辑同类型保留表单管不到的旧字段；换类型则从空白开始', () => {
    const old = { type: 'command', command: 'a', someFutureField: 1 };
    expect(buildHookConfig({ ...fieldsFromConfig(old), command: 'b' }, old).config)
      .toEqual({ type: 'command', command: 'b', someFutureField: 1 });

    expect(buildHookConfig({ ...fieldsFromConfig(old), type: 'agent', prompt: 'p' }, old).config)
      .toEqual({ type: 'agent', prompt: 'p' });
  });

  it('mcp_tool：输入是 JSON 对象', () => {
    expect(buildHookConfig({ ...emptyHookFields('mcp_tool'), server: 's', tool: 't', inputText: '{"x":1}' }).config)
      .toEqual({ type: 'mcp_tool', server: 's', tool: 't', input: { x: 1 } });
  });

  it('超时必须是正数', () => {
    expect(buildHookConfig({ ...emptyHookFields('command'), command: 'x', timeout: '-1' }).error).toBe('超时要填大于 0 的秒数');
  });
});
