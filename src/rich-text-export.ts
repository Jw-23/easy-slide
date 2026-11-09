import { TEXT_LINE_HEIGHT, type Element } from "./scene";
import { richHtml, escapeXml, mathRunAsset } from "./rich-text-render";
import { richRuns, type RichStyle } from "./rich-text";
import { svgData } from "./materials";
export type StyledRun = RichStyle & { text: string };
export type RichTextLine = { text: string; top: number; runs: StyledRun[] };
export type RichFragment = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  family: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  mono: boolean;
  data?: string;
};
/** Browser-measured fragments are reused for raster, vector and editable PPTX consumers. */
export async function measureRichText(
  e: Element,
  family: string,
): Promise<RichFragment[]> {
  const probe = document.createElement("div");
  Object.assign(probe.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: e.w + "px",
    height: e.h + "px",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
    fontFamily: family,
    fontSize: (e.size ?? 24) + "px",
    fontWeight: e.bold ? "650" : "400",
    lineHeight: String(TEXT_LINE_HEIGHT),
    fontSynthesis: "none",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    textAlign: e.align || "left",
    color: e.color || "#192c2a",
    margin: "0",
    padding: "0",
    border: "0",
  });
  probe.innerHTML = richHtml(e.rich!, e.color);
  document.body.append(probe);
  try {
    await Promise.all(
      Array.from(probe.querySelectorAll("img")).map((img) => img.decode()),
    );
    const origin = probe.getBoundingClientRect(),
      runs = richRuns(e.rich!),
      fragments: RichFragment[] = [];
    for (const node of probe.querySelectorAll<HTMLElement>("[data-rich-run]")) {
      const run = runs[Number(node.dataset.richRun)],
        style = getComputedStyle(node),
        font = {
          size: parseFloat(style.fontSize),
          family: style.fontFamily,
          bold: Number(style.fontWeight) >= 600,
          italic: style.fontStyle !== "normal",
          strike: style.textDecorationLine.includes("line-through"),
          mono: !!run.mono,
        };
      if (node instanceof HTMLImageElement) {
        const rect = node.getBoundingClientRect(),
          asset = mathRunAsset(run, e.color || "#192c2a")!;
        if (!asset.widthEm || !asset.heightEm || !rect.width || !rect.height)
          continue;
        const scale = Math.min(
            rect.width / asset.widthEm,
            rect.height / asset.heightEm,
          ),
          w = asset.widthEm * scale,
          h = asset.heightEm * scale;
        if (rect.top - origin.top < e.h && rect.bottom > origin.top)
          fragments.push({
            ...font,
            text: run.text,
            x: rect.left - origin.left + (rect.width - w) / 2,
            y: rect.top - origin.top + (rect.height - h) / 2,
            w,
            h,
            data: node.src,
          });
        continue;
      }
      const text = node.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) continue;
      const range = document.createRange();
      let previous: RichFragment | undefined;
      for (const part of new Intl.Segmenter(undefined, {
        granularity: "grapheme",
      }).segment(text.textContent || "")) {
        if (part.segment === "\n" || part.segment === "\r\n") {
          previous = undefined;
          continue;
        }
        range.setStart(text, part.index);
        range.setEnd(text, part.index + part.segment.length);
        const rect = range.getBoundingClientRect(),
          x = rect.left - origin.left,
          y = rect.top - origin.top;
        if (y >= e.h || rect.bottom <= origin.top) continue;
        if (
          previous &&
          Math.abs(previous.y - y) < 0.5 &&
          Math.abs(previous.x + previous.w - x) < 1
        ) {
          previous.text += part.segment;
          previous.w = rect.right - origin.left - previous.x;
        } else {
          previous = {
            ...font,
            text: part.segment,
            x,
            y,
            w: rect.width,
            h: rect.height,
          };
          fragments.push(previous);
        }
      }
    }
    return fragments;
  } finally {
    probe.remove();
  }
}
export function richTextLines(
  fragments: RichFragment[],
  size: number,
): RichTextLine[] {
  const lines: RichTextLine[] = [];
  for (const f of fragments) {
    if (f.data) continue;
    const row = Math.max(
      0,
      Math.floor((f.y + 0.5) / (size * TEXT_LINE_HEIGHT)),
    );
    while (lines.length <= row)
      lines.push({
        text: "",
        top: lines.length * size * TEXT_LINE_HEIGHT,
        runs: [],
      });
    const line = lines[row];
    line.text += f.text;
    line.runs.push({
      text: f.text,
      bold: f.bold,
      italic: f.italic,
      strike: f.strike,
      mono: f.mono,
    });
  }
  return lines;
}
export function fragmentFont(f: RichFragment): string {
  return `${f.italic ? "italic " : ""}${f.bold ? "650" : "400"} ${f.size}px ${f.family}`;
}
export function baseline(
  f: RichFragment,
  ctx: CanvasRenderingContext2D,
): number {
  ctx.font = fragmentFont(f);
  return (
    f.y + (ctx.measureText(f.text || "M").fontBoundingBoxAscent ?? f.size * 0.9)
  );
}
/** No foreignObject: SVG text and nested local MathJax paths work in PowerPoint. */
export function richTextSvg(
  e: Element,
  fragments: RichFragment[],
  baselines: number[],
): string {
  const body = fragments
    .map((f, i) => {
      let content: string;
      if (f.data) {
        const raw = new TextDecoder().decode(
          Uint8Array.from(atob(f.data.slice(f.data.indexOf(",") + 1)), (c) =>
            c.charCodeAt(0),
          ),
        );
        content = raw.replace(/<svg\b[^>]*>/, (tag) =>
          tag
            .replace(/\s(?:width|height|x|y)="[^"]*"/g, "")
            .replace(
              "<svg",
              `<svg x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}"`,
            ),
        );
      } else {
        content = `<text x="${f.x}" y="${baselines[i]}" fill="${e.color || "#192c2a"}" font-family="${escapeXml(f.family)}" font-size="${f.size}" font-weight="${f.bold ? 650 : 400}" font-style="${f.italic ? "italic" : "normal"}"${f.w > 0 ? ` textLength="${f.w}" lengthAdjust="spacingAndGlyphs"` : ""} xml:space="preserve">${escapeXml(f.text)}</text>`;
      }
      if (f.strike)
        content += `<path d="M${f.x},${f.data ? f.y + f.h / 2 : (baselines[i] ?? f.y + f.h) - f.size * 0.3}h${f.w}" stroke="${e.color || "#192c2a"}" stroke-width="${Math.max(1, f.size / 16)}"/>`;
      return content;
    })
    .join("");
  return svgData(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${e.w}" height="${e.h}" viewBox="0 0 ${e.w} ${e.h}"><defs><clipPath id="bounds"><rect width="${e.w}" height="${e.h}"/></clipPath></defs><g clip-path="url(#bounds)">${body}</g></svg>`,
  );
}
