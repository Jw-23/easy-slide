import { parseRichText, richRuns } from "./rich-text";

/** Remove source-code indentation from a newline-delimited prose literal. */
export function dedentProse(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("\n")) return text;
  const lines = normalized.slice(1).split("\n");
  if (!lines.at(-1)!.trim()) lines.pop();
  const nonempty = lines.filter((line) => line.trim());
  if (!nonempty.length) return "";
  let prefix = nonempty[0].match(/^[ \t]*/)![0];
  for (const line of nonempty) {
    while (prefix && !line.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return lines
    .map((line) => (line.trim() ? line.slice(prefix.length) : ""))
    .join("\n");
}

/** Full-width spaces make paragraph indents identical in preview, pagination and PPTX. */
export function indentProse(text: string, indent = 0): string {
  if (!indent) return text;
  const math = richRuns(parseRichText(text)).filter(
    (run) => run.kind === "math",
  );
  let from = 0,
    mathIndex = 0;
  return text
    .split("\n")
    .map((line) => {
      const first = from + line.match(/^[ \t]*/)![0].length;
      while (math[mathIndex] && math[mathIndex].node.to <= first) mathIndex++;
      const node = math[mathIndex]?.node;
      const formula =
        node &&
        first >= node.from &&
        first < node.to &&
        (node.display || first > node.from);
      from += line.length + 1;
      return line.trim() && !formula ? "\u3000".repeat(indent) + line : line;
    })
    .join("\n");
}

/** Text { ... } follows prose paragraphs: soft wraps join, blank lines become hard breaks. */
export function bodyProse(source: string): string {
  const text = dedentProse(source).trim();
  const document = parseRichText(text);
  const protectedNodes = [
    ...richRuns(document)
      .filter((run) => run.kind === "math" || run.node.kind === "code")
      .map((run) => run.node),
    ...document.pendingMath,
  ].sort((a, b) => a.from - b.from);
  let index = 0;
  return text.replace(
    /[ \t]*\n[ \t]*(?:\n[ \t]*)*/g,
    (breaks: string, from: number) => {
      while (protectedNodes[index] && protectedNodes[index].to <= from) index++;
      const node = protectedNodes[index];
      if (node && node.from <= from && node.to > from) return breaks;
      const count = breaks.split("\n").length - 1;
      if (count > 1) return "\n".repeat(count - 1);
      const before = text[from - 1] || "",
        after = text[from + breaks.length] || "";
      // CJK line wrapping needs no invented word space; Latin words retain a separator.
      return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}，。！？；：、（）]/u.test(
        before + after,
      )
        ? ""
        : " ";
    },
  );
}
