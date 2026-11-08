import { describe, it, expect } from "vitest";
import { parseDeck, serialize } from "../src/dsl";
import { DslError } from "../src/diagnostics";
import { scene } from "../src/scene";
import { timeline } from "../src/motion";
import { pptxTiming } from "../src/pptx-motion";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { completeDsl } from "../src/editor-language";
const source = `Deck("演示", author: "作者").transition(.slide, duration: 750, direction: .up, easing: .easeInOut)
Theme(accent: "#16766d")
Slide(.content, title: "清晰的先后顺序") {
 HStack {
  Text("A").appear(.rise, step: 1, order: 0, duration: 500)
  Text("B").appear(.fade, step: 1, order: 0, delay: 200, duration: 600)
  Text("C").appear(.zoom, step: 1, order: 1, delay: 100, duration: 700)
 }
}`;
describe("flat documents and diagnostics", () => {
  it("keeps Deck, Theme and Slides at top level and round-trips all motion metadata", () => {
    const d = parseDeck(source);
    const written = serialize(d);
    expect(written).toMatch(/^Deck\([^\n]+\)\.transition[^\n]+\n\nTheme/);
    expect(written).toContain("\n\nSlide(");
    expect(parseDeck(written)).toEqual(d);
  });
  it("points semantic errors at the exact modifier and suggests misspelling corrections", () => {
    const bad =
      'Deck("A")\nSlide(.content, title: "B") {\n Text("body").apear(.fade)\n}';
    try {
      parseDeck(bad);
      throw Error("expected error");
    } catch (e) {
      expect(e).toBeInstanceOf(DslError);
      const d = e as DslError;
      expect(d.line).toBe(3);
      expect(bad.slice(d.from, d.to)).toBe("apear(.fade)");
      expect(d.detail).toContain(".appear");
      expect(d.hint.length).toBeGreaterThan(10);
    }
  });
  it("rejects invalid animation parameters and duplicate headers", () => {
    for (const modifier of [
      "appear(.bad)",
      "appear(.fade, delay: -1)",
      "appear(.rise, order: 1.5)",
      "appear(.zoom, duration: 10001)",
      "appear(.fade, easing: .bad)",
      "transition(.slide, direction: .bad)",
    ]) {
      const s = modifier.startsWith("transition")
        ? `Deck("A").${modifier}\nSlide(.content, title: "A") {}`
        : `Deck("A")\nSlide(.content, title: "A") {Text("A").${modifier}}`;
      expect(() => parseDeck(s)).toThrow(DslError);
    }
    expect(() => parseDeck('Deck("A")\nDeck("B")')).toThrow();
  });
  it("retains the legacy nested syntax without requiring migration", () => {
    expect(
      parseDeck('Deck("A") {Slide(.content,title: "B") {Text("C")}}').slides[0]
        .title,
    ).toBe("B");
  });
});
describe("deterministic timeline", () => {
  it("runs equal orders in parallel and waits for the longest before later orders", () => {
    const d = parseDeck(source),
      es = scene(d, d.slides[0], 0),
      cues = timeline(es);
    expect(cues.map((c) => [c.label, c.step, c.start, c.end])).toEqual([
      ["A", 1, 0, 500],
      ["B", 1, 200, 800],
      ["C", 1, 900, 1600],
    ]);
  });
  it("inherits container motion while keeping later child stages", () => {
    const d = parseDeck(
      'Deck("A")\nSlide(.content,title:"B"){VStack{Text("A") Text("B").step(3)}.appear(.fade,step:1,order:2)}',
    );
    expect(
      timeline(scene(d, d.slides[0], 0)).map((c) => [c.step, c.motion.effect]),
    ).toEqual([
      [1, "fade"],
      [3, "fade"],
    ]);
  });
  it("exports native timing with unique node ids and actual shape targets", () => {
    const d = parseDeck(source),
      es = scene(d, d.slides[0], 0),
      cues = timeline(es),
      ids = es.map((_, i) => i + 2),
      xml = pptxTiming(cues, ids);
    expect(xml).toContain('delay="900"');
    expect(xml).toContain('dur="700"');
    expect(xml).toContain('filter="zoom(in)"');
    for (const c of cues)
      for (const i of c.elements) expect(xml).toContain(`spid="${ids[i]}"`);
    const nodeIds = [...xml.matchAll(/<p:cTn id="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
  });
});
describe("editor completion", () => {
  const complete = (text: string) =>
    completeDsl(
      new CompletionContext(
        EditorState.create({ doc: text }),
        text.length,
        true,
      ),
    )?.options.map((o) => o.label) || [];
  it("provides component, modifier, effect, layout, easing and named argument completions", () => {
    expect(complete("Te")).toContain("Text");
    expect(complete('Text("A").')).toContain("appear");
    expect(complete('Text("A").appear(.')).toContain("slideLeft");
    expect(complete("Slide(.")).toContain("content");
    expect(complete('Text("A").appear(.fade, easing: .')).toContain("spring");
    expect(complete('Text("A").appear(.fade, du')).toContain("duration:");
  });
});
it("staggers list items, table rows and container children without losing grouped shape targets", () => {
  for (const component of [
    'Bullets(["A","B"])',
    'Table([["A"],["B"]])',
    'HStack {Text("A") Text("B")}',
  ]) {
    const d = parseDeck(
      `Deck("A")\nSlide(.content,title:"B"){${component}.appear(.fade,step:1,duration:500).stagger(120)}`,
    );
    const cues = timeline(scene(d, d.slides[0], 0));
    expect(cues.map((c) => [c.label, c.start, c.end])).toEqual([
      ["A", 0, 500],
      ["B", 120, 620],
    ]);
    expect(parseDeck(serialize(d))).toEqual(d);
  }
});
