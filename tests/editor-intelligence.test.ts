import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { completeDsl, signatureHelp } from "../src/editor-language";
import { analyzeDocument, EditorAnalysis } from "../src/editor-analysis";
import { parseEditorAst } from "../src/editor-ast";
import { typeLabel, signatures } from "../src/editor-schema";
import { calculationNames } from "../src/expressions";
import { tokenize } from "../src/tokens";
import { equationContext } from "../src/latex";
import { serialize } from "../src/dsl";
import { showcaseDeck } from "../src/showcase";

function at(marked: string, assets: string[] = []) {
  const pos = marked.indexOf("¦"),
    doc = marked.replace("¦", ""),
    state = EditorState.create({ doc });
  const result = completeDsl(new CompletionContext(state, pos, true), assets);
  const model = analyzeDocument(state.doc);
  return {
    doc,
    state,
    pos,
    result,
    labels: result?.options.map((o) => o.label) ?? [],
    model,
    ctx: model.callContext(pos),
  };
}
function typeOf(source: string, name: string) {
  const m = new EditorAnalysis(source + "\n ");
  return typeLabel(
    m.symbolType(
      m.visibleSymbols(m.source.length).find((s) => s.name === name)!,
    ),
  );
}
describe("tolerant editor AST", () => {
  it("preserves runtime tokens for valid documents and analyses the complete feature tour", () => {
    const source = serialize(showcaseDeck),
      model = new EditorAnalysis(source);
    expect(
      tokenize(source, { tolerant: true }).map((t) => [
        t.kind,
        t.value,
        t.from,
        t.to,
      ]),
    ).toEqual(tokenize(source).map((t) => [t.kind, t.value, t.from, t.to]));
    expect(
      model.ast.root.children
        .map((n) => model.infer(n))
        .filter((t) => t.kind === "component" && t.name === "Slide"),
    ).toHaveLength(25);
    const multiline = 'Text("first\nsecond")';
    expect(tokenize(multiline, { tolerant: true })).toEqual(
      tokenize(multiline),
    );
  });
  it("shares the runtime lexer while retaining comments and incomplete raw strings", () => {
    const source = '// fake let secret=1\nEquation(#"\\fr';
    const ast = parseEditorAst(source);
    expect(ast.tokens[0].kind).toBe("comment");
    expect(ast.tokens.find((t) => t.kind === "string")).toMatchObject({
      raw: true,
      closed: false,
      contentTo: source.length,
    });
    expect(() => tokenize(source)).toThrow();
    expect(at(source + "¦").labels).toContain("\\frac");
  });
  it("recovers after invalid tokens, missing parentheses and unfinished strings", () => {
    for (const broken of [
      '@\nText("a"\n',
      "let bad = \n",
      'Text("unclosed\n',
    ]) {
      const result = at(
        `Deck("x")\n${broken}Slide(title:"good"){ Text("x").appear(.fade, easing: .¦) }`,
      );
      expect(result.labels).toContain("spring");
      expect(result.ctx?.signature.name).toBe("appear");
    }
  });
  it("retains nested call/argument ranges across comments and long arguments", () => {
    const r = at(
      `Table(rows: range(0, 4).map(k => [k, fixed(pow(k,2), 3)]), /* invalid but recoverable */ ¦)`,
    );
    // Invalid punctuation cannot cause a crash; supported // comments retain precise context.
    expect(r.model.ast.root.children.length).toBeGreaterThan(0);
    const clean = at(
      `Table(rows: [["${"x".repeat(500)}"]], // author note\n he¦)`,
    );
    expect(clean.ctx?.signature.name).toBe("Table");
    expect(clean.labels).toContain("header:");
    expect(clean.labels).not.toContain("rows:");
  });
  it("keeps usable trees for every incomplete prefix of representative code", () => {
    const source =
      'let xs=range(0,3).map((x,i)=>[x,fixed(i)])\nDeck("A").transition(.slide)\nSlide(title:"B"){Table(columns:[Column("v")],rows:xs)}';
    for (let pos = 0; pos <= source.length; pos++)
      expect(() => at(source.slice(0, pos) + "¦")).not.toThrow();
  });
  it("caches analysis by immutable document, including selection-only changes", () => {
    const state = EditorState.create({
      doc: "let xs=range(3)\nTable(rows:[])",
    });
    const next = state.update({ selection: { anchor: 4 } }).state;
    expect(analyzeDocument(state.doc)).toBe(analyzeDocument(next.doc));
    expect(analyzeDocument(state.doc)).not.toBe(
      analyzeDocument(
        state.update({ changes: { from: 0, insert: " " } }).state.doc,
      ),
    );
  });
});
describe("scope-aware static inference", () => {
  it("isolates sibling and nested layout scopes, honors shadowing and ignores future declarations", () => {
    const r = at(
      `let shared=1\nDeck("A")\nSlide(title:"one"){let sibling=2\nText(str(sibling))}\nSlide(title:"two"){let shared="local"\nVStack{let inner=3\nText(str(inner))}\nText(¦) }\nlet future="later"`,
    );
    expect(r.labels).toContain("shared");
    for (const hidden of ["sibling", "inner", "future"])
      expect(r.labels).not.toContain(hidden);
    expect(
      r.result?.options.find((o) => o.label === "shared")?.detail,
    ).toContain("String");
    expect(at("let self = se¦").labels).not.toContain("self");
    expect(
      at('// let fake=1\nlet title="let decoy=1"\nText(¦)').labels,
    ).not.toContain("fake");
  });
  it("understands the legacy Deck body's shared global scope", () => {
    const r = at('Deck("A"){let shared="yes"\nSlide(title:"B"){Text(¦)}}');
    expect(r.labels).toContain("shared");
  });
  it("infers computed arrays, table tuples, filters, reductions and user lambdas without evaluation", () => {
    const source = `let id=x=>x\nlet xs=id(range(0,2000))\nlet rows=xs.map((x,i)=>[x,fixed(i,2)])\nlet selected=rows.filter(r=>r[0]>1)\nlet total=xs.reduce((acc,x)=>acc+x,0)\nlet text=percent(total)\nlet columns=[Column("x")]`;
    expect(typeOf(source, "xs")).toBe("[Number]");
    expect(typeOf(source, "rows")).toBe("[[Number | String]]");
    expect(typeOf(source, "selected")).toBe("[[Number | String]]");
    expect(typeOf(source, "total")).toBe("Number");
    expect(typeOf(source, "text")).toBe("String");
    expect(typeOf(source, "columns")).toBe("[Column]");
    expect(typeOf("let f=x=>f(x)\nlet result=f(1)", "result")).toBe("未知");
    expect(typeOf("let huge=range(0,1e12).map(x=>[x,x*x])", "huge")).toBe(
      "[[Number]]",
    );
  });
  it("infers map item/index and reduce accumulator types inside the callback", () => {
    const r = at('let names=["a","b"]\nlet result=names.map((item,index)=> ¦)');
    expect(r.result?.options.find((o) => o.label === "item")?.detail).toContain(
      "String",
    );
    expect(
      r.result?.options.find((o) => o.label === "index")?.detail,
    ).toContain("Number");
    const reduce = at('let result=[1,2].reduce((acc,item,index)=> ¦, "")');
    expect(
      reduce.result?.options.find((o) => o.label === "acc")?.detail,
    ).toContain("String");
    expect(
      reduce.result?.options.find((o) => o.label === "item")?.detail,
    ).toContain("Number");
    expect(
      at("let result=[1,2].map(item=>item)\nText(¦)").labels,
    ).not.toContain("item");
  });
  it("ranks values and functions by expected type while keeping names available for new expressions", () => {
    const r = at(
      'let rows=[[1,2]]\nlet title="hello"\nlet count=4\nTable(rows: ¦)',
    );
    expect(r.labels).toContain("rows");
    expect(
      r.result!.options.find((o) => o.label === "rows")!.boost,
    ).toBeGreaterThan(
      r.result!.options.find((o) => o.label === "title")!.boost!,
    );
    expect(r.labels).toContain("count");
    const ctx = at('let count=4\nlet name="n"\nText(str(¦))');
    expect(ctx.labels).toContain("count");
    expect(ctx.labels).toContain("name");
    const text = at("Text(¦)").result!.options;
    expect(text.find((o) => o.label === "fixed")!.boost).toBeGreaterThan(
      text.find((o) => o.label === "pow")!.boost!,
    );
  });
});
describe("semantic completions and signatures", () => {
  it("does not suggest expressions while a new binding or lambda parameter name is being defined", () => {
    expect(at("let newNa¦me = range(3)").result).toBeNull();
    expect(at("let ¦").result).toBeNull();
    expect(at("let rows=range(3).map((it¦em,index)=>item)").result).toBeNull();
    expect(at("let rows=ra¦").labels).toContain("range");
  });
  it("restricts modifiers by the receiver, including across modifier chains", () => {
    expect(at('Deck("A").¦').labels).toEqual(["transition"]);
    expect(at('Slide(title:"A").¦').labels.sort()).toEqual([
      "background",
      "foreground",
      "notes",
      "transition",
    ]);
    const text = at('Text("A").font(24).¦').labels;
    expect(text).toContain("appear");
    for (const n of ["notes", "transition", "tableStyle", "stagger"])
      expect(text).not.toContain(n);
    expect(at("Table([[1]]).font(24).¦").labels).toContain("tableStyle");
    expect(at('VStack{Text("A")}.¦').labels).toContain("stagger");
  });
  it("distinguishes array/string/number receivers and respects builtin shadowing", () => {
    expect(at('let xs=true ? [1] : ["a"]\nlet y=xs.¦').labels).toContain("map");
    expect(
      at('Text("A").fo¦nt(24)').result?.options.find((o) => o.label === "font")
        ?.apply,
    ).toBe("font");
    expect(at("let xs=range(3).map(x=>[x])\nlet v=xs[0].¦").labels).toContain(
      "map",
    );
    expect(at("let s=fixed(1)\nlet v=s.¦").labels).toEqual(["length"]);
    expect(at("let n=3\nlet v=n.¦").labels).toEqual([]);
    expect(
      at('let xs=zip(range(2),["a","b"])\nlet v=xs[0][1].¦').labels,
    ).toEqual(["length"]);
    expect(at('let range=x=>"text"\nlet xs=range(3).¦').labels).toEqual([
      "length",
    ]);
  });
  it("tracks the innermost call, excludes arguments used before or after the cursor", () => {
    const r = at(
      'Text("A").appear(.fade, duration: pow(2,3), ¦, easing:.linear)',
    );
    expect(r.labels).toContain("delay:");
    expect(r.labels).not.toContain("duration:");
    expect(r.labels).not.toContain("easing:");
    expect(
      at('Text("A").appear(.fade,duration:pow(2,¦))').ctx?.signature.name,
    ).toBe("pow");
    const key = at('Text("A").appear(.fade,dur¦ation: 100)');
    expect(key.result?.from).toBe(key.doc.indexOf("duration"));
    expect(key.result?.to).toBe(key.doc.indexOf("duration") + 8);
    expect(
      key.result?.options.find((o) => o.label === "duration:")?.apply,
    ).toBe("duration");
  });
  it("offers enums before/after a dot and limits each enum to its argument", () => {
    expect(at('Text("A").appear(.fade,easing: .¦)').labels).toEqual([
      "linear",
      "easeOut",
      "easeInOut",
      "spring",
    ]);
    expect(at('Text("A").appear(.fade,easing: ¦)').labels).toContain(
      ".easeOut",
    );
    expect(at('Column("x",align:.¦)').labels).toEqual([
      "left",
      "center",
      "right",
    ]);
    expect(at("Table(rows:[],borders:.¦)").labels).toEqual([
      "none",
      "horizontal",
      "all",
    ]);
    expect(
      at('Text("A").appear(.fade,duration:pow(.¦,2))').labels,
    ).not.toContain("spring");
  });
  it("offers declarations appropriate to root vs layout bodies", () => {
    const root = at(
      'Deck("A").transition(.fade)\nTheme(accent:"#ffffff")\n¦',
    ).labels;
    expect(root).toContain("Slide");
    for (const n of ["Text", "Deck", "Theme", "Column", "range"])
      expect(root).not.toContain(n);
    const body = at('Deck("A")\nSlide(title:"B"){VStack{¦}}').labels;
    expect(body).toContain("Text");
    expect(body).toContain("Grid");
    expect(body).not.toContain("Deck");
    expect(body).not.toContain("Theme");
  });
  it("suppresses prose/comments and provides contextual assets, formats, colors and LaTeX", () => {
    expect(at('// Text("A").¦').result).toBeNull();
    expect(at('Text("Slide Tit¦le")').result).toBeNull();
    expect(at('Image(src: #"assets/p¦"#)', ["assets/plot.png"]).labels).toEqual(
      ["assets/plot.png"],
    );
    expect(at('Column("x",format:"0.¦")').labels).toContain("0.000");
    expect(at('Text("x").foreground("#¦")').labels).toContain("#23786b");
    expect(at('Equation(title:"\\fr¦")').labels).not.toContain("\\frac");
    const e = at('Equation(text: #"\\fr¦"#)');
    expect(e.labels).toContain("\\frac");
    expect(equationContext(e.doc, e.pos)).not.toBeNull();
  });
  it("provides an active parameter signature and stops it after closing the call", () => {
    const text = 'Text("A").appear(.fade, duration: 600)';
    let state = EditorState.create({ doc: text, extensions: [signatureHelp] });
    state = state.update({
      selection: { anchor: text.indexOf("600") + 1 },
    }).state;
    expect(state.field(signatureHelp)).not.toBeNull();
    state = state.update({ selection: { anchor: text.length } }).state;
    expect(state.field(signatureHelp)).toBeNull();
    expect(calculationNames.every((n) => signatures.has(n))).toBe(true);
  });
});
