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

it("exports bottom-left positions and independent scale as native geometry with animation", async () => {
  const d = parseDeck(
      'Deck("D") Theme(preset:.paper) Slide(title:"S"){Rectangle(fill:"#ff0000").frame(width:100,height:50).position(x:20,y:20,relativeTo:.slide).scale(2).appear(.rise,step:1,duration:650)}',
    ),
    blob = await buildPptx(d, {}, { textMode: "editable" }),
    zip = await JSZip.loadAsync(await blob.arrayBuffer()),
    xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).toContain('<a:off x="190500" y="5715000"/>');
  expect(xml).toContain('<a:ext cx="1905000" cy="952500"/>');
  expect(xml).toContain('nodeType="clickEffect"');
  expect(xml).toContain('dur="650"');
});

it("exports mathematical continuation pages, headings, step numbering, endings, notes and animations", async () => {
  const d = parseDeck(`Deck("证明").transition(.slide,duration:550)
    Theme(preset:.paper)
    Slide(title:"证明") {
      Proof {
        ProofStep("前半",reason:"初始条件"){Text("第一段").appear(.rise,step:1,duration:430)}
        PageBreak()
        ProofStep("后半",reason:"归纳假设"){Equation(\`a=b\`).appear(.fade,step:1,duration:610)}
      }
    }.notes("证明的演讲备注")`);
  const zip = await JSZip.loadAsync(
    await (await buildPptx(d, {}, { textMode: "editable" })).arrayBuffer(),
  );
  const slideFiles = Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(name),
  );
  expect(slideFiles).toHaveLength(2);
  const first = await zip.file(slideFiles[0])!.async("string"),
    last = await zip.file(slideFiles[1])!.async("string");
  expect(first).toContain("步骤 1 · 前半");
  expect(first).toContain("依据：初始条件");
  expect(first).not.toContain("∎");
  expect(last).toContain("步骤 2 · 后半");
  expect(last).toContain("证明（续）");
  expect(last).toContain("∎");
  expect(first).toContain('dur="430"');
  expect(last).toContain('dur="610"');
  for (const [i, xml] of [first, last].entries()) {
    expect(xml).toContain('nodeType="clickEffect"');
    expect(xml).toContain("p:transition");
    expect(
      await zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`)!.async("string"),
    ).toContain("证明的演讲备注");
  }
});

it("exports custom teaching title size, small body text and hidden footer", async () => {
  const d = parseDeck(
    'Deck("Teaching") DynamicSlide(title:"Teaching title",titleSize:24,fontSize:10,margin:20,padding:4,showFooter:false){Text("Small body")}',
  );
  const zip = await JSZip.loadAsync(
    await (await buildPptx(d, {}, { textMode: "editable" })).arrayBuffer(),
  );
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).toContain('sz="1800"');
  expect(xml).toContain('sz="750"');
  expect(xml).toContain("Small body");
  expect(xml).not.toContain("<a:t>01</a:t>");
});
