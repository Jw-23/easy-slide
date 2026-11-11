import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { parseDeck, serialize, type Project } from "../src/dsl";
import { tokenize } from "../src/tokens";
import { parseEditorAst } from "../src/editor-ast";
import { completeDsl } from "../src/editor-language";
import { equationContext } from "../src/latex";
import { stringContent } from "../src/string-content";
import { bodyProse } from "../src/prose";
import { scene } from "../src/scene";
import { SourceMap } from "../src/studio/source-map";
import { formatSource } from "../src/studio/format-source";
import {
  exportProjectArchive,
  importProjectArchive,
} from "../src/project-archive";

const source = String.raw`Deck("证明")
Slide(title: "示例") {
    Text(indent: 2) {
        设 $x>0$，
        下面证明**非负性**。

        $$\frac{x^2}{2} \ge 0$$

        于是结论成立。
    }.font(22)
    Text("后续组件")
}`;
const first = (s: string) => parseDeck(s).slides[0].blocks[0];
describe("unquoted Text bodies", () => {
  it("supports raw prose, named settings and modifiers, with soft wraps and paragraph breaks", () => {
    expect(first(source)).toMatchObject({
      type: "text",
      indent: 2,
      size: 22,
      text: "设 $x>0$，下面证明**非负性**。\n$$\\frac{x^2}{2} \\ge 0$$\n于是结论成立。",
    });
    expect(parseDeck(source).slides[0].blocks[1].text).toBe("后续组件");
    expect(first('Deck("D") Slide(title:"S"){Text { 一行正文 }}').text).toBe(
      "一行正文",
    );
    expect(first('Deck("D") Slide(title:"S"){text { 小写别名 }}').text).toBe(
      "小写别名",
    );
    expect(first('Deck("D") Slide(title:"S"){Text { }}').text).toBe("");
  });
  it("preserves word spacing for Latin, joins CJK naturally, and preserves intentional extra paragraphs", () => {
    expect(
      bodyProse("\n    中文\n    连续\n\n    Next\n    word\n\n\n    Last\n"),
    ).toBe("中文连续\nNext word\n\nLast");
    expect(bodyProse("hello  \n  world")).toBe("hello world");
    expect(first('Deck("D") Slide(title:"S"){Text("原有\\n换行") }').text).toBe(
      "原有\n换行",
    );
  });
  it("keeps TeX groups, code, quotes, comment markers and DSL-looking content literal", () => {
    const body =
      '引号 "不用转义" // 保留正文 {嵌套}，`}` 与 `Text("literal")`\n\n$$\\begin{aligned}\nx&=1\\\\\ny&=2\n\\end{aligned}$$\n\n单个 \\} 和 \\{';
    const dsl = 'Deck("D") Slide(title:"S"){Text {' + body + '} Text("next")}';
    const block = first(dsl);
    expect(block.text).toContain('引号 "不用转义" // 保留正文 {嵌套}');
    expect(block.text).toContain('`}` 与 `Text("literal")`');
    expect(block.text).toContain(
      "$$\\begin{aligned}\nx&=1\\\\\ny&=2\n\\end{aligned}$$",
    );
    expect(parseDeck(dsl).slides[0].blocks).toHaveLength(2);
  });
  it("does not reinterpret comments, strings or custom function bodies as raw Text", () => {
    expect(() =>
      parseDeck(
        'func text(){Text("inner")} Deck("D") Slide(title:"S"){text()}',
      ),
    ).not.toThrow();
    expect(
      tokenize('// Text { ignored\nText("{quoted}")', { comments: true }).some(
        (t) => t.prose,
      ),
    ).toBe(false);
  });
  it("gives a precise missing-brace diagnostic and recovers an unfinished body for the editor", () => {
    const unfinished = 'Deck("D") Slide(title:"S"){Text { 正文 $\\fra';
    expect(() => parseDeck(unfinished)).toThrow(/Text 正文缺少结束/);
    expect(
      tokenize(unfinished, { tolerant: true }).find((t) => t.prose),
    ).toMatchObject({ closed: false, raw: true });
    expect(() => parseEditorAst(unfinished)).not.toThrow();
    expect(() =>
      first('Deck("D") Slide(title:"S"){Text("重复"){正文}}'),
    ).toThrow(/不要同时/);
  });
  it("retains literal source ranges and LaTeX completion in both finished and unfinished bodies", () => {
    for (const suffix of ["$ } }", ""]) {
      const s = 'Deck("D") Slide(title:"S"){Text { 正文 $\\fra' + suffix;
      const pos = s.indexOf("\\fra") + 4;
      const token = tokenize(s, { tolerant: true }).find((t) => t.prose)!;
      expect(stringContent(s, token).value).toBe(
        s.slice(token.contentFrom, token.contentTo),
      );
      expect(equationContext(s, pos)?.raw).toBe(true);
      const state = EditorState.create({ doc: s });
      const result = completeDsl(new CompletionContext(state, pos, true), []);
      expect(result?.options.some((o) => o.label === "\\frac")).toBe(true);
      expect(result?.from).toBe(s.indexOf("\\fra"));
    }
    const plain = 'Deck("D") Slide(title:"S"){Text { plain }}';
    expect(
      completeDsl(
        new CompletionContext(
          EditorState.create({ doc: plain }),
          plain.indexOf("plain") + 2,
          true,
        ),
        [],
      ),
    ).toBeNull();
  });
  it("preserves preview content through formatting, serialization, source navigation and archive roundtrips", async () => {
    const deck = parseDeck(source),
      map = new SourceMap(source, deck);
    const record = map.get({ scope: "block", page: 0, path: [0] })!;
    expect(source.slice(record.from, record.to)).toContain("Text(indent: 2) {");
    expect(source.slice(record.revealFrom, record.revealTo)).toContain(
      "于是结论成立。",
    );
    const formatted = formatSource(source),
      next = parseDeck(formatted);
    expect(scene(next, next.slides[0], 0)).toEqual(
      scene(deck, deck.slides[0], 0),
    );
    expect(formatSource(formatted)).toBe(formatted);
    expect(first(serialize(deck)).text).toBe(first(source).text);
    const project: Project = {
      format: "easy-slide",
      version: 1,
      source,
      assets: {},
    };
    const zip = await exportProjectArchive(project);
    expect(await importProjectArchive(await zip.arrayBuffer())).toEqual(
      project,
    );
  });
  it("works inside mathematical environments and custom layouts without executing prose", () => {
    const s =
      'func Note(){Text { let x=99; Text("正文") }} Deck("D") DynamicSlide(title:"S"){Proof{Note() Text{ 设 $x>0$。\n所以 $x^2>0$。 }}}';
    const d = parseDeck(s);
    expect(
      scene(d, d.slides[0], 0).some((e) =>
        e.text?.includes('let x=99; Text("正文")'),
      ),
    ).toBe(true);
  });
});
