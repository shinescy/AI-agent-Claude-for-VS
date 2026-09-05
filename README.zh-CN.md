# Claude Code Extend

**中文** · [English](README.md)

**在 Visual Studio 里用原生面板驱动 Claude Code，不用再嵌一个终端窗口。**

扩展把 Claude Code CLI 作为子进程跑起来，把整条对话画成 WebView2 工具窗口里的真实界面：
流式回复、彩色 diff、命令补全、可折叠的工具调用。全都能选中、能搜索、跟随你的
Visual Studio 主题，而不是一屏点不动的 ANSI 转义字符。

![停靠在 Visual Studio 里的聊天面板](https://raw.githubusercontent.com/shinescy/AI-agent-Claude-for-VS/main/assets/screenshots/chat-panel.png)

1. **用量窗口。** 当前会话和本周的额度，各自还剩多久，边干活边更新。
2. **上次那条会话自动接回。** 重开 Visual Studio 就接着聊，本地转录回放在这条线以上。
3. **工具栏。** 思考强度、权限模式、终端按钮，以及面板语言——中英文就在这儿切。
4. **固定前缀 prompt**，每次发送都会加在内容前面，项目规矩不用反复打。
5. **状态栏。** 模型、工作目录、MCP 服务器数量，以及面板实际驱动的那个 CLI 版本。

*（转录中间那一大段空白在这张截图里剪掉了。）*

---

## 能做什么

### 会话经得起一整天

- **多条会话并排开。** tab 条上每个 tab 都是独立的 `claude` 进程、独立上下文，
  一个 tab 里跑长任务不会卡住另一个。关到最后一个时永远给你留一个，面板不会变空。
- **会话就存在 CLI 存它的地方**（`~/.claude/projects/`），所以你在这里做的事命令行那边
  也看得到，反过来也一样。

### 代码进去不用复制粘贴

- **编辑器里右键**发送选中的代码，连文件和行号上下文一起送。
- **一键发送当前的构建错误**，从错误列表直接过去。
- **`@` 引用文件**，代理提到的路径点一下就在编辑器里定位到行，图片可以直接粘进输入框。

### 原生面板，不是 TUI 界面

`/resume`、`/help`、`/memory` 这类命令打开的是能点的面板——看自己的会话列表，
不必被一个全屏终端接管。

---

## 管线里做不了的事，有真终端

有些事管线跑不了。一个按钮打开完整 TUI 的 `claude`，从上面那条会话分叉出去、
带着同样的上下文开场，用完再把你交还给聊天。

![面板里跑着完整 TUI 的 claude](https://raw.githubusercontent.com/shinescy/AI-agent-Claude-for-VS/main/assets/screenshots/terminal-panel.png)

1. **终端按钮行**——重启、中断、清屏、复制、粘贴，以及*回到对话*。
   *独立会话*那个标签是在提醒你：这条终端是分叉出去的，你离开它也不会停。
2. **货真价实的 TUI**，按键照旧——`shift+tab` 切权限模式，和你自己终端里一模一样。
3. **和聊天视图同一条工具栏**，强度、权限、语言都在你以为的位置。

---

## 环境要求

| | |
|---|---|
| **Visual Studio** | 2022 (17.x) 或 2026 (18.x) —— Community、Professional、Enterprise 都行 |
| **Claude Code CLI** | 已安装并登录。扩展会扫你的 `PATH` 和几个常见安装位置找 `claude`。 |
| **WebView2 运行时** | Visual Studio 自带 |

你得有自己的 Claude 账号。这个扩展是你已有的那个 CLI 的前端，
不自带模型、不自带密钥、不自带订阅。

---

## 安装

从 [Releases](../../releases) 下载 `.vsix`，**关掉 Visual Studio** 后双击安装。
然后从 **视图 → Claude Code Extend** 打开面板：

![视图菜单里的入口](https://raw.githubusercontent.com/shinescy/AI-agent-Claude-for-VS/main/assets/screenshots/view-menu.png)

想停在哪就停在哪——面板记得上次的位置，下次还开在那儿。

---

## 怎么用

会话在当前解决方案所在目录起，所以代理干活的地方就是你代码所在的地方。
打开另一个解决方案就是另一条会话。

- **tab 条上的 `+`** 开新会话。
- **编辑器里右键**有「发送选中代码」和「发送构建错误」。
- **输入框里**：`Enter` 发送，`Shift+Enter` 换行，`/` 开命令补全，`@` 引用文件。
- 斜杠命令边打边补全；需要全屏 TUI 的会开成面板，少数管线里确实跑不了的会直接说明，
  并指向终端按钮。

---

## 排查

**提示「找不到 claude」** —— 面板会把它找过的位置全列出来。装好 CLI、登录，
确认在普通终端里敲 `claude` 能跑起来。npm 装出来的是 `claude.cmd`，同样认。

**代理在错的目录里干活** —— 工作目录是会话启动那一刻从 Visual Studio 解决方案取的，
跑起来之后中途改不了。打开正确的解决方案，再开一条新会话。

---

## 从源码构建

需要 Visual Studio SDK 工作负载和 Node.js。前端由 MSBuild 目标自动构建，不用单独跑。

```
MSBuild AgentExtension.slnx /t:Restore;Build /p:Configuration=Release
```

产物在 `dist/AgentExtension-<版本>.vsix`。

---

## 许可证

[Apache License 2.0](LICENSE.txt)。与 Anthropic 无从属关系，也未获其背书。
