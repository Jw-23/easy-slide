import { bodyProse } from "./prose";
import { DslError } from "./diagnostics";
import { builtinComponentNames } from "./component-names";
import { tokenize, type Token } from "./tokens";
import {
  Scope,
  parseExpression,
  evaluate,
  dynamicExpression,
  type Cursor,
  type Budget,
  type Expr,
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
  functions?: string[];
  custom?: boolean;
  generated?: boolean;
  definitionLine?: number;
  declarations?: { name: string; from: number; to: number }[];
};
type ComponentFunction = {
  name: string;
  from: number;
  origin: Token;
  params: { name: string; default?: Expr; token: Token }[];
  start: number;
  end: number;
  to: number;
  scope: Scope;
  text: string;
};
type Expansion = {
  definition: ComponentFunction;
  invocation: Call;
  provided: Call[];
  used: Set<number>;
};
/** The DSL interprets expressions and component functions; it never executes JavaScript. */
export function readSyntax(source: string): Call {
  const ts = tokenize(source);
  let pos = 0,
    depth = 0,
    expandedCalls = 0;
  const budget: Budget = { operations: 0, calls: 0 },
    definitions = new Map<string, ComponentFunction>(),
    expansions: Expansion[] = [];
  const peek = (offset = 0) => ts[Math.min(pos + offset, ts.length - 1)];
  const fail = (message: string, t = peek()): never => {
    throw new DslError(
      message,
      t.from,
      t.to,
      t.line,
      t.col,
      "检查参数、括号和声明顺序。布局函数使用 func，参数默认值使用 =，调用参数使用 name: value。",
    );
  };
  const take = (value?: string) => {
    const t = peek();
    if (value !== undefined && t.value !== value)
      fail(`需要 ${value}，得到 ${t.value || "文件结尾"}`, t);
    pos++;
    return t;
  };
  const cursor: Cursor = { peek, take, fail },
    global = new Scope();
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
    if (["true", "false", "null", "let", "func"].includes(name))
      fail(`不能将 ${name} 用作变量名`, origin);
    take("=");
    const node = parseExpression(cursor);
    scope.values.set(name, evaluate(node, scope, budget));
    if (peek().value === ";") take();
    scope.bindings.push(snippet(origin.from, ts[pos - 1].to, origin.col));
  }
  function declaration(scope: Scope) {
    const start = take("func"),
      origin = take();
    if (origin.kind !== "id") fail("func 后需要函数名", origin);
    if (definitions.has(origin.value))
      fail(`布局函数 ${origin.value} 重复定义`, origin);
    if (
      (builtinComponentNames as readonly string[]).includes(origin.value) ||
      ["let", "func", "true", "false", "null"].includes(origin.value)
    )
      fail(`不能覆盖内置名称 ${origin.value}`, origin);
    take("(");
    const params: ComponentFunction["params"] = [];
    while (peek().value !== ")") {
      const token = take();
      if (
        token.kind !== "id" ||
        ["let", "func", "true", "false", "null"].includes(token.value)
      )
        fail("需要合法参数名称", token);
      if (params.some((p) => p.name === token.value))
        fail(`参数 ${token.value} 重复`, token);
      const param: ComponentFunction["params"][number] = {
        name: token.value,
        token,
      };
      if (peek().value === "=") {
        take();
        param.default = parseExpression(cursor);
      }
      params.push(param);
      if (params.length > 24) fail("布局函数最多接受 24 个参数", origin);
      if (peek().value !== ",") break;
      take();
    }
    take(")");
    take("{");
    const body = pos;
    let nesting = 1;
    while (nesting) {
      const t = take();
      if (t.kind === "eof") fail(`函数 ${origin.value} 缺少 }`, origin);
      if (t.kind === "punct" && t.value === "{") nesting++;
      if (t.kind === "punct" && t.value === "}") nesting--;
    }
    const end = pos - 1,
      to = ts[end].to;
    definitions.set(origin.value, {
      name: origin.value,
      from: start.from,
      origin,
      params,
      start: body,
      end,
      to,
      scope,
      text: snippet(start.from, to, start.col),
    });
    if (definitions.size > 100) fail("工程最多定义 100 个布局函数", origin);
  }
  function expand(invocation: Call, definition: ComponentFunction): Call[] {
    if (expansions.some((e) => e.definition === definition))
      fail(
        `不支持递归布局函数：${[...expansions.map((e) => e.definition.name), definition.name].join(" → ")}`,
        ts.find((t) => t.from === invocation.from),
      );
    if (expansions.length >= 16)
      fail("布局函数调用最多嵌套 16 层", definition.origin);
    const scope = new Scope(definition.scope);
    if (invocation.args.length > definition.params.length)
      fail(
        `${definition.name} 最多接受 ${definition.params.length} 个位置参数`,
        definition.origin,
      );
    for (const key of Object.keys(invocation.named))
      if (!definition.params.some((p) => p.name === key))
        fail(
          `${definition.name}：未知参数 ${key}；可用参数：${definition.params.map((p) => p.name).join(", ")}`,
          ts.find((t) => t.from === invocation.from),
        );
    definition.params.forEach((parameter, i) => {
      const positional = i < invocation.args.length,
        named = Object.hasOwn(invocation.named, parameter.name);
      if (positional && named)
        fail(
          `${definition.name}：参数 ${parameter.name} 被重复传入`,
          parameter.token,
        );
      let value: unknown;
      if (positional) value = invocation.args[i];
      else if (named) value = invocation.named[parameter.name];
      else if (parameter.default)
        value = evaluate(parameter.default, scope, budget);
      else
        fail(
          `${definition.name}：缺少参数 ${parameter.name}`,
          ts.find((t) => t.from === invocation.from),
        );
      scope.values.set(parameter.name, value);
    });
    const saved = pos,
      frame: Expansion = {
        definition,
        invocation,
        provided: invocation.children,
        used: new Set(),
      };
    expansions.push(frame);
    pos = definition.start;
    const result: Call[] = [];
    let seen = false;
    try {
      while (pos < definition.end) {
        if (peek().value === "let") {
          if (seen) fail("请把函数内 let 放在组件之前");
          binding(scope);
        } else if (peek().value === "func") fail("请在顶层定义布局函数");
        else {
          result.push(...statement(scope));
          seen = true;
        }
      }
      if (!result.length)
        fail(`${definition.name} 至少需要一个布局或元素`, definition.origin);
      if (frame.used.size !== frame.provided.length)
        fail(
          `${definition.name} 有 ${frame.provided.length - frame.used.size} 个内容未使用，请在函数中添加 Content() 或 Slot(index)`,
          ts.find((t) => t.from === invocation.from),
        );
      const remap = (call: Call): Call => {
        if (!call.generated) return call;
        return {
          ...call,
          from: invocation.from,
          to: invocation.to,
          line: invocation.line,
          col: invocation.col,
          definitionLine: definition.origin.line,
          children: call.children.map(remap),
          modifiers: call.modifiers,
        };
      };
      return result.map(remap);
    } catch (problem) {
      if (problem instanceof DslError)
        throw new DslError(
          `${definition.name}：${problem.detail}`,
          problem.from,
          problem.to,
          problem.line,
          problem.column,
          `${problem.hint} 调用 ${definition.name} 位于第 ${invocation.line} 行，定义位于第 ${definition.origin.line} 行。`,
        );
      throw problem;
    } finally {
      pos = saved;
      expansions.pop();
    }
  }
  function statement(scope: Scope): Call[] {
    const node = call(scope);
    if (node.name !== "Content" && node.name !== "Slot") return [node];
    const frame =
      expansions.at(-1) ??
      fail(
        `${node.name} 只能用于布局函数内部`,
        ts.find((t) => t.from === node.from),
      );
    if (
      node.children.length ||
      node.modifiers.length ||
      Object.keys(node.named).length
    )
      fail(
        `${node.name} 不能包含内容、命名参数或修饰符`,
        ts.find((t) => t.from === node.from),
      );
    if (node.name === "Content") {
      if (node.args.length) fail("Content() 不接受参数");
      return frame.provided.filter((_, i) => {
        if (frame.used.has(i)) return false;
        frame.used.add(i);
        return true;
      });
    }
    const i = node.args[0];
    if (
      node.args.length !== 1 ||
      typeof i !== "number" ||
      !Number.isInteger(i) ||
      i < 0
    )
      return fail("Slot(index) 需要一个非负整数");
    if (i >= frame.provided.length)
      fail(
        `Slot(${i}) 需要第 ${i + 1} 个内容，实际只有 ${frame.provided.length} 个`,
      );
    if (frame.used.has(i)) fail(`Slot(${i}) 已使用，不可重复放置`);
    frame.used.add(i);
    return [frame.provided[i]];
  }
  function call(scope: Scope, modifier = false): Call {
    if (++depth > 30) fail("布局嵌套不得超过 30 层");
    if (peek().kind !== "id") fail("需要组件声明或 let");
    const origin = peek(),
      name = take().value,
      args: unknown[] = [],
      named: Record<string, unknown> = Object.create(null),
      generated = expansions.length > 0;
    if (generated && ++expandedCalls > 12000)
      fail("布局函数展开超过 12000 个组件，请减少重复内容");
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
    if (peek().prose) {
      const body = take();
      if (args.length || Object.hasOwn(named, "text"))
        fail("Text 正文已写在 { } 中，请不要同时传入 text 参数或字符串", body);
      try {
        args.push(bodyProse(body.value));
      } catch (problem) {
        fail(
          problem instanceof Error ? problem.message : String(problem),
          body,
        );
      }
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
        } else if (peek().value === "func") {
          if (name !== "Deck") fail("请在顶层定义布局函数");
          declaration(childScope);
        } else {
          children.push(...statement(childScope));
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
    const result: Call = {
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
      ...(generated ? { generated: true } : {}),
    };
    const definition = !modifier && definitions.get(name);
    if (definition) {
      result.custom = true;
      result.children = expand(result, definition);
      dynamic = true;
    }
    if (dynamic)
      result.expressionSource = snippet(origin.from, result.to, origin.col);
    depth--;
    return result;
  }
  while (["let", "func"].includes(peek().value)) {
    if (peek().value === "let") binding(global);
    else declaration(global);
  }
  const root = call(global);
  while (peek().kind !== "eof") {
    if (peek().value === "let") binding(global);
    else if (peek().value === "func") declaration(global);
    else root.children.push(...statement(global));
  }
  if (global.bindings.length) root.bindings = global.bindings;
  if (definitions.size) {
    root.functions = [...definitions.values()].map((d) => d.text);
    root.declarations = [...definitions.values()].map((d) => ({
      name: d.name,
      from: d.from,
      to: d.to,
    }));
  }
  return root;
}
