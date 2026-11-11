import { describe, expect, it } from "vitest";
import { dedentProse, indentProse } from "../src/prose";
import { parseDeck, serialize } from "../src/dsl";
import { scene } from "../src/scene";
import { mathAsset, fitMath } from "../src/math";
import { flowRuns, parseRichText } from "../src/rich-text";
import { richHtml } from "../src/rich-text-render";
import { splitText } from "../src/content-measure";
import { formatSource } from "../src/studio/format-source";
import { equationContext } from "../src/latex";

const proof =
  'Deck("D") DynamicSlide(title:"证明", fontSize:22) { Proof { Text(`\n    设 $x>0$，**目标**是证明下式。\n    $$\\frac{x^2}{2} \\ge 0$$\n    由此可得结论。\n`).indent(2) } }';
describe("long mathematical prose", () => {
  it("removes common source indentation, preserving relative indentation and intentional blank lines", () => {
    expect(
      dedentProse("\r\n    第一段\r\n      子段\r\n\r\n    末段\r\n  "),
    ).toBe("第一段\n  子段\n\n末段");
    expect(dedentProse("  单行保持空格")).toBe("  单行保持空格");
    expect(dedentProse("\n\n  ")).toBe("");
  });
  it("indents prose, leaving display math and its multiline contents untouched", () => {
    const text = "正文 $x$\n$$\n x+y\n$$\n\n结论";
    expect(indentProse(text, 2)).toBe("　　正文 $x$\n$$\n x+y\n$$\n\n　　结论");
    expect(indentProse(text, 0)).toBe(text);
  });
  it("keeps raw multiline proof text, formulas and indentation through formatting and serialization", () => {
    const deck = parseDeck(proof);
    const elements = scene(deck, deck.slides[0], 0);
    const body = elements.find((e) => e.text?.includes("目标"))!;
    expect(body.text).toContain("　　设 $x>0$");
    expect(body.text).toContain("\n$$\\frac{x^2}{2} \\ge 0$$\n　　由此");
    expect(body.rich?.hasMath).toBe(true);
    const formatted = parseDeck(formatSource(proof));
    expect(scene(formatted, formatted.slides[0], 0)).toEqual(elements);
    const roundTrip = parseDeck(serialize(deck));
    expect(
      scene(roundTrip, roundTrip.slides[0], 0).find((e) =>
        e.text?.includes("目标"),
      )?.text,
    ).toBe(body.text);
    const pos = proof.indexOf("\\frac") + 4;
    expect(equationContext(proof, pos)?.raw).toBe(true);
  });
  it("supports named indentation and rejects invalid or misplaced values", () => {
    expect(
      parseDeck('Deck("D") Slide(title:"S"){Text("正文",indent:2)}').slides[0]
        .blocks[0].indent,
    ).toBe(2);
    for (const modifier of [".indent(-1)", ".indent(1.5)", ".indent(9)"])
      expect(() =>
        parseDeck(`Deck("D") Slide(title:"S"){Text("正文")${modifier}}`),
      ).toThrow(/indent/);
    expect(() =>
      parseDeck('Deck("D") Slide(title:"S"){Image("assets/a.png").indent(2)}'),
    ).toThrow(/indent/);
  });
  it("does not add indentation again to each wrapped or paginated line", () => {
    const parts = splitText(
      { type: "text", text: "第一段".repeat(80), indent: 2 },
      150,
      150,
      "serif",
      22,
    );
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((b) => b.indent === undefined)).toBe(true);
    expect(
      parts
        .map((b) => b.text)
        .join("")
        .match(/　/g),
    ).toHaveLength(2);
  });
  it("treats source newlines adjacent to display math as layout separators", () => {
    const document = parseRichText("正文\n$$x^2$$\n结论");
    expect(flowRuns(document).filter((r) => r.kind === "break")).toHaveLength(
      0,
    );
    expect(richHtml(document)).not.toContain("\n");
    expect(
      flowRuns(parseRichText("正文\n\n$$x$$\n\n结论")).filter(
        (r) => r.kind === "break",
      ),
    ).toHaveLength(2);
  });
});
describe("consistent formula sizes", () => {
  it("uses the same em scale for standalone and embedded display math, regardless of box size", () => {
    for (const tex of [
      "x",
      "\\lambda \\ge 0",
      "Hx+q+G^T\\lambda+E^T\\nu=0",
      "\\boxed{x+y=0}",
    ]) {
      const asset = mathAsset(tex, "#192c2a", true)!;
      const small = fitMath(tex, "#192c2a", 22, { x: 0, y: 0, w: 900, h: 180 });
      const large = fitMath(tex, "#192c2a", 22, {
        x: 0,
        y: 0,
        w: 1200,
        h: 500,
      });
      expect(small.w).toBeCloseTo(asset.widthEm * 22);
      expect(small.h).toBeCloseTo(asset.heightEm * 22);
      expect(large.w).toBeCloseTo(small.w);
      expect(large.h).toBeCloseTo(small.h);
    }
  });
  it("only shrinks overflowing formulas and retains the aspect ratio", () => {
    const asset = mathAsset("a+b+c+d+e=f", "#192c2a", true)!;
    const box = fitMath("a+b+c+d+e=f", "#192c2a", 24, {
      x: 10,
      y: 20,
      w: 60,
      h: 100,
    });
    expect(box.w).toBeCloseTo(60);
    expect(box.w / box.h).toBeCloseTo(asset.widthEm / asset.heightEm);
    expect(box.x).toBeCloseTo(10);
  });
  it("applies explicit and inherited font sizes to Equation in the shared export/preview scene", () => {
    const deck = parseDeck(
      'Deck("D") Slide(title:"S",fontSize:22){Equation(`x`).frame(width:800,height:200) Equation(`x`).font(30).frame(width:800,height:200)}',
    );
    const equations = scene(deck, deck.slides[0], 0).filter(
      (e) => e.kind === "equation",
    );
    expect(equations[0].size).toBe(22);
    expect(equations[1].w / equations[0].w).toBeCloseTo(30 / 22);
  });
});
