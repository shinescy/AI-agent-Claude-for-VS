// 消息桥封装：与宿主（VS 的 WebView2）之间的通信。

import { INBOUND } from './protocol';
import type { Lang } from './i18n';
import type { Appearance } from './appearance';

/** WebView2 注入的宿主对象，类型按需声明。 */
interface WebViewHost {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
}

declare global {
  interface Window {
    chrome?: {
      webview?: WebViewHost;
    };
  }
}

/** 取当前宿主对象，不存在则返回 undefined。 */
function getHost(): WebViewHost | undefined
{
  return window.chrome?.webview;
}

/** 向宿主发送一条消息；宿主不存在时静默忽略。 */
export function sendToHost(message: unknown): void
{
  const host = getHost();
  if (!host)
  {
    return;
  }
  host.postMessage(message);
}

/** 开发期注入入口用的宿主形状：外部（如 Playwright）只认得住 `.emit()`，内部可以同时挂多个 handler。 */
interface DevHost
{
  emit(data: unknown): void;
}

// 开发期尚未挂载的 handler 集合。
const devHandlers = new Set<(data: unknown) => void>();

/** 确保 window.__agentDevHost 存在，emit 会转发给当前挂着的全部 handler。 */
function ensureDevHost(): void
{
  const win = window as unknown as { __agentDevHost?: DevHost };
  if (!win.__agentDevHost)
  {
    win.__agentDevHost = { emit: (data: unknown) => devHandlers.forEach((h) => h(data)) };
  }
}

/** 注册宿主消息监听。 */
export function onHostMessage(handler: (data: unknown) => void): () => void
{
  const host = getHost();

  if (!host)
  {
    if (import.meta.env.DEV)
    {
      ensureDevHost();
      devHandlers.add(handler);
      return () => devHandlers.delete(handler);
    }
    return () => {};
  }

  function listener(event: MessageEvent): void
  {
    const raw = event.data;
    if (typeof raw === 'string')
    {
      try
      {
        handler(JSON.parse(raw));
      }
      catch
      {
        handler(raw);
      }
      return;
    }
    handler(raw);
  }

  host.addEventListener('message', listener);
  return () => host.removeEventListener('message', listener);
}

/** 前端挂载完成后发出，宿主收到即回灌转录。 */
export function notifyReady(): void
{
  sendToHost({ type: INBOUND.Ready });
}

/** 随提示词一起发送的图片，data 是不含 data URI 前缀的纯 base64。 */
export interface OutboundImage {
  mediaType: string;
  data: string;
}

/** 发送用户输入的 prompt。 */
export function sendPrompt(text: string, images: OutboundImage[] = []): void
{
  sendToHost({ type: INBOUND.Send, text, images });
}

/** 发送中断请求。 */
export function sendInterrupt(): void
{
  sendToHost({ type: INBOUND.Interrupt });
}

/** 请求工作区文件检索（@ 引用）。 */
export function sendFileQuery(query: string, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'files', value: query, requestId });
}

/** 请求 VS 打开文件并定位到行。 */
export function sendOpenFile(path: string, line: number): void
{
  sendToHost({ type: INBOUND.VsAction, option: 'openFile', value: path, line });
}

/** 切换权限模式。 */
export function sendPermissionMode(mode: string): void
{
  sendToHost({ type: INBOUND.SetOption, option: 'permissionMode', value: mode });
}

/** 切换模型。 */
export function sendModel(model: string): void
{
  sendToHost({ type: INBOUND.SetOption, option: 'model', value: model });
}

/** 切换思考强度（--effort）。 */
export function sendEffort(effort: string): void
{
  sendToHost({ type: INBOUND.SetOption, option: 'effort', value: effort });
}

/** 切换终端的 remote-control（远程操控）。 */
export function sendRemoteControl(on: boolean): void
{
  sendToHost({ type: INBOUND.SetOption, option: 'remoteControl', value: on ? 'true' : 'false' });
}

/** 开关 Ultracode（会话级，不持久化）。 */
export function sendUltracode(on: boolean): void
{
  sendToHost({ type: INBOUND.SetOption, option: 'ultracode', value: on ? 'true' : 'false' });
}

/** 执行一条 CLI 子命令。 */
export function sendRunCommand(id: string): void
{
  sendToHost({ type: INBOUND.RunCommand, option: id });
}

/** 打开面板。 */
export function openPanel(panelId: string, requestId: string): void
{
  sendToHost({ type: INBOUND.PanelOpen, panelId, requestId });
}

/** 请求宿主重新探一次额度用量。 */
export function refreshUsage(): void
{
  sendToHost({ type: INBOUND.RefreshUsage });
}

/** 接回一条历史会话。 */
export function sendResumeSession(sessionId: string, fork: boolean): void
{
  sendToHost({ type: INBOUND.ResumeSession, value: sessionId, fork });
}

/** 把一条网页会话拉回本机；value 是会话 id 或 claude.ai/code 链接，宿主再校验一遍。 */
export function sendTeleportSession(value: string): void
{
  sendToHost({ type: INBOUND.TeleportSession, value });
}

/** 丢掉当前会话，开一条干净的（自动接回之后的逃生口）。 */
export function sendNewSession(): void
{
  sendToHost({ type: INBOUND.NewSession });
}

/** 把某个文件还原成某一版快照。 */
export function sendRestoreFile(itemId: string): void
{
  sendToHost({ type: INBOUND.RestoreFile, value: itemId });
}

/** 告诉宿主「刚那个 Esc 网页没用上」，请它按工具窗的老规矩把焦点交回文档窗口。 */
export function sendEscapeUnhandled(): void
{
  sendToHost({ type: INBOUND.EscapeUnhandled });
}

/** 把整段转录写成本机文件。 */
export function sendExportTranscript(markdown: string): void
{
  sendToHost({ type: INBOUND.ExportTranscript, text: markdown });
}

/** 执行面板动作。 */
export function runPanelAction(panelId: string, actionId: string, values: string[], requestId: string): void
{
  sendToHost({ type: INBOUND.PanelAction, panelId, actionId, values, requestId });
}

/** 打开终端标签。 */
export function sendTerminalStart(columns: number, rows: number): void
{
  sendToHost({ type: INBOUND.TerminalStart, columns, rows });
}

/** 终端按键。 */
export function sendTerminalInput(data: string): void
{
  sendToHost({ type: INBOUND.TerminalInput, data });
}

/** 起标题用的正文，不含固定提示词。 */
export function sendTitleHint(text: string): void
{
  sendToHost({ type: INBOUND.TitleHint, text });
}

/** 埋点：宿主开了面板日志才落盘。 */
export function sendClientDiag(text: string): void
{
  sendToHost({ type: INBOUND.ClientDiag, text });
}

/** 终端尺寸变化。 */
export function sendTerminalResize(columns: number, rows: number): void
{
  sendToHost({ type: INBOUND.TerminalResize, columns, rows });
}

/** 关掉终端里的子进程。 */
export function sendTerminalStop(): void
{
  sendToHost({ type: INBOUND.TerminalStop });
}

/** 请求某个文件的预览内容。 */
export function sendFileContentQuery(path: string, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'fileContent', value: path, requestId });
}

/** 请宿主弹原生对话框挑文件。 */
export function sendPickFile(requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'pickFile', value: '', requestId });
}

/** 请宿主读系统剪贴板里复制的文件路径。 */
export function sendClipboardFilesQuery(requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'clipboardFiles', value: '', requestId });
}

/** 请宿主把粘贴的截图（data URL）存成临时文件。 */
export function sendSaveImage(dataUrl: string, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'saveImage', value: dataUrl, requestId });
}

/** 请宿主开始登录；method 为 claudeai 或 console。 */
export function sendLogin(method: 'claudeai' | 'console', requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'login', value: method, requestId });
}

/** 提交手动粘贴的授权码。 */
export function sendLoginCode(code: string, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'loginCode', value: code, requestId });
}

/** 侧问：不打断当前对话另问一句，history 为此前的问答。 */
export function sendSideQuestion(
  question: string, history: { question: string; response: string }[], requestId: string): void
{
  const value = JSON.stringify({ question, history });
  sendToHost({ type: INBOUND.Query, option: 'sideQuestion', value, requestId });
}

/** 读技能清单。 */
export function sendSkillsQuery(requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'skills', value: '', requestId });
}

/** 改一个技能的状态。 */
export function sendSetSkillState(
  edit: { name: string; state: string; handles?: unknown }, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'setSkillState', value: JSON.stringify(edit), requestId });
}

/** 读一个设置弹窗（memory / sandbox）的数据。 */
export function sendCliDialog(name: string, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'cliDialog', value: name, requestId });
}

/** 改一个设置弹窗里的设置。 */
export function sendCliEdit(name: string, edit: Record<string, unknown>, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'cliEdit', value: JSON.stringify({ name, edit }), requestId });
}

/** 重载插件。 */
export function sendReloadPlugins(requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'reloadPlugins', value: '', requestId });
}

/** 把一个正在跑的工具调用转到后台。 */
export function sendBackground(toolUseId: string, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'background', value: toolUseId, requestId });
}

/** 提交反馈；saveLocally 为真时只存本机、不发送。 */
export function sendFeedback(description: string, saveLocally: boolean, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'feedback', value: JSON.stringify({ description, saveLocally }), requestId });
}

/** 在资源管理器里打开自动记忆文件夹。 */
export function sendOpenMemoryFolder(): void
{
  sendToHost({ type: INBOUND.Query, option: 'openMemoryFolder', value: '', requestId: '' });
}

/** 在资源管理器里显示本机保存的反馈报告。 */
export function sendRevealFeedback(path: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'revealFeedback', value: path, requestId: '' });
}

/** Claude Design 登录：status / start / cancel，或 code:授权码。 */
export function sendDesignLogin(action: string, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'designLogin', value: action, requestId });
}

/** 记忆文件读、写、删；写和删要带读出时的身份戳。 */
export function sendMemoryFile(
  op: 'read' | 'write' | 'delete', path: string, requestId: string, content = '', version = ''): void
{
  sendToHost({
    type: INBOUND.Query, option: 'memoryFile', value: JSON.stringify({ op, path, content, version }), requestId,
  });
}

/** 本会话接入（on）或断开（off）浏览器。 */
export function sendChromeConnect(on: boolean, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'chromeConnect', value: on ? 'on' : 'off', requestId });
}

/** 列出浏览器；deviceId 给了就先选中它。 */
export function sendChromeBrowsers(deviceId: string | null, requestId: string): void
{
  if (deviceId === null)
  {
    sendToHost({ type: INBOUND.Query, option: 'chromeBrowsers', value: '', requestId });
    return;
  }

  sendToHost({ type: INBOUND.Query, option: 'chromeSelect', value: deviceId, requestId });
}

/** 在系统浏览器里打开 Claude 自家的链接（宿主只放行 claude.ai / claude.com / clau.de）。 */
export function sendOpenLink(url: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'openLink', value: url, requestId: '' });
}

/** 用系统浏览器打开回复里的网页链接（只认 http / https）。 */
export function sendOpenWebLink(url: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'openWebLink', value: url, requestId: '' });
}

/** 读权限规则清单。 */
export function sendPermissionRulesQuery(requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'permissionRules', value: '', requestId });
}

/** 增删权限规则；增：{op:'add', rules, behavior, destination}，删：{op:'remove', rule, behavior, source}。 */
export function sendEditPermissionRules(edit: Record<string, unknown>, requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'editPermissionRules', value: JSON.stringify(edit), requestId });
}

/** 请宿主退出登录（claude auth logout）。 */
export function sendLogout(requestId: string): void
{
  sendToHost({ type: INBOUND.Query, option: 'logout', value: '', requestId });
}

/** 请宿主在浏览器里打开第三方服务商的说明文档。 */
export function sendOpenLoginDocs(): void
{
  sendToHost({ type: INBOUND.Query, option: 'loginDocs', value: '', requestId: '' });
}

/** 新开一个 tab。 */
export function sendTabCreate(): void
{
  sendToHost({ type: INBOUND.TabCreate });
}

/** 切到某个 tab；fromKeyboard 为真时告诉宿主这是方向键触发。 */
export function sendTabActivate(id: string, fromKeyboard = false): void
{
  if (fromKeyboard)
  {
    sendToHost({ type: INBOUND.TabActivate, value: id, option: 'keyboard' });
    return;
  }

  sendToHost({ type: INBOUND.TabActivate, value: id });
}

/** 关掉某个 tab。 */
export function sendTabClose(id: string): void
{
  sendToHost({ type: INBOUND.TabClose, value: id });
}

/** 本 tab 的语言或外观变了，请宿主广播给其余 tab。 */
export function sendUiPrefs(lang: Lang, appearance: Appearance): void
{
  sendToHost({ type: INBOUND.UiPrefsChanged, lang, appearance });
}
