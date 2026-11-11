import { describe, it, expect } from "vitest";
import { formatSource, whitespaceSelection } from "../src/studio/format-source";
import { tokenize } from "../src/tokens";
import { parseDeck, serialize } from "../src/dsl";
import { showcaseDeck } from "../src/showcase";
function tokens(source: string) {
  return tokenize(source, { comments: true })
    .filter((t) => t.kind !== "eof")
    .map((t) => [t.kind, t.value]);
}
describe("DSL formatter", () => {
  it("wraps long function arguments, nested columns and modifiers while retaining every token", () => {
    const source =
      'Deck("Report",author:"Mathematics Forum").transition(.slide,duration:650,direction:.left,easing:.easeOut)\nlet rows=range(0,4).map(k=>[k,k^2])\nSlide(title:"Results",subtitle:"Collected measurements"){Table(columns:[Column("Iteration",width:1,align:.center),Column("Value",width:3,format:"0.000")],rows:rows).appear(.rise,step:1,order:0,delay:150,duration:700,easing:.easeOut)}';
    const formatted = formatSource(source, { width: 70 });
    expect(formatted).toMatch(/Table\(\n\s+columns:/);
    expect(formatted).toMatch(/\.appear\(\n\s+\.rise,/);
    expect(tokens(formatted)).toEqual(tokens(source));
    expect(parseDeck(formatted).slides[0].blocks[0].rows).toEqual([
      [0, 0],
      [1, 1],
      [2, 4],
      [3, 9],
    ]);
    expect(formatSource(formatted, { width: 70 })).toBe(formatted);
  });
  it("keeps short calls compact and preserves comments and raw LaTeX with punctuation", () => {
    const source = String.raw`// heading
Deck("A")
Slide(title:")", // title
subtitle:","){
// formula
Equation(#"\frac{a}{b} + \left\{x\right\}"#).font(24) // keep
Text("short")
}`;
    const formatted = formatSource(source);
    expect(formatted).toContain('Text("short")');
    expect(formatted).toContain(String.raw`#"\frac{a}{b} + \left\{x\right\}"#`);
    expect(tokens(formatted)).toEqual(tokens(source));
    expect(formatSource(formatted)).toBe(formatted);
  });
  it("retains raw multiline string indentation, negative numbers, callbacks and trailing comma comments", () => {
    const source =
      'Deck("A")\nlet f=(x,y)=>x-y\nlet xs=[-1,+2,3].map(x=>f(x,-2))\nSlide(title:"B", // trailing\n){Text("""first\n  second\nlast""").appear(.rise,step:1, // stage\nduration:450,)}';
    const formatted = formatSource(source, { width: 55 });
    expect(tokens(formatted)).toEqual(tokens(source));
    expect(formatted).toContain('"""first\n  second\nlast"""');
    expect(formatSource(formatted, { width: 55 })).toBe(formatted);
  });
  it("formats the entire feature tour without changing calculations, literals, comments or order", () => {
    const source = serialize(showcaseDeck),
      formatted = formatSource(source);
    expect(tokens(formatted)).toEqual(tokens(source));
    expect(parseDeck(formatted).slides).toHaveLength(
      showcaseDeck.slides.length,
    );
    expect(formatSource(formatted)).toBe(formatted);
  });
});

it("keeps the cursor on the same argument after formatting", () => {
  const before =
      'Deck("A") Slide(title:"B"){Table(columns:[Column("k"),Column("x")],rows:[[1,2]])}',
    after = formatSource(before, { width: 50 });
  const head = before.indexOf("rows:") + 2,
    mapped = whitespaceSelection(before, after, { anchor: head, head })!;
  expect(after.slice(mapped.head - 2, mapped.head + 2)).toBe("rows");
  expect(
    whitespaceSelection(before, before.replace('title:"B"', 'title:"C"'), {
      anchor: head,
      head,
    }),
  ).toBeUndefined();
});
