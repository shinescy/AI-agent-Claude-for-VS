// 「栏里选的」与「终端进程正在用的」之间的差异，以及每一项该怎么消解。
//
// 原先三项一律说「重启才生效」，那是把对话那条 --print 管线的结论整条搬了过来——
// 那边每一轮都是新进程，模型只能由启动参数决定。终端这一路跑的是完整 TUI，
// 它自己就有 /model 和 /effort，实测即刻生效。用户的原话是
// 「命令窗口明明可以直接切」。权限模式虽然没有对应命令，但底栏写着当前档位、
// shift+tab 是个四档的环，同样能转过去。所以这里分成三堆：发命令的、按键转的、
// 和真的只能重启的。

import { describe, it, expect } from 'vitest';
import { planSwitch } from '../terminalSwitch';

/** 测试里不做翻译，原样返回，断言才能直接比中文。 */
const t = (text: string) => text;

const KNOWN = { models: ['opus', 'sonnet', 'default'], efforts: ['low', 'high', 'xhigh'] };

describe('终端启动参数差异', () =>
{
  it('两套值一样就什么都不用做', () =>
  {
    const same = { model: 'opus', effort: 'high', permissionMode: 'acceptEdits' };
    const plan = planSwitch(same, { ...same }, KNOWN, t);

    expect(plan.live).toEqual([]);
    expect(plan.restart).toEqual([]);
  });

  it('终端还没起进程时一律不提', () =>
  {
    // launched 为 null 表示还不存在「正在用的」。此时摆一条提示，
    // 用户会以为出了错，而实际上什么都没发生。
    const selected = { model: 'opus', effort: 'high', permissionMode: 'plan' };
    const plan = planSwitch(selected, null, KNOWN, t);

    expect(plan.live).toEqual([]);
    expect(plan.restart).toEqual([]);
  });

  it('强度变了就直接切，不提重启', () =>
  {
    const plan = planSwitch(
      { model: 'opus', effort: 'xhigh', permissionMode: 'acceptEdits' },
      { model: 'opus', effort: '', permissionMode: 'acceptEdits' },
      KNOWN, t);

    expect(plan.live.map((x) => x.command)).toEqual(['/effort xhigh']);
    expect(plan.restart).toEqual([]);
  });

  it('型号变了也直接切', () =>
  {
    const plan = planSwitch(
      { model: 'sonnet', effort: '', permissionMode: '' },
      { model: 'opus', effort: '', permissionMode: '' },
      KNOWN, t);

    expect(plan.live.map((x) => x.command)).toEqual(['/model sonnet']);
  });

  it('两项都变就排成两条，型号在前', () =>
  {
    const plan = planSwitch(
      { model: 'sonnet', effort: 'low', permissionMode: '' },
      { model: 'opus', effort: 'high', permissionMode: '' },
      KNOWN, t);

    // 一次只送一条（两条挤在一行里会拼成 /model x/effort y），所以顺序是有意义的。
    expect(plan.live.map((x) => x.command)).toEqual(['/model sonnet', '/effort low']);
  });

  it('CLI 没报清单时不发命令，退回重启', () =>
  {
    // 握手没拿到清单。发一条 CLI 可能不认的 /xxx，代价是它被当成一句话交给模型——花真钱。
    const plan = planSwitch(
      { model: 'opus', effort: 'xhigh', permissionMode: '' },
      { model: 'opus', effort: '', permissionMode: '' },
      { models: [], efforts: [] }, t);

    expect(plan.live).toEqual([]);
    expect(plan.restart.length).toBe(1);
  });

  it('清单里没有的取值也退回重启', () =>
  {
    const plan = planSwitch(
      { model: 'haiku', effort: '', permissionMode: '' },
      { model: 'opus', effort: '', permissionMode: '' },
      KNOWN, t);

    expect(plan.live).toEqual([]);
    expect(plan.restart.length).toBe(1);
  });

  it('切回「默认」只能重启：TUI 里没有「把参数撤掉」这回事', () =>
  {
    const plan = planSwitch(
      { model: '', effort: '', permissionMode: '' },
      { model: 'sonnet', effort: '', permissionMode: '' },
      KNOWN, t);

    expect(plan.live).toEqual([]);
    expect(plan.restart[0]).toContain('默认');
  });

  it('权限模式在 shift+tab 的环里就转过去，不提重启', () =>
  {
    // 没有对应的斜杠命令不等于切不了：TUI 底栏写着当前是哪一档，shift+tab 转的就是这个环。
    const plan = planSwitch(
      { model: 'opus', effort: 'high', permissionMode: 'plan' },
      { model: 'opus', effort: 'high', permissionMode: 'acceptEdits' },
      KNOWN, t);

    expect(plan.cycle).toBe('plan');
    expect(plan.restart).toEqual([]);
  });

  it('环里这几档都能转', () =>
  {
    // 环的形状抄自 CLI 自己的换档函数：
    // manual → acceptEdits → plan →（有的话）bypassPermissions →（有的话）auto → manual。
    for (const mode of ['acceptEdits', 'plan', 'auto', 'manual'])
    {
      const plan = planSwitch(
        { model: '', effort: '', permissionMode: mode },
        { model: '', effort: '', permissionMode: 'dontAsk' },
        KNOWN, t);

      expect(plan.cycle).toBe(mode);
      expect(plan.restart).toEqual([]);
    }
  });

  it('绕过权限先去转，不一上来就说要重启', () =>
  {
    // 终端起时都带 --allow-dangerously-skip-permissions，bypass 在环上。
    const plan = planSwitch(
      { model: '', effort: '', permissionMode: 'bypassPermissions' },
      { model: '', effort: '', permissionMode: 'acceptEdits' },
      KNOWN, t);

    expect(plan.cycle).toBe('bypassPermissions');
    expect(plan.restart).toEqual([]);
  });

  it('转了一圈没转到 bypass，再说要重启并给出多半的原因', () =>
  {
    const plan = planSwitch(
      { model: '', effort: '', permissionMode: 'bypassPermissions' },
      { model: '', effort: '', permissionMode: 'acceptEdits' },
      KNOWN, t, 'bypassPermissions');

    expect(plan.cycle).toBeNull();
    expect(plan.restart.length).toBe(1);
    expect(plan.restart[0]).toContain('免责声明');
  });

  it('危险模式起的终端，再选「绕过权限」不算漂移', () =>
  {
    // 同一档两个名字：--dangerously-skip-permissions 起来之后底栏写的是 bypass permissions。
    // 不归一的话这条漂移提示永远消不掉，点多少次重启都还在。
    const plan = planSwitch(
      { model: '', effort: '', permissionMode: 'bypassPermissions' },
      { model: '', effort: '', permissionMode: 'dangerously' },
      KNOWN, t);

    expect(plan.cycle).toBeNull();
    expect(plan.restart).toEqual([]);
  });

  it('环外的档位只能重启，并说清原因', () =>
  {
    // dontAsk 是真的转不到：CLI 里没有任何一档转得过去，只能靠启动参数进。
    const plan = planSwitch(
      { model: '', effort: '', permissionMode: 'dontAsk' },
      { model: '', effort: '', permissionMode: 'acceptEdits' },
      KNOWN, t);

    expect(plan.cycle).toBeNull();
    expect(plan.restart.length).toBe(1);
    expect(plan.restart[0]).toContain('权限');
    expect(plan.restart[0]).toContain('没有任何一档转得到它');
  });

  it('转过一圈没转到的那一档，之后只给重启', () =>
  {
    // 不记住的话，每来一批终端输出就重转一轮，表现为底栏自己一直在跳。
    const plan = planSwitch(
      { model: '', effort: '', permissionMode: 'plan' },
      { model: '', effort: '', permissionMode: 'acceptEdits' },
      KNOWN, t, 'plan');

    expect(plan.cycle).toBeNull();
    expect(plan.restart.length).toBe(1);
  });

  it('重启那条说清从什么变成什么', () =>
  {
    const plan = planSwitch(
      { model: 'opus', effort: '', permissionMode: 'dontAsk' },
      { model: 'opus', effort: '', permissionMode: 'acceptEdits' },
      KNOWN, t);

    // 只说「权限已变」等于让人自己去猜终端里现在是哪一档——而这恰恰是他看不到的那一半。
    expect(plan.restart[0]).toContain('acceptEdits');
    expect(plan.restart[0]).toContain('dontAsk');
  });

  it('远程操控开关变了，发 /remote-control 命令', () =>
  {
    // /remote-control 是运行时 toggle，发命令即切，不必重启。
    const plan = planSwitch(
      { model: '', effort: '', permissionMode: '', remoteControl: true },
      { model: '', effort: '', permissionMode: '', remoteControl: false },
      KNOWN, t);

    expect(plan.restart).toEqual([]);
    expect(plan.live.map((x) => x.command)).toEqual(['/remote-control']);
  });

  it('远程操控省略当关处理也发命令', () =>
  {
    // selected 省略 remoteControl（undefined）对 launched=true：视作要关，照样发命令
    const plan = planSwitch(
      { model: '', effort: '', permissionMode: '' },
      { model: '', effort: '', permissionMode: '', remoteControl: true },
      KNOWN, t);

    expect(plan.restart).toEqual([]);
    expect(plan.live.map((x) => x.command)).toEqual(['/remote-control']);
  });

  it('远程操控没变就不提', () =>
  {
    const plan = planSwitch(
      { model: '', effort: '', permissionMode: '', remoteControl: true },
      { model: '', effort: '', permissionMode: '', remoteControl: true },
      KNOWN, t);

    expect(plan.live).toEqual([]);
    expect(plan.restart).toEqual([]);
  });
});
