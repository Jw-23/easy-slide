import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { parseDeck, type Deck, type Slide } from "../src/dsl";
import { richRuns } from "../src/rich-text";
import { mathRunAsset } from "../src/rich-text-render";
import {
  richTextLines,
  richTextSvg,
  type RichFragment,
} from "../src/rich-text-export";
import type { Element } from "../src/scene";
import {
  exportProjectArchive,
  importProjectArchive,
} from "../src/project-archive";
const decode = (data: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(data.slice(data.indexOf(",") + 1)), (c) =>
      c.charCodeAt(0),
    ),
  );
// Real package/vector generation; browser measurement and rasterization are tested separately in browser tests.
vi.mock("../src/pptx-render", () => ({
  renderExportLayers: vi.fn(
    async (_deck: Deck, _slide: Slide, elements: Element[]) =>
      elements.map((e) => {
        const data =
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=";
        if (!e.rich)
          return { ...e, data, textLines: [{ text: e.text || "", top: 0 }] };
        let x = 0;
        const fragments: RichFragment[] = richRuns(e.rich, { bold: e.bold })
          .filter((r) => r.kind !== "break")
          .map((r) => {
            const asset =
                r.kind === "math"
                  ? mathRunAsset(r, e.color || "#192c2a")
                  : undefined,
              w = asset ? asset.widthEm * 24 : r.text.length * 12,
              f = {
                text: r.text,
                x,
                y: 4,
                w,
                h: 24,
                size: 24,
                family: "Arial",
                bold: !!r.bold,
                italic: !!r.italic,
                strike: !!r.strike,
                mono: !!r.mono,
                ...(asset ? { data: asset.data } : {}),
              };
            x += w;
            return f;
          });
        return {
          ...e,
          data,
          textLines: richTextLines(fragments, 24),
          svg: richTextSvg(
            e,
            fragments,
            fragments.map(() => 24),
          ),
        };
      }),
  ),
}));
import { buildPptx } from "../src/export";

describe("rich text PPTX", () => {
  it("writes native editable bold, italic, strike and monospace runs with existing animations", async () => {
    const d = parseDeck(
        'Deck("D") Theme(preset:.paper) Slide(title:"A"){Text("normal **strong** *italic* ~~old~~ `code $x$`").appear(.rise,step:1,duration:720)}',
      ),
      blob = await buildPptx(d, {}, { textMode: "editable" }),
      zip = await JSZip.loadAsync(await blob.arrayBuffer()),
      xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    for (const text of ["strong", "italic", "old", "code $x$"])
      expect(xml).toContain(text);
    expect(xml).not.toContain("**strong**");
    expect(xml).toContain('b="1"');
    expect(xml).toContain('i="1"');
    expect(xml).toContain('strike="sngStrike"');
    expect(xml).toContain('typeface="Courier New"');
    expect(xml).toContain('nodeType="clickEffect"');
    expect(xml).toContain('dur="720"');
  });
  it("keeps mixed math paragraphs as SVG plus PNG in both modes without losing animation targets", async () => {
    const d = parseDeck(
      String.raw`Deck("D") Theme(preset:.paper) Slide(title:"A"){Text(#"**误差** $\frac{1}{n}$"#).appear(.zoom,step:2,duration:650)}`,
    );
    for (const textMode of ["faithful", "editable"] as const) {
      const blob = await buildPptx(d, {}, { textMode }),
        zip = await JSZip.loadAsync(await blob.arrayBuffer()),
        xml = await zip.file("ppt/slides/slide1.xml")!.async("string"),
        vectors = await Promise.all(
          Object.keys(zip.files)
            .filter((p) => p.startsWith("ppt/media/") && p.endsWith(".svg"))
            .map((p) => zip.file(p)!.async("string")),
        );
      expect(
        vectors.some(
          (svg) =>
            svg.includes("误差") &&
            svg.includes("<path") &&
            svg.includes('font-weight="650"'),
        ),
      ).toBe(true);
      expect(vectors.every((svg) => !svg.includes("foreignObject"))).toBe(true);
      expect(xml).toContain('name="easy-slide-element-');
      expect(xml).toContain('nodeType="clickEffect"');
      expect(xml).toContain('dur="650"');
      expect(xml).toContain("asvg:svgBlip");
      expect(xml).not.toContain("undefined");
    }
  });
  it("generates clipped standalone vectors and preserves explicit empty lines and styles", () => {
    const base: RichFragment = {
        text: "A < B & C",
        x: 0,
        y: 4,
        w: 110,
        h: 24,
        size: 24,
        family: '"Arial"',
        bold: true,
        italic: true,
        strike: true,
        mono: false,
      },
      fragments = [
        base,
        { ...base, text: "after blank line", y: 72, bold: false },
      ],
      svg = decode(
        richTextSvg(
          {
            kind: "text",
            x: 0,
            y: 0,
            w: 400,
            h: 120,
            step: 0,
            color: "#123456",
          },
          fragments,
          [24, 92],
        ),
      ),
      lines = richTextLines(fragments, 24);
    expect(svg).toContain("A &lt; B &amp; C");
    expect(svg).toContain('font-family="&quot;Arial&quot;"');
    expect(svg).toContain('clip-path="url(#bounds)"');
    expect(svg).toContain('font-style="italic"');
    expect(lines).toHaveLength(3);
    expect(lines[1].text).toBe("");
    expect(lines[2].runs[0].bold).toBe(false);
  });
  it("retains rich text source and formula delimiters in a portable ZIP", async () => {
    const project = {
        format: "easy-slide" as const,
        version: 1 as const,
        source: String.raw`Deck("D") Slide(title:"A"){Text(#"**结果**：$x^2$"#)}`,
        assets: {},
      },
      zip = await exportProjectArchive(project);
    expect(await importProjectArchive(await zip.arrayBuffer())).toEqual(
      project,
    );
  });
});
