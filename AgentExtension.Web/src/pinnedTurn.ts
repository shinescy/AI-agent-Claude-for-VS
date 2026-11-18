// 从 xterm 的回滚缓冲里认出「这一屏是在回答哪句话」。

/** 行首的提示符。 */
const PROMPT = /^[>\u276f\u203a] /;

/** TUI 用来起一个新块的记号。 */
const BLOCK_MARK = /^[\u23bf\u25cf\u273b\u23f5\u2514\u251c]/;

/** TUI 输入框的上下边框，形如 ─────────。 */
const RULE = /^[\u2500-\u257f]{8,}$/;

export interface PinnedTurn
{
  /** 这条消息在缓冲里的绝对行号。 */
  row: number;

  /** 消息正文，续行已经拼进来，整体折成一行。 */
  text: string;
}

/** 找出该钉住的那条消息。 */
export function findPinnedTurn(
  readLine: (row: number) => string | null,
  topRow: number,
  bufferLength: number,
  maxScan = 400,
): PinnedTurn | null
{
  const floor = Math.max(0, topRow - maxScan);

  for (let row = topRow; row >= floor; row--)
  {
    const line = readLine(row);

    if (line !== null && PROMPT.test(line))
    {
      const found = collect(readLine, row, bufferLength);

      if (found !== null)
      {
        return found;
      }
    }
  }

  const ceiling = Math.min(bufferLength, topRow + maxScan);

  for (let row = topRow + 1; row < ceiling; row++)
  {
    const line = readLine(row);

    if (line === null)
    {
      continue;
    }

    if (RULE.test(line.trim()))
    {
      return null;
    }

    if (PROMPT.test(line))
    {
      return collect(readLine, row, bufferLength);
    }
  }

  return null;
}

/** 把从 row 开始的一条消息拼完整：首行去掉提示符，续行（缩进两格）接在后面。 */
function collect(
  readLine: (row: number) => string | null,
  row: number,
  bufferLength: number,
): PinnedTurn | null
{
  const first = (readLine(row) ?? '').replace(PROMPT, '').trim();
  const parts = first === '' ? [] : [first];

  for (let next = row + 1; next < bufferLength; next++)
  {
    const line = readLine(next);

    if (line === null || !line.startsWith('  '))
    {
      break;
    }

    const rest = line.trim();

    if (rest === '' || BLOCK_MARK.test(rest))
    {
      break;
    }

    parts.push(rest);
  }

  if (parts.length === 0)
  {
    return null;
  }

  return { row, text: parts.join(' ') };
}
