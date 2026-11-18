// 钩子表单与钩子配置互转：五种类型（command / prompt / agent / http / mcp_tool）。

/** 钩子类型，与 CLI 的 hook.type 一致。 */
export const HOOK_TYPES = ['command', 'prompt', 'agent', 'http', 'mcp_tool'] as const;
export type HookType = (typeof HOOK_TYPES)[number];

/** 表单里的全部字段，统一用字符串或布尔，便于直接绑输入框。 */
export interface HookFields
{
  type: HookType;
  command: string;
  shell: string;
  async: boolean;
  prompt: string;
  model: string;
  continueOnBlock: boolean;
  url: string;
  headersText: string;
  envVars: string;
  server: string;
  tool: string;
  inputText: string;
  condition: string;
  timeout: string;
  statusMessage: string;
}

/** 空表单。 */
export function emptyHookFields(type: HookType = 'command'): HookFields
{
  return {
    type, command: '', shell: '', async: false, prompt: '', model: '', continueOnBlock: false,
    url: '', headersText: '', envVars: '', server: '', tool: '', inputText: '',
    condition: '', timeout: '', statusMessage: '',
  };
}

function text(value: unknown): string
{
  return typeof value === 'string' ? value : '';
}

function json(value: unknown): string
{
  return value && typeof value === 'object' ? JSON.stringify(value, null, 2) : '';
}

/** 从已有配置填表单。 */
export function fieldsFromConfig(config: Record<string, unknown>): HookFields
{
  const type = (HOOK_TYPES as readonly string[]).includes(String(config.type)) ? config.type as HookType : 'command';

  return {
    type,
    command: text(config.command),
    shell: text(config.shell),
    async: config.async === true,
    prompt: text(config.prompt),
    model: text(config.model),
    continueOnBlock: config.continueOnBlock === true,
    url: text(config.url),
    headersText: json(config.headers),
    envVars: Array.isArray(config.allowedEnvVars) ? config.allowedEnvVars.join(', ') : '',
    server: text(config.server),
    tool: text(config.tool),
    inputText: json(config.input),
    condition: text(config.if),
    timeout: typeof config.timeout === 'number' ? String(config.timeout) : '',
    statusMessage: text(config.statusMessage),
  };
}

/** 解析一个 JSON 对象字段；空串为 undefined，格式不对抛错。 */
function parseObject(raw: string, label: string): Record<string, unknown> | undefined
{
  if (raw.trim() === '')
  {
    return undefined;
  }

  let parsed: unknown;

  try
  {
    parsed = JSON.parse(raw);
  }
  catch
  {
    throw new Error(`${label}不是有效的 JSON`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
  {
    throw new Error(`${label}必须是 JSON 对象`);
  }

  return parsed as Record<string, unknown>;
}

/**
 * 表单拼成钩子配置；必填项缺了或格式不对返回 error。
 * 编辑时传 old：同类型保留表单管不到的旧字段；http 请求头没动过就沿用旧值，免得把密钥覆盖掉。
 */
export function buildHookConfig(
  fields: HookFields, old?: Record<string, unknown>, originalHeadersText?: string):
  { config?: Record<string, unknown>; error?: string }
{
  const sameType = old !== undefined && old.type === fields.type;
  const config: Record<string, unknown> = sameType ? { ...old } : {};
  config.type = fields.type;

  const set = (key: string, value: unknown) =>
  {
    if (value === undefined || value === '' || value === false)
    {
      delete config[key];
    }
    else
    {
      config[key] = value;
    }
  };

  try
  {
    switch (fields.type)
    {
      case 'command':
        if (fields.command.trim() === '')
        {
          return { error: '命令不能为空' };
        }

        set('command', fields.command.trim());
        set('shell', fields.shell);
        set('async', fields.async);
        break;

      case 'prompt':
      case 'agent':
        if (fields.prompt.trim() === '')
        {
          return { error: '提示词不能为空' };
        }

        set('prompt', fields.prompt.trim());
        set('model', fields.model.trim());

        if (fields.type === 'prompt')
        {
          set('continueOnBlock', fields.continueOnBlock);
        }

        break;

      case 'http':
      {
        if (fields.url.trim() === '')
        {
          return { error: '网址不能为空' };
        }

        set('url', fields.url.trim());

        const headersUntouched = sameType && originalHeadersText !== undefined
          && fields.headersText === originalHeadersText;

        if (!headersUntouched)
        {
          set('headers', parseObject(fields.headersText, '请求头'));
        }

        const vars = fields.envVars.split(',').map((v) => v.trim()).filter((v) => v !== '');
        set('allowedEnvVars', vars.length > 0 ? vars : undefined);
        break;
      }

      case 'mcp_tool':
        if (fields.server.trim() === '' || fields.tool.trim() === '')
        {
          return { error: '服务器和工具都不能为空' };
        }

        set('server', fields.server.trim());
        set('tool', fields.tool.trim());
        set('input', parseObject(fields.inputText, '输入'));
        break;
    }
  }
  catch (e)
  {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  set('if', fields.condition.trim());
  set('statusMessage', fields.statusMessage.trim());

  if (fields.timeout.trim() === '')
  {
    delete config.timeout;
  }
  else
  {
    const seconds = Number(fields.timeout);

    if (!Number.isFinite(seconds) || seconds <= 0)
    {
      return { error: '超时要填大于 0 的秒数' };
    }

    config.timeout = seconds;
  }

  return { config };
}
