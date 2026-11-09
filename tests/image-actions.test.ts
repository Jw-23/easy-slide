import { describe, it, expect } from "vitest";
import { renameImage, moveImage } from "../src/studio/image-actions";
import { parseDeck, type Project } from "../src/dsl";
import { scene } from "../src/scene";
import {
  exportProjectArchive,
  importProjectArchive,
} from "../src/project-archive";
import { cropRect, colorValues } from "../src/image-edit";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=";
const project = (body: string): Project => ({
  format: "easy-slide",
  version: 1,
  source: body,
  assets: { "assets/old.png": png },
});
const image = (p: Project, page = 0) => {
  const d = parseDeck(p.source);
  return scene(d, d.slides[page], page).find((e) => e.src)!;
};
describe("image source edits", () => {
  it("renames direct, computed, local and custom function references while retaining prose", async () => {
    const p = project(
      'func Picture(){Image("assets/old.png")} let picture="assets/old.png" Deck("D") Slide(title:"S"){Image(picture) Image("assets/"+"old.png") Text("assets/old.png") Picture()}',
    );
    const next = renameImage(p, "assets/old.png", "新图.png");
    expect(Object.keys(next.assets)).toEqual(["assets/新图.png"]);
    expect(next.source).toContain('Text("assets/old.png")');
    const d = parseDeck(next.source),
      images = d.slides.flatMap((s, i) => scene(d, s, i)).filter((e) => e.src);
    expect(images).toHaveLength(3);
    expect(images.every((e) => e.src === "assets/新图.png")).toBe(true);
    const zip = await exportProjectArchive(next);
    expect(
      await importProjectArchive(new Uint8Array(await zip.arrayBuffer())),
    ).toEqual(next);
    expect(p.assets["assets/old.png"]).toBe(png);
  });
  it("rejects collisions, traversal and unresolved generated references atomically", () => {
    const p = project(
      'func Picture(name){Image("assets/"+name)} Deck("D") Slide(title:"S"){Picture("old.png")}',
    );
    expect(() => renameImage(p, "assets/old.png", "next.png")).toThrow(
      /计算图片引用/,
    );
    expect(() => renameImage(p, "assets/old.png", "../bad.png")).toThrow();
    expect(() =>
      renameImage(
        { ...p, assets: { ...p.assets, "assets/next.png": png } },
        "assets/old.png",
        "next.png",
      ),
    ).toThrow(/同名/);
    expect(Object.keys(p.assets)).toEqual(["assets/old.png"]);
  });
  it("moves an image through canvas coordinates while retaining motion and nested scaling", () => {
    const p = project(
      'Deck("D") Slide(title:"S"){ZStack{Image("assets/old.png").frame(width:100,height:50).scale(1.5).appear(.rise,step:2)}.frame(width:500,height:300).scale(2)}',
    );
    const old = image(p),
      moved = moveImage(p, old.source!, 140, 120, old.w, old.h).project;
    const el = image(moved);
    expect(el).toMatchObject({ x: 140, y: 120, w: old.w, h: old.h, step: 2 });
    const again = moveImage(moved, el.source!, 160, 140, el.w, el.h).project;
    expect(image(again)).toMatchObject({ x: 160, y: 140, w: el.w, h: el.h });
    expect(again.source.match(/\.position\(/g)).toHaveLength(1);
    expect(again.source.match(/\.frame\(/g)).toHaveLength(2);
    expect(moved.source).toContain("relativeTo: .slide");
    expect(moved.source).toContain(".appear(.rise,step:2)");
  });
  it("keeps dynamic pages and numbering automatic when an image is dragged", () => {
    const p = project(
      'Deck("D") DynamicSlide(title:"S",columns:2){Theorem{Text("T")} Image("assets/old.png").frame(width:200,height:100) Proof{ProofStep("A"){Text("A")} PageBreak() ProofStep("B"){Text("B")}}}',
    );
    const before = parseDeck(p.source),
      old = image(p),
      moved = moveImage(p, old.source!, 200, 180, old.w, old.h).project,
      after = parseDeck(moved.source);
    expect(image(moved)).toMatchObject({ x: 200, y: 180, w: 200, h: 100 });
    expect(after.slides.length).toBe(before.slides.length);
    expect(after.slides.every((s) => s.dynamic)).toBe(true);
    const text = (p: Project) => {
      const d = parseDeck(p.source);
      return d.slides
        .flatMap((s, i) => scene(d, s, i))
        .filter((e) => e.kind === "text")
        .map((e) => e.text);
    };
    expect(text(moved)).toEqual(text(p));
  });
  it("clamps a drag to the slide and rejects generated function elements", () => {
    const p = project(
        'Deck("D") Slide(title:"S"){Image("assets/old.png").frame(width:100,height:100)}',
      ),
      el = image(p);
    expect(
      image(moveImage(p, el.source!, 9999, -1, 100, 100).project),
    ).toMatchObject({ x: 1180, y: 0 });
    const custom = project(
      'func Picture(){Image("assets/old.png")} Deck("D") Slide(title:"S"){Picture()}',
    );
    const e = image(custom);
    expect(() => moveImage(custom, e.source!, 10, 10, e.w, e.h)).toThrow(
      /布局函数/,
    );
  });
});
it("normalizes crop bounds and exposes lossless color formats", () => {
  expect(cropRect({ x: 80, y: 90 }, { x: 10, y: 20 }, 100, 100)).toEqual({
    x: 10,
    y: 20,
    w: 70,
    h: 70,
  });
  expect(cropRect({ x: -10, y: -10 }, { x: 200, y: 200 }, 100, 100)).toEqual({
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  });
  expect(colorValues(255, 128, 0)).toEqual({
    hex: "#ff8000",
    rgb: "rgb(255, 128, 0)",
    binary: "11111111 10000000 00000000",
  });
});
