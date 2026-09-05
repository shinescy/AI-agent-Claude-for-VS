// 由文件扩展名挑一个高亮语言。

const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  cs: 'csharp',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  psm1: 'powershell',
  py: 'python',
  html: 'html',
  htm: 'html',
  vue: 'html',
  css: 'css',
  scss: 'css',
  md: 'markdown',
  markdown: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  xml: 'xml',
  csproj: 'xml',
  props: 'xml',
  targets: 'xml',
  vsixmanifest: 'xml',
  xaml: 'xml',
  svg: 'xml',
  diff: 'diff',
  patch: 'diff',
  go: 'go',
  rs: 'rust',
  java: 'java',
};

/** 取高亮语言；认不出来返回空串。 */
export function previewLanguage(path: string): string {
  if (!path) {
    return '';
  }

  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');

  if (dot < 0 || dot === name.length - 1) {
    return '';
  }

  const extension = name.slice(dot + 1).toLowerCase();
  return BY_EXTENSION[extension] ?? '';
}

/** 算一个不会被内容撑破的围栏。 */
export function fenceFor(text: string): string {
  let longest = 0;
  let run = 0;

  for (const ch of text) {
    if (ch === '`') {
      run += 1;
      longest = Math.max(longest, run);
    }
    else {
      run = 0;
    }
  }

  return '`'.repeat(Math.max(3, longest + 1));
}
