/** A small declarative language. No eval, Function, dynamic imports or executable expressions. */
export type Call = {
  name: string;
  args: unknown[];
  named: Record<string, unknown>;
  children: Call[];
  modifiers: Call[];
};
type Token = {
  kind: "id" | "string" | "number" | "punct" | "eof";
  value: string;
  line: number;
  col: number;
};
export function readSyntax(source: string): Call {
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
    throw Error(`第 ${line} 行，第 ${col} 列：${m}`);
  };
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      advance();
      continue;
    }
    if (source.slice(i, i + 2) === "//") {
      while (i < source.length && advance() !== "\n") {}
      continue;
    }
    const l = line,
      c = col;
    if (source[i] === '"' || source.slice(i, i + 2) === '#"') {
      const raw = source[i] === "#";
      if (raw) advance();
      const triple = source.slice(i, i + 3) === '"""';
      const open = triple ? '"""' : '"';
      for (let n = 0; n < open.length; n++) advance();
      const end = open + (raw ? "#" : "");
      let v = "",
        closed = false;
      while (i < source.length) {
        if (source.slice(i, i + end.length) === end) {
          for (let n = 0; n < end.length; n++) advance();
          closed = true;
          break;
        }
        const ch = advance();
        if (ch === "\\" && !raw) {
          const esc = advance();
          const map: Record<string, string> = {
            n: "\n",
            t: "\t",
            r: "\r",
            '"': '"',
            "\\": "\\",
          };
          if (!(esc in map)) error('不支持的转义，请用 #"..."# 包裹公式');
          v += map[esc];
        } else v += ch;
      }
      if (!closed) error("字符串缺少结束引号");
      ts.push({ kind: "string", value: v, line: l, col: c });
      continue;
    }
    const num = source.slice(i).match(/^-?\d+(?:\.\d+)?/);
    if (num) {
      for (let n = 0; n < num[0].length; n++) advance();
      ts.push({ kind: "number", value: num[0], line: l, col: c });
      continue;
    }
    const id = source.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);
    if (id) {
      for (let n = 0; n < id[0].length; n++) advance();
      ts.push({ kind: "id", value: id[0], line: l, col: c });
      continue;
    }
    if ("(){}[]:,.".includes(source[i])) {
      ts.push({ kind: "punct", value: advance(), line: l, col: c });
      continue;
    }
    error(`无法识别字符 ${source[i]}`);
  }
  ts.push({ kind: "eof", value: "", line, col });
  let pos = 0,
    depth = 0;
  const peek = () => ts[pos];
  const take = (v?: string) => {
    const t = ts[pos];
    if (v !== undefined && t.value !== v)
      throw Error(
        `第 ${t.line} 行，第 ${t.col} 列：需要 ${v}，得到 ${t.value || "文件结尾"}`,
      );
    pos++;
    return t;
  };
  const fail = (m: string): never => {
    const t = peek();
    throw Error(`第 ${t.line} 行，第 ${t.col} 列：${m}`);
  };
  function value(): unknown {
    const t = peek();
    if (t.kind === "string") {
      take();
      return t.value;
    }
    if (t.kind === "number") {
      take();
      return Number(t.value);
    }
    if (t.value === ".") {
      take();
      if (peek().kind !== "id") fail("需要枚举名称");
      return take().value;
    }
    if (t.value === "[") {
      take();
      const a: unknown[] = [];
      while (peek().value !== "]") {
        a.push(value());
        if (peek().value !== ",") break;
        take();
      }
      take("]");
      return a;
    }
    return fail("参数应为字符串、数字、数组或 .枚举");
  }
  function call(modifier = false): Call {
    if (++depth > 30) fail("布局嵌套不得超过 30 层");
    if (peek().kind !== "id") fail("需要声明名称");
    const name = take().value,
      args: unknown[] = [],
      named: Record<string, unknown> = {};
    if (peek().value === "(") {
      take();
      while (peek().value !== ")") {
        if (peek().kind === "id" && ts[pos + 1]?.value === ":") {
          const key = take().value;
          take(":");
          if (Object.hasOwn(named, key)) fail(`参数 ${key} 重复`);
          named[key] = value();
        } else args.push(value());
        if (peek().value !== ",") break;
        take();
      }
      take(")");
    }
    const children: Call[] = [];
    if (peek().value === "{") {
      if (modifier) fail("修饰符不能包含内容");
      take();
      while (peek().value !== "}") {
        if (peek().kind === "eof") fail("缺少 }");
        children.push(call());
      }
      take("}");
    }
    const modifiers: Call[] = [];
    if (!modifier)
      while (peek().value === ".") {
        take();
        modifiers.push(call(true));
      }
    depth--;
    return { name, args, named, children, modifiers };
  }
  const root = call();
  if (peek().kind !== "eof") fail("工程只能有一个 Deck 声明");
  return root;
}
