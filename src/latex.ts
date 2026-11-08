import {
  snippetCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { latexCommands } from "./latex-commands";
import { mathSvg } from "./math";
import { astPath, parseEditorAst, type AstNode } from "./editor-ast";
export function equationContext(
  source: string,
  pos: number,
  root?: AstNode,
): { from: number; to: number; raw: boolean } | null {
  try {
    const path = astPath(root ?? parseEditorAst(source).root, pos);
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
