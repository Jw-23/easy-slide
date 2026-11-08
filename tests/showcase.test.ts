import { describe, it, expect } from "vitest";
import {
  showcaseDeck,
  initialSource,
  initialAssets,
  exampleAssetsFor,
} from "../src/examples";
import {
  parseDeck,
  layouts,
  effects,
  easings,
  validateProject,
  type Block,
} from "../src/dsl";
import { scene } from "../src/scene";
import { timeline } from "../src/motion";
describe("startup feature tour", () => {
  it("opens a valid flat document with a portable local image", () => {
    const p = validateProject({
      format: "easy-slide",
      version: 1,
      source: initialSource,
      assets: initialAssets,
    });
    expect(parseDeck(p.source)).toEqual(showcaseDeck);
    expect(showcaseDeck.slides).toHaveLength(18);
    expect(Object.keys(p.assets)).toEqual(["assets/convergence.png"]);
    expect(p.assets["assets/convergence.png"]).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(exampleAssetsFor(showcaseDeck)).toEqual(initialAssets);
  });
  it("demonstrates every layout, content component, container, entrance and easing", () => {
    const blocks: Block[] = [];
    const walk = (bs: Block[]) =>
      bs.forEach((b) => {
        blocks.push(b);
        walk(b.children || []);
      });
    showcaseDeck.slides.forEach((s) => walk(s.blocks));
    expect(
      new Set(blocks.filter((b) => b.type === "layout").map((b) => b.preset)),
    ).toEqual(new Set(layouts));
    for (const type of [
      "text",
      "bullets",
      "equation",
      "image",
      "metric",
      "code",
      "quote",
      "table",
      "hstack",
      "vstack",
      "zstack",
      "grid",
      "spacer",
      "glass",
    ])
      expect(blocks.some((b) => b.type === type)).toBe(true);
    expect(
      new Set(blocks.filter((b) => b.appear).map((b) => b.appear!.effect)),
    ).toEqual(new Set(effects));
    expect(
      new Set(
        blocks.filter((b) => b.appear?.easing).map((b) => b.appear!.easing),
      ),
    ).toEqual(new Set(easings));
    expect(
      new Set(
        showcaseDeck.slides
          .filter((s) => s.transition)
          .map((s) => s.transition),
      ),
    ).toEqual(new Set(["fade", "slide", "zoom", "none"]));
    expect(
      new Set(
        [
          showcaseDeck.direction,
          ...showcaseDeck.slides.map((s) => s.direction),
        ].filter(Boolean),
      ),
    ).toEqual(new Set(["left", "right", "up", "down"]));
    for (const s of showcaseDeck.slides)
      expect(s.notes?.length).toBeGreaterThan(20);
  });
  it("resolves every image and produces finite reproducible animation timings", () => {
    for (const [i, s] of showcaseDeck.slides.entries()) {
      const es = scene(showcaseDeck, s, i);
      for (const e of es) {
        if (e.src) expect(initialAssets[e.src]).toBeDefined();
        for (const v of [e.x, e.y, e.w, e.h])
          expect(Number.isFinite(v)).toBe(true);
        expect(e.w).toBeGreaterThanOrEqual(0);
        expect(e.h).toBeGreaterThanOrEqual(0);
      }
      for (const c of timeline(es)) {
        expect(c.start).toBeGreaterThanOrEqual(0);
        expect(c.end).toBeGreaterThanOrEqual(c.start);
      }
    }
  });
});
