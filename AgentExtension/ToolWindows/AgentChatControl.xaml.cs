// 承载 WebView2 的 WPF 宿主控件

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using AgentExtension.Agents;
using AgentExtension.Bridge;
using AgentExtension.Vs;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace AgentExtension.ToolWindows
{
    /// <summary>工具窗口的 WPF 内容，只负责把 WebView2 立起来并导航到前端。</summary>
    public partial class AgentChatControl : UserControl
    {
        #region 常量

        private const string VirtualHostName = "agent.local";

        private static string GetBuildStamp()
        {
            try
            {
                string location = typeof(AgentChatControl).Assembly.Location;

                if (!string.IsNullOrEmpty(location) && File.Exists(location))
                {
                    return File.GetLastWriteTimeUtc(location).Ticks.ToString(CultureInfo.InvariantCulture);
                }
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }

            return "0";
        }

        private const string DevServerUrl = "http://localhost:5173/";

        #endregion

        #region 字段

        /// <summary>当前这块 WebView2 的运行时环境。留着它是为了订 <c>BrowserProcessExited</c>——浏览器没了的唯一主动信号。</summary>
        private CoreWebView2Environment? _environment;

        /// <summary>已经关闭过。不能只靠 桥 == null 判断：EnsureWebViewAsync 的续体会在已释放的面板背后重新起进程、并再次订阅静态的 ThemeChanged。</summary>
        private bool _shutDown;

        private string _executablePath = string.Empty;

        private string _workingDirectory = string.Empty;

        /// <summary>
        /// <see cref="RestoreTabs"/> 当时读的是哪个目录。<see cref="PersistTabs"/> 落盘前要跟
        /// <see cref="_workingDirectory"/> 比对——解决方案没加载完时 <see cref="WorkspaceLocator"/>
        /// 返回的是「我的文档」兜底目录，拿那份恢复出来的单 tab 记录去写真正的解决方案槽位，
        /// 会把用户的整条 tab 条抹掉。
        /// </summary>
        private string _restoredDirectory = string.Empty;

        /// <summary>
        /// <see cref="RestoreTabs"/> 那一刻解决方案还没加载完，读的是兜底目录。
        /// 这种恢复不作数：真目录一到（<see cref="StartAgentProcess"/>）就得按真目录重来一次，
        /// 否则这一轮既接不回上次的会话，也永远落不了盘。
        /// </summary>
        private bool _restoreProvisional;

        /// <summary>
        /// <see cref="RestoreTabs"/> 因为超上限截断、或同会话去重丢掉了多少条记录。
        /// 丢的时候还没有任何桥可用，发不出通知；记在这里，等激活 tab 的桥在
        /// <see cref="StartSession"/> 里建好后一并 <c>SeedLog</c> 出去，发完归零。
        /// </summary>
        private int _restoredTabsDroppedCount;

        /// <summary>
        /// 「本次打开期间落盘被拒」这句话是不是已经说给用户听过了。只发一次，不然
        /// <see cref="PersistTabs"/> 调用很频繁，拒写一次刷一屏。拒写发生时激活 tab 的桥
        /// 可能还没建起来（最常见就是面板刚打开、前端还没挂载那一刻）——这种情况**不能**
        /// 置位，得留到下次桥建好、真正发出去的那一刻才算数，否则这句话会被静默吞掉。
        /// </summary>
        private bool _persistDisabledNoticeSent;

        private readonly WorkspaceIndex _workspaceIndex = new WorkspaceIndex();

        private bool _filePickInProgress;

        private readonly ClaudeSubcommandRunner _subcommandRunner = new ClaudeSubcommandRunner();

        private readonly CancellationTokenSource _shutdownCts = new CancellationTokenSource();

        private readonly LastSessionStore _lastSessionStore =
            new LastSessionStore(LastSessionStore.DefaultFilePath());

        /// <summary>全部 tab，顺序即 tab 条上的顺序。**永不为空**——见 <see cref="ChatTabPolicy.NextActiveAfterClose"/>。</summary>
        private readonly List<AgentChatTab> _tabs = new List<AgentChatTab>();

        private string _activeTabId = string.Empty;

        /// <summary>上次推给前端的 tab 条签名，用来做「变了才推」。</summary>
        private string _lastTabsSignature = string.Empty;

        /// <summary>当前激活的那个 tab。列表非空时保证不为 null。</summary>
        private AgentChatTab? ActiveTab
        {
            get
            {
                foreach (AgentChatTab tab in _tabs)
                {
                    if (string.Equals(tab.Id, _activeTabId, StringComparison.Ordinal))
                    {
                        return tab;
                    }
                }

                return _tabs.Count > 0 ? _tabs[0] : null;
            }
        }

        /// <summary>按桥或会话对象反查它属于哪个 tab。事件处理器共用一份，靠 sender 认人。</summary>
        private AgentChatTab? TabOf(object? sender)
        {
            foreach (AgentChatTab tab in _tabs)
            {
                if (ReferenceEquals(tab.Bridge, sender) || ReferenceEquals(tab.Session, sender))
                {
                    return tab;
                }
            }

            return null;
        }

        #endregion

        #region 构造与属性

        public AgentChatControl()
        {
            InitializeComponent();

            // 面板换了顶层窗口（浮动↔停靠、拖进别的窗口）时查一次 WebView 死活。
            // 这是唯一能发现「拖动之后一片空白」的时机：那条路上没有任何异常、没有任何事件。
            PresentationSource.AddSourceChangedHandler(this, OnPanelSourceChanged);

            // 主题订阅必须在控件级订一次。原先它写在 StartSession 里，
            // 按 tab 建会话就意味着订 N 次，主题一变同一个处理函数被叫 N 遍。
            VSColorTheme.ThemeChanged += OnVsThemeChanged;
        }

        public WebView2? WebView
        {
            get
            {
                return ActiveTab?.WebView;
            }
        }

        private void OnWebViewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Handled)
            {
                return;
            }

            int virtualKey = KeyInterop.VirtualKeyFromKey(e.Key);
            bool alt = (Keyboard.Modifiers & ModifierKeys.Alt) == ModifierKeys.Alt;

            if (!PanelKeyPolicy.IsStolenByWpfRoute(virtualKey, alt))
            {
                return;
            }

            IntPtr focus = NativeMethods.GetFocus();

            if (focus == IntPtr.Zero || !IsBrowserWindow(focus))
            {
                return;
            }

            uint scanCode = NativeMethods.MapVirtualKey((uint)virtualKey, 0);
            IntPtr lParam = new IntPtr(unchecked((int)(0x01000000u | (scanCode << 16) | 1u)));

            NativeMethods.SendMessage(focus, (uint)PanelKeyPolicy.WmKeyDown, new IntPtr(virtualKey), lParam);
            e.Handled = true;
        }

        /// <summary>这个窗口句柄是不是**任何一块**浏览器（WebView2 的宿主子窗口或它的后代）。</summary>
        internal bool IsBrowserWindow(IntPtr handle)
        {
            if (handle == IntPtr.Zero)
            {
                return false;
            }

            // 焦点可能落在任何一块活着的 WebView 上：虽然只有激活那块可见，
            // 但重建过程中会短暂同时存在两块。只比激活那块会漏掉按键。
            foreach (AgentChatTab tab in _tabs)
            {
                WebView2? view = tab.WebView;

                if (view == null)
                {
                    continue;
                }

                IntPtr host = view.Handle;

                if (host == IntPtr.Zero)
                {
                    continue;
                }

                if (handle == host || NativeMethods.IsChild(host, handle))
                {
                    return true;
                }
            }

            return false;
        }

        #endregion

        #region 初始化

        /// <summary>初始化：恢复上次的 tab 条，只把激活那个立起来（懒启动）。</summary>
        public async Task EnsureWebViewAsync()
        {
            RestoreTabs();

            AgentChatTab? active = ActiveTab;

            if (active == null)
            {
                return;
            }

            await InitializeWebViewAsync(active, rebuild: false);
        }

        /// <summary>
        /// 从记录里恢复整条 tab 条。WebView 全为 null——只有激活那个会被立刻立起来，
        /// 其余等用户点进去才建（懒启动）。没有记录时建一个空 tab，行为与今天完全一致。
        /// </summary>
        private void RestoreTabs()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (_tabs.Count > 0)
            {
                return;
            }

            // 这里必须先把工作目录解出来：记录按目录分别存。
            bool located = WorkspaceLocator.TryGetWorkspaceDirectory(out string directory);
            _workingDirectory = directory;
            _restoredDirectory = directory;
            _restoreProvisional = !located;

            WorkspaceTabsRecord record = _lastSessionStore.ReadTabs(_workingDirectory);

            var seenSessionIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            int activeIndex = -1;

            for (int i = 0; i < record.Tabs.Count; i++)
            {
                if (_tabs.Count >= ChatTabPolicy.MaxTabs)
                {
                    // 记录文件用户可以手改：塞进超过上限的条数，CanCreate 这条不变式
                    // 不能被恢复路径破坏，多出来的直接丢弃。丢弃不能不吭声——剩下这些
                    // 全部计入丢弃数，等激活 tab 的桥建好后由 StartSession 一并说出来。
                    _restoredTabsDroppedCount += record.Tabs.Count - i;
                    break;
                }

                TabRecord item = record.Tabs[i];

                // 同一条会话不能同时开在两个 tab 里：记录文件里一旦出现两条相同的合法 id，
                // 点开第二个就是两个进程 --resume 同一份转录。空串不参与去重——那是各自
                // 独立的「还没有会话」的懒启动 tab，不是重复。
                if (item.SessionId.Length > 0 && !seenSessionIds.Add(item.SessionId))
                {
                    _restoredTabsDroppedCount++;
                    continue;
                }

                var restored = new AgentChatTab(Guid.NewGuid().ToString(), item.Title)
                {
                    SessionId = item.SessionId
                };

                _tabs.Add(restored);

                if (i == record.Active)
                {
                    activeIndex = _tabs.Count - 1;
                }
            }

            if (_tabs.Count == 0)
            {
                var first = new AgentChatTab(
                    Guid.NewGuid().ToString(), ChatTabPolicy.NextTitle(new string[0]));

                _tabs.Add(first);
                _activeTabId = first.Id;
                PanelDiagnostics.Log($"恢复 tab 条：记录为空，新建默认 tab，激活={_activeTabId}");
                return;
            }

            int active = activeIndex >= 0 ? activeIndex : 0;
            _activeTabId = _tabs[active].Id;
            PanelDiagnostics.Log($"恢复 tab 条：{_tabs.Count} 个，激活={_activeTabId}，恢复目录={_restoredDirectory}");
        }

        /// <summary>
        /// 按真正的解决方案目录把 tab 条重来一次，返回是否真重来了。
        ///
        /// 面板随 VS 启动自动打开时会赶在解决方案加载完之前建好，那一刻
        /// <see cref="RestoreTabs"/> 读的是兜底目录——多半没有记录，于是开一条空 tab。
        /// 真目录直到起进程那一刻才拿得到；不在那时重读一遍，上次那条会话就永远接不回来，
        /// 而且 <see cref="PersistTabs"/> 会因为目录对不上一直拒写，这一轮开的 tab 也存不下。
        ///
        /// 活着的那个 tab 不能换掉：它的 WebView、桥、以及前端已经认得的 Id 都立起来了。
        /// 做法是让它顶替重读出来的**激活**那条（认领会话 id 与标题），其余条目照旧懒启动。
        /// </summary>
        private bool ReRestoreTabs()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (!ChatTabPolicy.CanReRestore(
                _restoreProvisional, _tabs.Count, ActiveTab?.SessionId ?? string.Empty))
            {
                return false;
            }

            if (string.Equals(
                NormalizeDirectoryKey(_workingDirectory),
                NormalizeDirectoryKey(_restoredDirectory),
                StringComparison.OrdinalIgnoreCase))
            {
                // 目录压根没变（一直没加载解决方案）：兜底恢复出来的那份就是对的，
                // 重来一次只会白白重建会话、把界面清空一次。
                return false;
            }

            AgentChatTab live = _tabs[0];

            // 清空后重跑 RestoreTabs：去重、超上限截断、空记录兜底那几条规则只此一份。
            _tabs.Clear();
            RestoreTabs();

            for (int i = 0; i < _tabs.Count; i++)
            {
                if (!string.Equals(_tabs[i].Id, _activeTabId, StringComparison.Ordinal))
                {
                    continue;
                }

                live.SessionId = _tabs[i].SessionId;
                live.Title = _tabs[i].Title;
                _tabs[i] = live;
                _activeTabId = live.Id;
                break;
            }

            PanelDiagnostics.Log(
                $"按真目录重恢复 tab 条：{_tabs.Count} 个，目录={_workingDirectory}");

            return true;
        }

        /// <summary>
        /// 立起一块 WebView2 并导航到前端。
        ///
        /// <paramref name="rebuild"/> 为 true 表示这是「面板被拖动后自愈」：会话与消息桥都还在，
        /// 只把桥换绑到新的 WebView 上；前端挂载后会收到整份转录回放。
        /// </summary>
        private async Task InitializeWebViewAsync(AgentChatTab tab, bool rebuild)
        {
            try
            {
                WebView2 view = RecreateWebViewControl(tab);

                // 环境只建一次，控件级复用（设计文档 §5.2）：同一个用户数据目录本来就是
                // 同一个浏览器进程，之前每次都 CreateAsync 只是语义上不成立，功能上无影响；
                // 改成复用之后语义才对得上代码。
                CoreWebView2Environment environment = _environment ?? await CreateEnvironmentAsync();

                if (_shutDown)
                {
                    // 不能裸 return：RecreateWebViewControl 已经把这块 WebView 挂上 tab 了，
                    // 裸 return 只是把它晾在那儿。理由与下面 catch 分支一致，见那边的注释。
                    DisposeTab(tab);
                    return;
                }

                await view.EnsureCoreWebView2Async(environment);

                if (_shutDown)
                {
                    DisposeTab(tab);
                    return;
                }

                AttachEnvironment(environment);

                view.AllowExternalDrop = false;
                tab.WebViewReady = true;

                PanelDiagnostics.Log($"WebView 已就绪 rebuild={rebuild} 浏览器进程={view.CoreWebView2.BrowserProcessId}");

                // 必须在任何 Navigate 之前挂桥并起会话：前端挂载后立刻会发 ready 请求回灌转录，
                if (rebuild)
                {
                    // 自愈路径：会话与桥都还活着（claude 子进程一直在跑），只换出站通道。
                    tab.ClientReady = false;
                    tab.Bridge?.RebindWebView(view.CoreWebView2);
                }
                else if (!StartSession(tab))
                {
                    return;
                }

                string? devUrl = await TryGetDevServerUrlAsync();

                if (_shutDown)
                {
                    // 这里原先调的是 ShutdownSession()，但它救不了这个在飞的 tab：
                    // _shutDown 是只在 ShutdownSession() 内部才会置位的字段，它是同步方法、
                    // 没有任何 await，能在这里读到 true 就说明它已经跑完一整轮、_tabs 早
                    // 清空了——再调一遍等于对着空列表 foreach，这个 tab（不论此刻还在不在
                    // 列表里）都摸不到。四处统一改成直接摘它自己的资源。
                    DisposeTab(tab);
                    return;
                }

                if (devUrl != null)
                {
                    // 走到这儿说明起成功了：之前记的失败文字（若有）作废，
                    // 否则字段一直留着旧内容，下次这个 tab 又出问题时 ApplyTabVisibility
                    // 短暂回填的会是这条过期文案。
                    tab.StatusMessage = string.Empty;
                    ApplyTabVisibility();
                    view.CoreWebView2.Navigate(devUrl);
                    return;
                }

                string webRoot = GetPackagedWebRoot();

                if (!Directory.Exists(webRoot))
                {
                    ShowStatus(tab, HostStrings.WebRootMissing(webRoot));
                    return;
                }

                view.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    VirtualHostName,
                    webRoot,
                    CoreWebView2HostResourceAccessKind.DenyCors);

                tab.StatusMessage = string.Empty;
                ApplyTabVisibility();

                view.CoreWebView2.Navigate(
                    $"https://{VirtualHostName}/index.html?build={GetBuildStamp()}");
            }
            catch (Exception ex)
            {
                ShowStatus(tab, HostStrings.WebViewInitFailed(ex.Message));

                // 不摘掉这个 tab 的全部运行时资源就成了死板，没有任何恢复入口：
                // EnsureTabStartedAsync 看 tab.WebView != null 以为已经起过、不会再试；
                // IsWebViewAlive 看 !tab.WebViewReady 直接判定「还在启动」、自愈也不会碰它。
                //
                // 原先这里只调 DetachWebView，只摘了半死的 WebView，tab.Bridge / tab.Session
                // 原样留着——用户切走再切回，EnsureTabStartedAsync 照样判「没起过」再跑一次，
                // StartSession 会直接覆盖旧的 Bridge / Session，谁都不解绑、不 Dispose，
                // 旧 Bridge 那个 16ms DispatcherTimer 从此永远空转，每次重试泄一份。这是
                // 「把单数字段搬进 AgentChatTab + ShutdownSession 改成遍历 _tabs」那次重构
                // 破掉的既有不变式：以前只有一个 tab，摘 WebView 等于摘全部；现在得整份摘，
                // 改成 DisposeTab——它已经把解绑桥/会话事件、Dispose 两者、置 null、
                // DetachWebView 这一整套做全了。
                DisposeTab(tab);

                // 标成崩了，第 3 项负责显示；tab 还在 _tabs 里
                tab.Failed = true;
                PushTabs();

                // 激活 tab 崩了才切走一次；推导见 docs/memory/multi-session-tabs.md
                if (ReferenceEquals(tab, ActiveTab) && !tab.AutoSwitchedAway)
                {
                    AgentChatTab? alive = FindAnotherAliveTab(tab);

                    if (alive != null)
                    {
                        tab.AutoSwitchedAway = true;
                        ActivateTab(alive.Id);
                    }
                }
            }
        }

        /// <summary>
        /// 找一个此刻确认还活着的候选 tab，供自动切走使用。
        /// 判据与防连锁推导见 docs/memory/multi-session-tabs.md。
        /// </summary>
        private AgentChatTab? FindAnotherAliveTab(AgentChatTab excluding)
        {
            foreach (AgentChatTab candidate in _tabs)
            {
                if (ReferenceEquals(candidate, excluding))
                {
                    continue;
                }

                if (candidate.WebView != null && candidate.WebViewReady && IsWebViewAlive(candidate))
                {
                    return candidate;
                }
            }

            return null;
        }

        /// <summary>建控件级共用的环境。</summary>
        /// <remarks>并发下可能被调不止一次，见 <see cref="AttachEnvironment"/> 判空去重。</remarks>
        private static async Task<CoreWebView2Environment> CreateEnvironmentAsync()
        {
            // 用户数据目录必须显式指定：默认位置是 devenv.exe 所在目录，那里通常不可写。
            string userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "AgentExtension",
                "WebView2");

            Directory.CreateDirectory(userDataFolder);

            // 远程调试端口：**默认关闭**，只在设了环境变量 AGENTEXT_WEBVIEW_DEBUG_PORT 时才开。
            // 这段必须留在「第一次创建」这条路径里：环境只建一次，这个参数也就只有这一次
            // 生效的机会。实测教训：WebView2 按用户数据目录共用浏览器进程，别的 VS 实例
            // 开着面板时，带不同参数创建环境会失败且**整个面板起不来、不报错**
            // （见 docs/memory/webview-debug-port-and-shared-browser.md），所以正常情况下
            // 绝不要设这个环境变量。
            var options = new CoreWebView2EnvironmentOptions();
            string debugPort = (Environment.GetEnvironmentVariable("AGENTEXT_WEBVIEW_DEBUG_PORT") ?? string.Empty).Trim();
            int parsedPort;

            if (debugPort.Length > 0 && int.TryParse(debugPort, out parsedPort) && parsedPort > 0 && parsedPort < 65536)
            {
                options.AdditionalBrowserArguments = $"--remote-debugging-port={parsedPort}";
            }

            CoreWebView2Environment environment =
                await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);

            return environment;
        }

        /// <summary>
        /// 记一条状态文字到 <paramref name="tab"/> 名下。必须同时折叠 WebView——它是 HwndHost，
        /// 子 HWND 永远盖在 WPF 内容之上，不折叠这段字画不出来。
        ///
        /// 界面上只有一份 <c>StatusText</c>，先把消息存进 <see cref="AgentChatTab.StatusMessage"/>，
        /// 只有 <paramref name="tab"/> 正好是当前激活的那个（用 <see cref="ActiveTab"/> 引用比较，
        /// 理由同 <see cref="ApplyTabVisibility"/>）时才真的刷新界面：后台 tab 出的问题不该把
        /// 前台那块正常显示的 WebView 折叠掉——那样用户看到的是「好端端的界面突然空了」，
        /// 而实际出问题的是他根本没在看的另一个 tab。非激活时也不能彻底无声，记一条日志，
        /// 用户切过去时 <see cref="ApplyTabVisibility"/> 会把这条消息回填出来。
        /// </summary>
        private void ShowStatus(AgentChatTab? tab, string message)
        {
            if (tab == null)
            {
                return;
            }

            tab.StatusMessage = message;

            if (!ReferenceEquals(tab, ActiveTab))
            {
                PanelDiagnostics.Log($"tab={tab.Title} 不是当前激活的，状态先记下、不刷新界面：{message}");
                return;
            }

            StatusText.Text = message;
            StatusText.Visibility = Visibility.Visible;

            WebView2? view = tab.WebView;

            if (view != null)
            {
                view.Visibility = Visibility.Collapsed;
            }
        }

        private void OnBridgeOutboundFailed(object sender, string reason)
        {
            AgentChatTab? tab = TabOf(sender);

            if (tab == null)
            {
                return;
            }

            ShowStatus(tab, HostStrings.OutboundBroken(reason));

            // 出站断了最常见的原因就是浏览器没了。先把话说出来，再看看能不能自己救回来；
            // 救得回来的话下面这次自检会把这段提示换成重建中的文案。
            ScheduleWebViewHealthCheck();
        }

        private static string GetPackagedWebRoot()
        {
            string assemblyDirectory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? string.Empty;
            string webRoot = Path.Combine(assemblyDirectory, "webview");
            return webRoot;
        }

        private static async Task<string?> TryGetDevServerUrlAsync()
        {
#if DEBUG
            try
            {
                using (var client = new System.Net.Http.HttpClient())
                {
                    client.Timeout = TimeSpan.FromMilliseconds(400);
                    System.Net.Http.HttpResponseMessage response = await client.GetAsync(DevServerUrl);

                    if (response.IsSuccessStatusCode)
                    {
                        return DevServerUrl;
                    }
                }
            }
            catch (Exception)
            {
            }
#endif
            await Task.CompletedTask;
            return null;
        }

        #endregion

        #region tab 切换

        /// <summary>按当前激活的是谁，重排所有 WebView 的可见性。</summary>
        private void ApplyTabVisibility()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            // 「谁是激活的」全篇只认这一个：ActiveTab 带兜底（列表非空时不为 null），
            // 不能在这个方法里另用 tab.Id == _activeTabId 严格比对——_activeTabId
            // 一旦悬空（比如 Task 9 从持久化还原到一个已经不在列表里的 id），两套判据会
            // 互相矛盾：下面循环谁都不匹配、全部折叠，而 activeShowingWebView 那半却按
            // ActiveTab 的兜底判定「已就绪」，界面就成了连一个字都没有的全空面板。
            AgentChatTab? active = ActiveTab;

            foreach (AgentChatTab tab in _tabs)
            {
                if (tab.WebView == null)
                {
                    continue;
                }

                // 必须带上 WebViewReady：没就绪的 WebView2 是一块白底，而它是 HwndHost，
                // 子 HWND 永远盖在所有 WPF 内容之上（airspace 限制，z-order 无效），
                // 置成 Visible 会把 StatusText 那段「正在重建…」整个盖死——用户看到的是
                // 一片空白且没有任何提示。见 docs/memory/webview-dies-on-dock.md。
                bool show = ReferenceEquals(tab, active) && tab.WebViewReady;
                tab.WebView.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
            }

            // 激活的那个还没起来时，状态文字要露出来——否则用户看到的是一块什么都没有的灰板。
            // 文字内容按激活 tab 自己记的那条回填，不是留着上一个激活 tab 的残留。
            bool activeShowingWebView = active != null && active.WebView != null && active.WebViewReady;
            StatusText.Text = active?.StatusMessage ?? string.Empty;
            StatusText.Visibility = activeShowingWebView ? Visibility.Collapsed : Visibility.Visible;
        }

        /// <summary>切到某个 tab。已经建过 WebView 的只换可见性，不重启任何进程；懒启动的这时才立起来。</summary>
        /// <param name="tabId">要切到的 tab id。</param>
        /// <param name="focusStrip">键盘触发时为真，要求前端聚焦 tab 条。</param>
        private void ActivateTab(string tabId, bool focusStrip = false)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            AgentChatTab? target = null;

            foreach (AgentChatTab tab in _tabs)
            {
                if (string.Equals(tab.Id, tabId, StringComparison.Ordinal))
                {
                    target = tab;
                    break;
                }
            }

            if (target == null)
            {
                return;
            }

            PanelDiagnostics.Log($"激活 tab：{target.Title}（懒启动={target.WebView == null}）");

            _activeTabId = target.Id;

            // 看过了就不算未读；崩了的标记也一并清掉——用户过去看过了，
            // 不管是不是已经解决，都不该再挂着那个提示。
            target.Unread = false;
            target.Failed = false;

            if (target.WebView == null && target.StatusMessage.Length == 0)
            {
                // 先填文案再刷可见性，否则这一秒是空白面板
                target.StatusMessage = HostStrings.TabStarting();
            }

            ApplyTabVisibility();
            PushTabs(focusStrip);
            PersistTabs();

            if (target.WebView == null)
            {
                _ = ThreadHelper.JoinableTaskFactory.RunAsync(async () =>
                {
                    await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
                    await EnsureTabStartedAsync(target);
                });
            }
        }

        /// <summary>把一个懒启动的 tab 真正立起来：建 WebView、起 CLI。已经起过的直接返回。</summary>
        private async Task EnsureTabStartedAsync(AgentChatTab tab)
        {
            if (tab.WebView != null || _shutDown)
            {
                return;
            }

            ShowStatus(tab, HostStrings.TabStarting());
            await InitializeWebViewAsync(tab, rebuild: false);
        }

        /// <summary>把整条 tab 条推给**所有**活着的桥。内容没变就不推。</summary>
        /// <param name="focusStrip">键盘触发时为真，要求前端聚焦 tab 条；一次性，不粘住。</param>
        private void PushTabs(bool focusStrip = false)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            var snapshots = new List<ChatTabSnapshot>();

            foreach (AgentChatTab tab in _tabs)
            {
                snapshots.Add(tab.ToSnapshot());
            }

            var payload = new ChatTabListPayload
            {
                Tabs = snapshots,
                // 必须走带 _tabs[0] 兜底的 ActiveTab，不能直读 _activeTabId：
                // 后者一旦悬空（比如 Task 9 从持久化还原出一个已经不在列表里的 id），
                // 屏幕上显示的是 ActiveTab 兜底出来的那个 WebView，而这里推给前端的
                // activeId 却谁都不匹配——tab 条上没有任何一个高亮，界面自相矛盾。
                ActiveId = ActiveTab?.Id ?? string.Empty,
                FocusStrip = focusStrip
            };

            string signature = ChatTabPolicy.Signature(payload);

            // 聚焦请求必须绕过去重：内容可能没变，但连按方向键第二次要求也得送到。
            if (!focusStrip && string.Equals(signature, _lastTabsSignature, StringComparison.Ordinal))
            {
                // 会话事件每轮来几十条，每条都推等于让 N 个前端一直重渲染。
                return;
            }

            _lastTabsSignature = signature;

            // 推给所有活着的桥，不只是激活那个：后台 tab 的前端也要保持列表正确，
            // 否则切回去时它画的是旧的一条。懒启动的 tab 没有桥，自然收不到——
            // 等它被激活、前端发 ready 时会拿到当前列表。
            foreach (AgentChatTab tab in _tabs)
            {
                tab.Bridge?.PostTabs(payload);
            }
        }

        private void OnTabCreateRequested(object sender, EventArgs e)
        {
            CreateTab();
        }

        private void OnTabActivateRequested(object sender, TabActivateRequest request)
        {
            ActivateTab(request.TabId, request.FromKeyboard);
        }

        private void OnTabCloseRequested(object sender, string tabId)
        {
            CloseTab(tabId);
        }

        /// <summary>
        /// 某个 tab 的语言/外观变了，转发给**其余**所有 tab（跳过发起的那个）。
        /// 语言/外观是全局设置（设计文档 §9），不像转录那样按 tab 各存一份。
        /// </summary>
        private void OnUiPrefsChanged(object sender, UiPrefsPayload payload)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            AgentChatTab? source = TabOf(sender);

            if (source == null)
            {
                return;
            }

            foreach (AgentChatTab tab in _tabs)
            {
                if (ReferenceEquals(tab, source))
                {
                    continue;
                }

                tab.Bridge?.PostUiPrefs(payload);
            }
        }

        /// <summary>新开一个 tab 并激活它。到上限时说一句话，不静默忽略。</summary>
        private void CreateTab()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (!ChatTabPolicy.CanCreate(_tabs.Count))
            {
                ActiveTab?.Bridge?.PostNotice(NoticeText.TabLimit, ChatTabPolicy.LimitArgs());
                return;
            }

            var titles = new List<string>();

            foreach (AgentChatTab existing in _tabs)
            {
                titles.Add(existing.Title);
            }

            var created = new AgentChatTab(Guid.NewGuid().ToString(), ChatTabPolicy.NextTitle(titles));
            _tabs.Add(created);

            PanelDiagnostics.Log($"新建 tab：{created.Title}（当前 {_tabs.Count} 个）");

            ActivateTab(created.Id);
        }

        /// <summary>关掉一个 tab。停它的 CLI、销毁它的 WebView、从列表移除；转录文件仍在，之后能从会话历史面板再开。</summary>
        private void CloseTab(string tabId)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            AgentChatTab? closing = null;
            var orderedIds = new List<string>();

            foreach (AgentChatTab tab in _tabs)
            {
                orderedIds.Add(tab.Id);

                if (string.Equals(tab.Id, tabId, StringComparison.Ordinal))
                {
                    closing = tab;
                }
            }

            if (closing == null)
            {
                return;
            }

            // 取激活 id 必须走带兜底的 ActiveTab，不能直读 _activeTabId——理由同 PushTabs。
            string activeId = ActiveTab?.Id ?? string.Empty;
            string nextActive = ChatTabPolicy.NextActiveAfterClose(orderedIds, activeId, tabId);

            // 列表状态必须先改好，Dispose 才跟上：WebViewBridge.Dispose 退订 COM 事件
            // 那两行万一在控制器已死的情况下抛出来（拖动停靠自愈没跟上那条路），
            // 顺序反过来会导致 _tabs.Remove 永远执行不到——关闭按钮从此在同一处
            // 永久失效，_tabs 也再没机会归零去触发下面的补新逻辑。
            _tabs.Remove(closing);
            DisposeTab(closing);

            PanelDiagnostics.Log($"关闭 tab：{closing.Title}（剩 {_tabs.Count} 个）");

            if (_tabs.Count == 0)
            {
                // 判据必须是列表实际为空，不能信策略的返回值：NextActiveAfterClose 在
                // 「关的不是激活那个」时原样返回 activeId，并不校验那个 id 还在不在列表里。
                // 一旦 _activeTabId 悬空，关掉唯一那个 tab 时会拿到一个非空的悬空 id，
                // 从而跳过这里——零 tab 就是零 WebView，那时界面变成一块灰板，
                // 再也点不出新 tab——这是硬约束，不是体验优化。
                CreateTab();
                return;
            }

            // nextActive 必定还在 _tabs 里（来自 orderedIds 且不是被删的那个），
            // 直接复用 ActivateTab：它已经处理了可见性刷新、推送、落盘、清未读、
            // 懒启动兜底这一整套，没必要在这里重复一份、还漏掉清未读那一步。
            ActivateTab(nextActive);
        }

        /// <summary>
        /// 目录比对前先归一化。规则必须跟 <see cref="LastSessionStore"/> 内部那份私有的
        /// <c>NormalizeKey</c> 一致（<c>Trim</c> 后 <c>TrimEnd('\\', '/')</c>）：两次
        /// <see cref="WorkspaceLocator"/> 调用之间只要一次带尾斜杠一次不带，裸比就会把
        /// 「同一个目录」误判成「目录被校正了」，导致 <see cref="PersistTabs"/> 本次打开
        /// 全程拒写、还弹一条很吓人的通知，用户这次开的 tab 全丢。<c>NormalizeKey</c> 是
        /// private，不改它的可见性，这里另写一份同规则的小函数。
        /// </summary>
        private static string NormalizeDirectoryKey(string directory)
        {
            string trimmed = (directory ?? string.Empty).Trim().TrimEnd('\\', '/');
            return trimmed;
        }

        /// <summary>把当前这条 tab 条落盘。tab 增删、激活切换、会话 id 变化时各写一次。</summary>
        private void PersistTabs()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (_workingDirectory.Length == 0)
            {
                return;
            }

            if (!string.Equals(
                NormalizeDirectoryKey(_workingDirectory),
                NormalizeDirectoryKey(_restoredDirectory),
                StringComparison.OrdinalIgnoreCase))
            {
                // 解决方案没加载完时 WorkspaceLocator 会先兜底解到「我的文档」，RestoreTabs
                // 拿那份读出来的多半是空条 → 补一个默认 tab；之后 _workingDirectory 校正成
                // 真正的解决方案目录，若这里照样写，会把用户为这个目录存的整条 tab 条覆盖成
                // 刚才那个默认空 tab。目录对不上就拒写，直到本面板关掉重开（见下面发给用户
                // 的那句话）——_restoredDirectory 这一轮不会再变，ReconcileWorkingDirectoryChange
                // 只按新目录重新判定当前这一个 tab 该接哪条会话，不会去重跑 RestoreTabs。
                //
                // 这条路不是走不通，只是这一轮不做：真按新目录重新读一遍 tab 条，「替换」
                // 掉当前这份（换掉前端已经认得的 tab、桥、WebView）才会失联；「追加」是
                // 安全的——新读出来的 tab 各自带一个前端本来就没见过的新 Id，PushTabs
                // 一推就认得，不存在覆盖问题。留给以后做。
                PanelDiagnostics.Log(
                    $"跳过落盘：恢复目录={_restoredDirectory} 当前目录={_workingDirectory}");

                // 拒写不能是静默的：不然用户开了好几个 tab、关掉 VS，下次全没了，却从没被
                // 告知过。只说一次——PersistTabs 调用很频繁，每次拒写都说等于刷屏。
                // 激活 tab 的桥这一刻可能还没建起来（最常见就是面板刚打开、前端还没挂载），
                // 这种情况不置位，留到下次真正发出去的那一刻再算数，否则这句话会被吞掉。
                if (!_persistDisabledNoticeSent)
                {
                    WebViewBridge? bridge = ActiveTab?.Bridge;

                    if (bridge != null)
                    {
                        bridge.PostNotice(NoticeText.PersistDisabled, NoticeText.Args(
                            "restored", _restoredDirectory,
                            "current", _workingDirectory));

                        _persistDisabledNoticeSent = true;
                    }
                }

                return;
            }

            var records = new List<TabRecord>();
            int active = 0;

            // 「谁是激活的」统一走带兜底的 ActiveTab，不能裸比 tab.Id == _activeTabId——
            // 全文件其余判活跳的地方都这么写，理由同 PushTabs/ApplyTabVisibility 上的注释。
            AgentChatTab? activeTab = ActiveTab;

            foreach (AgentChatTab tab in _tabs)
            {
                if (ReferenceEquals(tab, activeTab))
                {
                    active = records.Count;
                }

                records.Add(new TabRecord
                {
                    SessionId = tab.SessionId,
                    Title = tab.Title
                });
            }

            var record = new WorkspaceTabsRecord
            {
                Active = active,
                Tabs = records
            };

            _lastSessionStore.WriteTabs(_workingDirectory, record);
        }

        #endregion

        #region 自愈

        /// <summary>
        /// 扔掉旧的那块 WebView2、新建一块放进容器。
        ///
        /// 为什么非换不可：控制器一旦关闭就再也接不回来，而 WPF 的 <c>HwndHost</c> 只在自己的子窗口
        /// 不存在时才会重建（<c>BuildOrReparentWindow</c>），此刻它的子窗口好端端地在那儿——
        /// 于是谁都不会动手。只能整块换掉。
        /// </summary>
        private WebView2 RecreateWebViewControl(AgentChatTab tab)
        {
            WebView2? old = tab.WebView;
            tab.WebViewReady = false;

            if (old != null)
            {
                old.KeyDown -= OnWebViewKeyDown;
                WebViewHost.Children.Remove(old);

                try
                {
                    old.Dispose();
                }
                catch (Exception)
                {
                    // 它的控制器多半已经死了，Dispose 抛什么都无所谓：目的只是把那个宿主子窗口收掉。
                }
            }

            var view = new WebView2
            {
                Visibility = Visibility.Collapsed
            };

            // Home / End 必须在 WPF 冒泡路由里就抢下来，见 OnWebViewKeyDown 的注释。
            view.KeyDown += OnWebViewKeyDown;

            WebViewHost.Children.Add(view);
            tab.WebView = view;
            return view;
        }

        /// <summary>
        /// 记下这个控件级共用的运行时环境，只在第一次调用时真正生效。
        ///
        /// 环境现在只建一次、N 块 WebView 共用（<see cref="CreateEnvironmentAsync"/>），
        /// 不会再像以前那样中途换成另一个，所以不需要「换订」那套退订旧的、订新的逻辑——
        /// 只判一次「订过没有」就够了。
        ///
        /// <c>BrowserProcessExited</c> 是「浏览器进程真的没了」的主动信号，作为兜底。
        /// 拖动停靠这条路上它**不一定会响**（实测：新控制器建得够快时，浏览器进程根本没退，
        /// 换掉的只是控制器），所以真正把故障抓住的是 <see cref="OnPanelSourceChanged"/> 那次自检。
        /// 两个信号都往同一个自检上汇，由重建预算保证只会有一次重建。
        /// </summary>
        private void AttachEnvironment(CoreWebView2Environment environment)
        {
            if (_environment != null)
            {
                return;
            }

            _environment = environment;
            _environment.BrowserProcessExited += OnBrowserProcessExited;
        }

        private void OnBrowserProcessExited(object sender, CoreWebView2BrowserProcessExitedEventArgs e)
        {
            PanelDiagnostics.Log($"浏览器进程退出 kind={e?.BrowserProcessExitKind} shutDown={_shutDown}");
            ScheduleWebViewHealthCheck();
        }

        /// <summary>面板换了顶层窗口（浮动↔停靠、拖进别的窗口组）。</summary>
        private void OnPanelSourceChanged(object sender, SourceChangedEventArgs e)
        {
            PanelDiagnostics.Log("面板换了顶层窗口");
            ScheduleWebViewHealthCheck();
        }

        /// <summary>排到后台优先级再查：拖动刚结束时窗口关系还在变，此刻问死活会得到似是而非的答案。</summary>
        private void ScheduleWebViewHealthCheck()
        {
            _ = Dispatcher.BeginInvoke(
                DispatcherPriority.Background,
                new Action(CheckWebViewHealth));
        }

        private void CheckWebViewHealth()
        {
            // N 块 WebView 全挂在同一个顶层窗口上，窗口一销毁它们会一起死，
            // 所以必须逐个查、逐个重建。只查激活那块的话，切回后台 tab 时才发现是空白。
            foreach (AgentChatTab tab in new List<AgentChatTab>(_tabs))
            {
                if (tab.WebView == null)
                {
                    // 懒启动、还没立起来的：没有东西可救。
                    continue;
                }

                CheckTabWebViewHealth(tab);
            }
        }

        private void CheckTabWebViewHealth(AgentChatTab tab)
        {
            bool alive = IsWebViewAlive(tab);

            if (!tab.RebuildPolicy.TryBeginRebuild(_shutDown, alive))
            {
                PanelDiagnostics.Log($"自检：不重建 tab={tab.Title}（alive={alive} shutDown={_shutDown}）");
                return;
            }

            PanelDiagnostics.Log($"自检：tab={tab.Title} 的 WebView 已死，开始重建");

            // ShowStatus 自己会判断 tab 是否为当前激活的那个，后台 tab 重建不会折叠前台画面。
            ShowStatus(tab, HostStrings.WebViewRebuilding());

            _ = ThreadHelper.JoinableTaskFactory.RunAsync(async () =>
            {
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();

                try
                {
                    await InitializeWebViewAsync(tab, rebuild: true);
                }
                finally
                {
                    tab.RebuildPolicy.EndRebuild();
                }
            });
        }

        /// <summary>
        /// WebView 还能用吗。
        ///
        /// 判据取 <see cref="CoreWebView2.BrowserProcessId"/>：控制器被关掉、或浏览器进程没了之后，
        /// 取它的任何属性都会抛（COM 通道已断）。没有别的信号可用——控制器随浮动窗口一起关闭这条路上
        /// 既不抛异常也不触发 ProcessFailed。
        /// </summary>
        private bool IsWebViewAlive(AgentChatTab tab)
        {
            WebView2? view = tab.WebView;

            // 还没成功初始化过：此刻的「没有 CoreWebView2」是初始化中间态，不是死了。
            // 这条判断必须在 null 检查之前 —— 反过来写就会把「控制器被关掉后属性变成 null」
            // 误判成「还在启动」，于是永远不重建（2026-08-24 第一版就是这么漏的）。
            if (!tab.WebViewReady)
            {
                return true;
            }

            if (view == null)
            {
                return false;
            }

            try
            {
                CoreWebView2? core = view.CoreWebView2;

                if (core == null)
                {
                    // 已经就绪过却又没有了：控制器被关掉了。
                    return false;
                }

                return core.BrowserProcessId != 0;
            }
            catch (Exception)
            {
                // 控制器已关闭 / 浏览器进程没了，取任何属性都会抛（COM 通道已断）。
                return false;
            }
        }

        #endregion

        #region 会话

        private bool StartSession(AgentChatTab tab)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            string? executable = ClaudeCliLocator.Resolve(null);

            if (executable == null)
            {
                ShowStatus(tab, HostStrings.ClaudeNotFound(
                    ClaudeCliLocator.GetMachineWellKnownCandidates(),
                    ClaudeCliLocator.PathEnvironmentVariable));
                return false;
            }

            _executablePath = executable;

            // 工作目录必须在这里先解出来：LastSessionStore 按目录分别记，
            // 等 StartAgentProcess() 才解析就晚了——那时 ready 早把空回放发出去了，历史画不出来。
            WorkspaceLocator.TryGetWorkspaceDirectory(out string directory);
            _workingDirectory = directory;

            // 恢复出来的 tab 自己记着该接哪条；没有的话（新建的 tab）就是一条干净会话。
            // 不能按工作目录去 _lastSessionStore.Read：那读的是「这个目录上次激活的那条」，
            // 多 tab 之后跟「这个 tab 该接哪条」是两回事——按目录取会让新建的 tab 也接上
            // 别的 tab 正在用的那条会话，两个进程写同一份转录文件。
            string candidate = tab.SessionId;
            SessionResumeTarget target = SessionResumeDecision.Resolve(
                SessionHistoryReader.DefaultTranscriptRoot(), _workingDirectory, candidate);

            tab.ResumeOrigin = target.CanResume ? ResumeOrigin.AutoStartup : ResumeOrigin.None;
            tab.Session = CreateSession(tab, target.CanResume ? target.SessionId : null);
            tab.Session.Received += OnSessionEventForStore;
            tab.Session.StartupFailed += OnSessionStartupFailed;

            tab.Bridge = new WebViewBridge(
                tab.WebView!.CoreWebView2,
                tab.Session,
                Dispatcher,
                _executablePath,
                () => _workingDirectory);
            tab.Bridge.OutboundFailed += OnBridgeOutboundFailed;
            tab.Bridge.PermissionModeChangeRequested += OnPermissionModeChangeRequested;
            tab.Bridge.ModelChangeRequested += OnModelChangeRequested;
            tab.Bridge.SubcommandRequested += OnSubcommandRequested;
            tab.Bridge.EffortChangeRequested += OnEffortChangeRequested;
            tab.Bridge.ClientReady += OnClientReady;
            tab.Bridge.OpenFileRequested += OnOpenFileRequested;
            tab.Bridge.SessionResumeRequested += OnSessionResumeRequested;
            tab.Bridge.EscapeUnhandled += OnEscapeUnhandled;
            tab.Bridge.NewSessionRequested += OnNewSessionRequested;
            tab.Bridge.TabCreateRequested += OnTabCreateRequested;
            tab.Bridge.TabActivateRequested += OnTabActivateRequested;
            tab.Bridge.TabCloseRequested += OnTabCloseRequested;
            tab.Bridge.UiPrefsChanged += OnUiPrefsChanged;
            tab.Bridge.FileSearchRequested = query => _workspaceIndex.Search(query);
            tab.Bridge.FilePickRequested = PickFiles;

            tab.Bridge.TerminalLaunchProvider = () => new TerminalLaunchOptions
            {
                Model = tab.Model,
                Effort = tab.Effort,
                PermissionMode = tab.PermissionMode,

                // 起终端那一刻的会话 id：终端从这条会话分叉出去，带着上下文开场。
                ResumeSessionId = tab.SessionId
            };

            if (target.CanResume)
            {
                SeedReplay(tab, target);
            }
            else if (candidate.Length > 0)
            {
                // 记录里有 id 却接不回来：转录被清理、过了保留期、或项目目录换算变了。
                // 不出声的话用户看到的是「tab 条完整恢复了，点进去却一片空白」——
                // 而这条路上 CLI 起得好好的，ResumeFallbackPolicy 那套自愈根本不会触发。
                tab.Bridge.SeedLog(new[]
                {
                    AgentEvent.Notice(
                        NoticeText.ResumeTranscriptGone,
                        NoticeText.Args("id", candidate.Substring(0, Math.Min(8, candidate.Length))))
                });
            }

            if (_restoredTabsDroppedCount > 0 && ReferenceEquals(tab, ActiveTab))
            {
                // RestoreTabs 恢复时因为超上限截断、或同会话去重丢过条目，那时候还没有
                // 任何桥可用，发不出通知；只能先记数，等激活 tab 的桥在这里建好，
                // 才是第一个能把话说出去的时机。发完归零，不然以后每次重进这个方法都重发。
                tab.Bridge.SeedLog(new[]
                {
                    AgentEvent.Notice(NoticeText.TabsDropped, NoticeText.Args(
                        "n", _restoredTabsDroppedCount.ToString(CultureInfo.InvariantCulture),
                        "max", ChatTabPolicy.MaxTabs.ToString(CultureInfo.InvariantCulture)))
                });

                _restoredTabsDroppedCount = 0;
            }

            tab.Bridge.Start();

            return true;
        }

        /// <summary>把上次会话的历史折成事件预置进桥，界面 ready 时会一并画出来。</summary>
        private void SeedReplay(AgentChatTab tab, SessionResumeTarget target)
        {
            if (tab.Bridge == null)
            {
                return;
            }

            IReadOnlyList<AgentEvent> events = ComposeReplayEvents(target);
            tab.Bridge.SeedLog(events);
        }

        /// <summary>把接回目标的转录折成回放事件。</summary>
        private static IReadOnlyList<AgentEvent> ComposeReplayEvents(SessionResumeTarget target)
        {
            try
            {
                TranscriptReplayResult replay = TranscriptReplayReader.Read(target.TranscriptPath);

                // 没历史可画时也要出声：接回成功和没接回在界面上必须能区分开，
                // 判定与文案都在 ResumeSeedComposer 里，那边是可单测的纯逻辑。
                IReadOnlyList<AgentEvent> events = ResumeSeedComposer.Compose(replay, target.SessionId);
                return events;
            }
            catch (IOException ex)
            {
                // 读不出历史不该挡住启动：上下文在 CLI 那边，照样能接着聊。
                return ReplayUnreadable(ex);
            }
            catch (UnauthorizedAccessException ex)
            {
                return ReplayUnreadable(ex);
            }
        }

        /// <summary>历史读不出来时顶上的那一条说明。</summary>
        private static IReadOnlyList<AgentEvent> ReplayUnreadable(Exception ex)
        {
            var events = new[]
            {
                AgentEvent.Notice(NoticeText.ReplayUnreadable, NoticeText.Args("reason", ex.Message))
            };

            return events;
        }

        /// <summary>记下会话 id 供下次接回，并按事件更新这个 tab 的未读与忙标记。</summary>
        private void OnSessionEventForStore(object sender, AgentEvent evt)
        {
            if (evt == null)
            {
                return;
            }

            // 这个处理器跑在非 UI 线程上（CLI 读取线程，以及 Process.Exited 那条路上的线程池线程），
            // 而 _tabs 是在 UI 线程增删的。一切对 _tabs / TabOf 的访问都必须先回到 UI 线程，
            // 否则 foreach 会抛 InvalidOperationException，而 ReadLoop 那层空 catch 会把它吃掉、
            // 读循环静默退出——表现为「某个 tab 突然不再收到任何 CLI 输出」，无异常无日志。
#pragma warning disable VSTHRD001
            _ = Dispatcher.BeginInvoke(new Action(() =>
            {
                if (_shutDown)
                {
                    return;
                }

                AgentChatTab? tab = TabOf(sender);

                if (tab == null)
                {
                    // 会话已经被换掉（开新会话 / 接回 / 重启）：这条是旧会话排在队里的迟到事件，
                    // 不能拿它去写记录，否则会把旧会话 id 写回去。
                    return;
                }

                if (evt.Kind == AgentEventKind.SessionStarted)
                {
                    PanelDiagnostics.Log(
                        $"SessionStarted tab={tab.Title} id='{evt.SessionInfo?.SessionId ?? "<null>"}'");
                }

                // SessionStarted 有三个发出点，其中两个（探测轮次的 PublishProbedState、
                // initialize 控制回包）身上没有 session id，只有 system/init 那个才有。
                // 时序是先真 id 后空 id：拿空串覆盖会把这个 tab 的会话 id 抹掉并原样落盘，
                // 下次 ParseWorkspace 就把这条当非法丢掉，「接回」永远接不回。
                // 顺带用「与现值不同才写」挡掉重复落盘：SessionStarted 每个探测轮次都会重发一次。
                if (evt.Kind == AgentEventKind.SessionStarted
                    && evt.SessionInfo != null
                    && evt.SessionInfo.SessionId.Length > 0)
                {
                    // 会话真正起来了，崩了标记清掉
                    tab.Failed = false;
                    tab.AutoSwitchedAway = false;

                    if (!string.Equals(tab.SessionId, evt.SessionInfo.SessionId, StringComparison.OrdinalIgnoreCase))
                    {
                        tab.SessionId = evt.SessionInfo.SessionId;
                        PersistTabs();
                    }
                }

                bool isActive = ReferenceEquals(tab, ActiveTab);

                if (ChatTabPolicy.ShouldMarkUnread(isActive, evt.Kind))
                {
                    tab.Unread = true;
                }

                // 忙不忙以会话自己的状态为准，比按事件种类猜准。
                tab.Busy = tab.Session != null && tab.Session.IsBusy;

                PushTabs();

                // 额度是账号级的，广播给其余 tab；见 docs/memory/multi-session-tabs.md
                if (evt.Kind == AgentEventKind.SessionStarted
                    && evt.SessionInfo != null
                    && evt.SessionInfo.UsageWindows.Count > 0)
                {
                    BroadcastUsage(tab, evt.SessionInfo);
                }
            }));
#pragma warning restore VSTHRD001
        }

        /// <summary>把额度快照广播给其余 tab。</summary>
        private void BroadcastUsage(AgentChatTab source, AgentSessionInfo info)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            var payload = new UsagePayload
            {
                UsageWindows = info.UsageWindows,
                UsageRawText = info.UsageRawText
            };

            foreach (AgentChatTab tab in _tabs)
            {
                if (ReferenceEquals(tab, source))
                {
                    continue;
                }

                tab.Bridge?.PostUsage(payload);
            }
        }

        private void OnClientReady(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            AgentChatTab? tab = TabOf(sender);

            if (tab == null)
            {
                return;
            }

            tab.ClientReady = true;

            // 界面真的活过来了（不管是首次还是拖动后重建），重建预算还原。
            tab.RebuildPolicy.NoteWebViewLive();
            PanelDiagnostics.Log("前端已挂载（ready）");

            PostCurrentTheme();

            // 这个 tab 的前端刚挂载，它手上还没有 tab 条。签名没变时 PushTabs 会跳过，
            // 所以这里直接对它单推一份。
            var snapshots = new List<ChatTabSnapshot>();

            foreach (AgentChatTab each in _tabs)
            {
                snapshots.Add(each.ToSnapshot());
            }

            tab.Bridge?.PostTabs(new ChatTabListPayload
            {
                Tabs = snapshots,
                // 理由同 PushTabs：必须走带兜底的 ActiveTab，不能直读 _activeTabId。
                ActiveId = ActiveTab?.Id ?? string.Empty
            });

            StartAgentProcess(tab);
            FlushPendingContext(tab);
        }

        private void StartAgentProcess(AgentChatTab tab)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            if (tab.Session == null || tab.Bridge == null || tab.AgentStarted)
            {
                return;
            }

            tab.AgentStarted = true;

            // StartSession() 里做接回判定时用的那个目录，等会儿要跟这里比对。
            string decisionDirectory = _workingDirectory;

            bool located = WorkspaceLocator.TryGetWorkspaceDirectory(out string directory);
            _workingDirectory = directory;

            _workspaceIndex.EnsureBuilt(_workingDirectory);

            // 面板比解决方案先开时，上面那条 tab 条是按兜底目录恢复的，真目录这一刻才拿得到。
            bool reRestored = ReRestoreTabs();

            // 起进程这一刻的目录才是权威——CLI 子进程真正的工作目录由它决定。
            // WebView2 导航与前端 ready 往返之间，解决方案可能还在异步加载：
            // 带着旧目录做出的接回判定硬起，会把 A 目录的会话接到 B 目录去，还一声不吭。
            //
            // 重恢复过也必须重判一次：这个 tab 刚认领到会话 id，而当前这条会话是不带
            // --resume 建的（判定时它还是个空 tab），不重建就等于记录读回来了却没接上。
            if (reRestored
                || !string.Equals(decisionDirectory, _workingDirectory, StringComparison.OrdinalIgnoreCase))
            {
                ReconcileWorkingDirectoryChange(tab, decisionDirectory, reRestored);
            }

            tab.Session!.Start(_workingDirectory);

            // 跑在兜底目录上必须说出来：代理读写的是这个目录，用户以为是当前解决方案，
            if (!located)
            {
                tab.Bridge.PostNotice(
                    NoticeText.WorkspaceFallback, NoticeText.Args("path", _workingDirectory));
            }
        }

        /// <summary>
        /// 工作目录在「做接回判定」（<see cref="StartSession"/>）与「真正起进程」
        /// （<see cref="StartAgentProcess"/>）之间变了：多半是本扩展随 VS 启动自动打开时，
        /// 解决方案还没加载完，第一次解析落空或解到了上一个解决方案。
        /// 按新目录重新判定一次，不能带着可能错的旧判定继续走。
        /// </summary>
        private void ReconcileWorkingDirectoryChange(
            AgentChatTab tab, string previousDirectory, bool reRestored)
        {
            if (tab.Session == null || tab.Bridge == null)
            {
                return;
            }

            // 判据同 StartSession：按 tab 自己记的 id 重新校验，不能按（校正后的）目录去
            // _lastSessionStore.Read——那读到的是目录记录里「激活」那条，跟这个 tab 未必是同一个。
            string candidate = tab.SessionId;
            SessionResumeTarget target = SessionResumeDecision.Resolve(
                SessionHistoryReader.DefaultTranscriptRoot(), _workingDirectory, candidate);

            tab.ResumeOrigin = target.CanResume ? ResumeOrigin.Reconcile : ResumeOrigin.None;

            tab.Session.Received -= OnSessionEventForStore;
            tab.Session.StartupFailed -= OnSessionStartupFailed;
            tab.Session.Dispose();

            tab.Session = CreateSession(tab, target.CanResume ? target.SessionId : null);
            tab.Session.Received += OnSessionEventForStore;
            tab.Session.StartupFailed += OnSessionStartupFailed;

            tab.Bridge.ReplaceSession(tab.Session);

            // 旧目录判定时预置进桥的回放（如果有）已经在前端 ready 时发出去了，
            // 属于另一个目录的会话，不能悄悄留着——连同新历史一起整份换掉。
            // 这里必须用 ReseedLog 而不是 SeedLog：前端早在 ready 时就挂载完了，
            // 只往日志里塞不推，界面还是空的——「接回了但什么都没画出来」正是这条路上的老坑。
            tab.Bridge.ReseedLog(target.CanResume
                ? ComposeReplayEvents(target)
                : new AgentEvent[0]);

            if (!target.CanResume && candidate.Length > 0)
            {
                // 记录里有 id 却接不回来，理由同 StartSession 里那段：不出声的话，用户看到的是
                // tab 条恢复了、点进去一片空白，而 CLI 起得好好的，自愈那套根本不会触发。
                tab.Bridge.PostNotice(
                    NoticeText.ResumeTranscriptGone,
                    NoticeText.Args("id", candidate.Substring(0, Math.Min(8, candidate.Length))));
            }

            if (reRestored)
            {
                // 重恢复可能补出了新的懒启动 tab，前端还没见过它们。
                PushTabs();
                return;
            }

            tab.Bridge.PostNotice(NoticeText.WorkspaceChanged, NoticeText.Args(
                "from", previousDirectory,
                "to", _workingDirectory));
        }

        /// <summary>
        /// 接回起不来就退回新会话。只在当前这条会话是带 --resume 建的才触发——
        /// 回退出来的新会话是 <see cref="ResumeOrigin.None"/>，它自己再起不来属于普通启动失败
        /// （比如 claude.exe 本身坏了、参数错），不能再当成「接回失败」去重启，否则会来回循环。
        /// </summary>
        private void OnSessionStartupFailed(object sender, EventArgs e)
        {
            // 事件来自读取线程，回到 UI 线程再动会话与桥。
            // VSTHRD001 建议改用 SwitchToMainThreadAsync——但这是个同步事件处理器，
            // 没有可 await 的上下文，就地压掉。
#pragma warning disable VSTHRD001
            _ = Dispatcher.BeginInvoke(new Action(() =>
            {
                AgentChatTab? tab = TabOf(sender);

                if (tab == null)
                {
                    return;
                }

                // 不管接下来是否会自动退回新会话重试，先把「崩了」标出来——用户切进去
                // 能看到原因（设计文档 §11：「后台 tab 崩了：tab 头标出来，切进去能看到原因」）。
                tab.Failed = true;
                PushTabs();

                if (!ResumeFallbackPolicy.ShouldFallback(tab.ResumeOrigin)
                    || tab.Bridge == null || tab.Session == null)
                {
                    return;
                }

                string notice = ResumeFallbackPolicy.DescribeNotice(tab.ResumeOrigin);

                tab.Session.Received -= OnSessionEventForStore;
                tab.Session.StartupFailed -= OnSessionStartupFailed;
                tab.Session.Dispose();

                tab.Session = CreateSession(tab, resumeSessionId: null);
                tab.ResumeOrigin = ResumeOrigin.None;
                tab.Session.Received += OnSessionEventForStore;
                tab.Session.StartupFailed += OnSessionStartupFailed;

                tab.Bridge.ReplaceSession(tab.Session);
                tab.Session.Start(_workingDirectory);

                tab.Bridge.PostNotice(notice);
            }));
#pragma warning restore VSTHRD001
        }

        private void OnOpenFileRequested(object sender, OpenFileRequest request)
        {
            AgentChatTab? tab = TabOf(sender);

            _ = ThreadHelper.JoinableTaskFactory.RunAsync(async () =>
            {
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();

                string? resolved = FilePathResolver.Resolve(
                    request.Path, _workingDirectory, System.IO.File.Exists);

                if (resolved == null)
                {
                    // 用户是**点了一下**才走到这里的，静默返回就是「点了没反应」。
                    // 代理提到的路径可能压根不存在（说的是别的仓库、或是它随口编的名字），
                    // 这时要说出来，而不是让那一下点击石沉大海。
                    tab?.Bridge?.PostNotice(
                        NoticeText.OpenFileMissing, NoticeText.Args("path", request.Path));
                    return;
                }

                FileOpener.Open(resolved, request.Line);
            });
        }

        #region 挑文件与拖拽

        private IReadOnlyList<string> PickFiles()
        {
            if (_filePickInProgress)
            {
                return Array.Empty<string>();
            }

            _filePickInProgress = true;

            try
            {
                var dialog = new Microsoft.Win32.OpenFileDialog
                {
                    Title = "选择要引用的文件",
                    Multiselect = true,
                    CheckFileExists = true,
                    InitialDirectory = System.IO.Directory.Exists(_workingDirectory) ? _workingDirectory : ""
                };

                bool? ok = dialog.ShowDialog();

                if (ok != true)
                {
                    return Array.Empty<string>();
                }

                return dialog.FileNames ?? Array.Empty<string>();
            }
            finally
            {
                _filePickInProgress = false;
            }
        }

        private void OnPanelDragOver(object sender, DragEventArgs e)
        {
            bool hasFiles = e.Data != null && e.Data.GetDataPresent(DataFormats.FileDrop);

            e.Effects = hasFiles ? DragDropEffects.Copy : DragDropEffects.None;
            e.Handled = true;
        }

        private void OnPanelDrop(object sender, DragEventArgs e)
        {
            e.Handled = true;

            if (e.Data == null || !e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                return;
            }

            if (!(e.Data.GetData(DataFormats.FileDrop) is string[] paths) || paths.Length == 0)
            {
                return;
            }

            var files = new List<string>();

            foreach (string path in paths)
            {
                if (!string.IsNullOrWhiteSpace(path) && System.IO.File.Exists(path))
                {
                    files.Add(path);
                }
            }

            if (files.Count == 0)
            {
                return;
            }

            ActiveTab?.Bridge?.PostDroppedFiles(files);
        }

        #endregion

        /// <summary>把 VS 侧收集到的上下文送进输入框。</summary>
        public void InsertContext(string kind, string text)
        {
            if (string.IsNullOrEmpty(text))
            {
                return;
            }

            AgentChatTab? tab = ActiveTab;

            if (tab == null)
            {
                return;
            }

            // 判断依据必须是「前端已就绪」，不是「桥已建」：桥在 StartSession() 里就赋值了，
            if (!tab.ClientReady || tab.Bridge == null)
            {
                tab.PendingContext.Add((kind, text));
                return;
            }

            tab.Bridge.PostContext(kind, text);
        }

        private void FlushPendingContext(AgentChatTab tab)
        {
            if (tab.Bridge == null || tab.PendingContext.Count == 0)
            {
                return;
            }

            foreach ((string Kind, string Text) item in tab.PendingContext)
            {
                tab.Bridge.PostContext(item.Kind, item.Text);
            }

            tab.PendingContext.Clear();
        }

        private void OnVsThemeChanged(ThemeChangedEventArgs e)
        {
            _ = ThreadHelper.JoinableTaskFactory.RunAsync(async () =>
            {
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
                PostCurrentTheme();
            });
        }

        private void PostCurrentTheme()
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            IReadOnlyDictionary<string, string> tokens = VsThemeReader.ReadCurrentTheme();

            // 广播给所有活着的桥：后台 tab 的前端也在跑，主题不同步的话切回去是旧配色。
            foreach (AgentChatTab tab in _tabs)
            {
                tab.Bridge?.PostTheme(tokens);
            }
        }

        private ClaudeStreamJsonSession CreateSession(AgentChatTab tab, string? resumeSessionId)
        {
            ClaudeStreamJsonSession session = CreateSession(tab, resumeSessionId, false);
            return session;
        }

        private ClaudeStreamJsonSession CreateSession(AgentChatTab tab, string? resumeSessionId, bool fork)
        {
            var options = new ClaudeSessionOptions
            {
                ExecutablePath = _executablePath,
                PermissionMode = tab.PermissionMode,
                Model = tab.Model,
                Effort = tab.Effort
            };

            if (string.IsNullOrEmpty(resumeSessionId))
            {
                options.SessionId = Guid.NewGuid().ToString();
            }
            else
            {
                // --resume 与 --session-id 互斥，只能设其一。
                options.ResumeSessionId = resumeSessionId!;
                options.ForkSession = fork;
            }

            var session = new ClaudeStreamJsonSession(options, () => new JsonLineProcessHost());
            return session;
        }

        private void OnEscapeUnhandled(object sender, EventArgs e)
        {
            DocumentFocus.ActivateActiveDocument();
        }

        private void OnSessionResumeRequested(object sender, SessionResumeRequest request)
        {
            AgentChatTab? tab = TabOf(sender);

            if (tab == null || tab.Bridge == null || tab.Session == null || request == null)
            {
                return;
            }

            // 两个进程同时 --resume 同一条会话会互相覆盖转录文件，所以要挡；
            // 但 --fork-session 开的是一条新会话 id、写的是新转录文件，不存在这个问题——
            // 而且这正是「把同一条会话在第二个 tab 里再开一份」的正当入口，不能被这道守卫拦掉。
            if (!request.Fork)
            {
                foreach (AgentChatTab other in _tabs)
                {
                    if (ReferenceEquals(other, tab))
                    {
                        continue;
                    }

                    if (string.Equals(other.SessionId, request.SessionId, StringComparison.OrdinalIgnoreCase))
                    {
                        tab.Bridge?.PostNotice(
                            NoticeText.SessionAlreadyOpen, NoticeText.Args("title", other.Title));
                        ActivateTab(other.Id);
                        return;
                    }
                }
            }

            tab.Session.Received -= OnSessionEventForStore;
            tab.Session.StartupFailed -= OnSessionStartupFailed;
            tab.Session.Dispose();

            tab.Session = CreateSession(tab, request.SessionId, request.Fork);
            tab.ResumeOrigin = ResumeOrigin.Manual;
            tab.Session.Received += OnSessionEventForStore;
            tab.Session.StartupFailed += OnSessionStartupFailed;

            tab.Bridge.ReplaceSession(tab.Session);
            tab.Session.Start(_workingDirectory);

            string template = request.Fork ? NoticeText.SessionForked : NoticeText.SessionResumed;
            tab.Bridge.PostNotice(template, NoticeText.Args("id", request.SessionId));
        }

        /// <summary>
        /// 丢掉当前会话，开一条干净的（自动接回之后的逃生口）。
        ///
        /// 不带 --resume：新会话与 <see cref="ResumeOrigin.None"/> 一样，
        /// 起不来就是普通启动失败，不会被 <see cref="ResumeFallbackPolicy"/> 当成「接回失败」再退一次。
        /// </summary>
        private void OnNewSessionRequested(object sender, EventArgs e)
        {
            AgentChatTab? tab = TabOf(sender);

            if (tab == null || tab.Bridge == null || tab.Session == null)
            {
                return;
            }

            tab.Session.Received -= OnSessionEventForStore;
            tab.Session.StartupFailed -= OnSessionStartupFailed;
            tab.Session.Dispose();

            tab.Session = CreateSession(tab, resumeSessionId: null);
            tab.ResumeOrigin = ResumeOrigin.None;
            tab.Session.Received += OnSessionEventForStore;
            tab.Session.StartupFailed += OnSessionStartupFailed;

            tab.Bridge.ReplaceSession(tab.Session);

            // 先 Dispose 旧会话再 ResetLog，但这个顺序本身并不足以让「界面归零」这个承诺
            // 立得住：Dispose 只挡得住旧会话此后再产生新事件，挡不住此刻已经进了
            // WebViewBridge 内部 DeltaCoalescer 缓冲区、还没被 16ms 定时器冲刷出去的
            // 残留文本——ResetLog 原先只清事件日志并回放，从不碰合并器的缓冲。
            // 已经在 WebViewBridge.ResetLog 里补上丢弃缓冲这一步（见 DeltaCoalescer.Discard），
            // 这里按既有顺序调用即可，不需要再单独处理。
            tab.Bridge.ResetLog();

            tab.Session.Start(_workingDirectory);
            tab.Bridge.PostNotice(NoticeText.NewSession);
        }

        private void OnPermissionModeChangeRequested(object sender, string mode)
        {
            AgentChatTab? tab = TabOf(sender);

            if (tab == null || string.Equals(mode, tab.PermissionMode, StringComparison.Ordinal))
            {
                return;
            }

            tab.PermissionMode = mode;
            RestartSession(tab, DescribeMode(mode));
        }

        private void OnSubcommandRequested(object sender, ClaudeSubcommand subcommand)
        {
            WebViewBridge? bridge = TabOf(sender)?.Bridge;

            if (bridge == null || string.IsNullOrEmpty(_executablePath))
            {
                return;
            }

            _ = ThreadHelper.JoinableTaskFactory.RunAsync(async () =>
            {
                string output = await _subcommandRunner
                    .RunAsync(_executablePath, subcommand, _workingDirectory, _shutdownCts.Token)
                    .ConfigureAwait(false);

                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();

                bridge?.PostRawNotice(output);
            });
        }

        private void OnModelChangeRequested(object sender, string model)
        {
            AgentChatTab? tab = TabOf(sender);

            if (tab == null)
            {
                return;
            }

            // 用 /model 运行时切换，**不重启进程**。
            tab.Model = model;
            tab.Session?.Send($"/model {model}");
        }

        private void OnEffortChangeRequested(object sender, string effort)
        {
            AgentChatTab? tab = TabOf(sender);

            if (tab == null)
            {
                return;
            }

            tab.Effort = effort;
            tab.Session?.Send($"/effort {effort}");
        }

        /// <summary>换权限模式要重起进程；<paramref name="mode"/> 是给用户看的说法。</summary>
        private void RestartSession(AgentChatTab tab, string mode)
        {
            if (tab.Bridge == null || tab.Session == null)
            {
                return;
            }

            // 用 SessionId 而不是 ResumableSessionId：后者要等 TurnCompleted 才有值，
            // 于是「刚开面板就切权限模式」或「上一轮被 Esc 中断」会静默丢掉上下文，
            // 而屏幕上的记录还挂着，界面在骗人。SessionId 为空时才退回 ResumableSessionId。
            string candidate = tab.Session.SessionId.Length > 0
                ? tab.Session.SessionId
                : tab.Session.ResumableSessionId;

            SessionResumeTarget target = SessionResumeDecision.Resolve(
                SessionHistoryReader.DefaultTranscriptRoot(), _workingDirectory, candidate);

            tab.Session.Received -= OnSessionEventForStore;
            tab.Session.StartupFailed -= OnSessionStartupFailed;
            tab.Session.Dispose();

            tab.Session = CreateSession(tab, target.CanResume ? target.SessionId : null);
            tab.ResumeOrigin = target.CanResume ? ResumeOrigin.Restart : ResumeOrigin.None;
            tab.Session.Received += OnSessionEventForStore;
            tab.Session.StartupFailed += OnSessionStartupFailed;

            tab.Bridge.ReplaceSession(tab.Session);
            tab.Session.Start(_workingDirectory);

            string template = target.CanResume
                ? NoticeText.PermissionRestartKept
                : NoticeText.PermissionRestartFresh;

            tab.Bridge.PostNotice(template, NoticeText.Args("mode", mode));
        }

        private static string DescribeMode(string mode)
        {
            switch (mode)
            {
                case "acceptEdits":
                    return NoticeText.ModeAcceptEdits;
                case "auto":
                    return NoticeText.ModeAuto;
                case "bypassPermissions":
                    return NoticeText.ModeBypassPermissions;
                case "manual":
                    return NoticeText.ModeManual;
                case "dontAsk":
                    return NoticeText.ModeDontAsk;
                case "plan":
                    return NoticeText.ModePlan;
                case ClaudeSessionOptions.DangerouslySentinel:
                    return NoticeText.ModeDangerously;
                default:
                    return mode;
            }
        }

        /// <summary>拆掉一个 tab 的全部运行时资源。懒启动的 tab 没有这些对象，逐个判空即可，不会漏。</summary>
        private void DisposeTab(AgentChatTab tab)
        {
            if (tab.Bridge != null)
            {
                tab.Bridge.OutboundFailed -= OnBridgeOutboundFailed;
                tab.Bridge.PermissionModeChangeRequested -= OnPermissionModeChangeRequested;
                tab.Bridge.ModelChangeRequested -= OnModelChangeRequested;
                tab.Bridge.SubcommandRequested -= OnSubcommandRequested;
                tab.Bridge.EffortChangeRequested -= OnEffortChangeRequested;
                tab.Bridge.ClientReady -= OnClientReady;
                tab.Bridge.OpenFileRequested -= OnOpenFileRequested;
                tab.Bridge.SessionResumeRequested -= OnSessionResumeRequested;
                tab.Bridge.EscapeUnhandled -= OnEscapeUnhandled;
                tab.Bridge.NewSessionRequested -= OnNewSessionRequested;
                tab.Bridge.TabCreateRequested -= OnTabCreateRequested;
                tab.Bridge.TabActivateRequested -= OnTabActivateRequested;
                tab.Bridge.TabCloseRequested -= OnTabCloseRequested;
                tab.Bridge.UiPrefsChanged -= OnUiPrefsChanged;
            }

            if (tab.Session != null)
            {
                tab.Session.Received -= OnSessionEventForStore;
                tab.Session.StartupFailed -= OnSessionStartupFailed;
            }

            tab.Bridge?.Dispose();
            tab.Session?.Dispose();
            tab.Bridge = null;
            tab.Session = null;

            DetachWebView(tab);
        }

        /// <summary>
        /// 把 tab 名下这块 WebView2 摘掉、置空并释放——不管它是初始化失败留下的半成品
        /// （见 <see cref="InitializeWebViewAsync"/> 的 catch 分支）还是整个 tab 被正常关闭
        /// （见 <see cref="DisposeTab"/>），要做的都是同一件事，抽出来一份，别维护两套。
        /// </summary>
        private void DetachWebView(AgentChatTab tab)
        {
            WebView2? view = tab.WebView;
            tab.WebView = null;
            tab.WebViewReady = false;

            if (view == null)
            {
                return;
            }

            view.KeyDown -= OnWebViewKeyDown;
            WebViewHost.Children.Remove(view);

            try
            {
                view.Dispose();
            }
            catch (Exception)
            {
                // 控制器多半已经死了，Dispose 抛什么都无所谓：目的只是把宿主子窗口收掉。
            }
        }

        /// <summary>关闭会话并释放桥。</summary>
        public void ShutdownSession()
        {
            _shutDown = true;

            // 取消在跑的子命令，否则那些 claude.exe 会跑到自己超时才退，成为无主进程。
            try
            {
                _shutdownCts.Cancel();
            }
            catch (Exception)
            {
                // 已释放时才会抛，那种情况下也没什么要取消的。
            }

            VSColorTheme.ThemeChanged -= OnVsThemeChanged;

            foreach (AgentChatTab tab in _tabs)
            {
                DisposeTab(tab);
            }

            _tabs.Clear();
            _activeTabId = string.Empty;

            PresentationSource.RemoveSourceChangedHandler(this, OnPanelSourceChanged);

            if (_environment != null)
            {
                _environment.BrowserProcessExited -= OnBrowserProcessExited;
                _environment = null;
            }
        }

        #endregion
    }
}
