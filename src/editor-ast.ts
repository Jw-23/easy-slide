import { tokenize, type Token } from "./tokens";
import { binaryPrecedence } from "./expressions";

/** Loss-tolerant, unevaluated editor AST. Missing delimiters never discard later statements. */
export type AstNode = {
  kind:
    | "program"
    | "block"
    | "binding"
    | "declaration"
    | "identifier"
    | "literal"
    | "enum"
    | "array"
    | "group"
    | "unary"
    | "binary"
    | "conditional"
    | "lambda"
    | "parameter"
    | "call"
    | "argument"
    | "member"
    | "index"
    | "missing"
    | "error";
  from: number;
  to: number;
  children: AstNode[];
  parent?: AstNode;
  name?: string;
  nameFrom?: number;
  nameTo?: number;
  token?: Token;
  value?: unknown;
  op?: string;
  callee?: AstNode;
  receiver?: AstNode;
  args?: AstNode[];
  body?: AstNode;
  params?: AstNode[];
  initializer?: AstNode;
  colon?: number;
  equals?: number;
  open?: number;
  close?: number;
};
export type EditorAst = { root: AstNode; tokens: Token[] };
export function parseEditorAst(source: string): EditorAst {
  const all = tokenize(source, { tolerant: true, comments: true });
  const ts = all.filter((t) => t.kind !== "comment");
  let pos = 0,
    depth = 0;
  const peek = (offset = 0) => ts[Math.min(pos + offset, ts.length - 1)];
  const take = () => ts[Math.min(pos++, ts.length - 1)];
  const at = (value: string) => peek().value === value;
  const missing = (): AstNode => ({
    kind: "missing",
    from: peek().from,
    to: peek().from,
    children: [],
  });
  const make = (
    kind: AstNode["kind"],
    from: number,
    children: AstNode[] = [],
    extra: Partial<AstNode> = {},
  ): AstNode => ({
    kind,
    from,
    to: children.at(-1)?.to ?? from,
    children,
    ...extra,
  });
  const isEnd = () => peek().kind === "eof";
  const startsStatement = () =>
    peek().kind === "id" &&
    (["let", "func"].includes(peek().value) ||
      (/^[A-Z]/.test(peek().value) && peek().value !== "Column"));

  function statements(end?: string): AstNode[] {
    const result: AstNode[] = [];
    while (!isEnd() && !(end && at(end))) {
      const before = pos;
      if (at("func")) {
        const start = take(),
          name = peek().kind === "id" ? take() : undefined,
          params: AstNode[] = [];
        if (at("(")) take();
        while (!isEnd() && !at(")") && !at("{")) {
          const beforeParam = pos,
            token = peek().kind === "id" ? take() : undefined;
          const equals = at("=") ? take().to : undefined,
            initializer = equals !== undefined ? expression() : undefined;
          if (token)
            params.push(
              make("parameter", token.from, initializer ? [initializer] : [], {
                name: token.value,
                nameFrom: token.from,
                nameTo: token.to,
                initializer,
                equals,
                to: initializer?.to ?? token.to,
              }),
            );
          if (at(",")) take();
          else if (pos === beforeParam) {
            take();
          } else break;
        }
        if (at(")")) take();
        let body: AstNode | undefined;
        if (at("{")) {
          const open = take(),
            children = statements("}"),
            close = at("}") ? take() : undefined;
          body = make("block", open.from, children, {
            open: open.to,
            close: close?.from,
            to: close?.to ?? source.length,
          });
        }
        result.push(
          make(
            "declaration",
            start.from,
            [...params, ...(body ? [body] : [])],
            {
              name: name?.value,
              nameFrom: name?.from,
              nameTo: name?.to,
              params,
              body,
              to: body?.to ?? peek().from,
            },
          ),
        );
      } else if (at("let")) {
        const start = take();
        const id = peek().kind === "id" ? take() : undefined;
        const equals = at("=") ? take().to : undefined;
        const initializer = startsStatement() ? missing() : expression();
        result.push(
          make("binding", start.from, [initializer], {
            name: id?.value,
            nameFrom: id?.from,
            nameTo: id?.to,
            initializer,
            equals,
          }),
        );
      } else if (at(";")) take();
      else result.push(expression());
      if (pos === before) {
        const t = take();
        result.push(make("error", t.from, [], { to: t.to, token: t }));
      }
    }
    return result;
  }
  function expression(min = 0): AstNode {
    if (++depth > 80) {
      depth--;
      return missing();
    }
    let left = prefix();
    while (
      binaryPrecedence[peek().value] !== undefined &&
      binaryPrecedence[peek().value] >= min
    ) {
      const t = take(),
        p = binaryPrecedence[t.value];
      left = make(
        "binary",
        left.from,
        [left, expression(p + (["^", "**"].includes(t.value) ? 0 : 1))],
        { op: t.value },
      );
    }
    if (min === 0 && at("?")) {
      take();
      const yes = expression();
      if (at(":")) take();
      left = make("conditional", left.from, [left, yes, expression()]);
    }
    depth--;
    return left;
  }
  function prefix(): AstNode {
    const t = peek();
    let node: AstNode;
    if (["+", "-", "!"].includes(t.value)) {
      take();
      node = make("unary", t.from, [expression(7)], { op: t.value });
    } else if (
      t.kind === "string" ||
      t.kind === "number" ||
      ["true", "false", "null"].includes(t.value)
    ) {
      take();
      node = make("literal", t.from, [], {
        to: t.to,
        token: t,
        value:
          t.kind === "string"
            ? t.value
            : t.kind === "number"
              ? Number(t.value)
              : t.value === "null"
                ? null
                : t.value === "true",
      });
    } else if (at(".")) {
      take();
      const id = peek().kind === "id" ? take() : undefined;
      node = make("enum", t.from, [], {
        to: id?.to ?? t.to,
        name: id?.value,
        nameFrom: id?.from ?? t.to,
        nameTo: id?.to ?? t.to,
      });
    } else if (at("[")) {
      take();
      const items: AstNode[] = [];
      while (!isEnd() && !["}", ")", "]"].includes(peek().value)) {
        const before = pos;
        items.push(expression());
        if (at(",")) take();
        else break;
        if (pos === before) break;
      }
      const close = at("]") ? take() : undefined;
      node = make("array", t.from, items, {
        open: t.to,
        close: close?.from,
        to: close?.to ?? peek().from,
      });
    } else if (at("(")) {
      // Look ahead using tokens, so commas inside nested calls/strings cannot create a lambda.
      let offset = 1;
      while (peek(offset).kind === "id" && peek(offset + 1).value === ",")
        offset += 2;
      if (peek(offset).kind === "id") offset++;
      if (peek(offset).value === ")" && peek(offset + 1).value === "=>") {
        take();
        const params: AstNode[] = [];
        while (!isEnd() && !at(")")) {
          const p = take();
          if (p.kind === "id")
            params.push(
              make("parameter", p.from, [], { to: p.to, name: p.value }),
            );
        }
        take();
        take();
        const body = expression();
        node = make("lambda", t.from, [...params, body], { params, body });
      } else {
        take();
        const value = expression(),
          close = at(")") ? take() : undefined;
        node = make("group", t.from, [value], { to: close?.to ?? value.to });
      }
    } else if (t.kind === "id") {
      take();
      if (at("=>")) {
        take();
        const param = make("parameter", t.from, [], {
          to: t.to,
          name: t.value,
        });
        const body = expression();
        node = make("lambda", t.from, [param, body], { params: [param], body });
      } else
        node = make("identifier", t.from, [], {
          to: t.to,
          name: t.value,
          nameFrom: t.from,
          nameTo: t.to,
          token: t,
        });
    } else return missing();
    while (true) {
      if (at("(")) {
        const start = take();
        const args: AstNode[] = [];
        let slotFrom = start.to;
        while (!isEnd() && !["}", "]", ")"].includes(peek().value)) {
          if (startsStatement() && peek().line > ts[Math.max(0, pos - 1)].line)
            break;
          const before = pos;
          let key: Token | undefined, colon: Token | undefined;
          if (peek().kind === "id" && peek(1).value === ":") {
            key = take();
            colon = take();
          }
          const value = expression();
          args.push(
            make("argument", slotFrom, [value], {
              to: peek().from,
              name: key?.value,
              nameFrom: key?.from,
              nameTo: key?.to,
              colon: colon?.to,
            }),
          );
          if (!at(",")) break;
          slotFrom = take().to;
          if (pos === before) break;
        }
        // Retain empty slots (including after a trailing comma) for contextual completions.
        if (!args.length || slotFrom > args.at(-1)!.to)
          args.push(
            make("argument", slotFrom, [missing()], { to: peek().from }),
          );
        const close = at(")") ? take() : undefined;
        node = make("call", node.from, [node, ...args], {
          callee: node,
          name: node.name,
          args,
          open: start.to,
          close: close?.from,
          to: close?.to ?? peek().from,
        });
      } else if (
        peek().prose &&
        ["Text", "text"].includes(node.name ?? "") &&
        (node.kind === "call" || node.kind === "identifier")
      ) {
        const token = take();
        const literal = make("literal", token.from, [], {
          to: token.to,
          token,
          value: token.value,
        });
        const argument = make("argument", token.from, [literal], {
          to: token.to,
          name: "text",
        });
        if (node.kind === "identifier")
          node = make("call", node.from, [node], {
            name: "Text",
            callee: node,
            args: [],
          });
        node.args!.push(argument);
        node.children.push(argument);
        node.to = token.to;
      } else if (at("[")) {
        take();
        const index = expression();
        const close = at("]") ? take() : undefined;
        node = make("index", node.from, [node, index], {
          receiver: node,
          to: close?.to ?? index.to,
        });
      } else if (at(".")) {
        const dot = take(),
          id = peek().kind === "id" ? take() : undefined;
        node = make("member", node.from, [node], {
          receiver: node,
          name: id?.value,
          nameFrom: id?.from ?? dot.to,
          nameTo: id?.to ?? dot.to,
          open: dot.to,
          to: id?.to ?? dot.to,
        });
      } else if (
        at("{") &&
        (node.kind === "call" || node.kind === "identifier") &&
        /^[A-Z]/.test(node.name ?? "")
      ) {
        const open = take();
        const children = statements("}");
        const close = at("}") ? take() : undefined;
        const body = make("block", open.to, children, {
          to: close?.from ?? source.length,
          open: open.to,
          close: close?.from,
        });
        if (node.kind === "identifier")
          node = make("call", node.from, [node], {
            name: node.name,
            callee: node,
            args: [],
          });
        node.body = body;
        node.children.push(body);
        node.to = close?.to ?? source.length;
      } else break;
    }
    return node;
  }
  const root = make("program", 0, statements(), { to: source.length });
  const pending = [root];
  while (pending.length) {
    const n = pending.pop()!;
    for (const child of n.children) {
      child.parent = n;
      pending.push(child);
    }
  }
  return { root, tokens: all };
}

export function astPath(root: AstNode, pos: number): AstNode[] {
  if (pos < root.from || pos > root.to) return [];
  const path = [root];
  while (path.length < 256) {
    const current = path[path.length - 1];
    let child: AstNode | undefined;
    for (let i = current.children.length - 1; i >= 0; i--) {
      const candidate = current.children[i];
      if (candidate.from <= pos && candidate.to >= pos) {
        child = candidate;
        break;
      }
    }
    if (!child) break;
    path.push(child);
  }
  return path;
}
