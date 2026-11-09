import {
  measureRichText,
  richTextLines,
  richTextSvg,
  baseline,
  type StyledRun,
} from "./rich-text-export";
import { resolveTheme } from "./themes";
import type { Deck, Slide } from "./dsl";
import { TEXT_LINE_HEIGHT, type Element } from "./scene";
import { mathSvg } from "./math";
import { svgData } from "./materials";
import { timeline } from "./motion";

export const EXPORT_SCALE = 3;
export type TextLine = { text: string; top: number; runs?: StyledRun[] };
export type ExportLayer = {
  data: string;
  x: number;
  y: number;
  w: number;
  h: number;
  textLines?: TextLine[];
  svg?: string;
};
const xml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function canvas(w: number, h: number, scale = EXPORT_SCALE) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * scale));
  c.height = Math.max(1, Math.ceil(h * scale));
  const ctx = c.getContext("2d");
  if (!ctx) throw Error("无法创建 PPTX 导出画布");
  return { canvas: c, ctx };
}
export async function loadExportImage(data: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = data;
  try {
    await image.decode();
  } catch {
    throw Error("图片无法解码，请检查工程素材");
  }
  return image;
}
export function contain(
  iw: number,
  ih: number,
  box: { x: number; y: number; w: number; h: number },
) {
  const scale = Math.min(box.w / iw, box.h / ih);
  return {
    x: box.x + (box.w - iw * scale) / 2,
    y: box.y + (box.h - ih * scale) / 2,
    w: iw * scale,
    h: ih * scale,
  };
}
/** Measure real browser line breaks; CSS pre-wrap, CJK wrapping and clipping share preview's rules. */
export function measureText(element: Element, fontFamily: string) {
  const probe = document.createElement("div");
  Object.assign(probe.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: element.w + "px",
    height: element.h + "px",
    overflow: "hidden",
    pointerEvents: "none",
    opacity: "0",
    zIndex: "-1",
    fontFamily: element.mono ? "monospace" : fontFamily,
    fontSize: (element.size ?? 24) + "px",
    fontWeight: element.bold ? "650" : "400",
    lineHeight: String(TEXT_LINE_HEIGHT),
    fontSynthesis: "none",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    textAlign: element.align ?? "left",
    color: element.color ?? "#192c2a",
    padding: "0",
    margin: "0",
    border: "0",
  });
  const text = document.createTextNode(element.text ?? "");
  probe.append(text);
  document.body.append(probe);
  try {
    const lines: { text: string; top: number; from: number; to: number }[] = [],
      range = document.createRange();
    const origin = probe.getBoundingClientRect();
    for (const part of new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    }).segment(text.data)) {
      range.setStart(text, part.index);
      range.setEnd(text, part.index + part.segment.length);
      const rect = range.getBoundingClientRect(),
        top = rect.top - origin.top;
      if (top >= element.h) break;
      let line = lines.at(-1);
      if (!line || Math.abs(line.top - top) > 0.5) {
        line = { text: "", top, from: part.index, to: part.index };
        lines.push(line);
      }
      if (part.segment !== "\n" && part.segment !== "\r\n") {
        line.text += part.segment;
        line.to = part.index + part.segment.length;
      }
    }
    const style = getComputedStyle(probe),
      family = style.fontFamily,
      weight = style.fontWeight;
    // SVG foreignObject uses the browser's own HTML text layout, preserving exactly the same wrapping.
    const css = `width:${element.w}px;height:${element.h}px;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;font-family:${family};font-size:${element.size ?? 24}px;font-weight:${weight};line-height:${TEXT_LINE_HEIGHT};font-synthesis:none;text-align:${element.align ?? "left"};color:${element.color ?? "#192c2a"};margin:0;padding:0;box-sizing:border-box;`;
    return {
      lines: lines.map((l) => ({ text: l.text, top: l.top })),
      html: `<div xmlns="http://www.w3.org/1999/xhtml" style="${xml(css)}">${xml(text.data)}</div>`,
      font: `${weight} ${element.size ?? 24}px ${family}`,
      fontFamily: family,
    };
  } finally {
    probe.remove();
  }
}
async function textLayer(e: Element, fontFamily: string): Promise<ExportLayer> {
  if (e.rich) {
    const fragments = await measureRichText(e, fontFamily),
      { canvas: c, ctx } = canvas(e.w, e.h);
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
    ctx.fillStyle = e.color || "#192c2a";
    ctx.textBaseline = "alphabetic";
    const baselines: number[] = [];
    for (const f of fragments) {
      const y = f.data ? f.y + f.h : baseline(f, ctx);
      baselines.push(y);
      if (f.data)
        ctx.drawImage(await loadExportImage(f.data), f.x, f.y, f.w, f.h);
      else ctx.fillText(f.text, f.x, y);
      if (f.strike) {
        ctx.beginPath();
        ctx.strokeStyle = e.color || "#192c2a";
        ctx.lineWidth = Math.max(1, f.size / 16);
        const strikeY = f.data ? f.y + f.h / 2 : y - f.size * 0.3;
        ctx.moveTo(f.x, strikeY);
        ctx.lineTo(f.x + f.w, strikeY);
        ctx.stroke();
      }
    }
    const layer = {
      ...e,
      data: c.toDataURL("image/png"),
      svg: richTextSvg(e, fragments, baselines),
      textLines: richTextLines(fragments, e.size ?? 24),
    };
    c.width = 0;
    c.height = 0;
    return layer;
  }
  const layout = measureText(e, fontFamily),
    { canvas: c, ctx } = canvas(e.w, e.h);
  const svg = svgData(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${e.w} ${e.h}"><foreignObject width="${e.w}" height="${e.h}">${layout.html}</foreignObject></svg>`,
  );
  try {
    ctx.drawImage(await loadExportImage(svg), 0, 0, c.width, c.height);
    const data = c.toDataURL("image/png");
    // Some WebKit versions render foreignObject as an empty image. Keep a local canvas fallback.
    const visible =
      !(e.text ?? "").trim() ||
      ctx
        .getImageData(0, 0, c.width, c.height)
        .data.some((v, i) => i % 4 === 3 && v > 0);
    if (visible) return { ...e, data, textLines: layout.lines };
  } catch {
    /* Cross-browser fallback uses the same measured line breaks. */
  }
  c.width = c.width;
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.font = layout.font;
  ctx.fillStyle = e.color ?? "#192c2a";
  ctx.textAlign = e.align ?? "left";
  ctx.textBaseline = "alphabetic";
  for (const line of layout.lines) {
    const metrics = ctx.measureText(line.text || "M");
    ctx.fillText(
      line.text,
      e.align === "center" ? e.w / 2 : e.align === "right" ? e.w : 0,
      line.top + (metrics.fontBoundingBoxAscent ?? (e.size ?? 24) * 0.9),
    );
  }
  return { ...e, data: c.toDataURL("image/png"), textLines: layout.lines };
}
function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/** Independent element layers keep native animations and original z-order; no flattened whole-slide image. */
export async function renderExportLayers(
  deck: Deck,
  slide: Slide,
  elements: Element[],
  assets: Record<string, string>,
): Promise<(ExportLayer | null)[]> {
  await document.fonts.ready;
  const layers: (ExportLayer | null)[] = [],
    cues = timeline(elements),
    cueByElement = new Map(
      cues.flatMap((c) => c.elements.map((i) => [i, c] as const)),
    );
  const imageCache = new Map<string, Promise<HTMLImageElement>>();
  const image = (data: string) => {
    if (!imageCache.has(data)) imageCache.set(data, loadExportImage(data));
    return imageCache.get(data)!;
  };
  for (const [index, e] of elements.entries()) {
    if (e.w <= 0 || e.h <= 0) {
      layers.push(null);
      continue;
    }
    if (e.kind === "text") {
      layers.push(await textLayer(e, resolveTheme(deck.theme).font));
      continue;
    }
    if (e.kind === "rect") {
      const padding = e.glass ? 80 : 0,
        { canvas: c, ctx } = canvas(e.w + padding * 2, e.h + padding * 2);
      ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
      const radius = e.glass?.radius ?? e.radius ?? 0;
      if (e.glass) {
        ctx.shadowColor = "rgba(35,60,53,.08)";
        ctx.shadowBlur = 40 * EXPORT_SCALE;
        ctx.shadowOffsetY = 14 * EXPORT_SCALE;
        round(ctx, padding, padding, e.w, e.h, radius);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        const blur = e.glass.blur ?? 24,
          margin = Math.ceil(blur * 3) + 2;
        const { canvas: backdrop, ctx: back } = canvas(
          e.w + 2 * margin,
          e.h + 2 * margin,
        );
        back.scale(EXPORT_SCALE, EXPORT_SCALE);
        back.fillStyle = resolveTheme(deck.theme, slide.background).background;
        back.fillRect(
          0,
          0,
          backdrop.width / EXPORT_SCALE,
          backdrop.height / EXPORT_SCALE,
        );
        // The page background is supplied by the first backdrop element when glass is used.
        const ownCue = cueByElement.get(index);
        for (let previous = 0; previous < index; previous++) {
          const layer = layers[previous];
          if (!layer) continue;
          const prior = cueByElement.get(previous);
          if (
            prior &&
            (!ownCue
              ? prior.step > 0 || prior.start > 0
              : prior.step > ownCue.step ||
                (prior.step === ownCue.step && prior.start > ownCue.start))
          )
            continue;
          back.drawImage(
            await image(layer.data),
            layer.x - e.x + margin,
            layer.y - e.y + margin,
            layer.w,
            layer.h,
          );
        }
        ctx.save();
        round(ctx, padding, padding, e.w, e.h, radius);
        ctx.clip();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.filter = `blur(${blur * EXPORT_SCALE}px) saturate(130%)`;
        ctx.drawImage(
          backdrop,
          (padding - margin) * EXPORT_SCALE,
          (padding - margin) * EXPORT_SCALE,
        );
        ctx.filter = "none";
        ctx.restore();
        ctx.fillStyle = e.fill ?? "#ffffff";
        ctx.globalAlpha = e.glass.opacity ?? 0.68;
        round(ctx, padding, padding, e.w, e.h, radius);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(255,255,255,.65)";
        ctx.lineWidth = 1.5;
        round(
          ctx,
          padding + 0.75,
          padding + 0.75,
          Math.max(0, e.w - 1.5),
          Math.max(0, e.h - 1.5),
          Math.max(0, radius - 0.75),
        );
        ctx.stroke();
        backdrop.width = 0;
        backdrop.height = 0;
      } else {
        round(ctx, 0, 0, e.w, e.h, radius);
        ctx.fillStyle = e.fill ?? "#ffffff";
        ctx.fill();
      }
      layers.push({
        data: c.toDataURL("image/png"),
        x: e.x - padding,
        y: e.y - padding,
        w: e.w + padding * 2,
        h: e.h + padding * 2,
      });
      c.width = 0;
      c.height = 0;
      continue;
    }
    const data =
      e.data ||
      (e.kind === "equation"
        ? mathSvg(e.text ?? "", e.color ?? "#192c2a")
        : assets[e.src ?? ""]);
    if (!data) throw Error(`缺少图片或公式：${e.src ?? e.text ?? ""}`);
    const img = await image(data);
    const viewBox = data.startsWith("data:image/svg+xml")
      ? atob(data.slice(data.indexOf(",") + 1))
          .match(/viewBox="([^"]+)"/)?.[1]
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : undefined;
    // HTMLImageElement rounds SVG naturalWidth/Height to integers; keep the precise vector ratio.
    const box = contain(
      viewBox?.[2] && viewBox?.[3] ? viewBox[2] : img.naturalWidth,
      viewBox?.[2] && viewBox?.[3] ? viewBox[3] : img.naturalHeight,
      e,
    );
    if (
      data.startsWith("data:image/svg+xml") ||
      data.startsWith("data:image/webp")
    ) {
      // Decorative full-page gradients remain vector SVGs; a 1× fallback avoids huge repeated bitmaps.
      // Text and formula fallbacks retain their 3× resolution.
      const { canvas: c, ctx } = canvas(
        box.w,
        box.h,
        e.data ? 1 : EXPORT_SCALE,
      );
      ctx.drawImage(img, 0, 0, c.width, c.height);
      layers.push({
        ...box,
        data: c.toDataURL("image/png"),
        ...(data.startsWith("data:image/svg+xml") ? { svg: data } : {}),
      });
      c.width = 0;
      c.height = 0;
    } else layers.push({ ...box, data });
  }
  return layers;
}
