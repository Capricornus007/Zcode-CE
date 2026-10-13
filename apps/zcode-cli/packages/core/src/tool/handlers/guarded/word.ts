// Modified by ZCode: ported from zai-org/ZCode v3.15.1 (aac47556, Apache-2.0) for CE 3.15.1-ce.1.
/** AST 定位后的单词事实；不执行 expansion，也不将未知词当作已知选项。 */
export interface CommandWord {
  value: string;
  dynamic: boolean;
  hasUnquotedGlob: boolean;
  start: number;
  end: number;
}

export function literalPosixWord(text: string, start: number, end: number): CommandWord {
  let value = "";
  let quote = "";
  let dynamic = false;
  let hasUnquotedGlob = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === quote) {
      quote = "";
      continue;
    }
    if (quote !== "'" && c === "\\") {
      const next = text[i + 1];
      if (next === undefined) {
        dynamic = true;
        break;
      }
      if (!quote || ["$", "`", '"', "\\", "\n"].includes(next)) {
        if (next !== "\n") value += next;
        i++;
        continue;
      }
    }
    if (!quote && (c === "'" || c === '"')) {
      quote = c;
      continue;
    }
    if (quote !== "'" && (c === "$" || c === "`")) dynamic = true;
    if (!quote && /[*?[{}~]/.test(c)) dynamic = true;
    if (!quote && /[*?[]/.test(c)) hasUnquotedGlob = true;
    value += c;
  }
  return { value, dynamic: dynamic || Boolean(quote), hasUnquotedGlob, start, end };
}

export function commandBasename(word: CommandWord, windows: boolean): string | undefined {
  if (word.dynamic) return undefined;
  const name = word.value.split(windows ? /[\\/]/ : /\//).at(-1)!;
  return windows ? name.toLowerCase().replace(/\.exe$/, "") : name;
}
