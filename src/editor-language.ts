import { StreamLanguage } from "@codemirror/language";
import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { StateField } from "@codemirror/state";
import { showTooltip, hoverTooltip, type Tooltip } from "@codemirror/view";
import { analyzeDocument, type CallContext } from "./editor-analysis";
import {
  compatible,
  signatures,
  signatureText,
  typeLabel,
  unknown,
  type ParameterSpec,
  type Signature,
} from "./editor-schema";
import { completeLatex, equationContext } from "./latex";
export const slideLanguage = StreamLanguage.define({
  languageData: {
    commentTokens: { line: "//" },
    closeBrackets: {
      brackets: ["(", "[", "{", '"', "`", "```"],
      stringPrefixes: ["#"],
    },
  },
  startState: () => ({
    end: "",
    textHeader: false,
    textParens: 0,
    proseDepth: 0,
    proseCode: "",
    declarationName: false,
  }),
  token(stream, state) {
    if (state.proseDepth) {
      while (!stream.eol()) {
        if (stream.peek() === "`") {
          stream.eatWhile("`");
          const marker = stream.string
            .slice(stream.start, stream.pos)
            .match(/`+$/)![0];
          if (state.proseCode === marker) state.proseCode = "";
          else if (!state.proseCode) state.proseCode = marker;
          continue;
        }
        const c = stream.next();
        if (!state.proseCode) {
          if (c === "\\") stream.next();
          else if (c === "{") state.proseDepth++;
          else if (c === "}" && --state.proseDepth === 0) break;
        }
      }
      return "string";
    }
    if (state.end) {
      while (!stream.eol()) {
        if (stream.match(state.end)) {
          state.end = "";
          break;
        }
        if (stream.next() === "\\" && state.end === '"') stream.next();
      }
      return "string";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    for (const [open, end] of [
      ["```", "```"],
      ["`", "`"],
      ['#"""', '"""#'],
      ['"""', '"""'],
      ['#"', '"#'],
      ['"', '"'],
    ])
      if (stream.match(open)) {
        state.end = end;
        return "string";
      }
    if (stream.match(/^-?\d+(\.\d+)?/)) return "number";
    if (stream.match(/^\.[A-Za-z_]\w*/)) {
      state.textHeader = false;
      return "atom";
    }
    if (stream.match(/^(?:let|func|true|false|null)\b/)) {
      state.declarationName = stream.current() === "func";
      return "keyword";
    }
    if (stream.match(/^[A-Za-z_]\w*/)) {
      const name = stream.current();
      if (!state.textHeader || !state.textParens)
        state.textHeader =
          !state.declarationName && ["Text", "text"].includes(name);
      state.declarationName = false;
      return /^[A-Z]/.test(name) || name === "text"
        ? "keyword"
        : "propertyName";
    }
    const punctuation = stream.next();
    if (state.textHeader) {
      if (punctuation === "(") state.textParens++;
      else if (punctuation === ")") state.textParens--;
      else if (punctuation === "{" && !state.textParens) {
        state.proseDepth = 1;
        state.textHeader = false;
      } else if (punctuation !== ":" && !state.textParens)
        state.textHeader = false;
    }
    return "punctuation";
  },
});

const optionFor = (s: Signature, boost = 0): Completion =>
  snippetCompletion(s.snippet, {
    label: s.name,
    type:
      s.category === "modifier" || s.category === "method"
        ? "method"
        : "function",
    detail: s.detail,
    info: signatureText(s) + "\n" + s.detail,
    boost,
  });
function argumentTemplate(p: ParameterSpec) {
  if (p.snippet) return p.snippet;
  if (p.enums) return ".${" + p.enums[0] + "}";
  if (p.type.kind === "string") return '"${Text}"';
  if (p.type.kind === "boolean") return "${true}";
  if (p.type.kind === "array") return "${[]}";
  const value =
    (
      {
        duration: 600,
        delay: 0,
        order: 0,
        step: 1,
        width: 1,
        height: 320,
        columns: 2,
        spacing: 24,
        rowHeight: 40,
        cellPadding: 12,
        version: 1,
        opacity: 0.68,
        blur: 24,
        radius: 28,
      } as Record<string, number>
    )[p.name] ?? 0;
  return "${" + value + "}";
}
export function completeDsl(
  context: CompletionContext,
  assets: string[] = [],
): CompletionResult | null {
  const model = analyzeDocument(context.state.doc),
    pos = context.pos;
  const token = model.tokenAt(pos);
  if (token?.kind === "comment" && pos > token.from && pos <= token.to)
    return null;
  const path = model.path(pos),
    ctx = model.callContext(pos),
    literal = model.stringAt(pos);
  if (literal) {
    const range = equationContext(model.source, pos, model.ast.root);
    if (range) return completeLatex(context, range);
    // A string belongs to its direct argument; nested str()/format() calls do not inherit Image's role.
    const owner = [...path]
      .reverse()
      .find((n) => n.kind === "literal" && n.token === literal);
    if (owner?.parent?.kind !== "argument") return null;
    const kind = ctx?.parameter?.stringKind;
    let values: string[] = [];
    if (kind === "asset") values = assets;
    if (kind === "format")
      values = ["0", "0.00", "0.000", "0.0%", "0.00%", ".2f", ".3f"];
    if (kind === "color")
      values = [
        ...new Set([
          "#23786b",
          "#16766d",
          "#fafbf9",
          "#263b59",
          ...model.ast.tokens
            .filter(
              (t) => t.kind === "string" && /^#[0-9a-f]{6}$/i.test(t.value),
            )
            .map((t) => t.value),
        ]),
      ];
    if (!values.length) return null;
    return {
      from: literal.contentFrom!,
      to: literal.contentTo!,
      options: values.map((label) => ({
        label,
        apply: literal.raw ? label : JSON.stringify(label).slice(1, -1),
        type: "text",
        detail:
          kind === "asset"
            ? "Project asset"
            : kind === "format"
              ? "Number format"
              : "Color",
      })),
    };
  }
  // Never interpret text inside a closed string's delimiters as a declaration.
  if (token?.kind === "string" && pos < token.to) return null;
  if (
    path.some(
      (n) =>
        (n.kind === "parameter" && pos < (n.equals ?? n.to + 1)) ||
        (n.kind === "binding" &&
          pos >= n.from + 3 &&
          pos < (n.equals ?? n.to + 1)),
    )
  )
    return null;
  const word =
    token?.kind === "id" && pos > token.from && pos <= token.to
      ? token
      : undefined;
  const from = word?.from ?? pos,
    to = word?.to ?? pos;
  const previous = model.source[pos - 1];
  if (
    !context.explicit &&
    !word &&
    ![".", "(", ",", ":", "["].includes(previous) &&
    !(ctx && ctx.argument.children[0].kind === "missing")
  )
    return null;
  const existingCall =
    !!word && ["(", "{"].includes(model.source.slice(to).trimStart()[0]);
  const result = (options: Completion[]): CompletionResult => ({
    from,
    to,
    options: existingCall
      ? options.map((o) =>
          ["function", "method"].includes(o.type ?? "") &&
          !o.label.includes("=>")
            ? { ...o, apply: o.label }
            : o,
        )
      : options,
    validFor: /^[A-Za-z_]\w*$/,
  });
  const member = model.memberAt(pos);
  if (member) {
    const type = model.infer(member.receiver!);
    if (type.kind === "array")
      return result([
        ...["map", "filter", "reduce"].map((n) =>
          optionFor(signatures.get(n)!),
        ),
        { label: "length", type: "property", detail: "Number · Array length" },
      ]);
    if (type.kind === "string")
      return result([
        { label: "length", type: "property", detail: "Number · String length" },
      ]);
    if (type.kind === "component")
      return result(
        [...signatures.values()]
          .filter(
            (s) =>
              s.category === "modifier" && s.receivers?.includes(type.name!),
          )
          .map((s) => optionFor(s)),
      );
    return result([]);
  }
  const enumNode = [...path].reverse().find((n) => n.kind === "enum");
  if (enumNode && ctx?.parameter?.enums)
    return result(
      ctx.parameter.enums.map((label) => ({
        label,
        type: "enum",
        detail: ctx.parameter!.detail,
        info: `${ctx.signature.name} · ${ctx.parameter!.name}`,
      })),
    );
  if (enumNode) return result([]);

  const argument = ctx?.argument,
    value = argument?.children[0];
  const atLabel =
    ctx &&
    (argument!.name
      ? pos < argument!.colon!
      : value &&
        ["identifier", "missing"].includes(value.kind) &&
        path.slice(path.indexOf(argument!) + 1).every((n) => n === value));
  const options: Completion[] = [];
  if (atLabel) {
    const used = new Set(
      ctx.call.args!.filter((a) => a !== argument && a.name).map((a) => a.name),
    );
    const positional = ctx.call.args!.filter(
      (a) => a !== argument && !a.name && a.children[0].kind !== "missing",
    );
    ctx.signature.params
      .filter((p) => !p.named)
      .slice(0, positional.length)
      .forEach((p) => used.add(p.name));
    for (const param of ctx.signature.params.filter(
      (p) => p.named && !used.has(p.name),
    )) {
      const info = `${param.detail}\nType: ${typeLabel(param.type)}${param.enums ? " · " + param.enums.map((v) => "." + v).join(" / ") : ""}`;
      options.push(
        argument!.colon !== undefined
          ? {
              label: param.name + ":",
              apply: param.name,
              type: "property",
              detail: param.detail,
              info,
              boost: 60,
            }
          : snippetCompletion(param.name + ": " + argumentTemplate(param), {
              label: param.name + ":",
              type: "property",
              detail: param.detail,
              info,
              boost: 60,
            }),
      );
    }
    if (argument!.name) return result(options);
  }
  if (
    ctx?.parameter?.enums &&
    value &&
    ["identifier", "missing"].includes(value.kind)
  )
    options.push(
      ...ctx.parameter.enums.map((label) => ({
        label: "." + label,
        apply: "." + label,
        type: "enum",
        detail: ctx.parameter!.detail,
        boost: 45,
      })),
    );
  const inExpression = path.some(
    (n) =>
      n.kind === "binding" ||
      n.kind === "argument" ||
      n.kind === "array" ||
      n.kind === "lambda" ||
      (n.kind === "parameter" && n.equals !== undefined && pos >= n.equals) ||
      n.kind === "binary",
  );
  const expected = model.expectedAt(pos);
  if (inExpression) {
    const visible = model
      .visibleSymbols(pos)
      .filter((s) => s.node.kind !== "declaration");
    for (const symbol of visible) {
      const type = model.symbolType(symbol);
      const details: Completion = {
        label: symbol.name,
        type: type.kind === "function" ? "function" : "variable",
        detail: model.symbolDescription(symbol),
        info: `${symbol.name}: ${typeLabel(type)}\nOnly names already defined in the current scope are suggested.`,
        boost:
          25 +
          model.expectedBoost(
            type.kind === "function" && expected.kind !== "function"
              ? (type.result ?? unknown)
              : type,
            expected,
          ),
      };
      options.push(
        type.kind === "function" && expected.kind !== "function"
          ? snippetCompletion(
              symbol.name +
                "(" +
                (type.params ?? [])
                  .map(
                    (_, index) =>
                      "${" +
                      (symbol.node.initializer?.params?.[index]?.name ??
                        `arg${index + 1}`) +
                      "}",
                  )
                  .join(", ") +
                ")",
              details,
            )
          : details,
      );
    }
    const shadowed = new Set(visible.map((s) => s.name));
    for (const spec of signatures.values())
      if (spec.category === "calculation" && !shadowed.has(spec.name))
        options.push(
          optionFor(spec, model.expectedBoost(spec.result, expected)),
        );
    for (const [label, type] of [
      ["true", { kind: "boolean" }],
      ["false", { kind: "boolean" }],
      ["null", { kind: "null" }],
    ] as const)
      if (compatible(type, expected))
        options.push({ label, type: "keyword", detail: typeLabel(type) });
    if (expected.kind === "function")
      options.unshift(
        snippetCompletion("${x} => ${x}", {
          label: "x => …",
          type: "function",
          detail: "Callback function",
          boost: 80,
        }),
      );
    return result(options);
  }
  // Body ownership determines which declarations are valid. Deck's legacy body is a root scope.
  const block = [...path].reverse().find((n) => n.kind === "block");
  const root = !block || block.parent?.name === "Deck";
  const existing = new Set(
    model.ast.root.children
      .map((n) => model.infer(n))
      .filter((t) => t.kind === "component")
      .map((t) => t.name),
  );
  const fragment =
    !block && !existing.has("Deck") && !!word && word.value !== "Deck";
  const declarations = [...signatures.values()].filter((s) =>
    fragment
      ? ["root", "view", "container"].includes(s.category)
      : root
        ? s.category === "root" &&
          (["Slide", "DynamicSlide"].includes(s.name) || !existing.has(s.name))
        : ["view", "container"].includes(s.category),
  );
  const inFunction = path.some((n) => n.kind === "declaration");
  options.push(
    ...declarations
      .filter((spec) => inFunction || !["Content", "Slot"].includes(spec.name))
      .map((s) => optionFor(s)),
  );
  if (!root)
    options.push(
      ...model.componentFunctions(pos).map((spec) => optionFor(spec)),
    );
  if (root)
    options.push(
      snippetCompletion(
        "func \${Name}(\${title}, spacing = 24) {\n    VStack(spacing: spacing) {\n        Heading(title)\n        Content()\n    }\n}",
        {
          label: "func",
          type: "keyword",
          detail: "Define a reusable layout function",
        },
      ),
    );
  const hasContent = block?.children.some(
    (n) => n.kind !== "binding" && n.to < pos,
  );
  if (root || !hasContent)
    options.push(
      snippetCompletion("let ${name} = ${value}", {
        label: "let",
        type: "keyword",
        detail: "Define a constant in the current scope",
      }),
    );
  return result(options);
}

function signatureDom(ctx: CallContext) {
  const dom = document.createElement("div");
  dom.className = "dsl-signature";
  dom.setAttribute("role", "note");
  const title = document.createElement("div");
  title.append(ctx.signature.name + "(");
  ctx.signature.params.forEach((p, index) => {
    if (index) title.append(", ");
    const item = document.createElement(
      p === ctx.parameter ? "strong" : "span",
    );
    item.textContent = `${p.name}${p.optional ? "?" : ""}: ${typeLabel(p.type)}`;
    title.append(item);
  });
  title.append(")");
  dom.append(title);
  const help = document.createElement("p");
  help.textContent = ctx.parameter
    ? `${ctx.parameter.name} · ${ctx.parameter.detail}${ctx.parameter.enums ? " · " + ctx.parameter.enums.map((v) => "." + v).join(" / ") : ""}`
    : ctx.signature.detail;
  dom.append(help);
  return dom;
}
export const signatureHelp = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, transaction) {
    if (!transaction.docChanged && !transaction.selection) return value;
    const state = transaction.state,
      pos = state.selection.main.head;
    if (!state.selection.main.empty) return null;
    const model = analyzeDocument(state.doc),
      token = model.tokenAt(pos);
    if (token?.kind === "comment") return null;
    const ctx = model.callContext(pos);
    return ctx
      ? { pos, above: true, create: () => ({ dom: signatureDom(ctx) }) }
      : null;
  },
  provide: (field) => showTooltip.from(field),
});
export const semanticHover = hoverTooltip((view, pos) => {
  const model = analyzeDocument(view.state.doc),
    token = model.tokenAt(pos);
  if (token?.kind !== "id") return null;
  const symbol = model.symbolAt(pos);
  const spec = signatures.get(token.value);
  const ctx = model.callContext(pos);
  const param =
    ctx?.argument.name === token.value && pos < ctx.argument.colon!
      ? ctx.parameter
      : undefined;
  if (!symbol && !spec && !param) return null;
  return {
    pos: token.from,
    end: token.to,
    above: true,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "dsl-signature";
      dom.textContent = symbol
        ? `${symbol.name}: ${model.symbolDescription(symbol)}`
        : param
          ? `${ctx!.signature.name}.${param.name}: ${typeLabel(param.type)}\n${param.detail}`
          : signatureText(spec!) + "\n" + spec!.detail;
      return { dom };
    },
  };
});
