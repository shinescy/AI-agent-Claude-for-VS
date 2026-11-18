// i18n 的契约测试。
//
// 中文原文当键的方案有一个已知弱点：改了调用点的中文却忘了同步 EN 的键，
// 查表会静默失配，英文界面上悄悄退回中文。谁都不会收到报错，只有英文用户看到一句中文。
// 这正是本项目明令要防的静默失效，所以扫描全部调用点逐条比对。

import { describe, it, expect } from 'vitest';
import { englishKeys, englishEntries, fieldLabelTexts } from './i18n';

// 用 Vite 的 glob 而不是 node:fs 读源码：这个工程没装 @types/node，
// 而为了一条测试把 node 类型拉进前端工程会让 tsc 的检查范围变松。
// eager + ?raw 在构建期就把源码内联进来，运行时不碰文件系统。
const SOURCES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * 找出所有 `t('…')` 调用里的中文字面量。
 *
 * 只认单引号字面量：模板串与变量拼出来的键无法静态确定。目前没有这类调用点——
 * 需要插值的一律走 t('… {n} …', { n }) 的形式，键本身仍是静态字面量。
 *
 * 跳过测试文件：里面的中文是对被测组件的断言文本，不是调用点。
 */
function translationCallSites(): { file: string; key: string }[] {
  const found: { file: string; key: string }[] = [];

  for (const [file, text] of Object.entries(SOURCES)) {
    if (/\.test\.tsx?$/.test(file)) {
      continue;
    }

    for (const match of text.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const key = match[1].replace(/\\'/g, "'");

      if (/[一-鿿]/.test(key)) {
        found.push({ file, key });
      }
    }
  }

  return found;
}

describe('i18n 契约', () => {
  it('每个 t() 调用点的中文都有英文对应', () => {
    const keys = new Set(englishKeys());
    const missing = translationCallSites()
      .filter((site) => !keys.has(site.key))
      .map((site) => `${site.file}: ${site.key}`);

    expect(missing, `这些文案没有英文对应，英文界面上会显示中文：\n${missing.join('\n')}`).toEqual([]);
  });

  it('扫描确实找到了调用点（防止正则失效导致上一条空跑成绿）', () => {
    // 上一条断言的形式是「missing 为空」，正则一旦失效、一个调用点都扫不到时它同样为空，
    // 于是这条测试会在什么都没检查的情况下变绿。这里给它一个下限。
    expect(translationCallSites().length).toBeGreaterThan(40);
  });

  it('英文表里没有值与键相同的占位条目', () => {
    // 值等于键说明那条根本没翻，只是占了个位置骗过上面那条覆盖检查。
    const untranslated = englishEntries()
      .filter(([key, value]) => key === value)
      .map(([key]) => key);

    expect(untranslated, `这些条目只是占位，值与中文原文相同：\n${untranslated.join('\n')}`).toEqual([]);
  });

  it('详情字段的标签也都有英文对应', () => {
    // 这些标签不经 t() 调用点，而是查 FIELD_LABELS 之后再过 translate()，
    // 上面那条按调用点扫的检查覆盖不到它们。漏一条，英文界面上就是一个中文字段名。
    const keys = new Set(englishKeys());
    const missing = fieldLabelTexts().filter((text) => !keys.has(text));

    expect(missing, `这些字段标签没有英文对应：\n${missing.join('\n')}`).toEqual([]);
  });

  it('英文表里没有残留中文', () => {
    // 半翻的条目（中英混排）在界面上比全中文更难发现。
    const leftover = englishEntries()
      .filter(([, value]) => /[一-鿿]/.test(value))
      .map(([key, value]) => `${key} → ${value}`);

    expect(leftover, `这些英文文案里还有中文：\n${leftover.join('\n')}`).toEqual([]);
  });
});
