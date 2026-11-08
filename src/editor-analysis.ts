import type { Text } from "@codemirror/state";
import {
  astPath,
  parseEditorAst,
  type AstNode,
  type EditorAst,
} from "./editor-ast";
import {
  array,
  boolean,
  compatible,
  number,
  signatures,
  string,
  typeLabel,
  union,
  unknown,
  type ParameterSpec,
  type Signature,
  type ValueType,
} from "./editor-schema";

export type SymbolInfo = {
  name: string;
  node: AstNode;
  scope: LexicalScope;
  parameter?: number;
};
type LexicalScope = { parent?: LexicalScope; symbols: Map<string, SymbolInfo> };
export type CallContext = {
  call: AstNode;
  argument: AstNode;
  index: number;
  signature: Signature;
  parameter?: ParameterSpec;
  inLabel: boolean;
};
const cache = new WeakMap<Text, EditorAnalysis>();
export function analyzeDocument(doc: Text): EditorAnalysis {
  let model = cache.get(doc);
  if (!model) {
    model = new EditorAnalysis(doc.toString());
    cache.set(doc, model);
  }
  return model;
}
/** Bounded static inference: never calls evaluate(), even for range/reduce or user lambdas. */
export class EditorAnalysis {
  ast: EditorAst;
  private scopes = new WeakMap<AstNode, LexicalScope>();
  private symbols = new WeakMap<AstNode, SymbolInfo>();
  private types = new WeakMap<AstNode, ValueType>();
  private resolving = new Set<AstNode>();
  constructor(public source: string) {
    try {
      this.ast = parseEditorAst(source);
    } catch {
      this.ast = {
        root: { kind: "program", from: 0, to: source.length, children: [] },
        tokens: [],
      };
    }
    const visit = (node: AstNode, scope: LexicalScope) => {
      if (
        (node.kind === "block" && node.parent?.name !== "Deck") ||
        node.kind === "lambda"
      )
        scope = { parent: scope, symbols: new Map() };
      this.scopes.set(node, scope);
      if (node.kind === "binding" && node.name) {
        const symbol = { name: node.name, node, scope };
        scope.symbols.set(node.name, symbol);
        this.symbols.set(node, symbol);
      }
      if (node.kind === "lambda")
        node.params?.forEach((p, index) => {
          const symbol = { name: p.name!, node: p, scope, parameter: index };
          scope.symbols.set(p.name!, symbol);
          this.symbols.set(p, symbol);
        });
      return scope;
    };
    const pending = [
      { node: this.ast.root, scope: { symbols: new Map() } as LexicalScope },
    ];
    while (pending.length) {
      const { node, scope } = pending.pop()!;
      const next = visit(node, scope);
      for (let i = node.children.length - 1; i >= 0; i--)
        pending.push({ node: node.children[i], scope: next });
    }
  }
  path(pos: number) {
    return astPath(this.ast.root, pos);
  }
  tokenAt(pos: number) {
    // Tokens are sorted; use a binary search rather than scanning the complete file per keypress.
    const ts = this.ast.tokens;
    let lo = 0,
      hi = ts.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (ts[mid].from < pos) lo = mid + 1;
      else hi = mid;
    }
    const previous = ts[lo - 1];
    return previous && previous.to >= pos
      ? previous
      : ts[lo]?.from === pos
        ? ts[lo]
        : undefined;
  }
  private scopeAt(pos: number) {
    return this.scopes.get(this.path(pos).at(-1) ?? this.ast.root)!;
  }
  private visible(symbol: SymbolInfo, pos: number) {
    if (symbol.node.kind === "parameter")
      return pos >= symbol.node.parent!.body!.from;
    const n = symbol.node;
    return (
      n.to < pos ||
      (n.initializer?.kind === "lambda" &&
        pos >= n.initializer.body!.from &&
        pos <= n.to)
    );
  }
  visibleSymbols(pos: number) {
    const found = new Map<string, SymbolInfo>();
    for (
      let scope: LexicalScope | undefined = this.scopeAt(pos);
      scope;
      scope = scope.parent
    )
      for (const [name, symbol] of scope.symbols)
        if (!found.has(name) && this.visible(symbol, pos))
          found.set(name, symbol);
    return [...found.values()];
  }
  resolve(name: string, node: AstNode): SymbolInfo | undefined {
    for (let scope = this.scopes.get(node); scope; scope = scope.parent) {
      const s = scope.symbols.get(name);
      if (s && this.visible(s, node.from)) return s;
    }
  }
  symbolType(symbol: SymbolInfo): ValueType {
    return this.infer(symbol.node);
  }
  symbolAt(pos: number): SymbolInfo | undefined {
    const token = this.tokenAt(pos);
    if (token?.kind !== "id") return;
    for (const node of [...this.path(pos)].reverse()) {
      if (node.kind === "identifier" && node.name === token.value)
        return this.resolve(token.value, node);
      if (
        ((node.kind === "binding" && node.nameFrom === token.from) ||
          (node.kind === "parameter" && node.from === token.from)) &&
        node.name === token.value
      )
        return this.symbols.get(node);
    }
  }
  signature(call: AstNode): Signature | undefined {
    const callee = call.callee;
    if (!callee) return;
    if (callee.kind === "member") {
      const type = this.infer(callee.receiver!);
      const spec = signatures.get(callee.name ?? "");
      if (
        spec?.category === "modifier" &&
        type.kind === "component" &&
        spec.receivers?.includes(type.name!)
      )
        return spec;
      if (spec?.category === "method" && type.kind === "array") return spec;
      return;
    }
    const symbol = callee.name && this.resolve(callee.name, callee);
    if (symbol) {
      const type = this.symbolType(symbol);
      if (type.kind !== "function") return;
      const lambda = symbol.node.initializer;
      return {
        name: symbol.name,
        detail: "已声明函数",
        params: (type.params ?? []).map((type, i) => ({
          name: lambda?.params?.[i]?.name ?? `arg${i + 1}`,
          type,
          detail: "函数参数",
        })),
        snippet: "",
        category: "calculation",
        result: type.result ?? unknown,
      };
    }
    return signatures.get(callee.name ?? "");
  }
  callContext(pos: number): CallContext | undefined {
    const path = this.path(pos);
    // The nearest argument wins; a nested function must not inherit the outer function's enum.
    for (let i = path.length - 1; i >= 0; i--) {
      const argument = path[i];
      if (argument.kind !== "argument" || argument.parent?.kind !== "call")
        continue;
      const call = argument.parent,
        signature = this.signature(call);
      if (!signature) return;
      const index = call.args!.filter((a) => !a.name).indexOf(argument);
      const parameter = argument.name
        ? signature.params.find((p) => p.named && p.name === argument.name)
        : signature.params.filter((p) => !p.named)[index];
      return {
        call,
        argument,
        index,
        signature,
        parameter,
        inLabel: argument.colon === undefined || pos < argument.colon,
      };
    }
  }
  expectedAt(pos: number): ValueType {
    const ctx = this.callContext(pos);
    let expected = ctx?.parameter?.type ?? unknown;
    const path = this.path(pos);
    const start = ctx ? path.indexOf(ctx.argument) + 1 : 0;
    const inside = path.slice(start);
    for (const n of inside) {
      if (n.kind === "lambda") {
        const call = n.parent?.parent;
        expected =
          call?.callee?.name === "filter"
            ? boolean
            : call?.callee?.name === "reduce" && call.args?.[1]
              ? this.infer(call.args[1])
              : unknown;
      }
      if (n.kind === "array" && expected.kind === "array")
        expected = expected.element ?? unknown;
    }
    const binary = [...inside].reverse().find((n) => n.kind === "binary");
    if (binary?.op === "+") expected = unknown;
    if (
      binary &&
      binary.op &&
      !["+", "==", "!=", "&&", "||"].includes(binary.op)
    )
      expected = number;
    if (binary && ["&&", "||"].includes(binary.op ?? "")) expected = boolean;
    return expected;
  }
  memberAt(pos: number) {
    return [...this.path(pos)]
      .reverse()
      .find((n) => n.kind === "member" && pos >= n.open! && pos <= n.to);
  }
  stringAt(pos: number) {
    const t = this.tokenAt(pos);
    return t?.kind === "string" && pos >= t.contentFrom! && pos <= t.contentTo!
      ? t
      : undefined;
  }
  infer(
    node: AstNode,
    overrides = new Map<AstNode, ValueType>(),
    depth = 0,
  ): ValueType {
    if (depth > 32) return unknown;
    const override = overrides.get(node);
    if (override) return override;
    const cached = !overrides.size && this.types.get(node);
    if (cached) return cached;
    if (this.resolving.has(node)) return unknown;
    this.resolving.add(node);
    const infer = (n?: AstNode) =>
      n ? this.infer(n, overrides, depth + 1) : unknown;
    let result: ValueType = unknown;
    try {
      switch (node.kind) {
        case "binding":
          result = infer(node.initializer);
          break;
        case "parameter":
          result = this.parameterType(node, overrides, depth + 1);
          break;
        case "literal":
          result =
            typeof node.value === "number"
              ? number
              : typeof node.value === "string"
                ? string
                : typeof node.value === "boolean"
                  ? boolean
                  : { kind: "null" };
          break;
        case "enum":
          result = string;
          break;
        case "array": {
          const items = node.children.map(infer);
          result = array(union(items), items);
          break;
        }
        case "group":
        case "argument":
          result = infer(node.children[0]);
          break;
        case "identifier": {
          const symbol = this.resolve(node.name!, node),
            spec = signatures.get(node.name!);
          result = symbol
            ? infer(symbol.node)
            : spec?.category === "calculation"
              ? {
                  kind: "function",
                  params: spec.params
                    .filter((p) => !p.named)
                    .map((p) => p.type),
                  result: spec.result,
                  name: spec.name,
                }
              : spec && ["view", "container", "root"].includes(spec.category)
                ? { kind: "component", name: spec.name }
                : unknown;
          break;
        }
        case "unary":
          result = node.op === "!" ? boolean : number;
          break;
        case "binary": {
          if (["==", "!=", "<", "<=", ">", ">=", "&&", "||"].includes(node.op!))
            result = boolean;
          else if (node.op === "+") {
            const a = infer(node.children[0]),
              b = infer(node.children[1]);
            result =
              a.kind === "string" || b.kind === "string"
                ? string
                : a.kind === "array" && b.kind === "array"
                  ? array(union([a.element!, b.element!]))
                  : number;
          } else result = number;
          break;
        }
        case "conditional":
          result = union(node.children.slice(1).map(infer));
          break;
        case "lambda":
          result = {
            kind: "function",
            params: node.params!.map(infer),
            result: infer(node.body),
          };
          break;
        case "member": {
          const receiver = infer(node.receiver);
          if (
            node.name === "length" &&
            ["array", "string"].includes(receiver.kind)
          )
            result = number;
          else if (
            receiver.kind === "component" &&
            signatures.get(node.name!)?.receivers?.includes(receiver.name!)
          )
            result = receiver;
          else if (
            receiver.kind === "array" &&
            ["map", "filter", "reduce"].includes(node.name!)
          )
            result = { kind: "function" };
          break;
        }
        case "index": {
          const receiver = infer(node.receiver),
            key = node.children[1];
          result =
            receiver.kind === "string"
              ? string
              : receiver.kind === "array"
                ? (receiver.tuple?.[Number(key.value)] ??
                  receiver.element ??
                  unknown)
                : unknown;
          break;
        }
        case "call": {
          const args = node
              .args!.filter((a) => !a.name)
              .map((a) => a.children[0]),
            callee = node.callee!;
          const types = args.map(infer);
          if (callee.kind === "member") {
            const receiver = infer(callee.receiver),
              name = callee.name;
            if (
              receiver.kind === "component" &&
              signatures.get(name!)?.receivers?.includes(receiver.name!)
            )
              result = receiver;
            else if (receiver.kind === "array") {
              if (name === "filter") result = receiver;
              else if (name === "map")
                result = array(
                  this.lambdaResult(
                    args[0],
                    [receiver.element ?? unknown, number],
                    overrides,
                    depth + 1,
                  ),
                );
              else if (name === "reduce")
                result = union([
                  types[1] ?? unknown,
                  this.lambdaResult(
                    args[0],
                    [types[1] ?? unknown, receiver.element ?? unknown, number],
                    overrides,
                    depth + 1,
                  ),
                ]);
            }
          } else {
            const symbol = this.resolve(callee.name!, callee),
              spec = signatures.get(callee.name!);
            if (symbol)
              result = this.lambdaResult(
                symbol.node.initializer,
                types,
                overrides,
                depth + 1,
              );
            else if (
              spec &&
              ["root", "view", "container"].includes(spec.category)
            )
              result = { kind: "component", name: spec.name };
            else if (spec) {
              result = spec.result;
              if (callee.name === "repeat") result = array(types[0]);
              if (callee.name === "concat")
                result = array(union(types.map((t) => t.element ?? unknown)));
              if (callee.name === "row") result = array(union(types), types);
              if (callee.name === "zip") {
                const items = types.map((t) => t.element ?? unknown);
                result = array(array(union(items), items));
              }
              if (callee.name === "transpose")
                result = array(array(types[0]?.element?.element));
            }
          }
          break;
        }
      }
    } finally {
      this.resolving.delete(node);
    }
    if (!overrides.size) this.types.set(node, result);
    return result;
  }
  private lambdaResult(
    node: AstNode | undefined,
    args: ValueType[],
    overrides: Map<AstNode, ValueType>,
    depth: number,
  ): ValueType {
    if (!node || depth > 32) return unknown;
    if (node.kind === "identifier") {
      const symbol = this.resolve(node.name!, node);
      return symbol
        ? this.lambdaResult(symbol.node.initializer, args, overrides, depth + 1)
        : (this.infer(node).result ?? unknown);
    }
    if (node.kind !== "lambda") return unknown;
    const local = new Map(overrides);
    node.params!.forEach((p, i) => local.set(p, args[i] ?? unknown));
    return this.infer(node.body!, local, depth + 1);
  }
  private parameterType(
    node: AstNode,
    overrides: Map<AstNode, ValueType>,
    depth: number,
  ): ValueType {
    const lambda = node.parent,
      argument = lambda?.parent,
      call = argument?.parent;
    if (
      lambda?.kind !== "lambda" ||
      argument?.kind !== "argument" ||
      call?.kind !== "call" ||
      call.callee?.kind !== "member"
    )
      return unknown;
    const receiver = this.infer(call.callee.receiver!, overrides, depth + 1);
    if (receiver.kind !== "array") return unknown;
    const index = lambda.params!.indexOf(node);
    if (call.callee.name === "reduce")
      return index === 0
        ? this.infer(call.args![1], overrides, depth + 1)
        : index === 1
          ? (receiver.element ?? unknown)
          : number;
    return index === 0 ? (receiver.element ?? unknown) : number;
  }
  symbolDescription(symbol: SymbolInfo) {
    const t = this.symbolType(symbol),
      line = this.source.slice(0, symbol.node.from).split("\n").length;
    return `${typeLabel(t)} · ${symbol.parameter === undefined ? "常量" : "回调参数"} · 第 ${line} 行`;
  }
  expectedBoost(actual: ValueType, expected: ValueType) {
    return actual.kind === "unknown"
      ? 0
      : compatible(actual, expected)
        ? expected.kind === "unknown"
          ? 8
          : 35
        : -30;
  }
}
