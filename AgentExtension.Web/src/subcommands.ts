// CLI 子命令的前端镜像。

export interface SubcommandOption {
  id: string;
  label: string;
  /** 能否在面板内直接执行；false 时只展示引导，不发请求。 */
  canRunInPanel: boolean;
  /** 不可代跑时给用户的说明。 */
  guidance: string;
}

export const SUBCOMMANDS: SubcommandOption[] = [
  {
    id: 'doctor',
    label: '安装健康检查',
    canRunInPanel: true,
    guidance: '',
  },
  {
    id: 'mcp',
    label: 'MCP 服务器状态',
    canRunInPanel: true,
    guidance: '',
  },
  {
    id: 'plugin',
    label: '已装插件',
    canRunInPanel: true,
    guidance: '',
  },
  {
    id: 'auth',
    label: '登录 / 认证',
    canRunInPanel: false,
    guidance: '认证是交互式流程，面板内无法完成。请在终端执行：claude auth',
  },
];
