// 代码高亮：用 shiki 的“细粒度打包”方式（静态导入具体语言），而不是从 `shiki`

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
  }
  return highlighterPromise;
}

/** 高亮一段代码；语言不在精选列表内时抛出异常，调用方应捕获并回退成朴素代码块。 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  const html = highlighter.codeToHtml(code, { lang, theme: HIGHLIGHT_THEME });
  return html;
}
