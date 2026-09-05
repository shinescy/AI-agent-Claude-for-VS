// 识别「这条命令在本环境用不了」的回复。

/** 形如 `/resume isn't available in this environment.` */
const UNAVAILABLE = /^\s*\/(?<cmd>[^\s]+)\s+isn't available in this environment/im;

/** 形如 `Unknown command: /pr-comments`。 */
const UNKNOWN = /Unknown command:\s*\/(?<cmd>[^\s.,;]+)/i;

/** 从一段回复里认出「用不了」的命令名（不含前导斜杠）。 */
export function detectUnavailableCommand(text: string): string | null {
  if (!text)
  {
    return null;
  }

  const unavailable = UNAVAILABLE.exec(text);

  if (unavailable?.groups?.cmd)
  {
    return unavailable.groups.cmd;
  }

  const unknown = UNKNOWN.exec(text);
  return unknown?.groups?.cmd ?? null;
}
