// 市场截图用的演示对话：开发服务器下经 window.__agentDevHost 灌进前端，不连 CLI、不计费。
// 用法见 screenshots/README.md。
(function ()
{
  const T0 = Date.now() - 6 * 60000;
  const ROOT = 'F:\\Repos\\Contoso';

  const TEXT = {
    en: {
      tabs: ['Fix coupon discount', 'Checkout API refactor'],
      usage: ['Current session', 'Current week (all models)', 'Current week (Fable)'],
      ask1: 'Orders with two coupons are charged the full price. Find out why and fix it, then run the tests.',
      think1: 'The total ignores the second coupon. Look at how the pricing service applies coupons first.',
      found: '`ApplyCoupons` returns inside the loop, so only the first coupon is ever applied. Moving the `return` out of the loop fixes it.',
      testDesc: 'Run the order tests',
      done1: 'Fixed. Both coupons now apply, and all **48 tests pass**.\n\n| File | Change |\n|---|---|\n| [PricingService.cs](src/Contoso.Orders/PricingService.cs#L42) | `return` moved out of the coupon loop |\n\nWant me to add a test for stacked coupons?',
      ask2: 'Yes, add the test. And have a subagent check the other discount paths for the same bug.',
      think2: 'Write the test first, then send a subagent through the rest of the discount code.',
      agentDesc: 'Audit discount paths',
      agentPrompt: 'Find every place in src/Contoso.Orders that applies a discount, and report any loop that stops after the first item.',
      ask0: 'Where is the order total calculated?',
      done0: 'In [PricingService.cs](src/Contoso.Orders/PricingService.cs#L30): `Total()` adds up the lines, then hands the result to `ApplyCoupons`.',
      summary: 'The user asked where order totals are calculated and why stacked coupons were ignored. PricingService.ApplyCoupons returned inside its loop; the return was moved out and all 48 tests pass. Next: add a test for two coupons and audit the other discount paths.',
      remoteUrl: 'https://claude.ai/code/session_01Hk3vX9',
      groups: ['Checkout', 'CI'],
      sessions: ['Add rate limiting to the public API', 'Why does the nightly build fail on ARM64?', 'Flaky integration test in OrderQueue', 'Upgrade to .NET 10', 'Draft release notes for 3.2'],
    },
    zh: {
      tabs: ['修复优惠券折扣', '重构结账接口'],
      usage: ['Current session', 'Current week (all models)', 'Current week (Fable)'],
      ask1: '用两张优惠券的订单被按原价收费了。查一下原因并修好，然后跑测试。',
      think1: '总价漏掉了第二张优惠券。先看定价服务是怎么套用优惠券的。',
      found: '`ApplyCoupons` 在循环里面就 `return` 了，所以永远只用上第一张券。把 `return` 挪到循环外面就好。',
      testDesc: '运行订单测试',
      done1: '修好了。两张券都会生效，**48 个测试全部通过**。\n\n| 文件 | 改动 |\n|---|---|\n| [PricingService.cs](src/Contoso.Orders/PricingService.cs#L42) | 把 `return` 挪出优惠券循环 |\n\n要不要再补一个叠加优惠券的测试？',
      ask2: '要，把测试加上。再派个子代理查一下别的折扣逻辑有没有同样的问题。',
      think2: '先写测试，再派子代理把其余折扣代码过一遍。',
      agentDesc: '排查折扣逻辑',
      agentPrompt: '找出 src/Contoso.Orders 里所有计算折扣的地方，报告任何处理完第一项就提前退出的循环。',
      ask0: '订单总价是在哪里算的？',
      done0: '在 [PricingService.cs](src/Contoso.Orders/PricingService.cs#L30)：`Total()` 先把各行加起来，再交给 `ApplyCoupons`。',
      summary: '用户先问订单总价在哪里计算，又报告叠加优惠券不生效。原因是 PricingService.ApplyCoupons 在循环里提前 return；已挪到循环外，48 个测试全部通过。下一步：补两张券的测试，并排查其余折扣逻辑。',
      remoteUrl: 'https://claude.ai/code/session_01Hk3vX9',
      groups: ['结账', 'CI'],
      sessions: ['给公开接口加限流', '夜间构建为什么在 ARM64 上失败？', 'OrderQueue 集成测试时好时坏', '升级到 .NET 10', '起草 3.2 版更新说明'],
    },
  };

  const SOURCE = [
    'public decimal ApplyCoupons(decimal total, IReadOnlyList<Coupon> coupons)',
    '{',
    '    foreach (Coupon coupon in coupons)',
    '    {',
    '        total -= coupon.Discount(total);',
    '        return Math.Max(total, 0m);',
    '    }',
    '    return total;',
    '}',
  ].map((line, i) => `${String(i + 40).padStart(4)}\t${line}`).join('\n');

  const OLD = '        foreach (Coupon coupon in coupons)\n        {\n            total -= coupon.Discount(total);\n            return Math.Max(total, 0m);\n        }\n        return total;';
  const NEW = '        foreach (Coupon coupon in coupons)\n        {\n            total -= coupon.Discount(total);\n        }\n        return Math.Max(total, 0m);';

  function host()
  {
    return window.__agentDevHost;
  }

  function send(type, payload)
  {
    host().emit({ type, payload });
  }

  function ev(kind, at, extra)
  {
    return Object.assign({
      kind,
      content: '',
      sessionInfo: null,
      toolCall: null,
      usageData: null,
      turnResult: null,
      rateLimitData: null,
      hookName: '',
      hookPhase: '',
      atUnixMs: at,
    }, extra || {});
  }

  function event(kind, at, extra)
  {
    send('event', ev(kind, at, extra));
  }

  function tool(id, name, input, extra)
  {
    return Object.assign({ toolUseId: id, name, inputJson: JSON.stringify(input), resultText: '', isError: false, parentToolUseId: '' }, extra || {});
  }

  function toolRun(at, call, result, ms)
  {
    event('ToolCallStarted', at, { toolCall: call });
    event('ToolCallCompleted', at + ms, { toolCall: Object.assign({}, call, { resultText: result }) });
  }

  function usage(inTok, outTok, ms)
  {
    return { inputTokens: inTok, outputTokens: outTok, cacheReadTokens: 41200, cacheCreationTokens: 2300, costUsd: Math.round(inTok / 1000 * 0.9) / 100, durationMs: ms, cacheTtl: '1h' };
  }

  /** 主题、tab 条、额度、会话信息：每个场景都先铺这一层。 */
  function setup(lang)
  {
    const t = TEXT[lang];
    send('theme', {
      background: '#1f1f1f', foreground: '#dcdcdc', border: '#3c3c3c',
      accent: '#3b8eea', 'accent-text': '#ffffff', 'background-alt': '#272727', scheme: 'dark',
    });
    send('tabs', {
      tabs: [
        { id: 'a', title: t.tabs[0], busy: false, unread: false, failed: false },
        { id: 'b', title: t.tabs[1], busy: false, unread: true, failed: false },
      ],
      activeId: 'a',
    });
    event('SessionStarted', T0, {
      sessionInfo: {
        sessionId: '7c2f9e1a-4b6d-4f0e-9a51-3d8e2c7b1f40', model: 'claude-opus-5-5', cwd: ROOT, permissionMode: 'acceptEdits',
        cliVersion: '2.4.1', tools: ['Read', 'Edit', 'Bash', 'Grep', 'Glob', 'Agent'], slashCommands: ['compact', 'review', 'memory', 'resume'],
        slashCommandInfos: [], terminalSlashCommands: [], skills: [], subAgents: ['Explore', 'general-purpose'],
        mcpServers: [{ name: 'github', status: 'connected' }], capabilities: [],
        models: [],
        subscriptionType: 'Claude Max', effortLevel: 'high', availableModels: ['default', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'], usageWindows: [], usageRawText: '',
      },
    });
    const now = Math.floor(Date.now() / 1000);
    send('usage', {
      usageWindows: [
        { label: t.usage[0], percentUsed: 34, resetsAtText: '', resetsAtUnix: now + 3 * 3600 + 20 * 60, model: '' },
        { label: t.usage[1], percentUsed: 21, resetsAtText: '', resetsAtUnix: now + 4 * 86400, model: '' },
        { label: t.usage[2], percentUsed: 6, resetsAtText: '', resetsAtUnix: now + 4 * 86400, model: 'Fable' },
      ],
      usageRawText: '',
    });
  }

  /** 第一轮：查、读、改、跑测试、汇报。 */
  function turnFix(lang, at)
  {
    const t = TEXT[lang];
    event('UserPrompt', at, { content: t.ask1 });
    event('Thinking', at + 1000, { content: t.think1 });
    toolRun(at + 5000, tool('g1', 'Grep', { pattern: 'ApplyCoupons', path: 'src' }), 'src/Contoso.Orders/PricingService.cs\nsrc/Contoso.Orders/Cart.cs', 400);
    toolRun(at + 6000, tool('r1', 'Read', { file_path: `${ROOT}\\src\\Contoso.Orders\\PricingService.cs` }), SOURCE, 200);
    event('AssistantText', at + 9000, { content: t.found });
    toolRun(at + 11000, tool('e1', 'Edit', { file_path: `${ROOT}\\src\\Contoso.Orders\\PricingService.cs`, old_string: OLD, new_string: NEW }), 'The file has been updated.', 300);
    toolRun(at + 12000, tool('b1', 'Bash', { command: 'dotnet test tests/Contoso.Orders.Tests --nologo', description: t.testDesc }),
      'Build succeeded.\n\nPassed!  - Failed:     0, Passed:    48, Skipped:     0, Total:    48, Duration: 2 s - Contoso.Orders.Tests.dll (net8.0)', 9000);
    event('AssistantText', at + 23000, { content: t.done1 });
    event('UsageUpdated', at + 24000, { usageData: usage(52800, 1240, 24000) });
    event('TurnCompleted', at + 24000, { turnResult: { usage: usage(52800, 1240, 24000), wasInterrupted: false, permissionDenials: [] } });
  }

  /** 一问一答的短轮次，给吸顶栏和压缩场景垫底。 */
  function turnAsk(lang, at)
  {
    const t = TEXT[lang];
    event('UserPrompt', at, { content: t.ask0 });
    toolRun(at + 2000, tool('g0', 'Grep', { pattern: 'decimal Total', path: 'src' }), 'src/Contoso.Orders/PricingService.cs', 300);
    event('AssistantText', at + 4000, { content: t.done0 });
    event('TurnCompleted', at + 5000, { turnResult: { usage: usage(31000, 210, 5000), wasInterrupted: false, permissionDenials: [] } });
  }

  /** 第二轮进行中：子代理在跑，底部是「思考中」。用户那句由 Playwright 从输入框真的发出去。 */
  function turnLive(lang)
  {
    const t = TEXT[lang];
    const at = Date.now() - 14000;
    event('Thinking', at, { content: t.think2 });
    toolRun(at + 3000, tool('w1', 'Write', {
      file_path: `${ROOT}\\tests\\Contoso.Orders.Tests\\StackedCouponTests.cs`,
      content: '[Fact]\npublic void TwoCouponsBothApply()\n{\n    var pricing = new PricingService();\n    decimal total = pricing.ApplyCoupons(100m, [Coupon.Percent(10), Coupon.Fixed(5)]);\n    Assert.Equal(85m, total);\n}',
    }), 'File created.', 200);
    event('ToolCallStarted', at + 5000, { toolCall: tool('a1', 'Agent', { description: t.agentDesc, prompt: t.agentPrompt, subagent_type: 'Explore' }) });
    toolRun(at + 6000, tool('a1g', 'Grep', { pattern: 'Discount\\(', path: 'src/Contoso.Orders' }, { parentToolUseId: 'a1' }),
      'src/Contoso.Orders/PricingService.cs\nsrc/Contoso.Orders/LoyaltyService.cs\nsrc/Contoso.Orders/BundleRules.cs', 300);
    event('ToolCallStarted', at + 8000, { toolCall: tool('a1r', 'Read', { file_path: `${ROOT}\\src\\Contoso.Orders\\LoyaltyService.cs` }, { parentToolUseId: 'a1' }) });
  }

  function compaction(phase, extra)
  {
    return Object.assign({ phase, trigger: 'manual', preTokens: 0, postTokens: 0, durationMs: 0, boundaryUuid: '', summary: '', error: '' }, extra || {});
  }

  window.__demo = {
    /** 主图：做完的一轮 + 正在跑的一轮之前的状态。 */
    hero(lang)
    {
      setup(lang);
      turnAsk(lang, T0 + 60000);
      turnFix(lang, T0 + 120000);
    },
    live(lang)
    {
      turnLive(lang);
    },
    /** 压缩：两轮对话后手动 /compact，带摘要。 */
    compact(lang)
    {
      const t = TEXT[lang];
      setup(lang);
      turnAsk(lang, T0 + 60000);
      turnFix(lang, T0 + 120000);
      const at = T0 + 300000;
      event('UserPrompt', at, { content: '/compact' });
      event('Compaction', at + 500, { compactionData: compaction('started') });
      event('Compaction', at + 41000, { compactionData: compaction('completed', { preTokens: 128400, postTokens: 12700, durationMs: 40500, boundaryUuid: 'b1' }) });
      event('Compaction', at + 41500, { compactionData: compaction('summary', { boundaryUuid: 'b1', summary: t.summary }) });
      event('TurnCompleted', at + 42000, { turnResult: { usage: null, wasInterrupted: false, permissionDenials: [] } });
    },
    /** 远程控制已开启。 */
    remote(lang)
    {
      const t = TEXT[lang];
      event('RemoteControlChanged', Date.now(), { remoteControlData: { state: 'connected', detail: '', sessionUrl: t.remoteUrl } });
    },
    /** 会话管理弹窗的列表：要先由页面发出 panelOpen，用它的 requestId 回包。 */
    sessions(lang)
    {
      const t = TEXT[lang];
      const request = window.__sent.filter((m) => m.type === 'panelOpen' && m.panelId === 'sessions').pop();
      const now = Date.now();
      const H = 3600000;
      const item = (id, title, branch, group, ago, extra) => ({
        id, title, subtitle: '', enabled: true, detail: '', currentProject: true,
        fields: Object.assign({ branch, group, lastActivityMs: String(now - ago), live: '0', archived: '0' }, extra || {}),
      });
      send('panelData', {
        panelId: 'sessions',
        requestId: request.requestId,
        groups: [{ id: 'g1', name: t.groups[0] }, { id: 'g2', name: t.groups[1] }],
        items: [
          item('7c2f9e1a-4b6d-4f0e-9a51-3d8e2c7b1f40', t.tabs[0], 'fix/coupons', 'g1', 60000, { live: '1' }),
          item('s2', t.tabs[1], 'feature/checkout-v2', 'g1', 0.5 * H, { live: '1' }),
          item('s3', t.sessions[0], 'feature/rate-limit', 'g1', 26 * H),
          item('s4', t.sessions[1], 'main', 'g2', 3 * H),
          item('s5', t.sessions[2], 'main', 'g2', 50 * H),
          item('s6', t.sessions[3], 'chore/net10', '', 4 * 24 * H),
          item('s7', t.sessions[4], 'main', '', 6 * 24 * H),
          item('s8', 'GraphQL gateway spike', 'spike/graphql', '', 30 * 24 * H, { archived: '1' }),
        ],
        error: '',
        rawText: '',
        restartHint: false,
      });
    },
    text: TEXT,
  };
})();
