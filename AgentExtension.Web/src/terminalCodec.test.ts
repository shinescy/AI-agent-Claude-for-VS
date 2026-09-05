import { describe, it, expect } from 'vitest';
import { decodeTerminalOutput, encodeTerminalInput } from './terminalCodec';

describe('终端字节编解码', () =>
{
  it('空串两侧都返回空', () =>
  {
    expect(decodeTerminalOutput('').length).toBe(0);
    expect(encodeTerminalInput('')).toBe('');
  });

  it('ASCII 往返不变', () =>
  {
    const encoded = encodeTerminalInput('ls -la\r');
    const decoded = new TextDecoder().decode(decodeTerminalOutput(encoded));

    expect(decoded).toBe('ls -la\r');
  });

  it('中文按 UTF-8 编码而不是截断成单字节', () =>
  {
    // 逐字符取低字节的写法会把「你」变成 0x60，CLI 收到的就是乱码。
    const encoded = encodeTerminalInput('你好');
    const bytes = decodeTerminalOutput(encoded);

    expect(Array.from(bytes)).toEqual([0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd]);
  });

  it('emoji（代理对）也能往返', () =>
  {
    const encoded = encodeTerminalInput('🚀');
    const decoded = new TextDecoder().decode(decodeTerminalOutput(encoded));

    expect(decoded).toBe('🚀');
  });

  it('解码得到的是字节而非字符串', () =>
  {
    // 这一条守的是「不要顺手 decode 成字符串」：VT 流会把多字节字符切在两次读取之间，
    // 提前解码会把半个字符变成 U+FFFD，后半截再也拼不回来。
    const result = decodeTerminalOutput(encodeTerminalInput('ab'));

    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('保留 ESC 等控制字节', () =>
  {
    // 终端的一切颜色与光标控制都靠这些字节，丢一个就是满屏错位。
    const bytes = decodeTerminalOutput(encodeTerminalInput('\u001b[31m'));

    expect(bytes[0]).toBe(0x1b);
    expect(Array.from(bytes)).toEqual([0x1b, 0x5b, 0x33, 0x31, 0x6d]);
  });

  it('长文本不会因为参数过多而抛错', () =>
  {
    // String.fromCharCode(...bytes) 在这个长度上会超出调用栈上限。
    const long = 'x'.repeat(200000);

    expect(() => encodeTerminalInput(long)).not.toThrow();
  });

  it('半个多字节字符也能原样带过去', () =>
  {
    // 模拟宿主把「你」这三个字节切成两块发来：解码端不该在这里报错或替换。
    const first = decodeTerminalOutput(btoa(String.fromCharCode(0xe4, 0xbd)));
    const second = decodeTerminalOutput(btoa(String.fromCharCode(0xa0)));

    expect(Array.from(first)).toEqual([0xe4, 0xbd]);
    expect(Array.from(second)).toEqual([0xa0]);
  });
});
