import { DslError } from "./diagnostics";
export type Token = {
  from: number;
  to: number;
  kind: "id" | "string" | "number" | "punct" | "eof" | "comment" | "invalid";
  value: string;
  line: number;
  col: number;
  raw?: boolean;
  closed?: boolean;
  contentFrom?: number;
  contentTo?: number;
};
export function tokenize(
  source: string,
  options: { tolerant?: boolean; comments?: boolean } = {},
): Token[] {
  if (source.length > 2000000) throw new DslError("源码最多 2 MB", 0, 1, 1, 1);
  const ts: Token[] = [];
  let i = 0,
    line = 1,
    col = 1;
  const advance = () => {
    const c = source[i++];
    if (c === "\n") {
      line++;
      col = 1;
    } else col++;
    return c;
  };
  const error = (m: string): never => {
    throw new DslError(m, i, i + 1, line, col);
  };
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      advance();
      continue;
    }
    if (source.slice(i, i + 2) === "//") {
      const from = i,
        l = line,
        c = col;
      while (i < source.length && source[i] !== "\n") advance();
      if (options.comments)
        ts.push({
          kind: "comment",
          from,
          to: i,
          line: l,
          col: c,
          value: source.slice(from, i),
        });
      continue;
    }
    const start = i;
    const l = line,
      c = col;
    if (source[i] === '"' || source.slice(i, i + 2) === '#"') {
      const raw = source[i] === "#";
      if (raw) advance();
      const triple = source.slice(i, i + 3) === '"""';
      const open = triple ? '"""' : '"';
      for (let n = 0; n < open.length; n++) advance();
      const end = open + (raw ? "#" : "");
      const contentFrom = i;
      let contentTo = i;
      let newline: { i: number; line: number; col: number } | undefined;
      let v = "",
        closed = false;
      while (i < source.length) {
        if (source.slice(i, i + end.length) === end) {
          contentTo = i;
          for (let n = 0; n < end.length; n++) advance();
          closed = true;
          break;
        }
        if (!triple && !newline && source[i] === "\n")
          newline = { i, line, col };
        const ch = advance();
        if (ch === "\\" && !raw) {
          const esc = i < source.length ? advance() : "";
          const map: Record<string, string> = {
            n: "\n",
            t: "\t",
            r: "\r",
            '"': '"',
            "\\": "\\",
          };
          if (!(esc in map) && !options.tolerant)
            error('不支持的转义，请用 #"..."# 包裹公式');
          v += map[esc] ?? esc;
        } else v += ch;
      }
      // A missing ordinary quote can otherwise consume the next declaration's opening quote.
      // Recover only when the resulting multiline token has an impossible adjacent scalar tail;
      // valid multiline strings keep the exact runtime tokenization.
      if (
        options.tolerant &&
        closed &&
        newline &&
        /^[ \t]*[A-Za-z_0-9"#]/.test(source.slice(i))
      )
        closed = false;
      if (!closed) {
        if (!options.tolerant) error("字符串缺少结束引号");
        if (newline) {
          i = newline.i;
          line = newline.line;
          col = newline.col;
        }
        contentTo = i;
      }
      ts.push({
        kind: "string",
        value: v,
        line: l,
        col: c,
        from: start,
        to: i,
        raw,
        closed,
        contentFrom,
        contentTo,
      });
      continue;
    }
    const num = source
      .slice(i)
      .match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (num) {
      for (let n = 0; n < num[0].length; n++) advance();
      ts.push({
        kind: "number",
        value: num[0],
        line: l,
        col: c,
        from: start,
        to: i,
      });
      continue;
    }
    const id = source.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);
    if (id) {
      for (let n = 0; n < id[0].length; n++) advance();
      ts.push({
        kind: "id",
        value: id[0],
        line: l,
        col: c,
        from: start,
        to: i,
      });
      continue;
    }
    const multi = ["=>", "<=", ">=", "==", "!=", "&&", "||", "**"].find((op) =>
      source.startsWith(op, i),
    );
    if (multi) {
      for (let n = 0; n < multi.length; n++) advance();
      ts.push({
        kind: "punct",
        value: multi,
        line: l,
        col: c,
        from: start,
        to: i,
      });
      continue;
    }
    if ("(){}[]:,.=+-*/%^<>!?;".includes(source[i])) {
      ts.push({
        kind: "punct",
        value: advance(),
        line: l,
        col: c,
        from: start,
        to: i,
      });
      continue;
    }
    if (!options.tolerant) error(`无法识别字符 ${source[i]}`);
    ts.push({
      kind: "invalid",
      from: i,
      to: i + 1,
      value: advance(),
      line: l,
      col: c,
    });
  }
  ts.push({ kind: "eof", value: "", line, col, from: i, to: i });
  if (ts.length > 200000) throw new DslError("源码过长", 0, 1, 1, 1);
  return ts;
}
