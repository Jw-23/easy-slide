import { describe, it, expect } from "vitest";
import {
  parseDeck,
  serialize,
  pageLayout,
  pageContent,
  withLayout,
} from "../src/dsl";
import { scene } from "../src/scene";
import { mathError } from "../src/math";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { completeDsl } from "../src/editor-language";
import { equationContext } from "../src/latex";
describe("independent layout and material components", () => {
  it("composes layouts independently of Slide and round-trips glass properties", () => {
    const d = parseDeck(
      `Deck("布局")\nTheme(material: .glass)\nSlide(title:"独立布局") {Split(spacing:32){Glass {Text("左侧")} Cards(columns:2){Metric("1") Metric("2")}}.glass(blur:30,opacity:0.7,radius:24)}`,
    );
    expect(d.slides[0]).not.toHaveProperty("layout");
    expect(pageLayout(d.slides[0])).toBe("split");
    expect(pageContent(d.slides[0])).toHaveLength(2);
    expect(parseDeck(serialize(d))).toEqual(d);
    const elements = scene(d, d.slides[0], 0);
    expect(
      elements.some((e) => e.data?.startsWith("data:image/svg+xml")),
    ).toBeTruthy();
    expect(elements.filter((e) => e.glass)).toHaveLength(4);
  });
  it("switches a layout component while preserving content and reads the old syntax", () => {
    const old = parseDeck(
      'Deck("A")\nSlide(.split,title:"B"){Text("A") Text("B")}',
    );
    expect(old.slides[0]).not.toHaveProperty("layout");
    const s = withLayout(old.slides[0], "grid");
    expect(pageLayout(s)).toBe("grid");
    expect(pageContent(s).map((b) => b.text)).toEqual(["A", "B"]);
    expect(serialize({ ...old, slides: [s] })).toContain("Cards {");
    expect(serialize(old)).not.toContain("Slide(.split");
  });
  it("validates material parameters", () => {
    for (const modifier of [
      "glass(opacity:2)",
      "glass(blur:-1)",
      "glass(radius:101)",
    ])
      expect(() =>
        parseDeck(`Deck("A")\nSlide(title:"B"){Text("X").${modifier}}`),
      ).toThrow();
  });
});
describe("LaTeX assistance", () => {
  it("reports malformed formulas and unknown commands with a correction", () => {
    expect(mathError("\\frac{a}{b}")).toBeNull();
    expect(mathError("\\frca{a}{b}")).toContain("frac");
    expect(mathError("\\frac{a")).not.toBeNull();
    expect(() =>
      parseDeck('Deck("A")\nSlide(title:"B"){Equation(#"\\frca{a}{b}"#)}'),
    ).toThrow(/LaTeX/);
  });
  it("understands raw and escaped equation strings without activating inside Text", () => {
    for (const text of [
      'Equation(#"\\fr',
      'Equation("\\\\fr',
      'Equation(text: #"\\fr',
    ]) {
      const range = equationContext(text, text.length);
      expect(range).not.toBeNull();
      const result = completeDsl(
        new CompletionContext(
          EditorState.create({ doc: text }),
          text.length,
          true,
        ),
      );
      expect(result?.options.map((x) => x.label)).toContain("\\frac");
    }
    expect(equationContext('Text("\\fr', 10)).toBeNull();
  });
  it("keeps LaTeX source positions correct in strings with escaped quotes and comments", () => {
    const source =
      '// Equation(#"fake\nSlide(title:"A"){Text("quoted \\"text\\"") Equation(#"\\su';
    expect(equationContext(source, source.length)?.raw).toBe(true);
  });
});
