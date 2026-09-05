// 终端字节流与 base64 之间的互转。

/** 把宿主发来的 base64 解成字节。 */
export function decodeTerminalOutput(base64: string): Uint8Array
{
  if (base64.length === 0)
  {
    return new Uint8Array(0);
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1)
  {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

/** 把用户敲的字符编成 base64 送回宿主。 */
export function encodeTerminalInput(data: string): string
{
  if (data.length === 0)
  {
    return '';
  }

  const bytes = new TextEncoder().encode(data);
  let binary = '';

  for (let i = 0; i < bytes.length; i += 1)
  {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}
