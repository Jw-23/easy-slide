import { DslError, closest } from "./diagnostics";
import { formatCell, validFormat } from "./number-format";
import type { Token } from "./tokens";
export type Expr = {
  kind: string;
  token: Token;
  value?: unknown;
  name?: string;
  op?: string;
  items?: Expr[];
  left?: Expr;
  right?: Expr;
  test?: Expr;
  yes?: Expr;
  no?: Expr;
  args?: Expr[];
  named?: Record<string, Expr>;
  params?: string[];
  body?: Expr;
};
export type Cursor = {
  peek: (offset?: number) => Token;
  take: (value?: string) => Token;
  fail: (message: string, token?: Token) => never;
};
export const binaryPrecedence: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
  "^": 7,
  "**": 7,
};
const binary = binaryPrecedence;
export function parseExpression(c: Cursor): Expr {
  let depth = 0;
  function expr(min = 0): Expr {
    if (++depth > 60) c.fail("表达式嵌套不得超过 60 层");
    let left = prefix();
    while (
      binary[c.peek().value] !== undefined &&
      binary[c.peek().value] >= min
    ) {
      const token = c.take(),
        p = binary[token.value];
      const right = expr(p + (["^", "**"].includes(token.value) ? 0 : 1));
      left = { kind: "binary", token, op: token.value, left, right };
    }
    if (min === 0 && c.peek().value === "?") {
      const token = c.take(),
        yes = expr();
      c.take(":");
      left = { kind: "conditional", token, test: left, yes, no: expr() };
    }
    depth--;
    return left;
  }
  function prefix(): Expr {
    const token = c.peek();
    let node: Expr;
    if (["+", "-", "!"].includes(token.value)) {
      c.take();
      node = { kind: "unary", token, op: token.value, right: expr(7) };
    } else if (token.kind === "number") {
      c.take();
      node = { kind: "literal", token, value: Number(token.value) };
    } else if (token.kind === "string") {
      c.take();
      node = { kind: "literal", token, value: token.value };
    } else if (token.value === ".") {
      c.take();
      if (c.peek().kind !== "id") c.fail("需要枚举名称");
      node = { kind: "literal", token, value: c.take().value };
    } else if (token.value === "[") {
      c.take();
      const items: Expr[] = [];
      while (c.peek().value !== "]") {
        items.push(expr());
        if (c.peek().value !== ",") break;
        c.take();
      }
      c.take("]");
      node = { kind: "array", token, items };
    } else if (token.value === "(") {
      let offset = 1;
      const params: string[] = [];
      while (c.peek(offset).kind === "id") {
        params.push(c.peek(offset++).value);
        if (c.peek(offset).value !== ",") break;
        offset++;
      }
      if (
        params.length &&
        c.peek(offset).value === ")" &&
        c.peek(offset + 1).value === "=>"
      ) {
        c.take();
        for (let n = 0; n < params.length; n++) {
          c.take();
          if (n < params.length - 1) c.take(",");
        }
        c.take(")");
        c.take("=>");
        node = { kind: "lambda", token, params, body: expr() };
      } else {
        c.take();
        node = expr();
        c.take(")");
      }
    } else if (token.kind === "id") {
      c.take();
      if (c.peek().value === "=>") {
        c.take();
        node = { kind: "lambda", token, params: [token.value], body: expr() };
      } else if (["true", "false", "null"].includes(token.value))
        node = {
          kind: "literal",
          token,
          value: token.value === "null" ? null : token.value === "true",
        };
      else node = { kind: "identifier", token, name: token.value };
    } else return c.fail("需要数值、文字、数组、变量或计算表达式", token);
    while (true) {
      if (c.peek().value === "(") {
        const at = c.take(),
          args: Expr[] = [],
          named: Record<string, Expr> = Object.create(null);
        while (c.peek().value !== ")") {
          if (c.peek().kind === "id" && c.peek(1).value === ":") {
            const name = c.take().value;
            c.take(":");
            if (Object.hasOwn(named, name)) c.fail(`重复参数 ${name}`);
            named[name] = expr();
          } else args.push(expr());
          if (c.peek().value !== ",") break;
          c.take();
        }
        c.take(")");
        node = { kind: "invoke", token: at, left: node, args, named };
      } else if (c.peek().value === "[") {
        const at = c.take(),
          right = expr();
        c.take("]");
        node = { kind: "index", token: at, left: node, right };
      } else if (c.peek().value === ".") {
        const at = c.take();
        if (c.peek().kind !== "id") c.fail("需要数组方法或 length");
        node = { kind: "member", token: at, left: node, name: c.take().value };
      } else break;
    }
    return node;
  }
  return expr();
}
export function dynamicExpression(e: Expr): boolean {
  return e.kind === "array"
    ? e.items!.some(dynamicExpression)
    : e.kind !== "literal";
}
export class Scope {
  values = new Map<string, unknown>();
  bindings: string[] = [];
  constructor(public parent?: Scope) {}
  has(name: string): boolean {
    return this.values.has(name) || !!this.parent?.has(name);
  }
  get(name: string): unknown {
    return this.values.has(name)
      ? this.values.get(name)
      : this.parent?.get(name);
  }
  names(): string[] {
    return [...this.values.keys(), ...(this.parent?.names() || [])];
  }
}
export type Budget = { operations: number; calls: number };
type Callable =
  | { tag: "lambda"; params: string[]; body: Expr; scope: Scope }
  | { tag: "builtin"; name: string }
  | { tag: "method"; name: string; receiver: unknown[] };
export const calculationNames = [
  "range",
  "repeat",
  "sum",
  "mean",
  "min",
  "max",
  "pow",
  "sqrt",
  "sin",
  "cos",
  "tan",
  "exp",
  "log",
  "log10",
  "abs",
  "round",
  "floor",
  "ceil",
  "clamp",
  "fixed",
  "percent",
  "format",
  "str",
  "len",
  "concat",
  "transpose",
  "zip",
  "Column",
  "row",
];
function error(e: Expr, message: string): never {
  const t = e.token;
  throw new DslError(
    message,
    t.from,
    t.to,
    t.line,
    t.col,
    "计算在本地解释执行。检查变量定义、参数类型、下标和数值范围。",
  );
}
const MAX_ARRAY = 2000;
export function evaluate(e: Expr, scope: Scope, budget: Budget): unknown {
  if (++budget.operations > 100000)
    error(e, "计算超过 100000 步，请缩小范围或简化表达式");
  const consume = (count: number) => {
    budget.operations += count;
    if (budget.operations > 100000)
      error(e, "计算超过 100000 步，请缩小范围或简化表达式");
  };
  const ev = (n: Expr, s = scope) => evaluate(n, s, budget);
  const num = (v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v))
      error(e, "此运算需要有限数值");
    return v;
  };
  const array = (v: unknown) => {
    if (!Array.isArray(v)) error(e, "此运算需要数组");
    consume((v as unknown[]).length);
    return v as unknown[];
  };
  const boolean = (v: unknown) => {
    if (typeof v !== "boolean")
      error(e, "条件必须为 true / false 或比较表达式");
    return v;
  };
  const safe = (v: unknown): unknown => {
    if (typeof v === "number" && !Number.isFinite(v))
      error(e, "计算结果不是有限数值，请检查除法、开方和指数");
    if (Array.isArray(v) && v.length > MAX_ARRAY)
      error(e, "数组最多包含 2000 项");
    if (Array.isArray(v)) consume(v.length);
    if (typeof v === "string" && v.length > 20000) error(e, "计算文本过长");
    return v;
  };
  function invoke(
    fn: unknown,
    args: unknown[],
    named: Record<string, unknown> = {},
  ): unknown {
    if (++budget.calls > 60) error(e, "函数调用嵌套超过 60 层");
    try {
      const f = fn as Callable;
      if (!f || !["lambda", "builtin", "method"].includes(f.tag))
        error(e, "此值不能作为函数调用");
      if (f.tag === "lambda") {
        if (args.length !== f.params.length || Object.keys(named).length)
          error(e, `函数需要 ${f.params.length} 个参数`);
        const child = new Scope(f.scope);
        f.params.forEach((p, i) => child.values.set(p, args[i]));
        return safe(ev(f.body, child));
      }
      if (f.tag === "method") {
        consume(f.receiver.length);
        if (Object.keys(named).length) error(e, "数组方法不接受命名参数");
        const callItem = (value: unknown, index: number, acc?: unknown) => {
          const lambda = args[0] as Callable;
          if (lambda?.tag !== "lambda")
            error(e, `${f.name} 需要形如 x => ... 的函数`);
          const supplied =
            f.name === "reduce" ? [acc, value, index] : [value, index];
          return invoke(lambda, supplied.slice(0, lambda.params.length));
        };
        if (f.name === "map") {
          if (args.length !== 1) error(e, "map 需要一个函数");
          return safe(f.receiver.map((x, i) => callItem(x, i)));
        }
        if (f.name === "filter") {
          if (args.length !== 1) error(e, "filter 需要一个函数");
          return f.receiver.filter((x, i) => boolean(callItem(x, i)));
        }
        if (f.name === "reduce") {
          if (args.length !== 2) error(e, "reduce 需要函数与初始值");
          return safe(
            f.receiver.reduce((acc, x, i) => callItem(x, i, acc), args[1]),
          );
        }
      }
      const name = (f as { name: string }).name;
      if (name !== "Column" && Object.keys(named).length)
        error(e, `${name} 只接受未命名参数`);
      const arity = (low: number, high = low) => {
        if (args.length < low || args.length > high)
          error(
            e,
            `${name} 需要 ${low === high ? low : `${low}–${high}`} 个参数`,
          );
      };
      const digits = (v: unknown) => {
        const n = num(v);
        if (!Number.isInteger(n) || n < 0 || n > 10)
          error(e, "小数位数必须为 0–10 的整数");
        return n;
      };
      const integers = (v: unknown) => {
        const n = num(v);
        if (!Number.isInteger(n)) error(e, "需要整数");
        return n;
      };
      let result: unknown;
      switch (name) {
        case "range": {
          arity(1, 3);
          const start = args.length === 1 ? 0 : num(args[0]),
            end = num(args.length === 1 ? args[0] : args[1]),
            step = args.length === 3 ? num(args[2]) : 1;
          if (step === 0) error(e, "range 步长不能为 0");
          const count = Math.max(0, Math.ceil((end - start) / step));
          if (count > MAX_ARRAY) error(e, "range 最多生成 2000 项");
          result = Array.from({ length: count }, (_, i) => start + i * step);
          break;
        }
        case "repeat": {
          arity(2);
          const count = integers(args[1]);
          if (count < 0 || count > MAX_ARRAY)
            error(e, "repeat 次数范围 0–2000");
          result = Array.from({ length: count }, () => args[0]);
          break;
        }
        case "sum":
        case "mean":
        case "min":
        case "max": {
          arity(1, MAX_ARRAY);
          const values = (
            args.length === 1 && Array.isArray(args[0]) ? array(args[0]) : args
          ).map(num);
          if (!values.length && name !== "sum")
            error(e, `${name} 需要非空数组`);
          const total = values.reduce((a, b) => a + b, 0);
          result =
            name === "sum"
              ? total
              : name === "mean"
                ? total / values.length
                : name === "min"
                  ? Math.min(...values)
                  : Math.max(...values);
          break;
        }
        case "pow":
          arity(2);
          result = Math.pow(num(args[0]), num(args[1]));
          break;
        case "sin":
        case "cos":
        case "tan":
        case "exp":
        case "log":
        case "log10":
        case "sqrt":
        case "abs":
        case "floor":
        case "ceil":
          arity(1);
          result = Math[name](num(args[0]));
          break;
        case "round": {
          arity(1, 2);
          const n = num(args[0]),
            power = 10 ** digits(args[1] ?? 0);
          result = Math.round((n + Number.EPSILON) * power) / power;
          break;
        }
        case "clamp": {
          arity(3);
          const n = num(args[0]),
            lo = num(args[1]),
            hi = num(args[2]);
          if (lo > hi) error(e, "clamp 下限不能高于上限");
          result = Math.min(hi, Math.max(lo, n));
          break;
        }
        case "fixed":
        case "percent": {
          arity(1, 2);
          const n = num(args[0]),
            d = digits(args[1] ?? (name === "percent" ? 1 : 2));
          result =
            (n * (name === "percent" ? 100 : 1)).toFixed(d) +
            (name === "percent" ? "%" : "");
          break;
        }
        case "format": {
          arity(2);
          if (typeof args[1] !== "string" || !validFormat(args[1]))
            error(e, "数字格式示例：0、0.000、0.0%、.2f");
          result = formatCell(num(args[0]), args[1]);
          break;
        }
        case "str":
          arity(1);
          if (
            !["string", "number", "boolean"].includes(typeof args[0]) &&
            args[0] !== null
          )
            error(e, "str 仅转换标量");
          result = String(args[0]);
          break;
        case "len":
          arity(1);
          if (typeof args[0] !== "string" && !Array.isArray(args[0]))
            error(e, "len 需要文字或数组");
          result = (args[0] as string | unknown[]).length;
          break;
        case "concat":
          arity(1, 100);
          result = args.flatMap(array);
          break;
        case "row":
          arity(0, 20);
          result = args;
          break;
        case "transpose": {
          arity(1);
          const rows = array(args[0]).map(array),
            cols = rows[0]?.length || 0;
          if (rows.some((r) => r.length !== cols))
            error(e, "transpose 需要每行长度相同");
          result = Array.from({ length: cols }, (_, i) =>
            rows.map((r) => r[i]),
          );
          break;
        }
        case "zip": {
          arity(2, 20);
          const arrays = args.map(array),
            length = Math.min(...arrays.map((a) => a.length));
          result = Array.from({ length }, (_, i) => arrays.map((a) => a[i]));
          break;
        }
        case "Column": {
          arity(1);
          if (typeof args[0] !== "string") error(e, "Column 标题必须是文字");
          for (const key of Object.keys(named))
            if (!["width", "align", "format"].includes(key))
              error(e, `Column 未知参数 ${key}`);
          const width = named.width ?? 1,
            align = named.align ?? "left",
            format = named.format;
          if (
            typeof width !== "number" ||
            !Number.isFinite(width) ||
            width <= 0
          )
            error(e, "Column width 必须大于 0");
          if (!["left", "center", "right"].includes(String(align)))
            error(e, "Column align 支持 .left / .center / .right");
          if (
            format !== undefined &&
            (typeof format !== "string" || !validFormat(format))
          )
            error(e, "Column format 示例：0.00 或 0.0%");
          result = {
            label: args[0],
            width,
            align,
            ...(format !== undefined ? { format } : {}),
          };
          break;
        }
        default:
          return error(e, `未知计算函数 ${name}`);
      }
      return safe(result);
    } finally {
      budget.calls--;
    }
  }
  switch (e.kind) {
    case "literal":
      return e.value;
    case "array":
      return safe(e.items!.map((n) => ev(n)));
    case "identifier":
      if (scope.has(e.name!)) return scope.get(e.name!);
      if (calculationNames.includes(e.name!))
        return { tag: "builtin", name: e.name };
      error(
        e,
        `未定义变量或函数 ${e.name}${closest(e.name!, [...scope.names(), ...calculationNames]) ? `；是否想写 ${closest(e.name!, [...scope.names(), ...calculationNames])}？` : ""}`,
      );
    case "lambda":
      if (new Set(e.params).size !== e.params!.length)
        error(e, "函数参数不能重名");
      return { tag: "lambda", params: e.params, body: e.body, scope };
    case "unary": {
      const v = ev(e.right!);
      return e.op === "!" ? !boolean(v) : safe(e.op === "-" ? -num(v) : num(v));
    }
    case "binary": {
      const a = ev(e.left!);
      if (e.op === "&&") return boolean(a) && boolean(ev(e.right!));
      if (e.op === "||") return boolean(a) || boolean(ev(e.right!));
      const b = ev(e.right!);
      switch (e.op) {
        case "+":
          if (Array.isArray(a) && Array.isArray(b)) return safe([...a, ...b]);
          if (typeof a === "string" || typeof b === "string") {
            if (
              ![a, b].every(
                (v) =>
                  v === null ||
                  ["string", "number", "boolean"].includes(typeof v),
              )
            )
              error(e, "文字只能与标量拼接");
            return safe(String(a) + String(b));
          }
          return safe(num(a) + num(b));
        case "-":
          return safe(num(a) - num(b));
        case "*":
          return safe(num(a) * num(b));
        case "/":
          if (num(b) === 0) error(e, "除数不能为 0");
          return safe(num(a) / num(b));
        case "%":
          if (num(b) === 0) error(e, "取余除数不能为 0");
          return safe(num(a) % num(b));
        case "^":
        case "**":
          return safe(num(a) ** num(b));
        case "==":
        case "!=":
          if (
            Array.isArray(a) ||
            Array.isArray(b) ||
            (typeof a === "object" && a !== null) ||
            (typeof b === "object" && b !== null)
          )
            error(e, "相等比较仅支持标量");
          return e.op === "==" ? a === b : a !== b;
        default: {
          if (!(
            (typeof a === "number" && typeof b === "number") ||
            (typeof a === "string" && typeof b === "string")
          ))
            error(e, "比较两侧应同为数值或文字");
          return e.op === "<"
            ? a! < b!
            : e.op === "<="
              ? a! <= b!
              : e.op === ">"
                ? a! > b!
                : a! >= b!;
        }
      }
    }
    case "conditional":
      return boolean(ev(e.test!)) ? ev(e.yes!) : ev(e.no!);
    case "index": {
      const a = ev(e.left!),
        i = num(ev(e.right!));
      if (
        (!Array.isArray(a) && typeof a !== "string") ||
        !Number.isInteger(i) ||
        i < 0 ||
        i >= a.length
      )
        error(e, "数组或文字下标越界，使用 0 开始的整数下标");
      return a[i];
    }
    case "member": {
      const a = ev(e.left!);
      if (e.name === "length" && (Array.isArray(a) || typeof a === "string"))
        return a.length;
      if (Array.isArray(a) && ["map", "filter", "reduce"].includes(e.name!))
        return { tag: "method", name: e.name, receiver: a };
      return error(
        e,
        "仅支持数组的 map / filter / reduce，以及数组或文字的 length",
      );
    }
    case "invoke":
      return invoke(
        ev(e.left!),
        e.args!.map((n) => ev(n)),
        Object.fromEntries(
          Object.entries(e.named!).map(([k, v]) => [k, ev(v)]),
        ),
      );
    default:
      return error(e, "未知表达式");
  }
}
