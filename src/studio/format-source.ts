import { readSyntax, type Call } from "../syntax";
import { tokenize, type Token } from "../tokens";
type Atom = { kind: "atom"; text: string; token: Token };
type Group = {
  kind: "group";
  open: string;
  close: string;
  children: Node[];
  from: number;
  to: number;
};
type Node = Atom | Group;
const operators = new Set([
  "=",
  "=>",
  "+",
  "-",
  "*",
  "/",
  "^",
  "%",
  "==",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "&&",
  "||",
  "?",
  ":",
]);
function value(node: Node | undefined): string {
  return !node ? "" : node.kind === "atom" ? node.text : node.close;
}
function space(
  previous: Node | undefined,
  node: Node,
  beforePrevious?: Node,
): boolean {
  if (!previous) return false;
  const a = value(previous),
    b = node.kind === "group" ? node.open : node.text;
  if (a === "." || b === "," || b === ":" || b === ";") return false;
  if (a === "," || a === ":" || a === ";") return true;
  if (b === ".") return operators.has(a);
  if (node.kind === "group" && b === "{") return true;
  if (node.kind === "group" && (b === "(" || b === "["))
    return operators.has(a) || a === "let";
  if (
    (a === "-" || a === "+" || a === "!") &&
    (!beforePrevious || operators.has(value(beforePrevious)))
  )
    return false;
  if (operators.has(a) || operators.has(b) || b === "!") return true;
  return true;
}
/** Format whitespace only: literal tokens, comments, expressions and declaration order remain unchanged. */
export function formatSource(
  source: string,
  options: { width?: number; indent?: number } = {},
): string {
  const root = readSyntax(source),
    tokens = tokenize(source, { comments: true }).filter(
      (t) => t.kind !== "eof",
    ),
    width = Math.max(40, Math.min(160, options.width ?? 88)),
    unit = Math.max(2, Math.min(8, options.indent ?? 4));
  const statements = new Set<number>();
  const walk = (call: Call) => {
    statements.add(call.from);
    call.children.forEach(walk);
  };
  walk(root);
  let index = 0;
  function nodes(close?: string): Node[] {
    const result: Node[] = [];
    while (index < tokens.length) {
      const token = tokens[index++];
      if (token.kind === "punct" && token.value === close) return result;
      if (token.kind === "punct" && ["(", "[", "{"].includes(token.value)) {
        const end = { "(": ")", "[": "]", "{": "}" }[token.value]!;
        result.push({
          kind: "group",
          open: token.value,
          close: end,
          children: nodes(end),
          from: token.from,
          to: tokens[index - 1].to,
        });
      } else
        result.push({
          kind: "atom",
          text: source.slice(token.from, token.to),
          token,
        });
    }
    return result;
  }
  const tree = nodes();
  const flat = (list: Node[]): string => {
    let result = "";
    list.forEach((node, i) => {
      if (node.kind === "atom" && node.token.kind === "comment") {
        result += "\n";
        return;
      }
      if (space(list[i - 1], node, list[i - 2])) result += " ";
      result +=
        node.kind === "atom"
          ? node.text
          : node.open +
            (node.open === "{" && node.children.length
              ? "\n"
              : flat(node.children)) +
            node.close;
    });
    return result;
  };
  function sequence(
    list: Node[],
    indent: number,
    column = indent,
    statementsMode = false,
  ): string {
    let output = "",
      col = column,
      lineIndent = indent,
      previous: Node | undefined,
      beforePrevious: Node | undefined;
    const append = (text: string) => {
      output += text;
      const last = text.lastIndexOf("\n");
      if (last >= 0) {
        const tail = text.slice(last + 1);
        col = tail.length;
        lineIndent = tail.match(/^ */)![0].length;
      } else col += text.length;
    };
    const newline = (level = indent, blank = false) => {
      output = output.replace(/[ \t]+$/g, "");
      if (!output.endsWith("\n")) output += "\n";
      if (blank && !output.endsWith("\n\n")) output += "\n";
      output += " ".repeat(level);
      col = level;
      lineIndent = level;
    };
    for (let i = 0; i < list.length; i++) {
      const node = list[i],
        start = node.kind === "atom" ? node.token.from : node.from;
      const statement =
        statementsMode &&
        node.kind === "atom" &&
        (statements.has(start) || node.token.value === "let");
      if (statement && output.trim() && col > lineIndent) {
        newline(indent, indent === 0 && node.token.value !== "let");
        previous = undefined;
        beforePrevious = undefined;
      }
      if (node.kind === "atom" && node.token.kind === "comment") {
        const wasInline = col > lineIndent;
        if (wasInline) {
          const prevEnd =
            previous?.kind === "atom" ? previous.token.to : previous?.to;
          const onSameLine =
            prevEnd !== undefined &&
            !source.slice(prevEnd, node.token.from).includes("\n");
          if (!onSameLine) newline();
          else append(" ");
        }
        append(node.text);
        newline();
        previous = undefined;
        beforePrevious = undefined;
        continue;
      }
      if (
        node.kind === "atom" &&
        node.text === "." &&
        previous &&
        (previous.kind === "group" ||
          (previous.kind === "atom" && previous.token.kind === "id"))
      ) {
        const lookahead = flat(list.slice(i, i + 3));
        if (col + lookahead.length > width && !lookahead.includes("\n"))
          newline(indent + unit);
      } else if (space(previous, node, beforePrevious)) append(" ");
      if (node.kind === "atom") append(node.text);
      else if (node.open === "{") {
        if (!node.children.length) append("{}");
        else {
          append("{\n" + " ".repeat(indent + unit));
          append(
            sequence(
              node.children,
              indent + unit,
              indent + unit,
              true,
            ).trimEnd(),
          );
          append("\n" + " ".repeat(indent) + "}");
        }
      } else {
        const flattened = flat(node.children),
          expanded =
            flattened.includes("\n") || col + flattened.length + 2 > width;
        if (!expanded) append(node.open + flattened + node.close);
        else {
          const base = lineIndent,
            parts: Node[][] = [],
            commas: Atom[] = [];
          let part: Node[] = [];
          for (const child of node.children) {
            if (
              child.kind === "atom" &&
              child.token.kind === "punct" &&
              child.text === ","
            ) {
              parts.push(part);
              commas.push(child);
              part = [];
            } else part.push(child);
          }
          if (part.length) parts.push(part);
          append(node.open);
          parts.forEach((argument, j) => {
            newline(base + unit);
            const comma = commas[j];
            let formatted = argument;
            if (comma) {
              let at = argument.length;
              while (
                at > 0 &&
                argument[at - 1].kind === "atom" &&
                (argument[at - 1] as Atom).token.kind === "comment"
              )
                at--;
              formatted = [
                ...argument.slice(0, at),
                comma,
                ...argument.slice(at),
              ];
            }
            append(sequence(formatted, base + unit, base + unit));
          });
          newline(base);
          append(node.close);
        }
      }
      beforePrevious = previous;
      previous = node;
    }
    return output;
  }
  const result = sequence(tree, 0, 0, true).trimEnd() + "\n";
  // Whitespace must never make an enum, raw string or callback mean something else.
  readSyntax(result);
  return result;
}

/** Map editor selections by unchanged tokens when an external edit only changes whitespace. */
export function whitespaceSelection(
  before: string,
  after: string,
  selection: { anchor: number; head: number },
): { anchor: number; head: number } | undefined {
  let old: Token[], next: Token[];
  try {
    old = tokenize(before, { comments: true });
    next = tokenize(after, { comments: true });
  } catch {
    return;
  }
  if (
    old.length !== next.length ||
    old.some(
      (token, i) =>
        token.kind !== next[i].kind ||
        before.slice(token.from, token.to) !==
          after.slice(next[i].from, next[i].to),
    )
  )
    return;
  const map = (position: number) => {
    let lo = 0,
      hi = old.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (old[mid].to < position) lo = mid + 1;
      else hi = mid;
    }
    return (
      next[lo].from +
      Math.max(
        0,
        Math.min(position - old[lo].from, next[lo].to - next[lo].from),
      )
    );
  };
  return { anchor: map(selection.anchor), head: map(selection.head) };
}
