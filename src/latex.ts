import {
  snippetCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { latexCommands } from "./latex-commands";
import { mathSvg } from "./math";
export function equationContext(
  source: string,
  pos: number,
): { from: number; to: number; raw: boolean } | null {
  const stack: string[] = [];
  let i = 0;
  while (i < source.length && i <= pos) {
    if (source.slice(i, i + 2) === "//") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source[i] === '"' || source.slice(i, i + 2) === '#"') {
      const raw = source[i] === "#";
      if (raw) i++;
      const triple = source.slice(i, i + 3) === '"""',
        open = triple ? '"""' : '"',
        end = open + (raw ? "#" : "");
      i += open.length;
      const from = i;
      while (i < source.length && !source.startsWith(end, i)) {
        if (!raw && source[i] === "\\") i += 2;
        else i++;
      }
      if (pos >= from && pos <= i && stack[stack.length - 1] === "Equation")
        return { from, to: i, raw };
      i += end.length;
      continue;
    }
    if (source[i] === "(") {
      const name = source.slice(0, i).match(/([A-Za-z_]\w*)\s*$/)?.[1] || "";
      stack.push(name);
    } else if (source[i] === ")") stack.pop();
    i++;
  }
  return null;
}
export function completeLatex(
  context: CompletionContext,
): CompletionResult | null {
  const source = context.state.doc.toString(),
    range = equationContext(source, context.pos);
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
