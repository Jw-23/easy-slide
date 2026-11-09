import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  CompletionContext,
  closeBrackets,
  insertBracket,
} from "@codemirror/autocomplete";
import { tokenize } from "../src/tokens";
import { parseDeck, serialize } from "../src/dsl";
import { parseEditorAst } from "../src/editor-ast";
import { completeDsl, slideLanguage } from "../src/editor-language";
import { stringContent } from "../src/string-content";
import { formatSource } from "../src/studio/format-source";
import { SourceMap } from "../src/studio/source-map";
import { scene } from "../src/scene";
import {
  exportProjectArchive,
  importProjectArchive,
} from "../src/project-archive";
function completion(marked: string) {
  const pos = marked.indexOf("¦"),
    state = EditorState.create({ doc: marked.replace("¦", "") });
  return completeDsl(new CompletionContext(state, pos, true), []);
}
const source =
  'Deck("D")\nSlide(title:"原始字符串"){\n Text(`**误差**为 $\\frac{1}{n}$，\\(x_k\\)`)\n Equation(`\\nabla f(x)`)\n}';
describe("backtick raw DSL strings", () => {
  it("retains backslashes, quotes, comment markers, braces and interpolation-like text literally", () => {
    const value = '\\frac{1}{n} \\nabla "quoted" // {text} ${value} \\n',
      source = "`" + value + "`",
      token = tokenize(source)[0];
    expect(token).toMatchObject({
      kind: "string",
      value,
      raw: true,
      closed: true,
      contentFrom: 1,
      contentTo: source.length - 1,
    });
    expect(tokenize("``")[0].value).toBe("");
    expect(stringContent(source, token).value).toBe(value);
    expect(
      parseDeck('Deck("D") Slide(title:"S"){Code(' + source + ")}").slides[0]
        .blocks[0].text,
    ).toBe(value);
  });
  it("supports multiline single and triple backticks and preserves embedded inline code", () => {
    const value = "first\n  `code` and $\\frac{a}{b}$\nlast",
      source = "```" + value + "```";
    expect(tokenize(source)[0]).toMatchObject({
      value,
      raw: true,
      closed: true,
      contentFrom: 3,
      contentTo: source.length - 3,
    });
    expect(tokenize("`first\nsecond`", { tolerant: true })).toEqual(
      tokenize("`first\nsecond`"),
    );
    const d = parseDeck('Deck("D") Slide(title:"S"){Text(' + source + ")}");
    expect(
      scene(d, d.slides[0], 0).find((e) => e.text === value)?.rich?.hasMath,
    ).toBe(true);
    expect(
      tokenize('```\\frac{a}{b}\n\\sum_i x_i```\nText("next")')[1],
    ).toMatchObject({ kind: "id", line: 3, value: "Text" });
  });
  it("keeps AST completion ranges raw in complete, named and unfinished formulas", () => {
    for (const text of [
      "Equation(`\\fra¦`)",
      "Equation(text: `\\fra¦)",
      "Text(`**误差** $\\fra¦$`)",
      "Equation(```\\frac{a}{b}\n\\su¦```)",
    ]) {
      const result = completion('Deck("D") Slide(title:"S"){' + text + "}");
      expect(
        result?.options.some(
          (o) => o.label === "\\frac" || o.label === "\\sum",
        ),
      ).toBe(true);
      const doc = 'Deck("D") Slide(title:"S"){' + text,
        cursor = doc.indexOf("¦");
      expect(result?.from).toBe(doc.lastIndexOf("\\", cursor));
    }
    expect(completion("Text(`普通 \\fra¦`)")).toBeNull();
    expect(completion('Text("`$\\\\fra¦$`")')).toBeNull();
    const unfinished = tokenize(
      'Equation(`\\fr\nSlide(title:"later"){Text("safe")}',
      { tolerant: true },
    );
    expect(unfinished.find((t) => t.kind === "string")).toMatchObject({
      raw: true,
      closed: false,
      value: "\\fr",
    });
    expect(
      unfinished.find((t) => t.kind === "id" && t.value === "Slide"),
    ).toBeDefined();
    expect(
      parseEditorAst("Equation(`\\fr").tokens.find((t) => t.kind === "string")
        ?.raw,
    ).toBe(true);
  });
  it("pairs backticks through editor language data without requiring a browser", () => {
    const state = EditorState.create({
        doc: "Equation(",
        extensions: [slideLanguage, closeBrackets()],
        selection: { anchor: 9 },
      }),
      tr = insertBracket(state, "`");
    expect(tr?.state.doc.toString()).toBe("Equation(``");
    expect(tr?.state.selection.main.head).toBe(10);
    const second = insertBracket(tr!.state, "`")!,
      third = insertBracket(second.state, "`")!;
    expect(third.state.doc.toString()).toBe("Equation(``````");
    expect(third.state.selection.main.head).toBe(12);
  });
  it("formats and locates backtick strings without touching their contents", () => {
    const formatted = formatSource(source),
      d = parseDeck(formatted),
      map = new SourceMap(formatted),
      text = scene(d, d.slides[0], 0).find((e) =>
        e.text?.startsWith("**误差**"),
      )!;
    expect(formatted).toContain("`**误差**为 $\\frac{1}{n}$，\\(x_k\\)`");
    expect(parseDeck(formatted)).toEqual(parseDeck(source));
    expect(formatSource(formatted)).toBe(formatted);
    expect(map.get(text.source!)?.name).toBe("Text");
    const multiline =
        'Deck("D") Slide(title:"S"){Text(```first\n  `code` and $\\frac{a}{b}$\nlast```)}',
      formattedMulti = formatSource(multiline);
    expect(
      tokenize(formattedMulti).find(
        (t) => t.kind === "string" && t.value.startsWith("first"),
      )?.value,
    ).toBe("first\n  `code` and $\\frac{a}{b}$\nlast");
    expect(parseDeck(formattedMulti)).toEqual(parseDeck(multiline));
  });
  it("serializes formulas and array cells without extra escapes, with a safe fallback for delimiter collisions", () => {
    const d = parseDeck(source),
      serialized = serialize(d);
    expect(serialized).toContain("Equation(`\\nabla f(x)`)");
    expect(parseDeck(serialized)).toEqual(d);
    for (const text of [
      "\\frac{1}{n}",
      "has `code` and \\frac{1}{n}",
      "ends with \\raw`",
      "contains ``` and \\raw",
    ]) {
      const d = parseDeck(
        'Deck("D") Slide(title:"S"){Code(' + JSON.stringify(text) + ")}",
      );
      expect(parseDeck(serialize(d))).toEqual(d);
    }
    const table = parseDeck(
      'Deck("D") Slide(title:"S"){Table([[`$\\alpha$`],[`$\\beta$`]])}',
    );
    expect(serialize(table)).toContain("`$\\alpha$`");
    expect(parseDeck(serialize(table))).toEqual(table);
  });
  it("reports unclosed backticks at their opening and preserves old quote syntax", () => {
    for (const marker of ["`", "```"]) {
      try {
        tokenize("Text(" + marker + "\\frac{a}{b}");
        throw Error("expected failure");
      } catch (error) {
        expect(String(error)).toContain("反引号");
        expect((error as { from: number }).from).toBe(5);
      }
    }
    const expected = parseDeck(
      'Deck("D") Slide(title:"S"){Equation(`\\frac{a}{b}`)}',
    );
    for (const arg of ['#"\\frac{a}{b}"#', '"\\\\frac{a}{b}"'])
      expect(
        parseDeck('Deck("D") Slide(title:"S"){Equation(' + arg + ")}"),
      ).toEqual(expected);
  });
  it("retains raw source through a portable project archive", async () => {
    const p = {
        format: "easy-slide" as const,
        version: 1 as const,
        source,
        assets: {},
      },
      zip = await exportProjectArchive(p);
    expect(await importProjectArchive(await zip.arrayBuffer())).toEqual(p);
  });
});
