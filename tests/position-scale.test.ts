import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { parseDeck, serialize } from "../src/dsl";
import { scene } from "../src/scene";
import { timeline } from "../src/motion";
import { completeDsl } from "../src/editor-language";
import { SourceMap } from "../src/studio/source-map";
import { formatSource } from "../src/studio/format-source";
import {
  exportProjectArchive,
  importProjectArchive,
} from "../src/project-archive";
function draw(body: string) {
  const d = parseDeck(
    'Deck("D") Theme(preset:.paper) Slide(title:"S"){' + body + "}",
  );
  return scene(d, d.slides[0], 0);
}
function labels(marked: string) {
  const pos = marked.indexOf("¦"),
    state = EditorState.create({ doc: marked.replace("¦", "") });
  return (
    completeDsl(new CompletionContext(state, pos, true), [])?.options.map(
      (o) => o.label,
    ) || []
  );
}
describe("independent position, frame and scale", () => {
  it("positions from the parent's padded bottom-left and keeps that point fixed when scaled", () => {
    const es = draw(
        'Panel(fill:"#eeeeee"){ZStack{Rectangle(fill:"#ff0000").frame(width:100,height:50).position(x:10,y:15).scale(2) Rectangle(fill:"#0000ff").frame(width:20,height:20)}}.frame(width:500,height:300).padding(20).position(x:100,y:220,relativeTo:.slide)',
      ),
      red = es.find((e) => e.fill === "#ff0000")!,
      blue = es.find((e) => e.fill === "#0000ff")!;
    expect(red).toMatchObject({ x: 130, y: 365, w: 200, h: 100 });
    expect(red.y + red.h).toBe(465);
    expect(blue).toMatchObject({ x: 120, y: 220, w: 20, h: 20 });
  });
  it("changes presentation size without reserving extra layout space", () => {
    const a = draw(
        'HStack{Rectangle(fill:"#ff0000").frame(width:100,height:50).scale(2) Rectangle(fill:"#0000ff").frame(width:100,height:50)}',
      ),
      b = draw(
        'HStack{Rectangle(fill:"#ff0000").frame(width:100,height:50) Rectangle(fill:"#0000ff").frame(width:100,height:50)}',
      );
    expect(a.find((e) => e.fill === "#0000ff")).toEqual(
      b.find((e) => e.fill === "#0000ff"),
    );
    expect(a.find((e) => e.fill === "#ff0000")).toMatchObject({
      x: 24,
      y: 225,
      w: 200,
      h: 100,
    });
  });
  it("separates the reference point from the element anchor and uses Cartesian offsets", () => {
    expect(
      draw(
        'Rectangle(fill:"#ff0000").frame(width:120,height:60).position(reference:.center,anchor:.bottomLeft).scale(1.5)',
      ).find((e) => e.fill === "#ff0000"),
    ).toMatchObject({ x: 640, y: 345, w: 180, h: 90 });
    expect(
      draw(
        'Rectangle(fill:"#ff0000").frame(width:120,height:60).position(reference:.center,anchor:.center).scale(1.5)',
      ).find((e) => e.fill === "#ff0000"),
    ).toMatchObject({ x: 550, y: 390, w: 180, h: 90 });
    expect(
      draw(
        'Rectangle(fill:"#ff0000").frame(width:100,height:50).position(x:80,y:-250,reference:.topLeft,anchor:.topLeft,relativeTo:.slide)',
      ).find((e) => e.fill === "#ff0000"),
    ).toMatchObject({ x: 80, y: 250, w: 100, h: 50 });
  });
  it("keeps canvas reference points stable inside scaled ancestors, while parent offsets scale with the parent", () => {
    const es = draw(
      'ZStack{Rectangle(fill:"#ff0000").frame(width:50,height:20).position(x:400,y:300,relativeTo:.slide).scale(1.5) Rectangle(fill:"#0000ff").frame(width:20,height:10).position(x:10,y:10)}.frame(width:300,height:200).position(x:100,y:320,relativeTo:.slide).scale(2)',
    );
    expect(es.find((e) => e.fill === "#ff0000")).toMatchObject({
      x: 400,
      y: 360,
      w: 150,
      h: 60,
    });
    expect(es.find((e) => e.fill === "#0000ff")).toMatchObject({
      x: 120,
      y: 360,
      w: 40,
      h: 20,
    });
  });
  it("scales descendants, rich text, material geometry and keeps source/animation identities", () => {
    const source =
        'Deck("D") Theme(preset:.paper) Slide(title:"S"){ZStack{Text("**result** $x^2$").font(20).frame(width:100,height:50).position(x:10,y:10).glass(radius:16).appear(.rise,step:1,duration:650)}.frame(width:300,height:200).scale(1.5)}',
      d = parseDeck(source),
      es = scene(d, d.slides[0], 0),
      text = es.find((e) => e.text?.startsWith("**result**"))!,
      glass = es.find((e) => e.glass)!;
    expect(text.size).toBe(30);
    expect(text.rich?.hasMath).toBe(true);
    expect(glass.glass?.radius).toBe(24);
    expect(glass.radius).toBe(24);
    expect(new SourceMap(source).get(text.source!)?.name).toBe("Text");
    expect(timeline(es).find((c) => c.step === 1)).toMatchObject({
      start: 0,
      end: 650,
    });
  });
  it("validates signed offsets, reference names and scale bounds, with migration guidance for old frames", () => {
    for (const modifier of [
      ".frame(x:10,y:20)",
      ".position(reference:.unknown)",
      ".position(anchor:.unknown)",
      ".position(relativeTo:.unknown)",
      '.position(x:"bad")',
      ".scale(0)",
      ".scale(-1)",
      ".scale(11)",
    ])
      expect(() =>
        parseDeck('Deck("D") Slide(title:"S"){Text("X")' + modifier + "}"),
      ).toThrow();
    expect(() =>
      parseDeck('Deck("D") Slide(title:"S"){Text("X").frame(x:10)}'),
    ).toThrow(/position/);
    expect(() =>
      draw('Text("X").position(x:-10,y:-20).scale(0.25)'),
    ).not.toThrow();
  });
  it("offers AST parameter/enum completion for separate layout, placement and scale modifiers", () => {
    expect(labels('Text("A").frame(¦)')).toEqual(
      expect.arrayContaining(["width:", "height:"]),
    );
    expect(labels('Text("A").frame(¦)')).not.toContain("x:");
    expect(labels('Text("A").position(reference:.¦)')).toEqual(
      expect.arrayContaining(["bottomLeft", "center", "topRight"]),
    );
    expect(labels('Text("A").position(anchor:.¦)')).toContain("center");
    expect(labels('Text("A").position(relativeTo:.¦)')).toEqual(
      expect.arrayContaining(["parent", "slide"]),
    );
    expect(labels('Text("A").¦')).toEqual(
      expect.arrayContaining(["frame", "position", "scale"]),
    );
  });
  it("preserves declarations, calculations and modifier order through formatting, serialization and ZIP", async () => {
    const source =
        'func Dot(zoom=1.25){Circle(fill:"#ff0000").frame(width:80,height:80).position(x:20,y:30,reference:.bottomLeft,anchor:.center).scale(zoom)} Deck("D") Slide(title:"S"){Dot().position(reference:.center).frame(width:200,height:180)}',
      d = parseDeck(source),
      p = {
        format: "easy-slide" as const,
        version: 1 as const,
        source,
        assets: {},
      };
    const formatted = formatSource(source),
      after = parseDeck(formatted);
    expect(scene(after, after.slides[0], 0)).toEqual(scene(d, d.slides[0], 0));
    expect(formatSource(formatted)).toBe(formatted);
    expect(parseDeck(serialize(d))).toEqual(d);
    const zip = await exportProjectArchive(p);
    expect(await importProjectArchive(await zip.arrayBuffer())).toEqual(p);
  });
});
