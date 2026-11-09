import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { parseDeck, type Deck, type Slide } from "../src/dsl";
import { themeIds, resolveTheme } from "../src/themes";
import { SlideView } from "../src/SlideView";
import type { Element } from "../src/scene";
// Browser rasterization is outside this unit test; inspect the real PPTX package
// and server-rendered preview to verify theme propagation through both consumers.
vi.mock("../src/pptx-render", () => ({
  renderExportLayers: vi.fn(
    async (_deck: Deck, _slide: Slide, elements: Element[]) =>
      elements.map((e) => ({
        ...e,
        data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=",
        textLines: [{ text: e.text || "", top: 0 }],
      })),
  ),
}));
import { buildPptx } from "../src/export";
function deck(preset: (typeof themeIds)[number]) {
  return parseDeck(
    `Deck("报告") Theme(preset: .${preset}) Slide(title: "结论") { Cards { Text("结果").appear(.rise,step:1,duration:520) Metric("92%",label:"通过率") } }`,
  );
}
describe("theme propagation to preview and PPTX", () => {
  it("uses preset background, font, panel material and title color in the web preview", () => {
    for (const preset of themeIds) {
      const d = deck(preset),
        t = resolveTheme(d.theme);
      const html = renderToStaticMarkup(
        createElement(SlideView, {
          deck: d,
          slide: d.slides[0],
          index: 0,
          assets: {},
        }),
      );
      expect(html).toContain(`background:${t.background}`);
      expect(html).toContain(`color:${t.color}`);
      expect(html).toContain(`border-radius:${t.radius}`);
      expect(html).toContain(t.font.split(",")[0].replaceAll('"', "&quot;"));
      expect(html.includes("backdrop-filter:")).toBe(t.material === "glass");
    }
  });
  it("writes each preset background/font/accent and retains click animation in actual editable PPTX XML", async () => {
    for (const preset of themeIds) {
      const d = deck(preset),
        t = resolveTheme(d.theme);
      const blob = await buildPptx(d, {}, { textMode: "editable" });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
      expect(xml).toContain(`val="${t.background.slice(1).toUpperCase()}"`);
      expect(xml).toContain(`val="${t.accent.slice(1).toUpperCase()}"`);
      expect(xml).toContain(
        `typeface="${t.font.split(",")[0].replaceAll('"', "")}"`,
      );
      expect(xml).toContain("结果");
      expect(xml).toContain('nodeType="clickEffect"');
      expect(xml).toContain('dur="520"');
      expect(xml).not.toContain("undefined");
    }
  });
});

it("exports expanded custom layouts, basic shapes and their grouped animations", async () => {
  const d = parseDeck(`
    func Report(title, completed = 0.8) {
      Panel {
        Columns(weights: [1, 3]) {
          Circle(fill: "#245abc").frame(width: 80, height: 80)
          VStack(spacing: 12) {
            Heading(title)
            Progress(completed, label: "验证")
            Content()
          }
        }
      }
    }
    Deck("布局函数")
    Slide(title: "报告") {
      Report("结果") { Numbered(["假设", "结论"]) }
        .appear(.rise, step: 1, duration: 720)
    }
  `);
  const blob = await buildPptx(d, {}, { textMode: "editable" });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).toContain('prst="ellipse"');
  for (const content of ["结果", "80%", "验证", "假设", "结论"])
    expect(xml).toContain(content);
  expect(xml).toContain('nodeType="clickEffect"');
  expect(xml).toContain('dur="720"');
  expect(xml).not.toContain("undefined");
});
