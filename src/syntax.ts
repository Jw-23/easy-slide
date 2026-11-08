import { DslError } from "./diagnostics";
import { tokenize, type Token } from "./tokens";
import {
  Scope,
  parseExpression,
  evaluate,
  dynamicExpression,
  type Cursor,
  type Budget,
} from "./expressions";
export type Call = {
  name: string;
  from: number;
  to: number;
  line: number;
  col: number;
  args: unknown[];
  named: Record<string, unknown>;
  children: Call[];
  modifiers: Call[];
  bindings?: string[];
  expressionSource?: string;
};
/** Declarations and bounded expressions are interpreted, never executed as JavaScript. */
export function readSyntax(source: string): Call {
  const ts = tokenize(source);
  let pos = 0,
    depth = 0;
  const budget: Budget = { operations: 0, calls: 0 };
  const peek = (offset = 0) => ts[Math.min(pos + offset, ts.length - 1)];
  const fail = (message: string, t = peek()): never => {
    throw new DslError(
      message,
      t.from,
      t.to,
      t.line,
      t.col,
      "检查此处的声明、参数类型与括号。变量先用 let 定义，再在当前作用域中使用。",
    );
  };
  const take = (v?: string) => {
    const t = peek();
    if (v !== undefined && t.value !== v)
      fail(`需要 ${v}，得到 ${t.value || "文件结尾"}`, t);
    pos++;
    return t;
  };
  const cursor: Cursor = { peek, take, fail };
  const global = new Scope();
  const snippet = (from: number, to: number, col: number) =>
    source
      .slice(from, to)
      .split("\n")
      .map((line, i) =>
        i ? line.slice(Math.min(col - 1, line.match(/^ */)![0].length)) : line,
      )
      .join("\n");
  function binding(scope: Scope) {
    const origin = take("let");
    if (peek().kind !== "id") fail("let 后需要变量名");
    const name = take().value;
    if (scope.values.has(name)) fail(`变量 ${name} 已在此作用域定义`, origin);
    if (["true", "false", "null", "let"].includes(name))
      fail(`不能将 ${name} 用作变量名`, origin);
    take("=");
    const node = parseExpression(cursor);
    const result = evaluate(node, scope, budget);
    scope.values.set(name, result);
    if (peek().value === ";") take();
    scope.bindings.push(snippet(origin.from, ts[pos - 1].to, origin.col));
  }
  function call(scope: Scope, modifier = false): Call {
    if (++depth > 30) fail("布局嵌套不得超过 30 层");
    if (peek().kind !== "id") fail("需要组件声明或 let");
    const origin = peek(),
      name = take().value,
      args: unknown[] = [],
      named: Record<string, unknown> = Object.create(null);
    let dynamic = false;
    const value = () => {
      const node = parseExpression(cursor);
      dynamic ||= dynamicExpression(node);
      return evaluate(node, scope, budget);
    };
    if (peek().value === "(") {
      take();
      while (peek().value !== ")") {
        if (peek().kind === "id" && peek(1).value === ":") {
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
    const children: Call[] = [],
      childScope = name === "Deck" ? scope : new Scope(scope);
    let seenContent = false;
    if (peek().value === "{") {
      if (modifier) fail("修饰符不能包含组件");
      take();
      while (peek().value !== "}") {
        if (peek().kind === "eof") fail("缺少 }");
        if (peek().value === "let") {
          if (seenContent) fail("请把当前作用域的 let 声明放在组件之前");
          binding(childScope);
        } else {
          children.push(call(childScope));
          seenContent = true;
        }
      }
      take("}");
    }
    const modifiers: Call[] = [];
    if (!modifier)
      while (peek().value === ".") {
        take();
        modifiers.push(call(scope, true));
      }
    const bindings =
      name !== "Deck" && childScope.bindings.length
        ? childScope.bindings
        : undefined;
    dynamic ||=
      !!bindings ||
      children.some((c) => !!c.expressionSource) ||
      modifiers.some((c) => !!c.expressionSource);
    depth--;
    return {
      name,
      args,
      named,
      children,
      modifiers,
      from: origin.from,
      to: ts[pos - 1].to,
      line: origin.line,
      col: origin.col,
      ...(bindings ? { bindings } : {}),
      ...(dynamic
        ? { expressionSource: snippet(origin.from, ts[pos - 1].to, origin.col) }
        : {}),
    };
  }
  while (peek().value === "let") binding(global);
  const root = call(global);
  while (peek().kind !== "eof") {
    if (peek().value === "let") binding(global);
    else root.children.push(call(global));
  }
  if (global.bindings.length) root.bindings = global.bindings;
  return root;
}
