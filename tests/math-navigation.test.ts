import { describe, it, expect } from "vitest";
import { parseDeck, type Project } from "../src/dsl";
import { scene } from "../src/scene";
import { SourceMap } from "../src/studio/source-map";
import {
  pageGroup,
  groupMoveTarget,
  sourcePages,
} from "../src/studio/page-groups";
import {
  editSlide,
  addSlideSource,
  duplicateSlideSource,
  deleteSlideSource,
  moveSlideSource,
  setSlideLayout,
  appendSlideBlocks,
} from "../src/studio/source-edits";
import {
  copyComponent,
  pasteComponent,
  pasteCanvasText,
} from "../src/studio/component-clipboard";
import { mathProofDeck, mathProofSource } from "../src/examples";
const source = `// preserved
Deck("D")
Slide(title:"Before"){Text("Before")}
DynamicSlide(title:"Proof",columns:2,id:"proof") {
 LeftColumn(repeat:true){Theorem("Fixed"){Text("Fixed statement")}}
 RightColumn { Proof {
  let local="local value"
  ProofStep("First"){Text(local)}
  PageBreak()
  ProofStep("Second"){Text("Second value")}
  PageBreak()
  ProofStep("Third"){Text("Third value")}
 }}
}
Slide(title:"After"){Text("After")}
`;
const project = (source: string): Project => ({
  format: "easy-slide",
  version: 1,
  source,
  assets: {},
});
const titles = (source: string) => parseDeck(source).slides.map((s) => s.title);
describe("dynamic page source navigation and editing", () => {
  it("maps every generated element back to the authored call and preserves local scopes", () => {
    const d = parseDeck(source),
      map = new SourceMap(source, d);
    expect(d.slides).toHaveLength(5);
    d.slides.forEach((s, i) =>
      scene(d, s, i).forEach((e) => expect(map.get(e.source!)).toBeDefined()),
    );
    const last = scene(d, d.slides[3], 3).find(
      (e) => e.text === "Third value",
    )!;
    const record = map.get(last.source!)!;
    expect(source.slice(record.from, record.to)).toBe('Text("Third value")');
    expect(record.scopeBindings.some((b) => b.includes("local="))).toBe(true);
    expect(
      map.at(source.indexOf('Text("Third value")') + 2, 0)?.target.page,
    ).toBe(3);
    expect(
      map.at(source.indexOf('Text("Fixed statement")') + 2, 3)?.target.page,
    ).toBe(1);
    expect(sourcePages(source).pages.map((c) => c.named.title)).toEqual([
      "Before",
      "Proof",
      "Proof",
      "Proof",
      "After",
    ]);
  });
  it("updates, duplicates, moves and deletes a complete authored group from any continuation", () => {
    const d = parseDeck(source);
    expect(pageGroup(d, 2)).toEqual({ first: 1, last: 3, count: 3 });
    expect(groupMoveTarget(d, 2, 1)).toBe(2);
    expect(groupMoveTarget(d, 2, -1)).toBe(0);
    expect(titles(editSlide(source, 2, { title: "Changed" }))).toEqual([
      "Before",
      "Changed",
      "Changed（续 2）",
      "Changed（续 3）",
      "After",
    ]);
    const added = addSlideSource(source, 2);
    expect(titles(added)[4]).toBe("新页面");
    const copied = duplicateSlideSource(source, 2, "copy");
    expect(parseDeck(copied).slides[4].id).toBe("proof-copy");
    expect(titles(copied)).toHaveLength(8);
    const moved = moveSlideSource(source, 2, 1);
    expect(titles(moved)).toEqual([
      "Before",
      "After",
      "Proof",
      "Proof（续 2）",
      "Proof（续 3）",
    ]);
    expect(titles(moveSlideSource(source, 2, -1))).toEqual([
      "Proof",
      "Proof（续 2）",
      "Proof（续 3）",
      "Before",
      "After",
    ]);
    expect(titles(deleteSlideSource(source, 2))).toEqual(["Before", "After"]);
    expect(deleteSlideSource(source, 2)).toContain("// preserved");
    expect(
      parseDeck(setSlideLayout(source, 2, "content")).slides[1].dynamic
        ?.columns,
    ).toBe(1);
  });
  it("supports editable column counts for sequential flow and adds content into explicit right columns", () => {
    const flow = 'Deck("D") Slide(title:"S"){Proof{Text("content")}}';
    expect(
      parseDeck(setSlideLayout(flow, 0, "split")).slides[0].dynamic?.columns,
    ).toBe(2);
    const d = parseDeck(source),
      map = new SourceMap(source, d);
    const changed = appendSlideBlocks(source, 2, ['Text("appended")']);
    expect(
      parseDeck(changed).slides.some((s, i) =>
        scene(parseDeck(changed), s, i).some((e) => e.text === "appended"),
      ),
    ).toBe(true);
    // Pasting on the generated right-column wrapper uses the original RightColumn body.
    const pasted = pasteCanvasText(
      project(source),
      d,
      map,
      { scope: "block", page: 2, path: [1] },
      "Pasted",
    );
    expect(pasted.source).toContain('Text("Pasted")');
    expect(() => parseDeck(pasted.source)).not.toThrow();
  });
  it("copies a split environment as portable content without generated absolute positioning", () => {
    const d = parseDeck(source),
      map = new SourceMap(source, d),
      clip = copyComponent(project(source), d, map, {
        scope: "block",
        page: 2,
        path: (
          map.records.find(
            (r) =>
              r.name === "Proof" &&
              r.generated &&
              r.target.page === 2 &&
              r.target.scope === "block",
          )!.target as { path: number[] }
        ).path,
      });
    expect(clip.snapshotOnly).toBe(true);
    expect(clip.text).toContain("Proof");
    expect(clip.text).not.toContain(".frame");
    expect(clip.text).not.toContain(".position");
    expect(clip.text).not.toContain("First");
    const destination = project(
        'Deck("Dest") Slide(title:"Dest"){Text("start")}',
      ),
      deck = parseDeck(destination.source);
    const pasted = pasteComponent(
      destination,
      deck,
      new SourceMap(destination.source),
      { scope: "slide", page: 0 },
      clip,
      "copy",
    );
    expect(
      parseDeck(pasted.project.source)
        .slides.flatMap((s, i) => scene(parseDeck(pasted.project.source), s, i))
        .some((e) => e.text === "Second value"),
    ).toBe(true);
  });
  it("maps legacy split math content and validates the complete example", () => {
    const legacy =
        'Deck("D") Slide(.split,title:"S"){Theorem{Text("left")} Proof{Text("right")}}',
      d = parseDeck(legacy),
      map = new SourceMap(legacy);
    const right = scene(d, d.slides[0], 0).find((e) => e.text === "right")!;
    expect(
      legacy.slice(map.get(right.source!)!.from, map.get(right.source!)!.to),
    ).toBe('Text("right")');
    const examples = new SourceMap(mathProofSource, mathProofDeck);
    mathProofDeck.slides.forEach((s, i) =>
      scene(mathProofDeck, s, i).forEach((e) => {
        expect(examples.get(e.source!)).toBeDefined();
        expect(e.y + e.h).toBeLessThanOrEqual(720);
        expect(e.x + e.w).toBeLessThanOrEqual(1280);
      }),
    );
  });
});

it("edits teaching page settings through local source changes", () => {
  const updated = editSlide(source, 2, {
    titleSize: 24,
    fontSize: 10,
    margin: 20,
    padding: 4,
    columnGap: 12,
    showFooter: false,
  });
  expect(updated).toContain("// preserved");
  const page = parseDeck(updated).slides[1];
  expect(page).toMatchObject({
    titleSize: 24,
    fontSize: 10,
    margin: 20,
    padding: 4,
    columnGap: 12,
    showFooter: false,
  });
  expect(new SourceMap(updated).records.length).toBeGreaterThan(0);
});

it("keeps editing the same declaration when smaller text removes continuation pages", () => {
  const text = "说明。".repeat(1200),
    source =
      'Deck("D") DynamicSlide(title:"Proof",fontSize:32){Text("' +
      text +
      '")} Slide(title:"After"){Text("After")}';
  const d = parseDeck(source),
    last = d.slides.length - 2;
  expect(last).toBeGreaterThan(0);
  const changed = editSlide(source, last, {
    fontSize: 8,
    margin: 0,
    padding: 0,
    showFooter: false,
  });
  expect(parseDeck(changed).slides[0]).toMatchObject({
    fontSize: 8,
    margin: 0,
    padding: 0,
    showFooter: false,
  });
  expect(parseDeck(changed).slides.at(-1)?.title).toBe("After");
});
