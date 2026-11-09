import type { Block } from "./dsl";
import { mathAsset } from "./math";
import { parseRichText, richRuns, type RichRun } from "./rich-text";
import { mathHeading, proofEnds } from "./math-environments";
const LINE = 1.42;
let context: CanvasRenderingContext2D | null | undefined;
function width(
  text: string,
  size: number,
  font: string,
  bold = false,
  mono = false,
): number {
  if (context === undefined)
    context =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  if (context) {
    context.font = `${bold ? 650 : 400} ${size}px ${mono ? "monospace" : font}`;
    return context.measureText(text).width;
  }
  return Array.from(text).reduce(
    (n, c) =>
      n +
      size *
        (/\s/u.test(c)
          ? 0.4
          : /[\u0000-\u00ff]/u.test(c)
            ? /[MW@]/.test(c)
              ? 1.05
              : 0.72
            : 1.05),
    0,
  );
}
export type MeasuredLine = { runs: RichRun[]; height: number };
/** Same bounded inline AST as preview; formulas remain atomic, paragraphs keep their font size. */
export function textLines(
  text: string,
  available: number,
  size: number,
  font: string,
): MeasuredLine[] {
  const lines: MeasuredLine[] = [{ runs: [], height: size * LINE + 3 }];
  let used = 0;
  const newline = () => {
    lines.push({ runs: [], height: size * LINE + 3 });
    used = 0;
  };
  for (const run of richRuns(parseRichText(text))) {
    if (run.kind === "break") {
      newline();
      continue;
    }
    const units =
      run.kind === "math"
        ? [run.text]
        : Array.from(
            new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
              run.text,
            ),
            (s) => s.segment,
          );
    for (const unit of units) {
      const asset =
          run.kind === "math"
            ? mathAsset(
                run.bold ? `\\boldsymbol{${unit}}` : unit,
                "#192c2a",
                run.node.display,
              )
            : null,
        w = asset
          ? asset.widthEm * size
          : width(unit, size, font, run.bold, run.mono),
        h = asset
          ? Math.max(size * LINE + 3, asset.heightEm * size + size * 0.5)
          : size * LINE + 3;
      if (run.node.display && used > 0) newline();
      if (used > 0 && used + w > Math.max(1, available - 4)) newline();
      const line = lines.at(-1)!;
      line.runs.push({ ...run, text: unit });
      line.height = Math.max(line.height, h);
      used += w;
      if (run.node.display) newline();
    }
  }
  if (lines.length > 1 && !lines.at(-1)!.runs.length && !text.endsWith("\n"))
    lines.pop();
  return lines;
}
export function textHeight(
  text: string,
  w: number,
  size: number,
  font: string,
): number {
  return Math.ceil(
    textLines(text, w, size, font).reduce((s, l) => s + l.height, 0),
  );
}
export function mathMetrics(b: Block, w: number, font: string, inherited = 22) {
  const pad = b.padding ?? (b.environment === "ProofStep" ? 10 : 18),
    size = b.size ?? inherited,
    inner = Math.max(1, w - pad * 2 - 4),
    heading = textHeight(mathHeading(b), inner, size, font),
    body = b.text ? textHeight(b.text, inner, size, font) + 12 : 0,
    reason = b.reason
      ? textHeight("依据：" + b.reason, inner, Math.max(8, size - 2), font) + 10
      : 0,
    footer = proofEnds(b) ? 30 : 0;
  return {
    pad,
    size,
    inner,
    heading,
    body,
    reason,
    footer,
    overhead: pad * 2 + heading + 12 + body + reason + footer,
  };
}
function fontSize(b: Block, inherited: number) {
  return (
    b.size ??
    (b.type === "caption"
      ? 16
      : b.type === "heading"
        ? [44, 32, 26, 21][(b.level ?? 2) - 1]
        : b.type === "code"
          ? 19
          : b.type === "quote"
            ? 32
            : inherited)
  );
}
export function contentHeight(
  b: Block,
  w: number,
  font: string,
  inherited = 22,
): number {
  if (b.h !== undefined) return b.h;
  const size = fontSize(b, inherited),
    pad = b.padding ?? (b.type === "panel" ? 24 : b.type === "glass" ? 28 : 0),
    inner = Math.max(1, (b.w ?? w) - 2 * pad),
    gap = b.gap ?? (b.type === "math" ? 18 : 24),
    children = b.children || [];
  let height: number;
  if (b.type === "math") {
    const m = mathMetrics(b, b.w ?? w, font, inherited);
    height =
      m.overhead +
      children.reduce(
        (s, c) => s + contentHeight(c, m.inner, font, m.size),
        0,
      ) +
      gap * Math.max(0, children.length - 1);
  } else if (
    b.type === "text" ||
    b.type === "quote" ||
    b.type === "caption" ||
    b.type === "heading" ||
    b.type === "code"
  ) {
    height =
      textHeight(
        b.type === "code" ? escapeText(b.text || "") : b.text || "",
        Math.max(
          1,
          inner - (b.type === "code" ? 48 : b.type === "quote" ? 28 : 0),
        ),
        size,
        b.type === "code" ? "monospace" : font,
      ) +
      pad * 2 +
      (b.title ? 54 : 0) +
      (b.type === "code" ? 48 : 6);
  } else if (b.type === "equation") {
    const asset = mathAsset(b.text || "", "#192c2a", true);
    height =
      Math.max(size * 2.2, (asset?.heightEm || 2) * size + size * 0.8) +
      pad * 2;
  } else if (b.type === "bullets" || b.type === "numbered")
    height =
      (b.items || []).reduce(
        (s, t) => s + textHeight(t, Math.max(1, inner - 40), size, font) + 10,
        0,
      ) +
      pad * 2 +
      (b.title ? 54 : 0);
  else if (b.type === "table")
    height =
      Math.max(1, (b.rows?.length || 0) + 1) * (b.table?.rowHeight ?? 42) +
      pad * 2;
  else if (b.type === "image") height = 220 + pad * 2;
  else if (b.type === "metric")
    height = (b.text ? 274 : b.label ? 160 : 100) + pad * 2;
  else if (["rectangle", "circle"].includes(b.type)) height = 100 + pad * 2;
  else if (b.type === "progress") height = 76 + pad * 2;
  else if (b.type === "badge") height = 42 + pad * 2;
  else if (b.type === "divider") height = 16 + pad * 2;
  else if (b.type === "spacer") height = 24;
  else if (b.type === "pageBreak" || b.type === "columnBreak") height = 0;
  else if (["hstack", "columns", "grid"].includes(b.type)) {
    const cols =
        b.type === "grid" ? b.columns || 2 : Math.max(1, children.length),
      cw = (inner - gap * (cols - 1)) / cols;
    height =
      Math.max(0, ...children.map((c) => contentHeight(c, cw, font, size))) *
        Math.max(1, Math.ceil(children.length / cols)) +
      gap * Math.max(0, Math.ceil(children.length / cols) - 1) +
      pad * 2;
  } else if (b.type === "zstack")
    height =
      Math.max(0, ...children.map((c) => contentHeight(c, inner, font, size))) +
      pad * 2;
  else
    height =
      children.reduce((s, c) => s + contentHeight(c, inner, font, size), 0) +
      gap * Math.max(0, children.length - 1) +
      pad * 2 +
      (b.title ? 54 : 0);
  return Math.ceil(Math.max(0, height));
}
const escapeText = (t: string) => t.replace(/[\\*_~`$]/g, (c) => "\\" + c);
function encoded(runs: RichRun[]): string {
  const groups: RichRun[] = [];
  for (const run of runs) {
    const last = groups.at(-1);
    if (
      last &&
      last.kind === "text" &&
      run.kind === "text" &&
      last.bold === run.bold &&
      last.italic === run.italic &&
      last.strike === run.strike &&
      last.mono === run.mono
    )
      last.text += run.text;
    else groups.push({ ...run });
  }
  return groups
    .map((r) => {
      let s =
        r.kind === "math"
          ? r.node.display
            ? "$$" + r.text + "$$"
            : "\\(" + r.text + "\\)"
          : r.mono
            ? "`".repeat(
                Math.max(
                  1,
                  ...Array.from(r.text.matchAll(/`+/g), (m) => m[0].length + 1),
                ),
              ) +
              r.text +
              "`".repeat(
                Math.max(
                  1,
                  ...Array.from(r.text.matchAll(/`+/g), (m) => m[0].length + 1),
                ),
              )
            : escapeText(r.text);
      if (r.italic) s = "*" + s + "*";
      if (r.bold) s = "**" + s + "**";
      if (r.strike) s = "~~" + s + "~~";
      return s;
    })
    .join("");
}
export function splitText(
  b: Block,
  w: number,
  max: number,
  font: string,
  size: number,
): Block[] {
  const pad = b.padding ?? 0,
    overhead = pad * 2 + (b.title ? 54 : 0) + 6,
    lines = textLines(
      b.text || "",
      Math.max(1, w - pad * 2 - (b.type === "quote" ? 28 : 0)),
      fontSize(b, size),
      font,
    ),
    chunks: MeasuredLine[][] = [[]];
  let used = overhead;
  for (const line of lines) {
    if (line.height + overhead > max)
      throw Error("单个公式或文本行超出动态页高度，请拆分公式或调整字号");
    if (used + line.height > max && chunks.at(-1)!.length) {
      chunks.push([]);
      used = overhead;
    }
    chunks.at(-1)!.push(line);
    used += line.height;
  }
  return chunks
    .filter((c) => c.length)
    .map((c, i) => ({
      ...b,
      text: c.map((l) => encoded(l.runs)).join("\n"),
      size: fontSize(b, size),
      h: Math.ceil(c.reduce((s, l) => s + l.height, 0) + overhead),
      fragment: true,
      measured: true,
      continued: i > 0,
    }));
}

/** Freeze natural sizes for the flow renderer. Authored frame heights remain distinguishable for copying. */
export function measureBlock(
  b: Block,
  w: number,
  font: string,
  inherited = 22,
): Block {
  const size = fontSize(b, inherited);
  const pad =
    b.padding ?? (b.type === "panel" ? 24 : b.type === "glass" ? 28 : 0);
  const inner =
    b.type === "math"
      ? mathMetrics(b, b.w ?? w, font, size).inner
      : Math.max(1, (b.w ?? w) - 2 * pad);
  const cols =
    b.type === "grid"
      ? b.columns || 2
      : ["hstack", "columns"].includes(b.type)
        ? Math.max(1, b.children?.length || 0)
        : 1;
  const cw = (inner - (b.gap ?? 24) * (cols - 1)) / cols;
  return {
    ...b,
    size,
    h: contentHeight(b, w, font, inherited),
    measured: b.measured || b.h === undefined,
    ...(b.children
      ? { children: b.children.map((c) => measureBlock(c, cw, font, size)) }
      : {}),
  };
}
