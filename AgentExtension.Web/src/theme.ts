// 主题应用：把宿主下发的 VS 主题令牌写成 CSS 变量。

/** 不是颜色的令牌，需要单独处理，不能写成 CSS 变量。 */
const SCHEME_KEY = 'scheme';

/** 把颜色令牌写成 `--vs-<key>` 的 CSS 变量挂到根元素。 */
export function applyTheme(tokens: Record<string, string>): void
{
  const root = document.documentElement;

  for (const [key, value] of Object.entries(tokens))
  {
    if (key === SCHEME_KEY)
    {
      root.dataset.theme = value;
      continue;
    }

    root.style.setProperty(`--vs-${key}`, value);
  }
}
