import { describe, it, expect } from "vitest";
import { parseDeck, serialize, pageContent, withLayout } from "../src/dsl";
import { scene } from "../src/scene";
import { DslError } from "../src/diagnostics";
import { tableModel } from "../src/table";
const source = `Deck("计算表格")
let rate = 0.2
let loss = x => x^2 / 2
let samples = range(0, 6).map(k => row(k, (1-rate)^k, loss((1-rate)^k)))
Slide(title: "迭代数据") {
 Glass {
  Table(columns: [Column("k", width: 1, align: .center), Column("x", width: 2, align: .right, format: "0.000"), Column("loss", width: 2, align: .right, format: "0.0000")], rows: samples)
   .tableStyle(rowHeight: 42, zebra: true, borders: .all, headerFill: "#23796e")
 }
}`;
const value = (expression: string) =>
  parseDeck(
    `let result = ${expression}\nDeck("A")\nSlide(title:"B"){Table(rows:[[result]],header:false)}`,
  ).slides[0].blocks[0].rows![0][0];
describe("bounded expression language", () => {
  it("respects precedence, right associative powers, booleans and lazy branches", () => {
    expect(value("2 + 3 * 4")).toBe(14);
    expect(value("2^3^2")).toBe(512);
    expect(value("-2^2")).toBe(-4);
    expect(value("2^-2")).toBe(0.25);
    expect(value("true ? 7 : 1 / 0")).toBe(7);
    expect(value("false && (1/0 > 0)")).toBe(false);
    expect(value('2 < 3 && 4 >= 4 ? "yes" : "no"')).toBe("yes");
    expect(value('"第 " + 3 + " 次"')).toBe("第 3 次");
  });
  it("supports arrays, methods, scoped lambdas and numerical functions", () => {
    expect(
      value(
        "range(0, 6).filter(x => x % 2 == 0).map(x => x^2).reduce((acc, x) => acc+x, 0)",
      ),
    ).toBe(20);
    expect(value("range(5, 0, -1)[2]")).toBe(3);
    expect(value("mean([2,4,6])")).toBe(4);
    expect(value("round(sqrt(2), 3)")).toBe(1.414);
    expect(value("fixed(1/3, 3)")).toBe("0.333");
    expect(value("percent(0.125, 1)")).toBe("12.5%");
    expect(value('format(0.25,"0.0%")')).toBe("25.0%");
    expect(value("zip([1,2],[3,4])[1][0]")).toBe(2);
    expect(value("transpose([[1,2],[3,4]])[0][1]")).toBe(3);
    expect(value("(concat([1,2], [3])).length")).toBe(3);
    expect(value("sin(0)")).toBe(0);
  });
  it("reports exact runtime positions and rejects undefined names, invalid arithmetic and resource exhaustion", () => {
    const bad = 'Deck("A")\nlet x = 1 / 0\nSlide(title:"B"){Text("A")}';
    try {
      parseDeck(bad);
      throw Error("expected failure");
    } catch (e) {
      expect(e).toBeInstanceOf(DslError);
      const d = e as DslError;
      expect(d.line).toBe(2);
      expect(bad.slice(d.from, d.to)).toBe("/");
    }
    for (const e of [
      "missing + 1",
      "[1][3]",
      "range(0,10,0)",
      "sqrt(-1)",
      "range(0,3000)",
      "range(0,2000).map(i => range(0,2000).map(j => i+j))",
      "range(0,2000).map(i => repeat(0,2000))",
      'fetch("https://example.com")',
      "window.location",
      "[1].constructor",
      'Column("x").constructor',
    ])
      expect(() => value(e)).toThrow(DslError);
    expect(() =>
      parseDeck(
        'let f = x => f(x)\nDeck("A")\nSlide(title:"B"){Text(str(f(1)))}',
      ),
    ).toThrow(/60/);
  });
  it("gives nested scopes independent constants and prevents redeclaration", () => {
    const d = parseDeck(
      'let n=2\nDeck("A")\nSlide(title:"B"){let n=3\nVStack {let n=4\nText(str(n))} Text(str(n))}',
    );
    expect(d.slides[0].blocks[0].children?.[0].text).toBe("4");
    expect(d.slides[0].blocks[1].text).toBe("3");
    expect(parseDeck(serialize(d))).toEqual(d);
    expect(() =>
      parseDeck('let n=1\nlet n=2\nDeck("A")\nSlide(title:"B"){}'),
    ).toThrow(/已在此作用域/);
  });
});
describe("computed styled tables", () => {
  it("computes data and formats headers, widths and cells", () => {
    const d = parseDeck(source),
      table = d.slides[0].blocks[0].children![0];
    expect(table.rows).toHaveLength(6);
    expect(table.rows![2][1]).toBeCloseTo(0.64);
    expect(table.rows![2][2]).toBeCloseTo(0.2048);
    const model = tableModel(table.rows!, table.table);
    expect(model.rows[0].cells).toEqual(["k", "x", "loss"]);
    expect(model.rows[3].cells).toEqual(["2", "0.640", "0.2048"]);
    expect(model.widths).toEqual([0.2, 0.4, 0.4]);
    const es = scene(d, d.slides[0], 0);
    expect(es.find((e) => e.text === "0.640")?.align).toBe("right");
  });
  it("preserves computed expressions and bindings through visual normalization and layout changes", () => {
    const d = parseDeck(source),
      text = serialize({ ...d, title: "改名" });
    expect(text).toContain("let samples = range");
    expect(text).toContain("rows: samples");
    expect(text).toContain('Column("k"');
    expect(parseDeck(text).slides).toEqual(d.slides);
    const s = withLayout(d.slides[0], "split");
    const again = parseDeck(serialize({ ...d, slides: [s] }));
    expect(pageContent(again.slides[0])[0].children?.[0].rows).toEqual(
      d.slides[0].blocks[0].children?.[0].rows,
    );
  });
  it("supports direct numeric cells and legacy first-row headers", () => {
    const d = parseDeck(
      'Deck("A")\nSlide(title:"B"){Table([["k","value"],[0,1.2],[1,null],[2,true]])}',
    );
    expect(tableModel(d.slides[0].blocks[0].rows!).rows[2].cells).toEqual([
      "1",
      "—",
    ]);
    expect(parseDeck(serialize(d))).toEqual(d);
  });
  it("validates column specs, formats and table size", () => {
    for (const table of [
      'Table(columns:[Column("x",width:0)],rows:[])',
      'Table(columns:[Column("x",width:1e308),Column("y",width:1e308)],rows:[])',
      'Table(columns:[Column("x",format:"bad")],rows:[])',
      "Table(rows:range(0,101).map(k=>[k]))",
      'Table(rows:[[Column("x")]])',
      "Table(rows:[[1]],rowHeight:3)",
      "Table(rows:[[1]],zebra:1)",
    ])
      expect(() =>
        parseDeck(`Deck("A")\nSlide(title:"B"){${table}}`),
      ).toThrow();
  });
});
it("completes computation functions, visible constants, columns and array methods", async () => {
  const { EditorState } = await import("@codemirror/state"),
    { CompletionContext } = await import("@codemirror/autocomplete"),
    { completeDsl } = await import("../src/editor-language");
  const labels = (doc: string) =>
    completeDsl(
      new CompletionContext(EditorState.create({ doc }), doc.length, true),
    )?.options.map((o) => o.label) || [];
  expect(labels("let rate=0.2\nTable(rows: ra")).toContain("rate");
  expect(labels("Table(rows: range(0,6).")).toContain("map");
  expect(labels('Column("x", align: .')).toContain("right");
  expect(labels("Table(rows:[],borders:.")).toContain("horizontal");
  expect(labels("Table(rows:[], ro")).toContain("rowHeight:");
});
