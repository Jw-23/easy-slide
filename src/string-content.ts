import type { Token } from "./tokens";
/** Map decoded string offsets back to source, including ordinary DSL escape sequences. */
export function stringContent(source: string, token: Token) {
  const from = token.contentFrom!,
    to = token.contentTo!,
    offsets: number[] = [];
  let value = "";
  for (let p = from; p < to; p++) {
    offsets.push(p);
    if (!token.raw && source[p] === "\\" && p + 1 < to) {
      const c = source[++p];
      value +=
        (
          { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" } as Record<
            string,
            string
          >
        )[c] ?? c;
    } else value += source[p];
  }
  offsets.push(to);
  return {
    value,
    offsets,
    at(position: number) {
      let lo = 0,
        hi = offsets.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (offsets[mid] <= position) lo = mid + 1;
        else hi = mid;
      }
      return Math.max(0, lo - 1);
    },
  };
}
