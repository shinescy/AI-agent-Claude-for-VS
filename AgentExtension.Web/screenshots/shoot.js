// 市场截图：先 `npx vite` 起开发服务器，再用 Playwright MCP 的 browser_run_code_unsafe 以 filename 运行本文件。
// 中英两套输出到 marketplace/images（中文带 -zh 后缀）。演示内容在 demo.js。
async (page) =>
{
  const OUT = 'F:/WrokSpace/NET/VSExtensions/AgentExtension/AgentExtension/marketplace/images/';
  const WIDTH = 720;

  async function open(lang, height)
  {
    await page.setViewportSize({ width: WIDTH, height });
    await page.goto('http://localhost:5173/');
    await page.evaluate((l) => localStorage.setItem('agentExtension.lang', l), lang);
    await page.reload();
    await page.waitForFunction(() => !!window.__agentDevHost);
    await page.addScriptTag({ url: `/screenshots/demo.js?t=${Date.now()}` });
  }

  async function settle()
  {
    await page.waitForTimeout(500);
  }

  async function toBottom()
  {
    await page.evaluate(() =>
    {
      const el = document.querySelector('.transcript');
      el.scrollTop = el.scrollHeight;
    });
    await settle();
  }

  async function rect(js)
  {
    return page.evaluate(js);
  }

  function clip(top, bottom)
  {
    return { x: 0, y: Math.max(0, top), width: WIDTH, height: bottom - Math.max(0, top) };
  }

  const done = [];

  for (const lang of ['en', 'zh'])
  {
    const suffix = lang === 'en' ? '' : '-zh';

    // 主图：做完一轮、第二轮进行中，顶部吸着上一条用户消息
    await open(lang, 1180);
    await page.evaluate((l) => window.__demo.hero(l), lang);
    await settle();
    const ask = await page.evaluate((l) => window.__demo.text[l].ask2, lang);
    const box = page.locator('textarea').last();
    await box.fill(ask);
    await box.press('Control+Enter');
    await page.evaluate((l) => window.__demo.live(l), lang);
    await page.waitForTimeout(1200);
    await toBottom();
    await page.screenshot({ path: `${OUT}chat-panel${suffix}.png` });
    done.push(`chat-panel${suffix}`);

    // 时间线：第二条提问到这一轮结束
    await open(lang, 1700);
    await page.evaluate((l) => window.__demo.hero(l), lang);
    await settle();
    const span = await rect(() =>
    {
      const users = document.querySelectorAll('.block-user');
      const top = users[1].getBoundingClientRect().top;
      const ends = [...document.querySelectorAll('.transcript *')].filter((e) => e.children.length === 0 && /API|\u7b49\u6548|tokens/.test(e.textContent || ''));
      const bottom = ends[ends.length - 1].getBoundingClientRect().bottom;
      return { top, bottom };
    });
    await page.screenshot({ path: `${OUT}timeline${suffix}.png`, clip: clip(span.top - 6, span.bottom + 16) });
    done.push(`timeline${suffix}`);

    // 压缩：展开摘要
    await open(lang, 1180);
    await page.evaluate((l) => window.__demo.compact(l), lang);
    await settle();
    await page.click('.compaction-line');
    await toBottom();
    const compact = await rect(() =>
    {
      const users = document.querySelectorAll('.block-user');
      const top = users[users.length - 1].getBoundingClientRect().top;
      const bottom = document.querySelector('.block-compaction').getBoundingClientRect().bottom;
      return { top, bottom };
    });
    await page.screenshot({ path: `${OUT}compaction${suffix}.png`, clip: clip(compact.top - 6, compact.bottom + 16) });
    done.push(`compaction${suffix}`);

    // 远程控制：已开启，按钮变绿，聊天里一条带链接的提示（1.6.11 起不再弹面板）
    await open(lang, 1180);
    await page.evaluate((l) => window.__demo.hero(l), lang);
    await page.evaluate((l) => window.__demo.remote(l), lang);
    await settle();
    await toBottom();
    const remote = await rect(() =>
    {
      const button = [...document.querySelectorAll('button')].find((b) => /Remote Control:|远程控制：/.test(b.getAttribute('aria-label') || b.title || ''));
      const tables = document.querySelectorAll('.transcript table');
      const reply = tables[tables.length - 1].closest('.timeline-item') || tables[tables.length - 1];
      return { top: reply.getBoundingClientRect().top, bottom: button.getBoundingClientRect().bottom + 10 };
    });
    await page.screenshot({ path: `${OUT}remote-control${suffix}.png`, clip: clip(remote.top - 8, remote.bottom) });
    done.push(`remote-control${suffix}`);

    // 会话管理：要接住前端发的 panelOpen 再回灌列表，开发期入口只收不发，所以另开一页装假宿主
    const sessions = await page.context().newPage();
    await sessions.addInitScript(() =>
    {
      const listeners = new Set();
      window.__sent = [];
      window.chrome = window.chrome || {};
      window.chrome.webview = {
        postMessage: (m) => window.__sent.push(m),
        addEventListener: (_t, h) => listeners.add(h),
        removeEventListener: (_t, h) => listeners.delete(h),
      };
      window.__agentDevHost = { emit: (data) => listeners.forEach((h) => h({ data })) };
    });
    await sessions.setViewportSize({ width: WIDTH, height: 1000 });
    await sessions.goto('http://localhost:5173/');
    await sessions.evaluate((l) => localStorage.setItem('agentExtension.lang', l), lang);
    await sessions.reload();
    await sessions.waitForTimeout(800);
    await sessions.addScriptTag({ url: `/screenshots/demo.js?t=${Date.now()}` });
    await sessions.evaluate((l) => window.__demo.hero(l), lang);
    await sessions.waitForTimeout(400);
    await sessions.locator('.tabstrip-history').nth(1).click();
    await sessions.waitForTimeout(300);
    await sessions.evaluate((l) => window.__demo.sessions(l), lang);
    await sessions.waitForTimeout(500);
    // [role=dialog] 是全屏遮罩，弹窗本体是里面的 modal-card
    const dialog = await sessions.evaluate(() => document.querySelector('.modal-card').getBoundingClientRect().toJSON());
    await sessions.screenshot({
      path: `${OUT}session-manager${suffix}.png`,
      clip: { x: dialog.x - 16, y: dialog.y - 16, width: dialog.width + 32, height: dialog.height + 32 },
    });
    await sessions.close();
    done.push(`session-manager${suffix}`);
  }

  return done;
}
