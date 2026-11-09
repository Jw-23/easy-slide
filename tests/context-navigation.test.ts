import { formatSource } from "../src/studio/format-source";
import { describe, it, expect } from "vitest";
import { parseDeck, serialize, type Project } from "../src/dsl";
import {
  SourceMap,
  targetKey,
  targetContains,
  type SceneTarget,
} from "../src/studio/source-map";
import { scene } from "../src/scene";
import { compileDocument } from "../src/studio/compile-document";
import {
  copyComponent,
  pasteComponent,
  deleteComponent,
  pasteCanvasText,
} from "../src/studio/component-clipboard";
import { showcaseDeck } from "../src/showcase";
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=";
const source = String.raw`// keep
Deck("D",author:"Author")
Theme(preset:.aurora)
let rows=range(0,3).map(k=>[k,k^2])
Slide(title:"Same",subtitle:"subtitle",eyebrow:"E") {
 Cards {
  Text("Same")
  VStack {
   Text("Same").appear(.rise,step:2)
   Table(columns:[Column("k"),Column("square")],rows:rows)
   Image("assets/图片.png")
  }.glass()
 }
}.notes("N")
Slide(title:"Second"){Flow{Text("Same")}}
`;
const target = (path: number[], page = 0): SceneTarget => ({
  scope: "block",
  page,
  path,
});
function project(
  src = source,
  assets: Record<string, string> = { "assets/图片.png": pixel },
): Project {
  return { format: "easy-slide", version: 1, source: src, assets };
}
describe("structural source navigation", () => {
  it("distinguishes repeated text, fields, nested components and modifier positions", () => {
    const deck = parseDeck(source),
      map = new SourceMap(source),
      elements = scene(deck, deck.slides[0], 0);
    const texts = elements.filter((e) => e.text === "Same");
    expect(texts).toHaveLength(3);
    expect(new Set(texts.map((e) => targetKey(e.source!))).size).toBe(3);
    for (const element of elements) {
      expect(element.source).toBeDefined();
      expect(map.get(element.source!)).toBeDefined();
    }
    const nested = map.get(target([0, 1, 0]))!;
    expect(source.slice(nested.from, nested.to)).toContain(
      ".appear(.rise,step:2)",
    );
    expect(map.at(source.indexOf("step:2") + 2, 0)?.target).toEqual(
      target([0, 1, 0]),
    );
    expect(
      map.at(source.indexOf('subtitle:"subtitle"') + 12, 0)?.target,
    ).toEqual({ scope: "slide", page: 0, field: "subtitle" });
    expect(map.at(source.indexOf(".notes") + 2, 0)?.target).toEqual({
      scope: "slide",
      page: 0,
      field: "notes",
    });
    expect(map.at(source.indexOf("Theme") + 3, 1)?.target).toEqual({
      scope: "theme",
      page: 1,
    });
    expect(targetContains(target([0, 1]), target([0, 1, 2]))).toBe(true);
    expect(targetContains(target([0, 1]), target([0, 2]))).toBe(false);
  });
  it("rebuilds offsets after edits while compiled pages are reused", () => {
    const before = parseDeck(source),
      changed = "// inserted comment\n" + source,
      next = compileDocument(changed, before),
      map = new SourceMap(changed);
    expect(next.slides[0]).toBe(before.slides[0]);
    for (const element of scene(next, next.slides[0], 0)) {
      const record = map.get(element.source!)!;
      expect(changed.slice(record.from, record.to)).not.toBe("");
    }
    expect(map.get(target([0, 1, 2]))!.from).toBe(changed.indexOf("Image("));
  });
  it("handles legacy Deck/Slide layouts and maps every tour element to a declaration", () => {
    const legacy = 'Deck("D"){Slide(.split,title:"L"){Text("A") Text("B")}}',
      deck = parseDeck(legacy),
      map = new SourceMap(legacy);
    for (const element of scene(deck, deck.slides[0], 0))
      expect(map.get(element.source!)).toBeDefined();
    expect(map.get(target([0]))!.synthetic).toBe(true);
    expect(
      legacy.slice(map.get(target([0, 1]))!.from, map.get(target([0, 1]))!.to),
    ).toBe('Text("B")');
    const tour = serialize(showcaseDeck),
      all = new SourceMap(tour),
      parsed = parseDeck(tour);
    parsed.slides.forEach((slide, i) =>
      scene(parsed, slide, i).forEach((element) =>
        expect(all.get(element.source!)).toBeDefined(),
      ),
    );
  });
});
describe("component clipboard", () => {
  it("preserves raw calculations and comments in the same scope and supports atomic cut/delete", () => {
    const p = project(),
      deck = parseDeck(source),
      map = new SourceMap(source),
      clip = copyComponent(p, deck, map, target([0, 1, 1]));
    const result = pasteComponent(
      p,
      deck,
      map,
      target([0, 1, 1]),
      clip,
      "id",
      true,
    );
    expect(result.materialized).toBe(false);
    expect(result.project.source.match(/rows:rows/g)).toHaveLength(2);
    expect(result.project.source).toContain("// keep");
    const removed = deleteComponent(source, map, target([0, 1, 1]));
    expect(removed).not.toContain("Table(");
    expect(parseDeck(removed).slides).toHaveLength(2);
  });
  it("captures local data when pasting into another scope or project", () => {
    const p = project(),
      deck = parseDeck(source),
      clip = copyComponent(p, deck, new SourceMap(source), target([0, 1, 1]));
    const dest = project(
        'Deck("Other") Slide(title:"X"){Flow{Text("existing")}}',
        {},
      ),
      d = parseDeck(dest.source);
    const result = pasteComponent(
      dest,
      d,
      new SourceMap(dest.source),
      target([0]),
      clip,
      "copy",
    );
    expect(result.materialized).toBe(true);
    expect(result.project.source).not.toContain("rows: rows");
    const parsed = parseDeck(result.project.source);
    expect(parsed.slides[0].blocks[0].children?.at(-1)?.rows).toEqual([
      [0, 0],
      [1, 1],
      [2, 4],
    ]);
  });
  it("preserves images on cross-project paste and resolves filename collisions without rewriting matching text", () => {
    const p = project(),
      d = parseDeck(source),
      clip = copyComponent(p, d, new SourceMap(source), target([0, 1]));
    // The same logical name belongs to another image in the destination.
    const other = pixel.replace("AAAC1HAwCAAAAC0", "AAAC1HAwCAAAAC1");
    const dest = project(
        'Deck("Other") Slide(title:"X"){Flow{Text("assets/图片.png")}}',
        { "assets/图片.png": other },
      ),
      deck = parseDeck(dest.source);
    const result = pasteComponent(
      dest,
      deck,
      new SourceMap(dest.source),
      target([0]),
      clip,
      "asset",
    );
    expect(result.project.assets["assets/paste-asset-图片.png"]).toBe(pixel);
    expect(result.project.assets["assets/图片.png"]).toBe(other);
    expect(result.project.source).toContain('Text("assets/图片.png")');
    expect(result.project.source).toContain(
      'Image("assets/paste-asset-图片.png")',
    );
  });
  it("pastes plain text as content and external DSL as declarations with one validation boundary", () => {
    const p = project(),
      d = parseDeck(source),
      map = new SourceMap(source);
    const text = pasteCanvasText(
      p,
      d,
      map,
      target([0, 0]),
      'hello "world"\nnext',
    );
    expect(parseDeck(text.source).slides[0].blocks[0].children?.[1].text).toBe(
      'hello "world"\nnext',
    );
    const dsl = pasteCanvasText(p, d, map, target([0]), 'Text("new").font(31)');
    expect(
      parseDeck(dsl.source).slides[0].blocks[0].children?.at(-1)?.size,
    ).toBe(31);
    expect(() =>
      pasteCanvasText(p, d, map, target([0]), "Text(undefinedVariable)"),
    ).toThrow();
    expect(p.source).toBe(source);
  });
});
it("materializes references declared later than the destination page instead of pasting an undefined variable", () => {
  const p = project(
      'Deck("D") Slide(title:"A"){Flow{Text("A")}} let later=3 Slide(title:"B"){Text(fixed(later))}',
      {},
    ),
    d = parseDeck(p.source),
    map = new SourceMap(p.source);
  const clip = copyComponent(p, d, map, target([0], 1)),
    result = pasteComponent(p, d, map, target([0, 0]), clip, "late");
  expect(result.materialized).toBe(true);
  expect(
    parseDeck(result.project.source).slides[0].blocks[0].children?.at(-1)?.text,
  ).toBe("3.00");
});
it("maps a glass backdrop without a Theme declaration to the page", () => {
  const source = 'Deck("A") Slide(title:"B"){Glass{Text("C")}}',
    deck = parseDeck(source),
    map = new SourceMap(source);
  scene(deck, deck.slides[0], 0).forEach((element) =>
    expect(map.get(element.source!)).toBeDefined(),
  );
});

it("keeps computed source portable within the same scope after formatting its declarations", () => {
  const original = project(),
    old = parseDeck(source),
    clip = copyComponent(
      original,
      old,
      new SourceMap(source),
      target([0, 1, 1]),
    );
  const formatted = project(formatSource(source)),
    deck = parseDeck(formatted.source),
    result = pasteComponent(
      formatted,
      deck,
      new SourceMap(formatted.source),
      target([0, 1, 1]),
      clip,
      "formatted",
      true,
    );
  expect(result.materialized).toBe(false);
  expect(result.project.source).toContain("rows:rows");
});
it("rewrites only the copied Image argument when raw source encounters an asset collision", () => {
  const original = project(
    source.replace(
      'Image("assets/图片.png")',
      'Text("assets/图片.png")\n   Image("assets/图片.png")',
    ),
  );
  const deck = parseDeck(original.source),
    map = new SourceMap(original.source),
    clip = copyComponent(original, deck, map, target([0, 1]));
  const other =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const dest = { ...original, assets: { "assets/图片.png": other } },
    result = pasteComponent(dest, deck, map, target([0, 1]), clip, "raw", true);
  expect(result.materialized).toBe(false);
  expect(
    result.project.source.match(/Text\("assets\/图片.png"\)/g),
  ).toHaveLength(2);
  expect(result.project.source).toContain('Image("assets/paste-raw-图片.png")');
  expect(result.project.assets["assets/paste-raw-图片.png"]).toBe(pixel);
});
