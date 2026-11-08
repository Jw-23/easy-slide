import { describe, expect, it } from "vitest";
import { parseDeck, pageLayout, pageContent, serialize } from "../src/dsl";
import { showcaseDeck } from "../src/showcase";
import {
  addSlideSource,
  appendSlideBlocks,
  deleteSlideSource,
  duplicateSlideSource,
  editSlide,
  minimalTextChange,
  moveSlideSource,
  renameDeck,
  setSlideLayout,
} from "../src/studio/source-edits";
const original = String.raw`// 项目说明保留
Deck("A").transition(.slide, duration: 800)
Theme(preset: .paper)
let values = range(0, 3).map(k => [k, k^2])
Slide(title: ")", // 标题注释
 subtitle: ",", id: "page-one",) {
  // 正文保留原始缩进和计算
  Split(spacing: 18) {
    Table(columns: [Column("k"), Column("value")], rows: values)
    Equation(#"\left\{x\right\}"#).appear(.zoom, step: 2)
  }.padding(4)
}.notes("before").transition(.fade, duration: 300, easing: .spring) // 页尾

// 第二页
Slide(title: "B") { Flow { Text("原文") } }
`;
describe("source-preserving page operations", () => {
  it("updates metadata with punctuation strings, trailing commas and comments without rewriting content", () => {
    const next = editSlide(original, 0, {
      title: '一个"标题"',
      subtitle: "新副标题",
      notes: "新备注",
    });
    const before = parseDeck(original),
      after = parseDeck(next);
    expect(after.slides[0]).toMatchObject({
      title: '一个"标题"',
      subtitle: "新副标题",
      notes: "新备注",
    });
    expect(after.slides[0].blocks).toEqual(before.slides[0].blocks);
    expect(next).toContain("// 标题注释");
    expect(next).toContain("// 正文保留原始缩进和计算");
    expect(next).toContain("// 页尾");
    expect(next.slice(next.indexOf("  // 正文"), next.indexOf("}.notes"))).toBe(
      original.slice(
        original.indexOf("  // 正文"),
        original.indexOf("}.notes"),
      ),
    );
    expect(next).toContain(original.slice(original.indexOf("// 第二页")));
  });
  it("adds fields before trailing comments and updates the final effective modifier", () => {
    const source =
      'Deck("A")\nSlide(title:"B" // keep\n) {}.notes("old").notes("effective")';
    const next = editSlide(source, 0, { subtitle: "Sub", notes: "new" });
    expect(next).toContain('subtitle: "Sub" // keep');
    expect(next).toContain('.notes("old").notes("new")');
    expect(parseDeck(next).slides[0].notes).toBe("new");
    const named = editSlide('Deck("A") Slide(title:"B",notes:"named") {}', 0, {
      notes: "replacement",
    });
    expect(named).toContain('notes:"replacement"');
    expect(named).not.toContain(".notes");
  });
  it("preserves other transition values and global inheritance while changing duration or effect", () => {
    const next = editSlide(original, 0, { duration: 550 });
    expect(parseDeck(next).slides[0]).toMatchObject({
      transition: "fade",
      duration: 550,
      easing: "spring",
    });
    expect(next).toContain('.notes("before")');
    const inherited = editSlide(original, 1, { direction: "up" });
    expect(parseDeck(inherited).slides[1]).toMatchObject({
      transition: "slide",
      direction: "up",
    });
  });
  it("renames an existing layout in place and wraps mixed content without losing local bindings", () => {
    const next = setSlideLayout(original, 0, "grid");
    expect(next).toBe(
      original.replace("Split(spacing: 18)", "Cards(spacing: 18)"),
    );
    expect(pageLayout(parseDeck(next).slides[0])).toBe("grid");
    const flat =
      'Deck("A") Slide(title:"B") {\nlet n=2\n// keep\nText(fixed(n))\nImage("assets/a.png")\n}';
    const wrapped = setSlideLayout(flat, 0, "split");
    expect(wrapped).toContain("let n=2\n// keep\nText(fixed(n))");
    expect(pageContent(parseDeck(wrapped).slides[0])).toHaveLength(2);
    expect(
      pageLayout(
        parseDeck(
          setSlideLayout(
            'Deck("A"){Slide(.content,title:"B"){Text("x")}}',
            0,
            "grid",
          ),
        ).slides[0],
      ),
    ).toBe("grid");
  });
  it("inserts images inside bare layout blocks and creates a missing body before modifiers", () => {
    const next = appendSlideBlocks(original, 1, ['Image("assets/图片.png")']);
    expect(pageContent(parseDeck(next).slides[1]).at(-1)).toMatchObject({
      type: "image",
      src: "assets/图片.png",
    });
    expect(next).toContain('Text("原文")');
    const bodyless = appendSlideBlocks(
      'Deck("A") Slide(title:"B").notes("N")',
      0,
      ['Text("New")'],
    );
    expect(parseDeck(bodyless).slides[0]).toMatchObject({
      notes: "N",
      blocks: [{ type: "text", text: "New" }],
    });
    expect(
      parseDeck(
        setSlideLayout('Deck("A") Slide(title:"B").notes("N")', 0, "split"),
      ).slides[0].notes,
    ).toBe("N");
  });
  it("copies computed source with a fresh ID and moves/deletes whole pages including inline comments", () => {
    const copied = duplicateSlideSource(original, 0, "copy");
    const deck = parseDeck(copied);
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides[1].id).toBe("page-one-copy");
    expect(deck.slides[1].blocks).toEqual(deck.slides[0].blocks);
    const moved = moveSlideSource(original, 0, 1);
    expect(parseDeck(moved).slides.map((s) => s.title)).toEqual(["B", ")"]);
    expect(moved).toContain(".spring) // 页尾");
    const deleted = deleteSlideSource(original, 0);
    expect(parseDeck(deleted).slides[0].title).toBe("B");
    expect(deleted).not.toContain(" // 页尾");
    expect(
      parseDeck(addSlideSource(original, 0)).slides.map((s) => s.title),
    ).toEqual([")", "新页面", "B"]);
    expect(() => deleteSlideSource(deleted, 0)).toThrow("至少保留一页");
  });
  it("edits every tour page without destroying calculated content and rejects an overfull deck", () => {
    const source = serialize(showcaseDeck);
    showcaseDeck.slides.forEach((slide, i) => {
      const next = parseDeck(
        editSlide(source, i, { title: "Edited", notes: "N" }),
      );
      expect(next.slides[i].blocks).toEqual(slide.blocks);
      expect(next.slides[i].title).toBe("Edited");
    });
    const full =
      'Deck("A")\n' +
      Array.from({ length: 200 }, (_, i) => `Slide(title:"${i}") {}`).join(
        "\n",
      );
    expect(() => addSlideSource(full, 199)).toThrow("200");
    expect(() => duplicateSlideSource(full, 0)).toThrow("200");
  });
  it("keeps the project header and editor selections local to the changed text", () => {
    const next = renameDeck(original, "新名称");
    expect(next).toBe(original.replace('Deck("A")', 'Deck("新名称")'));
    const change = minimalTextChange("prefix OLD suffix", "prefix NEW suffix");
    expect(change).toEqual({ from: 7, to: 10, insert: "NEW" });
    for (const [a, b] of [
      ["same", "same"],
      ["a", ""],
      ["", "b"],
      ["a🙂b", "a🙂bc"],
    ]) {
      const diff = minimalTextChange(a, b);
      expect(a.slice(0, diff.from) + diff.insert + a.slice(diff.to)).toBe(b);
    }
  });
});
