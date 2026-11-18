// 高亮核心：shiki 细粒度打包，静态导入语言

import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import darkPlus from '@shikijs/themes/dark-plus';

import langTypescript from '@shikijs/langs/typescript';
import langTsx from '@shikijs/langs/tsx';
import langJavascript from '@shikijs/langs/javascript';
import langJsx from '@shikijs/langs/jsx';
import langJson from '@shikijs/langs/json';
import langCsharp from '@shikijs/langs/csharp';
import langBash from '@shikijs/langs/bash';
import langPowershell from '@shikijs/langs/powershell';
import langPython from '@shikijs/langs/python';
import langHtml from '@shikijs/langs/html';
import langCss from '@shikijs/langs/css';
import langMarkdown from '@shikijs/langs/markdown';
import langYaml from '@shikijs/langs/yaml';
import langSql from '@shikijs/langs/sql';
import langXml from '@shikijs/langs/xml';
import langDiff from '@shikijs/langs/diff';
import langGo from '@shikijs/langs/go';
import langRust from '@shikijs/langs/rust';
import langJava from '@shikijs/langs/java';

/** 主题名，与 `codeToHtml` 调用处保持一致。 */
export const HIGHLIGHT_THEME = 'dark-plus';

let highlighterPromise: Promise<HighlighterCore> | null = null;

/** 惰性创建、进程内单例的高亮器；只在真正需要高亮时才触发加载。 */
function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise)
  {
    highlighterPromise = createHighlighterCore({
      themes: [darkPlus],
      langs: [
        langTypescript, langTsx, langJavascript, langJsx, langJson, langCsharp,
        langBash, langPowershell, langPython, langHtml, langCss, langMarkdown,
        langYaml, langSql, langXml, langDiff, langGo, langRust, langJava,
      ],
      engine: createJavaScriptRegexEngine(),
    });

    // 失败了清掉，下次重试
    highlighterPromise.catch(() =>
    {
      highlighterPromise = null;
    });
  }
  return highlighterPromise;
}

/** 高亮代码；语言不支持时抛异常。 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  const html = highlighter.codeToHtml(code, { lang, theme: HIGHLIGHT_THEME });
  return html;
}
