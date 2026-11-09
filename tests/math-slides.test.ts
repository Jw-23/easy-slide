import { describe, it, expect } from "vitest";
import { parseDeck, serialize, type Block } from "../src/dsl";
import { scene } from "../src/scene";
const walk = (bs: Block[]): Block[] =>
  bs.flatMap((b) => [b, ...walk(b.children || [])]);
describe("mathematical environments and automatic slides", () => {
  it("numbers statements and proof steps and renders proof endings", () => {
    const d = parseDeck(
      'Deck("D") Slide(title:"S"){Theorem("结论"){Text("所有 n 都成立")} Proof{ProofStep("初始"){Text("n=1")} ProofStep("递推",reason:"归纳假设"){Equation(`n+1`)}}}',
    );
    expect(d.slides.length).toBeGreaterThanOrEqual(1);
    expect(
      walk(d.slides.flatMap((s) => s.blocks)).find(
        (b) => b.environment === "Theorem",
      )?.displayNumber,
    ).toBe("1");
    const es = d.slides.flatMap((s, i) => scene(d, s, i));
    expect(es.some((e) => e.text?.includes("定理 1"))).toBe(true);
    expect(es.some((e) => e.text === "∎")).toBe(true);
    expect(es.some((e) => e.text?.includes("步骤 2"))).toBe(true);
    expect(es.some((e) => e.text === "依据：归纳假设")).toBe(true);
  });
  it("automatically continues an ordinary Slide containing a long proof", () => {
    const steps = Array.from(
        { length: 10 },
        (_, i) => `ProofStep("步骤 ${i + 1}"){Text("说明").frame(height:60)}`,
      ).join("\n"),
      d = parseDeck(
        'Deck("D") Slide(title:"证明"){Proof{' +
          steps +
          '}} Slide(title:"After"){Text("End")}',
      );
    expect(d.slides.length).toBeGreaterThan(3);
    const all = d.slides.flatMap((s, i) => scene(d, s, i));
    for (let i = 1; i <= 10; i++)
      expect(all.filter((e) => e.text?.startsWith(`步骤 ${i} ·`))).toHaveLength(
        1,
      );
    expect(all.filter((e) => e.text === "∎")).toHaveLength(1);
    expect(d.slides.at(-1)?.title).toBe("After");
    expect(d.slides[1].title).toContain("续");
    expect(parseDeck(serialize(d))).toEqual(d);
  });
  it("fills two columns then creates more physical slides", () => {
    const d = parseDeck(
      'Deck("D") DynamicSlide(title:"双栏",columns:2){' +
        Array.from(
          { length: 9 },
          (_, i) => `Text("${i}").frame(height:180)`,
        ).join(" ") +
        "}",
    );
    expect(d.slides).toHaveLength(3);
    expect(d.slides[0].blocks).toHaveLength(2);
    expect(
      scene(d, d.slides[0], 0).find((e) => e.text === "2")?.x,
    ).toBeGreaterThan(600);
    expect(scene(d, d.slides[1], 1).some((e) => e.text === "4")).toBe(true);
  });
  it("reads legacy side wrappers in sequential order without repeating content", () => {
    const d = parseDeck(
      'Deck("D") DynamicSlide(title:"证明",columns:2){LeftColumn(repeat:true){Theorem("命题"){Text("原命题")}} RightColumn{Proof{' +
        Array.from(
          { length: 7 },
          (_, i) => `ProofStep("${i + 1}"){Text("推理").frame(height:50)}`,
        ).join(" ") +
        "}}}",
    );
    expect(d.slides.length).toBeGreaterThan(1);
    expect(
      d.slides
        .flatMap((s, i) => scene(d, s, i))
        .filter((e) => e.text === "原命题"),
    ).toHaveLength(1);
  });
  it("splits long formatted text, keeping formulas atomic and explicit breaks effective", () => {
    const d = parseDeck(
      'Deck("D") Slide(title:"长段落"){Definition("定义"){Text(`**重要**：$x_k$ ' +
        "定义说明。".repeat(450) +
        "`)}}",
    );
    expect(d.slides.length).toBeGreaterThan(1);
    expect(
      d.slides.every((s, i) =>
        scene(d, s, i).every((e) => Number.isFinite(e.h) && e.h >= 0),
      ),
    ).toBe(true);
    const manual = parseDeck(
      'Deck("D") Slide(title:"S"){Proof{ProofStep("A"){Text("A")} PageBreak() ProofStep("B"){Text("B")}}}',
    );
    expect(manual.slides).toHaveLength(2);
    expect(
      scene(manual, manual.slides[1], 1).some((e) =>
        e.text?.includes("步骤 2"),
      ),
    ).toBe(true);
  });
});

it("keeps independent numbering, custom labels and proof-local step counters", () => {
  const d = parseDeck(
    'Deck("D") Slide(title:"S"){Definition("D") Theorem("T",number:"A") Theorem("T2") Lemma("L") Proof{ProofStep("P") ProofStep("Q")} Proof{ProofStep("R")} Corollary("C",numbered:false)}',
  );
  const bs = walk(d.slides.flatMap((s) => s.blocks));
  expect(
    bs.filter((b) => b.environment === "Theorem").map((b) => b.displayNumber),
  ).toEqual(["A", "2"]);
  expect(
    bs.filter((b) => b.environment === "ProofStep").map((b) => b.displayNumber),
  ).toEqual(["1", "2", "1"]);
  expect(bs.find((b) => b.environment === "Lemma")?.displayNumber).toBe("1");
  expect(
    bs.find((b) => b.environment === "Corollary")?.displayNumber,
  ).toBeUndefined();
});

it("preserves content order and bounded geometry through nested natural layouts and numbered lists", () => {
  const d = parseDeck(
    'Deck("D") DynamicSlide(title:"S"){VStack{Text("short") Text("' +
      "较长的文字。".repeat(60) +
      '")} Numbered([' +
      Array.from({ length: 32 }, (_, i) => '"条目 ' + i + '"').join(",") +
      "],start:5)}",
  );
  const elements = d.slides.flatMap((s, i) => scene(d, s, i));
  expect(
    elements.filter((e) => e.text?.match(/^\d+\.$/)).map((e) => e.text),
  ).toEqual(Array.from({ length: 32 }, (_, i) => `${i + 5}.`));
  for (const e of elements) expect(e.y + e.h).toBeLessThanOrEqual(720);
  expect(parseDeck(serialize(d))).toEqual(d);
});

it("reports useful errors for impossible atomic blocks and supports manual opt-out", () => {
  for (const [body, message] of [
    ['Proof{Text("x").frame(height:600)}', /固定 height/],
    [
      'Definition(keepTogether:true){Text("' +
        "很长的内容。".repeat(250) +
        '")}',
      /keepTogether/,
    ],
    ['Proof{Text("x").position(x:10)}', /autoPages: false/],
  ] as const)
    expect(() => parseDeck('Deck("D") Slide(title:"S"){' + body + "}")).toThrow(
      message,
    );
  expect(() =>
    parseDeck(
      'Deck("D") DynamicSlide(title:"S",maxPages:1){Text("A") PageBreak() Text("B")}',
    ),
  ).toThrow(/maxPages/);
  const manual = parseDeck(
    'Deck("D") Slide(title:"S",autoPages:false){Theorem{Text("Manual")}.position(x:40,y:40)}',
  );
  expect(manual.slides).toHaveLength(1);
  expect(manual.slides[0].dynamic).toBeUndefined();
});

it("retains flow/column styles and delays QED until the final proof stage", async () => {
  const { timeline } = await import("../src/motion");
  const d = parseDeck(
    'Deck("D") Slide(title:"S"){Flow(spacing:12){Proof{ProofStep("A"){Text("A").appear(.rise,step:2,duration:400)}}}.font(18).foreground("#315973").padding(16)}',
  );
  const es = scene(d, d.slides[0], 0),
    a = es.find((e) => e.text === "A")!,
    qed = es.find((e) => e.text === "∎")!;
  expect(a.size).toBe(18);
  expect(a.color).toBe("#315973");
  expect(a.x).toBeGreaterThan(74 + 16);
  expect(qed.step).toBe(2);
  const cues = timeline(es),
    end = cues.find((c) => c.elements.includes(es.indexOf(qed)))!,
    body = cues.find((c) => c.elements.includes(es.indexOf(a)))!;
  expect(end.start).toBeGreaterThanOrEqual(body.end);
  const col = parseDeck(
    'Deck("D") DynamicSlide(title:"S",columns:2){LeftColumn{Definition{Text("left")}} RightColumn{Proof{Text("right")}}.font(18).foreground("#315973").padding(16)}',
  );
  const right = scene(col, col.slides[0], 0).find((e) => e.text === "right")!;
  expect(right.size).toBe(18);
  expect(right.color).toBe("#315973");
  expect(right.x).toBeGreaterThan(40);
  expect(right.x).toBeLessThan(640);
});

it("detects nested page breaks in a normal Slide without a math environment", () => {
  const d = parseDeck(
    'Deck("D") Slide(title:"S"){VStack{Text("A") PageBreak() Text("B")}}',
  );
  expect(d.slides).toHaveLength(2);
  expect(scene(d, d.slides[1], 1).some((e) => e.text === "B")).toBe(true);
});

it("uses teaching page geometry, small fonts and natural column order in preview and serialization", () => {
  const d = parseDeck(
    'Deck("D") DynamicSlide(title:"教学",columns:2,titleSize:24,fontSize:10,margin:20,padding:4,titleGap:8,columnGap:30,showFooter:false){' +
      Array.from(
        { length: 7 },
        (_, i) => `Text("教学内容${i}").frame(height:250)`,
      ).join(" ") +
      "}",
  );
  expect(d.slides).toHaveLength(2);
  const first = scene(d, d.slides[0], 0),
    second = scene(d, d.slides[1], 1);
  expect(first.find((e) => e.text === "教学")?.size).toBe(24);
  expect(first.find((e) => e.text === "教学内容0")).toMatchObject({
    x: 24,
    size: 10,
  });
  expect(first.find((e) => e.text === "教学内容2")!.x).toBeGreaterThan(640);
  expect(second.some((e) => e.text === "教学内容4")).toBe(true);
  expect(first.some((e) => e.text === "01")).toBe(false);
  for (const e of [...first, ...second])
    expect(e.y + e.h).toBeLessThanOrEqual(720);
  expect(parseDeck(serialize(d))).toEqual(d);
  const small = parseDeck(
    'Deck("D") Slide(title:"S",fontSize:8){ProofStep("小字"){Text("解释")}}',
  );
  expect(
    scene(small, small.slides[0], 0).find((e) => e.text === "解释")?.size,
  ).toBe(8);
  for (const option of [
    "fontSize:7",
    "titleSize:100",
    "margin:200",
    "padding:-1",
    "columnGap:200",
    "showFooter:1",
  ])
    expect(() =>
      parseDeck('Deck("D") Slide(title:"S",' + option + '){Text("A")}'),
    ).toThrow();
});
