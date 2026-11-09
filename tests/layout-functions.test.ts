import { describe, it, expect } from "vitest";
import {
  parseDeck,
  serialize,
  layouts,
  type Block,
  type Project,
} from "../src/dsl";
import { scene } from "../src/scene";
import { formatSource } from "../src/studio/format-source";
import { compileDocument } from "../src/studio/compile-document";
import { SourceMap } from "../src/studio/source-map";
import {
  copyComponent,
  pasteComponent,
} from "../src/studio/component-clipboard";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { completeDsl } from "../src/editor-language";
import { EditorAnalysis } from "../src/editor-analysis";
import {
  exportProjectArchive,
  importProjectArchive,
} from "../src/project-archive";
const definition = `func PanelLayout(title, gap = 16) {
 let doubled = gap * 2
 Panel(radius: 16) {
  VStack(spacing: gap) {
   Heading(title,level:2)
   Content()
  }.padding(doubled / 4)
 }
}
func Pair(spacing=24) { Columns(weights:[2,1],spacing:spacing) { Slot(0) Slot(1) } }
`;
const source =
  definition +
  `Deck("Functions") Theme(preset:.aurora)
let data=range(0,3).map(k=>[k,k^2])
Slide(title:"A") {
 PanelLayout(title:"方法",gap:12) {
  Pair {
   Numbered(["one","two"])
   Progress(mean([0.6,0.8]),label:"进度")
  }
 }
}
Slide(title:"B"){PanelLayout("结果") { Table(columns:[Column("k"),Column("k²")],rows:data) }}
`;
const flatten = (blocks: Block[]): Block[] =>
  blocks.flatMap((b) => [b, ...flatten(b.children || [])]);
function labels(marked: string) {
  const pos = marked.indexOf("¦"),
    state = EditorState.create({ doc: marked.replace("¦", "") });
  return (
    completeDsl(new CompletionContext(state, pos, true), [])?.options.map(
      (o) => o.label,
    ) || []
  );
}
describe("layout functions", () => {
  it("expands parameters, defaults, local computation, nested functions and content slots", () => {
    const deck = parseDeck(source),
      blocks = flatten(deck.slides[0].blocks);
    expect(deck.functions).toHaveLength(2);
    expect(blocks.find((b) => b.type === "heading")?.text).toBe("方法");
    expect(blocks.find((b) => b.type === "progress")?.progress).toBeCloseTo(
      0.7,
    );
    expect(blocks.find((b) => b.type === "columns")?.weights).toEqual([2, 1]);
    expect(
      flatten(deck.slides[1].blocks).find((b) => b.type === "heading")?.text,
    ).toBe("结果");
    expect(
      flatten(deck.slides[1].blocks).find((b) => b.type === "vstack")?.gap,
    ).toBe(16);
    expect(parseDeck(serialize(deck))).toEqual(deck);
  });
  it("recompiles affected pages when function definitions change", () => {
    const before = parseDeck(source),
      after = compileDocument(
        source.replace(
          "Heading(title,level:2)",
          'Heading(title + "更新",level:2)',
        ),
        before,
      );
    expect(after).not.toBeNull();
    expect(
      flatten(after!.slides[0].blocks).find((b) => b.type === "heading")?.text,
    ).toBe("方法更新");
    expect(
      flatten(after!.slides[1].blocks).find((b) => b.type === "heading")?.text,
    ).toBe("结果更新");
  });
  it("preserves scope: supplied children use caller variables and function locals do not leak", () => {
    const deck = parseDeck(
      'func Label(title="default"){let value=99 VStack{Text(title) Content()}} Deck("D") let value=7 Slide(title:"S"){Label { Text(fixed(value,0)) }}',
    );
    expect(
      flatten(deck.slides[0].blocks)
        .filter((b) => b.type === "text")
        .map((b) => b.text),
    ).toEqual(["default", "7"]);
    expect(() =>
      parseDeck(
        'func Label(){let hidden=3 Text(fixed(hidden))} Deck("D") Slide(title:"A"){Label() Text(fixed(hidden))}',
      ),
    ).toThrow(/未定义/);
    expect(
      parseDeck(
        'func Title(spacing){Text(spacing)} Deck("D") Slide(title:"A"){Title("text")}',
      ).slides[0].blocks[0].children?.[0].text,
    ).toBe("text");
  });
  it("rejects recursive expansion, invalid calls, missing, duplicated or unused slots", () => {
    const invalid = [
      ['func A(){A()} Deck("D") Slide(title:"A"){A()}', /递归/],
      ['func A(){B()} func B(){A()} Deck("D") Slide(title:"A"){A()}', /递归/],
      [
        'func A(title){Text(title)} Deck("D") Slide(title:"A"){A()}',
        /缺少参数 title/,
      ],
      [
        'func A(x){Text(x)} Deck("D") Slide(title:"A"){A("a",x:"b")}',
        /重复传入/,
      ],
      [
        'func A(x="x"){Text(x)} Deck("D") Slide(title:"A"){A(other:3)}',
        /未知参数/,
      ],
      [
        'func A(){VStack{Slot(1)}} Deck("D") Slide(title:"A"){A {Text("x")}}',
        /第 2 个内容/,
      ],
      [
        'func A(){VStack{Slot(0) Slot(0)}} Deck("D") Slide(title:"A"){A {Text("x")}}',
        /不可重复/,
      ],
      [
        'func A(){Text("x")} Deck("D") Slide(title:"A"){A {Text("unused")}}',
        /未使用/,
      ],
      ['Deck("D") Slide(title:"A"){Content()}', /只能用于布局函数/],
      ['func Text() {Caption("x")} Deck("D") Slide(title:"A"){}', /覆盖内置/],
    ] as const;
    for (const [text, error] of invalid)
      expect(() => parseDeck(text)).toThrow(error);
  });
  it("allows Content() to consume remaining slots and keeps errors linked to definitions", () => {
    const deck = parseDeck(
      'func A(){VStack{Slot(1) Content()}} Deck("D") Slide(title:"A"){A {Text("first") Text("second")}}',
    );
    expect(
      flatten(deck.slides[0].blocks)
        .filter((b) => b.type === "text")
        .map((b) => b.text),
    ).toEqual(["second", "first"]);
    try {
      parseDeck(
        'func Wrong(){Heading(12)}\nDeck("D")\nSlide(title:"A"){Wrong()}',
      );
      throw Error("expected failure");
    } catch (error) {
      expect(String(error)).toContain("文本");
      expect((error as { hint: string }).hint).toContain("第 1 行");
    }
  });
  it("keeps formatted definitions and invocations, and maps generated elements to their call", () => {
    const formatted = formatSource(source),
      deck = parseDeck(formatted),
      map = new SourceMap(formatted);
    expect(formatted).toContain("func PanelLayout");
    expect(formatted).toContain("Content()");
    expect(parseDeck(formatSource(formatted))).toEqual(deck);
    const es = scene(deck, deck.slides[0], 0);
    for (const element of es) expect(map.get(element.source!)).toBeDefined();
    const heading = es.find((e) => e.text === "方法")!,
      record = map.get(heading.source!)!;
    expect(record.generated).toBe(true);
    expect(formatted.slice(record.from, record.to)).toContain(
      'PanelLayout(title: "方法"',
    );
    expect(map.at(formatted.indexOf('title: "方法"'), 0)?.name).toBe(
      "PanelLayout",
    );
  });
  it("copies custom layouts across projects as resolved portable content and keeps ZIP definitions", async () => {
    const p: Project = { format: "easy-slide", version: 1, source, assets: {} },
      d = parseDeck(source),
      map = new SourceMap(source),
      clip = copyComponent(p, d, map, { scope: "block", page: 0, path: [0] });
    const dest: Project = {
        ...p,
        source: 'Deck("Other") Slide(title:"A"){Flow{Text("Existing")}}',
      },
      dd = parseDeck(dest.source);
    const pasted = pasteComponent(
      dest,
      dd,
      new SourceMap(dest.source),
      { scope: "slide", page: 0 },
      clip,
      "test",
    );
    expect(pasted.materialized).toBe(true);
    expect(
      flatten(parseDeck(pasted.project.source).slides[0].blocks).some(
        (b) => b.text === "方法",
      ),
    ).toBe(true);
    const zip = await exportProjectArchive(p);
    expect(await importProjectArchive(await zip.arrayBuffer())).toEqual(p);
  });
  it("keeps same-project calls and carries images when generated assets collide", () => {
    const p: Project = {
      format: "easy-slide",
      version: 1,
      source:
        'func Figure(){Panel{Image("assets/figure.png")}} Deck("D") Slide(title:"A"){VStack{Figure()}}',
      assets: { "assets/figure.png": "data:image/png;base64,AA==" },
    };
    const d = parseDeck(p.source),
      map = new SourceMap(p.source),
      target = { scope: "block" as const, page: 0, path: [0, 0] },
      clip = copyComponent(p, d, map, target),
      pasted = pasteComponent(p, d, map, target, clip, "same", true);
    expect(pasted.materialized).toBe(false);
    expect(pasted.project.source.match(/Figure\(\)/g)).toHaveLength(3);
    const dest = {
        ...p,
        assets: { "assets/figure.png": "data:image/png;base64,AQ==" },
      },
      changed = pasteComponent(dest, d, map, target, clip, "collision", true),
      blocks = flatten(parseDeck(changed.project.source).slides[0].blocks),
      image = blocks.filter((b) => b.type === "image").at(-1)!;
    expect(changed.materialized).toBe(true);
    expect(image.src).not.toBe("assets/figure.png");
    expect(changed.project.assets[image.src!]).toBe(
      p.assets["assets/figure.png"],
    );
  });
  it("offers function names, named arguments, defaults, scoped parameters and legal modifiers", () => {
    expect(labels(definition + 'Deck("D") Slide(title:"A"){ Pa¦ }')).toContain(
      "PanelLayout",
    );
    expect(
      labels(definition + 'Deck("D") Slide(title:"A"){ PanelLayout(¦) }'),
    ).toContain("title:");
    expect(
      labels(
        'func Card(title,gap=16){VStack(spacing: ga¦){Content()}} Deck("D") Slide(title:"A"){}',
      ),
    ).toContain("gap");
    expect(
      labels('func Card(title){Text(ti¦)} Deck("D") Slide(title:"A"){}'),
    ).toContain("title");
    expect(
      labels(definition + 'Deck("D") Slide(title:"A"){ PanelLayout("A").¦ }'),
    ).toContain("appear");
    expect(labels('Deck("D") Slide(title:"A"){ ¦ }')).not.toContain("Slot");
    expect(labels("func Card(width=20,height=wi¦)")).toContain("width");
    expect(labels("func Card(width=20,height=¦)")).not.toContain("height");
    expect(labels("func Card(width=20,height=¦")).toBeDefined();

    const model = new EditorAnalysis(
      definition +
        'Deck("D") Slide(title:"A"){PanelLayout(title:"A",gap:12){Text("body")}}',
    );
    expect(
      model.ast.root.children.filter((n) => n.kind === "declaration"),
    ).toHaveLength(2);
  });
});
describe("basic layout and element geometry", () => {
  it("renders all basic elements, fixed dimensions and weighted axes within the canvas", () => {
    const source =
      'Deck("D") Theme(preset:.paper) Slide(title:"Basics"){Columns(weights:[1,3],spacing:20){Panel{VStack(spacing:10){Heading("H",level:3) Caption("C") Divider() Badge("B") Progress(0.5,label:"P")}} Rows(weights:[1,2],spacing:12){Rectangle(fill:"#123456",radius:8) Circle(fill:"#654321")}}}';
    const d = parseDeck(source),
      es = scene(d, d.slides[0], 0);
    expect(parseDeck(serialize(d))).toEqual(d);
    expect(es.some((e) => e.shape === "ellipse")).toBe(true);
    expect(es.find((e) => e.text === "50%")).toBeDefined();
    expect(es.find((e) => e.text === "H")?.bold).toBe(true);
    for (const e of es) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.x + e.w).toBeLessThanOrEqual(1280);
      expect(e.y + e.h).toBeLessThanOrEqual(720);
    }
    expect(() =>
      parseDeck(
        'Deck("D") Slide(title:"A"){Columns(weights:[1]){Text("a") Text("b")}}',
      ),
    ).toThrow(/weights/);
    expect(() =>
      parseDeck('Deck("D") Slide(title:"A"){Progress(1.2)}'),
    ).toThrow(/0–1/);
  });
  it("uses exact column/row weights and draws panel backgrounds outside padding", () => {
    const d = parseDeck(
      'Deck("D") Theme(preset:.paper) Slide(title:"S"){Columns(weights:[1,3],spacing:20){Rectangle(fill:"#112233") Rectangle(fill:"#445566")}}',
    );
    const es = scene(d, d.slides[0], 0),
      a = es.find((e) => e.fill === "#112233")!,
      b = es.find((e) => e.fill === "#445566")!;
    expect(b.w / a.w).toBeCloseTo(3);
    expect(b.x - a.x - a.w).toBeCloseTo(20);
    const rows = parseDeck(
        'Deck("D") Slide(title:"S"){Rows(weights:[1,2],spacing:10){Rectangle(fill:"#112233") Rectangle(fill:"#445566")}}',
      ),
      rs = scene(rows, rows.slides[0], 0);
    expect(
      rs.find((e) => e.fill === "#445566")!.h /
        rs.find((e) => e.fill === "#112233")!.h,
    ).toBeCloseTo(2);
    const padded = parseDeck(
        'Deck("D") Slide(title:"S"){Panel(fill:"#112233"){Text("inside")}.padding(30)}',
      ),
      pe = scene(padded, padded.slides[0], 0),
      panel = pe.find((e) => e.fill === "#112233")!,
      text = pe.find((e) => e.text === "inside")!;
    expect(text.x - panel.x).toBe(30);
    expect(text.y - panel.y).toBe(30);
    expect(panel.w - text.w).toBe(60);
  });
  it("supports all preset layouts and custom Cover behavior without changing explicit content styles", () => {
    for (const preset of layouts) {
      const d = parseDeck(
        `Deck("D") Slide(.${preset},title:"A"){Text("B") Text("C")}`,
      );
      scene(d, d.slides[0], 0).forEach((e) =>
        expect(Number.isFinite(e.x + e.y + e.w + e.h)).toBe(true),
      );
    }
    const d = parseDeck(
      'func Intro(){Cover{Text("body")}} Deck("D") Slide(title:"A"){Intro()}',
    );
    expect(scene(d, d.slides[0], 0).find((e) => e.text === "A")?.size).toBe(68);
  });
});
