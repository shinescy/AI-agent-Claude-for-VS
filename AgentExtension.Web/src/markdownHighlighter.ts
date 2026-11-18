// 高亮入口：shiki 按需加载，不进主包

/** 主题名，与 codeToHtml 调用处保持一致。 */
export const HIGHLIGHT_THEME = 'dark-plus';

type Core = typeof import('./markdownHighlighterCore');

let corePromise: Promise<Core> | null = null;

/** 只加载一次；失败了下次重试。 */
function loadCore(): Promise<Core>
{
  if (corePromise === null)
  {
    corePromise = import('./markdownHighlighterCore').catch((error) =>
    {
      corePromise = null;
      throw error;
    });
  }

  return corePromise;
}

/** 高亮一段代码；语言不在精选列表内时抛出异常，调用方应捕获并回退成朴素代码块。 */
export async function highlightCode(code: string, lang: string): Promise<string>
{
  const core = await loadCore();
  const html = await core.highlightCode(code, lang);
  return html;
}
