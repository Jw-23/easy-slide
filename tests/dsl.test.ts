import { describe, it, expect } from "vitest";
import { parseDeck, serialize, validateProject } from "../src/dsl";
import { mathDeck, engineeringDeck } from "../src/examples";
import { scene } from "../src/scene";
import { mathSvg } from "../src/math";
describe("DSL compilation", () => {
  it("round-trips both scene templates without losing notes or formulas", () => {
    for (const deck of [mathDeck, engineeringDeck])
      expect(parseDeck(serialize(deck))).toEqual(deck);
  });
  it("validates layouts, scalar types and offline image references", () => {
    for (const patch of [
      { layout: "missing" },
      { blocks: [{ type: "metric", value: 42 }] },
      { blocks: [{ type: "image", src: "https://example.com/a.png" }] },
      { blocks: [{ type: "text", step: -1 }] },
    ]) {
      const deck = structuredClone(mathDeck);
      Object.assign(deck.slides[0], patch);
      expect(() => parseDeck(serialize(deck))).toThrow();
    }
  });
  it("keeps every generated scene element within the canvas", () => {
    for (const d of [mathDeck, engineeringDeck])
      d.slides.forEach((s, i) =>
        scene(d, s, i).forEach((e) => {
          expect(e.x).toBeGreaterThanOrEqual(0);
          expect(e.y).toBeGreaterThanOrEqual(0);
          expect(e.x + e.w).toBeLessThanOrEqual(1280);
          expect(e.y + e.h).toBeLessThanOrEqual(720);
        }),
      );
  });
  it("preserves explicit positions and staged appearance", () => {
    const d = structuredClone(mathDeck);
    d.slides[0].blocks = [
      {
        type: "text",
        text: "precise",
        x: 100,
        y: 150,
        w: 200,
        h: 50,
        size: 22,
        step: 2,
      },
    ];
    expect(
      scene(d, d.slides[0], 0).find((e) => e.text === "precise"),
    ).toMatchObject({ x: 100, y: 150, w: 200, h: 50, size: 22, step: 2 });
  });
  it("embeds standalone vector formulas", () => {
    const url = mathSvg("x_{k+1}=x_k-\\eta\\nabla f(x_k)", "#16766d");
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = atob(url.split(",")[1]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox");
    expect(svg).not.toContain("currentColor");
  });
  it("rejects invalid imported projects and remote asset data", () => {
    expect(() =>
      validateProject({
        format: "easy-slide",
        version: 1,
        source: serialize(mathDeck),
        assets: { "assets/a.png": "https://example.com" },
      }),
    ).toThrow();
  });
});
describe("SwiftUI-style composition", () => {
  it("supports nested containers, raw formulas, comments and chained modifiers", () => {
    const d = parseDeck(`// Local declarative document
Deck("研究") {
 Theme(accent: "#16766d")
 Slide(.content, title: "组合布局") {
  HStack(spacing: 20) {
   VStack(spacing: 10) {
    Text("标题").font(28).frame(height: 50)
    Bullets(["A", "B"])
   }.frame(width: 400)
   Equation(#"\\frac{a}{b}"#).step(2)
  }.padding(20).foreground("#16766d")
 }.notes("讨论")
}.transition(.slide, duration: 650)`);
    expect(d.slides[0].blocks[0].children?.[1].text).toBe("\\frac{a}{b}");
    const e = scene(d, d.slides[0], 0);
    expect(e.find((x) => x.text === "标题")).toMatchObject({
      x: 94,
      y: 270,
      size: 28,
      color: "#16766d",
    });
    expect(e.find((x) => x.kind === "equation")).toMatchObject({
      step: 2,
      x: 514,
    });
    expect(parseDeck(serialize(d))).toEqual(d);
  });
  it("rejects executable expressions and unknown modifiers with useful errors", () => {
    for (const s of [
      'Deck("A") { Slide(.content, title: "A") { eval("code") } }',
      'Deck("A") { Slide(.content, title: "A") { Text("A").unknown(3) } }',
      'Deck("A") { Slide(.content, title: "A") { Text(window.location) } }',
      'Deck("A") {',
    ])
      expect(() => parseDeck(s)).toThrow();
  });
});
