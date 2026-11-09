import {
  snippetCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { builtinComponentNames } from "./component-names";
import { parseRichText, richRuns } from "./rich-text";
import { stringContent } from "./string-content";
import { latexCommands } from "./latex-commands";
import { mathSvg } from "./math";
import { astPath, parseEditorAst, type AstNode } from "./editor-ast";
export function equationContext(
  source: string,
  pos: number,
  root?: AstNode,
): { from: number; to: number; raw: boolean } | null {
  try {
    const ast = root ?? parseEditorAst(source).root,
      path = astPath(ast, pos),
      names = new Set<string>([...builtinComponentNames, "Column", "title"]);
    for (const n of ast.children)
      if (n.kind === "declaration" && n.name) names.add(n.name);
    const literal = [...path]
      .reverse()
      .find((n) => n.kind === "literal" && n.token?.kind === "string");
    const token = literal?.token,
      arg = literal?.parent,
      call = arg?.parent;
    if (
      token &&
      pos >= token.contentFrom! &&
      pos <= token.contentTo! &&
      arg?.kind === "argument" &&
      call?.name === "Equation" &&
      (arg.name === "text" || (!arg.name && call.args?.[0] === arg))
    )
      return {
        from: token.contentFrom!,
        to: token.contentTo!,
        raw: !!token.raw,
      };
    if (token && pos >= token.contentFrom! && pos <= token.contentTo!) {
      // Follow AST ancestry through list/table arrays, without treating Code or asset/config strings as prose.
      const owner = [...path]
        .reverse()
        .find((n) => n.kind === "call" && names.has(n.name || ""));
      const argument = owner && path[path.indexOf(owner) + 1];
      const prose =
        owner &&
        argument?.kind === "argument" &&
        (argument.name
          ? [
              "text",
              "title",
              "subtitle",
              "eyebrow",
              "label",
              "value",
              "items",
              "rows",
              "headers",
              "author",
              "reason",
            ].includes(argument.name) &&
            !(owner.name === "Code" && argument.name === "text")
          : !["Code", "Image", "Slide", "DynamicSlide"].includes(
              owner.name || "",
            ));
      if (prose) {
        const content = stringContent(source, token),
          p = content.at(pos),
          document = parseRichText(content.value),
          runs = richRuns(document);
        if (
          runs.some(
            (run) =>
              run.node.kind === "code" && p >= run.node.from && p < run.node.to,
          )
        )
          return null;
        const math = [
          ...runs.filter((run) => run.kind === "math").map((run) => run.node),
          ...document.pendingMath,
        ].find((node) => p >= node.contentFrom! && p <= node.contentTo!);
        if (math)
          return {
            from: content.offsets[math.contentFrom!],
            to: content.offsets[math.contentTo!],
            raw: !!token.raw,
          };
      }
    }
  } catch {
    /* Oversized or invalid documents still retain the normal editor. */
  }
  return null;
}
export function completeLatex(
  context: CompletionContext,
  suppliedRange?: { from: number; to: number; raw: boolean },
): CompletionResult | null {
  const source = context.state.doc.toString(),
    range = suppliedRange ?? equationContext(source, context.pos);
  if (!range) return null;
  const prefix = source.slice(range.from, context.pos),
    command = prefix.match(/\\[A-Za-z]*$/);
  if (!command && !context.explicit) return { from: context.pos, options: [] };
  let from = command ? context.pos - command[0].length : context.pos;
  if (!range.raw && from > range.from && source[from - 1] === "\\") from--;
  return {
    from,
    filter: false,
    options: latexCommands
      .filter(([name]) =>
        name.startsWith(command?.[0].replace(/\\/g, "") || ""),
      )
      .map(([name, template, detail, example]) =>
        snippetCompletion(
          range.raw ? template : template.replace(/\\/g, "\\\\"),
          {
            label: "\\" + name,
            type: "function",
            detail,
            info: () => {
              const wrap = document.createElement("div");
              wrap.className = "latex-completion-preview";
              const label = document.createElement("div");
              label.textContent = detail + " · " + example;
              const img = document.createElement("img");
              img.src = mathSvg(example, "#244b3c");
              img.alt = example;
              wrap.append(label, img);
              return wrap;
            },
          },
        ),
      ),
  };
}
