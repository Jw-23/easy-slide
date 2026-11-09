import { describe, it, expect } from "vitest";
import { parseRichText, richRuns } from "../src/rich-text";
import { richHtml } from "../src/rich-text-render";
import { mathAsset } from "../src/math";
import { parseDeck, serialize } from "../src/dsl";
import { scene } from "../src/scene";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SlideView } from "../src/SlideView";
import { SourceMap } from "../src/studio/source-map";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { completeDsl } from "../src/editor-language";
const runs = (text: string) => richRuns(parseRichText(text));
const plain = (text: string) =>
  runs(text)
    .map((r) => (r.kind === "break" ? "\n" : r.text))
    .join("");
function completions(marked: string) {
  const pos = marked.indexOf("¦"),
    state = EditorState.create({ doc: marked.replace("¦", "") });
  return (
    completeDsl(new CompletionContext(state, pos, true), [])?.options.map(
      (o) => o.label,
    ) || []
  );
}
describe("rich text AST", () => {
  it("parses nested strong/emphasis/strike and formulas into source-ranged nodes", () => {
    const source = "正文 **结论 *更强 $x_1$*** 与 ~~旧值~~、__粗体__",
      document = parseRichText(source),
      rs = richRuns(document);
    expect(document.hasMath).toBe(true);
    expect(rs.find((r) => r.text === "结论 ")?.bold).toBe(true);
    expect(rs.find((r) => r.text === "更强 ")).toMatchObject({
      bold: true,
      italic: true,
    });
    expect(rs.find((r) => r.kind === "math")).toMatchObject({
      text: "x_1",
      bold: true,
      italic: true,
    });
    expect(rs.find((r) => r.text === "旧值")?.strike).toBe(true);
    expect(plain(source)).toBe("正文 结论 更强 x_1 与 旧值、粗体");
    function check(nodes: typeof document.children, from: number, to: number) {
      for (const n of nodes) {
        expect(n.from).toBeGreaterThanOrEqual(from);
        expect(n.to).toBeLessThanOrEqual(to);
        if (n.children) check(n.children, n.from, n.to);
      }
    }
    check(document.children, 0, source.length);
  });
  it("protects escapes, underscores inside identifiers, prices and exact-length code fences", () => {
    const source = String.raw`\*\*literal\*\* x_k $10 和 $20，**结论**，\$5 \(x^2\)`;
    expect(plain(source)).toContain("**literal** x_k $10 和 $20，结论，$5 x^2");
    const code = runs("``literal ` **bold** $x$`` 和 `\\frac{a}{b}`");
    expect(code[0]).toMatchObject({
      mono: true,
      kind: "text",
      text: "literal ` **bold** $x$",
    });
    expect(code.some((r) => r.kind === "math")).toBe(false);
    expect(runs("snake_case_and_more").some((r) => r.italic)).toBe(false);
    expect(runs("𝑥_𝑦_𝑧").some((r) => r.italic)).toBe(false);
    expect(runs("`a\\` tail")[0]).toMatchObject({ mono: true, text: "a\\" });
  });
  it("recovers unfinished markers literally while recognizing subsequent complete markup", () => {
    for (const text of [
      "**unfinished",
      "*unfinished",
      "~~unfinished",
      "`unfinished",
      "$unfinished",
      "\\(unfinished",
    ])
      expect(plain(text)).toBe(text);
    expect(plain("$20 **重点**")).toBe("$20 重点");
    expect(parseRichText("说明 $\\fra").pendingMath[0]).toMatchObject({
      closed: false,
      contentFrom: 4,
    });
    expect(plain("**outer *inner** tail*")).toBe("outer *inner tail*");
  });
  it("handles inline/display math, line breaks and delimiter escapes without interpreting math as markdown", () => {
    const source = String.raw`A $a*b+c$ B \(\frac{1}{n}\) C $$\sum_i x_i$$ D \[x^2\]`;
    expect(
      runs(source)
        .filter((r) => r.kind === "math")
        .map((r) => [r.text, !!r.node.display]),
    ).toEqual([
      ["a*b+c", false],
      [String.raw`\frac{1}{n}`, false],
      [String.raw`\sum_i x_i`, true],
      ["x^2", true],
    ]);
    expect(
      runs("$$\n\\sum_i x_i\n$$").filter((r) => r.kind === "math"),
    ).toHaveLength(1);
    expect(
      runs("价格 $5 和公式 $x$")
        .filter((r) => r.kind === "math")
        .map((r) => r.text),
    ).toEqual(["x"]);
    expect(plain("a\r\nb\nc")).toBe("a\nb\nc");
    expect(parseRichText(String.raw`\$notMath\$`).hasMath).toBe(false);
  });
  it("bounds nesting, token count and cache size without rescanning unmatched suffixes", () => {
    expect(() => parseRichText("*".repeat(100_000))).toThrow(/标记过多/);
    expect(() => parseRichText("a".repeat(200_001))).toThrow(/200000/);
    const mixed = Array.from(
      { length: 1000 },
      (_, i) => `\\( open${i} **x** `,
    ).join("");
    expect(plain(mixed)).toContain("open999 x");
  });
});
describe("rich preview and DSL integration", () => {
  it("renders safe markup and baseline-aware local formulas; never executes user HTML", () => {
    const html = richHtml(
      parseRichText(
        "**bold** *em* ~~old~~ `**literal**` $x^2$ <img src=x onerror=alert(1)>",
      ),
    );
    expect(html).toContain("font-weight:650");
    expect(html).toContain("font-style:italic");
    expect(html).toContain("line-through");
    expect(html).toContain("data-inline-math");
    expect(html).toContain("vertical-align:");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x");
    const f = mathAsset(String.raw`\frac{a}{b}`, "#123456")!;
    expect(f.widthEm).toBeGreaterThan(0);
    expect(f.heightEm).toBeGreaterThan(0);
    expect(f.depthEm).toBeGreaterThan(0);
  });
  it("shares ASTs with preview scenes, preserves source navigation/serialization, and keeps Code literal", () => {
    const source = String.raw`Deck("Rich") Slide(title:"**结果**"){VStack{Text(#"**误差**为 $\frac{1}{n}$，*收敛*"#).appear(.rise,step:1) Code("**literal** $x$")}}`,
      d = parseDeck(source),
      es = scene(d, d.slides[0], 0),
      text = es.find((e) => e.text?.startsWith("**误差"))!,
      code = es.find((e) => e.text === "**literal** $x$")!;
    expect(text.rich?.hasMath).toBe(true);
    expect(code.rich).toBeUndefined();
    expect(new SourceMap(source).get(text.source!)?.name).toBe("Text");
    expect(parseDeck(serialize(d))).toEqual(d);
    const html = renderToStaticMarkup(
      createElement(SlideView, {
        deck: d,
        slide: d.slides[0],
        index: 0,
        assets: {},
      }),
    );
    expect(html).toContain('data-inline-math="true"');
    expect(html).toContain("**literal** $x$");
  });
  it("validates closed inline formulas in text, lists, headers and table cells but not code or notes", () => {
    for (const block of [
      'Text(#"bad $\\fracc{1}{2}$"#)',
      'Bullets([#"$\\badcommand$"#])',
      'Table([["A"],[#"$\\badcommand$"#]])',
    ])
      expect(() => parseDeck(`Deck("D") Slide(title:"A"){${block}}`)).toThrow(
        /LaTeX/,
      );
    expect(() =>
      parseDeck(String.raw`Deck("D") Slide(title:#"$\badcommand$"#){}`),
    ).toThrow(/LaTeX/);
    expect(() =>
      parseDeck(
        String.raw`Deck("D") Slide(title:"A"){Code(#"$\badcommand$"#)}.notes(#"$\badcommand$"#)`,
      ),
    ).not.toThrow();
    expect(() =>
      parseDeck('Deck("D") Slide(title:"A"){Text("**unfinished $x")}'),
    ).not.toThrow();
  });
  it("locates bad inline math on its actual declaration in a multi-page document", () => {
    const source = String.raw`Deck("D")
Slide(title:"one"){Text("fine")}
Slide(title:"two"){Text(#"**错误** $\badcommand$"#)}`;
    try {
      parseDeck(source);
      throw Error("expected error");
    } catch (error) {
      expect((error as { line: number }).line).toBe(3);
      expect(String(error)).toContain("LaTeX");
      expect(String(error)).not.toContain("第 1 页");
      expect(String(error)).toContain("文本第");
    }
  });
  it("offers LaTeX only inside math AST ranges, including escaped DSL strings and unfinished formulas", () => {
    for (const text of [
      String.raw`Text(#"**误差** $\fra¦$"#)`,
      String.raw`Text("误差 $\\fra¦$")`,
      String.raw`Bullets([#"误差 \(\fra¦\)"#])`,
      String.raw`Panel(title:#"$\fra¦$"#){Text("x")}`,
      String.raw`Text(#"误差 $\fra¦"#)`,
    ])
      expect(completions('Deck("D") Slide(title:"A"){' + text + "}")).toContain(
        "\\frac",
      );
    for (const text of [
      String.raw`Text(#"普通 \fra¦"#)`,
      String.raw`Text(#"\$\fra¦\$"#)`,
      String.raw`Text(#"` + "`$\\fra¦$`" + `"#)`,
      String.raw`Code(#"$\fra¦$"#)`,
    ])
      expect(
        completions('Deck("D") Slide(title:"A"){' + text + "}"),
      ).not.toContain("\\frac");
  });
});
