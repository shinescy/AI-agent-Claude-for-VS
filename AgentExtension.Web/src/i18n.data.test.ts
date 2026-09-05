// 数据模块里的文案覆盖检查。
//
// i18n.contract.test.ts 扫的是源码里 `t('字面量')` 的调用点，扫不到 `t(m.label)`
// 这类**动态键**——而模型、强度、权限模式、子命令、字体这些文案全都存在数据数组里，
// 调用点长的正是 t(变量) 的样子。那道扫描对它们完全失明。
//
// 于是这里换个方向：不看调用点，直接把这些数组里的中文文案逐条拿出来比对。
// 两条测试合起来才覆盖住全部文案；少任何一条，漏翻都会静默退化成中文。

import { describe, it, expect } from 'vitest';
import { englishKeys } from './i18n';
import { PERMISSION_MODES } from './permissionModes';
import { MODEL_BRANDS } from './models';
import { SUBCOMMANDS } from './subcommands';
import { FONT_FAMILIES } from './appearance';
import { buildEffortOptions } from './efforts';
import { PLUGIN_TABS } from './components/PluginPanel';

/** 含中文的才需要翻译；纯 ASCII 的（Opus、Consolas 等）是专有名词，原样显示即可。 */
function needsTranslation(text: string): boolean {
  return /[一-鿿]/.test(text);
}

function collect(): { where: string; text: string }[] {
  const found: { where: string; text: string }[] = [];

  function add(where: string, text: string | undefined) {
    if (text !== undefined && text !== '' && needsTranslation(text)) {
      found.push({ where, text });
    }
  }

  for (const mode of PERMISSION_MODES) {
    add(`permissionModes[${mode.value}].label`, mode.label);
    add(`permissionModes[${mode.value}].hint`, mode.hint);
  }

  for (const brand of MODEL_BRANDS) {
    add(`models[${brand.id}].label`, brand.label);

    for (const model of brand.models) {
      add(`models[${brand.id}][${model.value}].label`, model.label);
      add(`models[${brand.id}][${model.value}].hint`, model.hint);
    }
  }

  for (const item of SUBCOMMANDS) {
    add(`subcommands[${item.id}].label`, item.label);
    add(`subcommands[${item.id}].guidance`, item.guidance);
  }

  for (const font of FONT_FAMILIES) {
    add(`fontFamilies[${font.value}].label`, font.label);
  }

  // 覆盖 CLI 可能报出的全部档位，含兜底清单之外的那些。
  for (const effort of buildEffortOptions(['low', 'medium', 'high', 'xhigh', 'max', 'ultracode', 'auto'])) {
    add(`efforts[${effort.value}].label`, effort.label);
    add(`efforts[${effort.value}].description`, effort.description);
  }

  for (const tab of PLUGIN_TABS) {
    add(`pluginTabs[${tab.panelId}].label`, tab.label);
  }

  return found;
}

describe('i18n 数据模块覆盖', () => {
  it('数据数组里的每条中文文案都有英文对应', () => {
    const keys = new Set(englishKeys());
    const missing = collect()
      .filter((entry) => !keys.has(entry.text))
      .map((entry) => `${entry.where}: ${entry.text}`);

    expect(missing, `这些文案没有英文对应，英文界面上会显示中文：\n${missing.join('\n')}`).toEqual([]);
  });

  it('确实收集到了文案（防止收集函数失效导致上一条空跑成绿）', () => {
    // 上一条断言的形式是「missing 为空」，收集函数一旦失效、一条都收不到时它同样为空。
    expect(collect().length).toBeGreaterThan(20);
  });
});
