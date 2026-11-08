import { timeline } from "./motion";
import { pptxTiming, shapeIds } from "./pptx-motion";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { scene } from "./scene";
import { mathSvg } from "./math";
import type { Deck } from "./dsl";
export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
export async function exportPptx(deck: Deck, assets: Record<string, string>) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "EASY", width: 13.333333, height: 7.5 });
  pptx.layout = "EASY";
  pptx.title = deck.title;
  pptx.author = deck.author || "Easy Slide";
  for (const [i, s] of deck.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = {
      color: (s.background || deck.theme?.background || "#fafbf9").slice(1),
    };
    for (const e of scene(deck, s, i)) {
      const pos = { x: e.x / 96, y: e.y / 96, w: e.w / 96, h: e.h / 96 };
      if (e.kind === "rect")
        slide.addShape(pptx.ShapeType.roundRect, {
          ...pos,
          rectRadius: 0.15,
          fill: { color: e.fill!.slice(1) },
          line: { color: e.fill!.slice(1), transparency: 100 },
        });
      else if (e.kind === "text")
        slide.addText(e.text || "", {
          ...pos,
          fontFace: e.mono ? "Courier New" : deck.theme?.font || "Arial",
          fontSize: (e.size || 24) * 0.75,
          color: e.color?.slice(1),
          bold: e.bold,
          margin: 0,
          breakLine: false,
          valign: "top",
          fit: "shrink",
          paraSpaceAfter: 8,
          lang: "zh-CN",
        });
      else {
        const data =
          e.kind === "equation"
            ? mathSvg(e.text || "", e.color || "#192c2a")
            : assets[e.src || ""];
        if (!data)
          throw new Error(`第 ${i + 1} 页：缺少图片 ${e.src || "或公式无效"}`);
        // SVG viewBox and raster dimensions preserve the same contain geometry used in preview.
        let w = 1,
          h = 1;
        if (e.kind === "equation") {
          const raw = atob(data.split(",")[1]);
          const v = raw
            .match(/viewBox="([^"]+)"/)?.[1]
            .split(" ")
            .map(Number);
          if (v) {
            w = v[2];
            h = v[3];
          }
        } else {
          const img = new Image();
          img.src = data;
          await img.decode();
          w = img.naturalWidth;
          h = img.naturalHeight;
        }
        slide.addImage({
          data,
          ...pptxgenjsContain(w, h, pos.x, pos.y, pos.w, pos.h),
        });
      }
    }
    slide.addNotes(s.notes || "");
  }
  const raw = await pptx.write({ outputType: "arraybuffer" });
  const zip = await JSZip.loadAsync(raw as ArrayBuffer);
  for (const [i, s] of deck.slides.entries()) {
    const path = `ppt/slides/slide${i + 1}.xml`,
      file = zip.file(path);
    if (!file) continue;
    const type = s.transition || deck.transition || "fade",
      duration = s.duration ?? deck.duration ?? 600;
    const direction = { left: "l", right: "r", up: "u", down: "d" }[
      s.direction || deck.direction || "left"
    ];
    const effect =
      type === "slide"
        ? `<p:push dir="${direction}"/>`
        : type === "zoom"
          ? '<p:zoom dir="in"/>'
          : "<p:fade/>";
    let xml = await file.async("string");
    if (type !== "none")
      xml = xml.replace(
        "</p:clrMapOvr>",
        `</p:clrMapOvr><p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" p14:dur="${duration}" spd="${duration > 700 ? "slow" : duration < 400 ? "fast" : "med"}">${effect}</p:transition>`,
      );
    const timing = pptxTiming(timeline(scene(deck, s, i)), shapeIds(xml));
    if (timing) xml = xml.replace("</p:sld>", timing + "</p:sld>");
    zip.file(path, xml);
  }
  download(
    await zip.generateAsync({
      type: "blob",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    deck.title + ".pptx",
  );
}
function pptxgenjsContain(
  iw: number,
  ih: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.min(w / iw, h / ih);
  return {
    x: x + (w - iw * scale) / 2,
    y: y + (h - ih * scale) / 2,
    w: iw * scale,
    h: ih * scale,
  };
}
