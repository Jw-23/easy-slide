import { resolveTheme } from "./themes";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { scene, TEXT_LINE_HEIGHT } from "./scene";
import { timeline } from "./motion";
import { pptxTiming, sceneShapeIds } from "./pptx-motion";
import { renderExportLayers } from "./pptx-render";
import { attachSvg, patchSlideMotion, deduplicateMedia } from "./pptx-package";
import type { Deck } from "./dsl";
export type PptxOptions = {
  textMode?: "faithful" | "editable";
  onProgress?: (page: number, total: number) => void;
};
import { download } from "./download";
export { download } from "./download";
/** Preserve every scene layer as an independently animated native PowerPoint shape. */
export async function buildPptx(
  deck: Deck,
  assets: Record<string, string>,
  options: PptxOptions = {},
): Promise<Blob> {
  const pptx = new PptxGenJS(),
    faithful = options.textMode !== "editable";
  pptx.defineLayout({ name: "EASY", width: 1280 / 96, height: 720 / 96 });
  pptx.layout = "EASY";
  pptx.title = deck.title;
  pptx.author = deck.author || "Easy Slide";
  pptx.subject = "Easy Slide";
  const pages: {
    elements: ReturnType<typeof scene>;
    active: boolean[];
    vectors: Map<number, string>;
  }[] = [];
  for (const [index, s] of deck.slides.entries()) {
    const page = pptx.addSlide();
    page.background = {
      color: resolveTheme(deck.theme, s.background).background.slice(1),
    };
    const elements = scene(deck, s, index),
      layers = await renderExportLayers(deck, s, elements, assets),
      vectors = new Map<number, string>();
    for (const [i, e] of elements.entries()) {
      const layer = layers[i];
      if (!layer) continue;
      const objectName = `easy-slide-element-${i}`;
      if (e.kind === "text" && !faithful) {
        const size = e.size ?? 24;
        page.addText((layer.textLines ?? []).map((l) => l.text).join("\n"), {
          x: e.x / 96,
          y: e.y / 96,
          w: e.w / 96,
          h: e.h / 96,
          objectName,
          fontFace: e.mono
            ? "Courier New"
            : resolveTheme(deck.theme)
                .font.split(",")[0]
                .replace(/["']/g, "")
                .trim(),
          fontSize: size * 0.75,
          color: e.color?.slice(1),
          bold: e.bold,
          align: e.align || "left",
          valign: "top",
          margin: 0,
          lineSpacing: size * 0.75 * TEXT_LINE_HEIGHT,
          paraSpaceAfter: 0,
          paraSpaceBefore: 0,
          lang: "zh-CN",
          wrap: false,
        });
      } else if (e.kind === "rect" && !e.glass && !faithful) {
        page.addShape(
          e.shape === "ellipse"
            ? pptx.ShapeType.ellipse
            : (e.radius ?? 0) > 0
              ? pptx.ShapeType.roundRect
              : pptx.ShapeType.rect,
          {
            x: e.x / 96,
            y: e.y / 96,
            w: e.w / 96,
            h: e.h / 96,
            objectName,
            rectRadius: Math.min(e.radius ?? 0, e.w / 2, e.h / 2) / 96,
            fill: { color: (e.fill || "#ffffff").slice(1) },
            line: { color: (e.fill || "#ffffff").slice(1), transparency: 100 },
          },
        );
      } else {
        page.addImage({
          data: layer.data,
          x: layer.x / 96,
          y: layer.y / 96,
          w: layer.w / 96,
          h: layer.h / 96,
          objectName,
          altText: e.text || e.src || e.kind,
        });
        if (layer.svg) vectors.set(i, layer.svg);
      }
    }
    page.addNotes(s.notes || "");
    pages.push({ elements, active: layers.map(Boolean), vectors });
    options.onProgress?.(index + 1, deck.slides.length);
    // Let the browser release per-slide decoded textures before processing the next page.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const raw = await pptx.write({ outputType: "arraybuffer" }),
    zip = await JSZip.loadAsync(raw as ArrayBuffer);
  for (const [i, page] of pages.entries()) {
    const path = `ppt/slides/slide${i + 1}.xml`,
      relPath = `ppt/slides/_rels/slide${i + 1}.xml.rels`;
    let xml = await zip.file(path)!.async("string"),
      relationships = await zip.file(relPath)!.async("string");
    const ids = sceneShapeIds(xml, page.elements.length);
    page.active.forEach((visible, index) => {
      if (visible && ids[index] === null)
        throw Error(`第 ${i + 1} 页：PPTX 元素 ${index} 未能导出`);
    });
    for (const [element, data] of page.vectors) {
      const file = `easy-slide-vector-${i + 1}-${element}.svg`,
        base64 = data.slice(data.indexOf(",") + 1);
      zip.file(`ppt/media/${file}`, base64, { base64: true });
      ({ xml, relationships } = attachSvg(
        xml,
        relationships,
        element,
        `../media/${file}`,
      ));
    }
    if (!faithful) {
      // Native text uses the measured browser breaks, no automatic shrinking or hidden reflow.
      xml = xml.replace(
        /<a:bodyPr\b([^>]*?)(\/?)>/g,
        (_, attributes, close) =>
          `<a:bodyPr${attributes.replace(/\s(?:wrap|vertOverflow|horzOverflow)="[^"]*"/g, "")} wrap="none" vertOverflow="clip" horzOverflow="clip"${close}>`,
      );
    }
    const textIds = faithful
      ? []
      : page.elements.flatMap((e, j) =>
          e.kind === "text" && ids[j] !== null ? [ids[j]!] : [],
        );
    xml = patchSlideMotion(
      xml,
      deck,
      deck.slides[i],
      pptxTiming(timeline(page.elements), ids, textIds),
    );
    zip.file(path, xml);
    zip.file(relPath, relationships);
  }
  const types = await zip.file("[Content_Types].xml")!.async("string");
  if (!/Extension="svg"/.test(types))
    zip.file(
      "[Content_Types].xml",
      types.replace(
        "</Types>",
        '<Default Extension="svg" ContentType="image/svg+xml"/></Types>',
      ),
    );
  await deduplicateMedia(zip);
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
export async function exportPptx(
  deck: Deck,
  assets: Record<string, string>,
  options: PptxOptions = {},
) {
  download(await buildPptx(deck, assets, options), deck.title + ".pptx");
}
