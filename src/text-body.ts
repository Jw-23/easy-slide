/** Find a raw Text body boundary, keeping TeX groups, escaped braces and code spans literal. */
export function textBodyEnd(source: string, from: number): number | undefined {
  let depth = 1;
  for (let i = from; i < source.length;) {
    const c = source[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") {
      let end = i + 1;
      while (source[end] === "`") end++;
      const marker = source.slice(i, end);
      let close = source.indexOf(marker, end);
      while (
        close >= 0 &&
        (source[close - 1] === "`" || source[close + marker.length] === "`")
      )
        close = source.indexOf(marker, close + marker.length);
      i = close < 0 ? end : close + marker.length;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}" && --depth === 0) return i;
    i++;
  }
}
