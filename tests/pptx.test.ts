import { describe, it, expect } from "vitest";
import { parseDeck } from "../src/dsl";
import { scene } from "../src/scene";
import { timeline, easingProgress } from "../src/motion";
import { pptxTiming, sceneShapeIds } from "../src/pptx-motion";
import {
  attachSvg,
  patchSlideMotion,
  deduplicateMedia,
} from "../src/pptx-package";
import JSZip from "jszip";
function fixture(body: string) {
  const deck = parseDeck(`Deck("A")\nSlide(title:"B"){${body}}`),
    elements = scene(deck, deck.slides[0], 0);
  return {
    deck,
    elements,
    cues: timeline(elements),
    ids: elements.map((_, i) => i + 2),
  };
}
describe("PowerPoint timing interoperability", () => {
  it("serializes computed fractional milliseconds as valid integer timing values", () => {
    const f = fixture(
      'Text("A").appear(.rise,step:1,duration:500.5,delay:0.25)',
    );
    const xml = pptxTiming(f.cues, f.ids);
    expect(xml).toContain('dur="501"');
    expect(
      [...xml.matchAll(/\b(?:dur|delay)="([^"]+)"/g)].every(
        (m) => m[1] === "indefinite" || /^\d+$/.test(m[1]),
      ),
    ).toBe(true);
  });
  it("writes one clickEffect per nonzero stage, with simultaneous starts and no extra clicks for gaps", () => {
    const f = fixture(
      'Text("auto").appear(.fade,step:0,delay:100) Text("A").appear(.rise,step:1,order:0,duration:500) Text("B").appear(.slideLeft,step:1,order:0,delay:200,duration:600) Text("C").appear(.zoom,step:1,order:1,delay:100,duration:700) Text("last").appear(.none,step:3)',
    );
    const xml = pptxTiming(f.cues, f.ids);
    expect(xml.match(/nodeType="clickEffect"/g)).toHaveLength(2);
    expect(xml.match(/nodeType="afterEffect"/g)).toHaveLength(1);
    expect(xml).toContain('delay="900"');
    expect(xml).toContain('dur="700"');
    expect(xml).toContain('evt="onNext"');
    expect(xml).toContain('evt="onPrev"');
    expect(xml).not.toContain("slide(from");
    expect(xml).not.toContain("zoom(in)");
  });
  it("exports actual pixel movement and an 88%-to-100% scale using sampled easing", () => {
    const f = fixture(
      'Text("A").appear(.rise,easing:.linear) Text("B").appear(.slideLeft,easing:.spring) Text("C").appear(.zoom,easing:.spring)',
    );
    const xml = pptxTiming(f.cues, f.ids);
    expect(xml).toContain("#ppt_y+0.041666667");
    expect(xml).toContain("#ppt_x-0.046875");
    expect(xml).toContain("#ppt_w*0.88");
    expect(xml).toContain("#ppt_h*1");
    expect(xml).toMatch(/#ppt_w\*1\.00[1-9]/);
    expect(xml).not.toMatch(/#ppt_\w+[^<]*e[+-]\d/);
    const ids = [...xml.matchAll(/<p:cTn id="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(easingProgress("linear", 0.5)).toBe(0.5);
    for (const easing of [
      "linear",
      "easeOut",
      "easeInOut",
      "spring",
    ] as const) {
      expect(easingProgress(easing, 0)).toBe(0);
      expect(easingProgress(easing, 1)).toBe(1);
    }
    expect(
      Math.max(
        ...Array.from({ length: 25 }, (_, i) =>
          easingProgress("spring", i / 24),
        ),
      ),
    ).toBeGreaterThan(1);
  });
  it("uses a visibility set for instant appearances and emits paragraph build data only for editable text", () => {
    const f = fixture('Text("instant").appear(.none,step:1,delay:250)');
    const id = f.ids[f.cues[0].elements[0]],
      xml = pptxTiming(f.cues, f.ids, [id]);
    expect(xml).toContain('presetID="1"');
    expect(xml).not.toContain("<p:animEffect");
    expect(xml).not.toContain("<p:anim ");
    expect(xml).toContain("style.visibility");
    expect(xml).toContain('val="visible"');
    expect(xml).toContain('delay="250"');
    expect(xml).toContain(`<p:bldP spid="${id}"`);
    expect(pptxTiming(f.cues, f.ids)).not.toContain("bldP");
  });
  it("maps animation targets by stable element names and skips explicitly invisible zero-area shapes", () => {
    const xml =
      '<p:cNvPr id="1" name="root"/><p:cNvPr name="unrelated" id="5"/><p:cNvPr name="easy-slide-element-2" id="91"/><p:cNvPr id="12" name="easy-slide-element-0"/>';
    expect(sceneShapeIds(xml, 3)).toEqual([12, null, 91]);
    expect(() => sceneShapeIds(xml + xml, 3)).toThrow("映射");
    const f = fixture('Text("A").appear(.fade,step:1)');
    expect(
      pptxTiming(
        f.cues,
        f.ids.map(() => null),
      ),
    ).toBe("");
    expect(() => pptxTiming(f.cues, [])).toThrow("目标与场景不匹配");
  });
});
describe("PowerPoint package ordering and fallback media", () => {
  it("shares identical media across slides without changing relationship IDs", async () => {
    const zip = new JSZip();
    zip.file("ppt/media/a.png", "same");
    zip.file("ppt/media/b.png", "same");
    zip.file("ppt/media/c.png", "different");
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      '<Relationships><Relationship Id="rId2" Target="../media/b.png"/><Relationship Id="rId3" Target="../media/c.png"/></Relationships>',
    );
    await deduplicateMedia(zip);
    expect(zip.file("ppt/media/b.png")).toBeNull();
    expect(zip.file("ppt/media/c.png")).not.toBeNull();
    const xml = await zip
      .file("ppt/slides/_rels/slide1.xml.rels")!
      .async("string");
    expect(xml).toContain('Id="rId2" Target="../media/a.png"');
    expect(xml).toContain('Id="rId3" Target="../media/c.png"');
  });
  const root =
    '<p:sld xmlns:p="p"><p:cSld></p:cSld><p:clrMapOvr></p:clrMapOvr><p:extLst/></p:sld>';
  it("keeps transition and timing before extensions, declares compatibility namespaces and exact milliseconds", () => {
    const { deck } = fixture('Text("x")');
    deck.transition = "slide";
    deck.duration = 780;
    deck.direction = "up";
    const xml = patchSlideMotion(root, deck, deck.slides[0], "<p:timing/>");
    expect(xml).toContain('mc:Ignorable="p14"');
    expect(xml).toContain('p14:dur="780"');
    expect(xml).toContain('<p:push dir="u"/>');
    expect(xml.indexOf("<p:transition")).toBeLessThan(xml.indexOf("<p:timing"));
    expect(xml.indexOf("<p:timing")).toBeLessThan(xml.indexOf("<p:extLst"));
    expect(
      patchSlideMotion(
        "<p:sld><p:cSld></p:cSld></p:sld>",
        deck,
        { ...deck.slides[0], transition: "none" },
        "",
      ),
    ).not.toContain("p:transition");
  });
  it("retains a high-resolution PNG relationship while adding the vector SVG alternative", () => {
    const xml =
      '<p:pic><p:cNvPr id="3" name="easy-slide-element-2"/><a:blip r:embed="rId4"/></p:pic>';
    const rels =
      '<Relationships><Relationship Id="rId4"/><Relationship Id="rId9"/></Relationships>';
    const result = attachSvg(xml, rels, 2, "../media/formula.svg");
    expect(result.xml).toContain('<a:blip r:embed="rId4">');
    expect(result.xml).toContain("asvg:svgBlip");
    expect(result.xml).toContain('r:embed="rId10"');
    expect(result.relationships).toContain('Target="../media/formula.svg"');
    expect(() => attachSvg(xml, rels, 1, "x")).toThrow("定位");
    expect(() =>
      attachSvg(
        '<p:pic><p:cNvPr name="easy-slide-element-2"/></p:pic>',
        rels,
        2,
        "x",
      ),
    ).toThrow("定位");
  });
});
