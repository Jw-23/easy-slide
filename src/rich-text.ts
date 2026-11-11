/** Bounded inline AST. Offsets always refer to the original (decoded DSL) string. */
export type RichNode = {
  kind: "text" | "strong" | "emphasis" | "strike" | "code" | "math" | "break";
  from: number;
  to: number;
  value?: string;
  children?: RichNode[];
  contentFrom?: number;
  contentTo?: number;
  display?: boolean;
  closed?: boolean;
};
export type RichDocument = {
  kind: "document";
  from: number;
  to: number;
  children: RichNode[];
  formatted: boolean;
  hasMath: boolean;
  pendingMath: RichNode[];
};
export type RichStyle = {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  mono?: boolean;
};
export type RichRun = RichStyle & {
  kind: "text" | "math" | "break";
  text: string;
  node: RichNode;
};
const cache = new Map<string, RichDocument>();
let cachedSize = 0;
const white = (c: string | undefined) => c === undefined || /\s/u.test(c);
const punct = (c: string | undefined) => !!c && /[\p{P}\p{S}]/u.test(c);
const escapable = new Set("\\`*_~$[](){}".split(""));

export function parseRichText(source: string): RichDocument {
  const cached = cache.get(source);
  if (cached) return cached;
  if (source.length > 200_000)
    throw Error("单段富文本最多 200000 个字符，请拆分内容");
  // Index candidates once, including exact-length code delimiters. Failed openers never rescan the suffix.
  const positions = new Map<string, number[]>();
  for (let i = 0; i < source.length;) {
    let key = source[i],
      end = i + 1;
    if (key === "\\") {
      // Backslashes are literal inside code spans, so all raw backtick runs remain candidates.
      if (source[i + 1] === "`") {
        i++;
        continue;
      }
      key += source[i + 1] || "";
      end++;
      if (!["\\)", "\\]"].includes(key)) {
        i = end;
        continue;
      }
    } else if (key === "`" || key === "$") {
      while (source[end] === source[i]) end++;
      key = source.slice(i, end);
    } else if (key !== "\n") {
      i++;
      continue;
    }
    const list = positions.get(key) || [];
    list.push(i);
    positions.set(key, list);
    i = end;
  }
  const closing = new Map<string, number[]>();
  for (const key of ["$", "$$", "\\)", "\\]"])
    closing.set(
      key,
      (positions.get(key) || []).filter(
        (p) =>
          !key.startsWith("$") ||
          key === "$$" ||
          (!white(source[p - 1]) && !/[0-9]/.test(source[p + 1] || "")),
      ),
    );
  function next(list: number[] | undefined, p: number): number | undefined {
    if (!list) return;
    let lo = 0,
      hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid] <= p) lo = mid + 1;
      else hi = mid;
    }
    return list[lo];
  }
  type Frame = { marker: string; from: number; children: RichNode[] };
  const frames: Frame[] = [{ marker: "", from: 0, children: [] }];
  const pendingMath: RichNode[] = [];
  let count = 0,
    formatted = false,
    hasMath = false;
  const children = () => frames.at(-1)!.children;
  function add(node: RichNode) {
    if (++count > 12000) throw Error("富文本标记过多，请拆分内容");
    const previous = children().at(-1);
    if (
      node.kind === "text" &&
      previous?.kind === "text" &&
      previous.to === node.from
    ) {
      previous.value += node.value!;
      previous.to = node.to;
    } else children().push(node);
  }
  const text = (from: number, to: number, value = source.slice(from, to)) =>
    add({ kind: "text", from, to, value });
  function literalFrame() {
    const frame = frames.pop()!;
    text(frame.from, frame.from + frame.marker.length);
    children().push(...frame.children);
  }
  for (let i = 0; i < source.length;) {
    const start = i,
      c = source[i];
    if (c === "\n" || c === "\r") {
      i += c === "\r" && source[i + 1] === "\n" ? 2 : 1;
      add({ kind: "break", from: start, to: i });
      continue;
    }
    if (c === "`") {
      while (source[i] === "`") i++;
      const marker = source.slice(start, i),
        end = next(positions.get(marker), start);
      if (end !== undefined) {
        add({
          kind: "code",
          from: start,
          to: end + marker.length,
          value: source.slice(i, end).replace(/\r\n|\r|\n/g, " "),
          contentFrom: i,
          contentTo: end,
        });
        formatted = true;
        i = end + marker.length;
      } else text(start, i);
      continue;
    }
    const bracket = c === "\\" && ["(", "["].includes(source[i + 1]);
    if (c === "$" || bracket) {
      let marker: string;
      if (bracket) {
        marker = source.slice(i, i + 2);
        i += 2;
      } else {
        while (source[i] === "$") i++;
        marker = source.slice(start, i);
      }
      if (marker.length > 2 || (marker === "$" && white(source[i]))) {
        text(start, i);
        continue;
      }
      const close =
          marker === "\\(" ? "\\)" : marker === "\\[" ? "\\]" : marker,
        display = marker === "$$" || marker === "\\[",
        candidate = next(
          marker === "$" ? positions.get("$") : closing.get(close),
          start,
        ),
        lineEnd = next(positions.get("\n"), i - 1) ?? -1,
        end =
          marker === "$" &&
          ((lineEnd >= 0 && (candidate === undefined || candidate > lineEnd)) ||
            (candidate !== undefined &&
              (white(source[candidate - 1]) ||
                /[0-9]/.test(source[candidate + 1] || ""))))
            ? undefined
            : candidate;
      if (end !== undefined && end > i && source.slice(i, end).trim()) {
        add({
          kind: "math",
          from: start,
          to: end + close.length,
          value: source.slice(i, end),
          contentFrom: i,
          contentTo: end,
          display,
          closed: true,
        });
        formatted = hasMath = true;
        i = end + close.length;
      } else {
        // Keep incomplete math literal in the preview, but retain its range for editor completion.
        const to = !display && lineEnd >= 0 ? lineEnd : source.length;
        pendingMath.push({
          kind: "math",
          from: start,
          to,
          contentFrom: i,
          contentTo: to,
          display,
          closed: false,
        });
        text(start, i);
      }
      continue;
    }
    if (c === "\\" && escapable.has(source[i + 1])) {
      text(i, i + 2, source[i + 1]);
      i += 2;
      formatted = true;
      continue;
    }
    if (c === "*" || c === "_" || c === "~") {
      while (source[i] === c) i++;
      const previousUnit = source.charCodeAt(start - 1),
        prev = start
          ? source.slice(
              start -
                (previousUnit >= 0xdc00 && previousUnit <= 0xdfff ? 2 : 1),
              start,
            )
          : undefined,
        after =
          i < source.length
            ? String.fromCodePoint(source.codePointAt(i)!)
            : undefined,
        intra =
          c === "_" &&
          !!prev &&
          !!after &&
          /[\p{L}\p{N}]/u.test(prev) &&
          /[\p{L}\p{N}]/u.test(after),
        open =
          !intra &&
          !white(after) &&
          (!punct(after) || white(prev) || punct(prev)),
        close =
          !intra &&
          !white(prev) &&
          (!punct(prev) || white(after) || punct(after));
      let p = start;
      while (p < i) {
        const remaining = i - p,
          width =
            c === "~"
              ? 2
              : remaining === 3 && frames.at(-1)?.marker === c
                ? 1
                : remaining >= 2
                  ? 2
                  : 1,
          marker = c.repeat(width);
        if (remaining < width) {
          text(p, i);
          break;
        }
        let found = -1;
        if (close)
          for (let f = frames.length - 1; f > 0; f--)
            if (frames[f].marker === marker) {
              found = f;
              break;
            }
        if (found > 0) {
          while (frames.length - 1 > found) literalFrame();
          const frame = frames.pop()!;
          add({
            kind: c === "~" ? "strike" : width === 2 ? "strong" : "emphasis",
            from: frame.from,
            to: p + width,
            children: frame.children,
          });
          formatted = true;
        } else if (open && frames.length < 65)
          frames.push({ marker, from: p, children: [] });
        else text(p, p + width);
        p += width;
      }
      continue;
    }
    i++;
    while (i < source.length && !"\\`$*_~\r\n".includes(source[i])) i++;
    text(start, i);
  }
  while (frames.length > 1) literalFrame();
  const result: RichDocument = {
    kind: "document",
    from: 0,
    to: source.length,
    children: frames[0].children,
    formatted,
    hasMath,
    pendingMath,
  };
  if (cache.size >= 512 || cachedSize + source.length > 1_000_000) {
    cache.clear();
    cachedSize = 0;
  }
  cache.set(source, result);
  cachedSize += source.length;
  return result;
}
export function richRuns(
  document: RichDocument,
  initial: RichStyle = {},
): RichRun[] {
  const runs: RichRun[] = [];
  function visit(nodes: RichNode[], style: RichStyle) {
    for (const node of nodes) {
      if (node.children)
        visit(node.children, {
          ...style,
          ...(node.kind === "strong"
            ? { bold: true }
            : node.kind === "emphasis"
              ? { italic: true }
              : { strike: true }),
        });
      else
        runs.push({
          ...style,
          kind:
            node.kind === "math" && node.closed
              ? "math"
              : node.kind === "break"
                ? "break"
                : "text",
          text: node.value || "",
          node,
          ...(node.kind === "code" ? { mono: true } : {}),
        });
    }
  }
  visit(document.children, initial);
  return runs;
}

/** Display formulas own their line; a source newline beside them is not an extra blank paragraph. */
export function flowRuns(document: RichDocument): RichRun[] {
  const runs = richRuns(document);
  return runs.filter(
    (run, index) =>
      run.kind !== "break" ||
      ![runs[index - 1], runs[index + 1]].some(
        (adjacent) => adjacent?.kind === "math" && adjacent.node.display,
      ),
  );
}
