import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { completeDsl } from "../src/editor-language";
import { parseDeck, serialize } from "../src/dsl";
import { replaceTheme } from "../src/theme-source";
import {
  themeIds,
  themePresets,
  resolveTheme,
  luminance,
  headerText,
} from "../src/themes";
import { scene } from "../src/scene";
import { timeline } from "../src/motion";
import { showcaseDeck } from "../src/showcase";
import {
  exportProjectArchive,
  importProjectArchive,
} from "../src/project-archive";
const content = String.raw`
// 表格保留计算，不把结果改写成常量
let rows = range(1, 4).map(k => [k, k^2])
Slide(title: "结果") {
  Cards {
    Table(columns: [Column("k"), Column("平方")], rows: rows)
      .appear(.rise, step: 1, duration: 620)
    Code("Theme(preset: .ink) // 这是正文")
  }
}.notes("注释和备注")
`;
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
describe("presentation themes", () => {
  it("round trips all ten distinct presets and keeps primary, secondary and table text legible", () => {
    expect(themePresets).toHaveLength(10);
    expect(new Set(themePresets.map((t) => t.background))).toHaveProperty(
      "size",
      10,
    );
    for (const preset of themeIds) {
      const deck = parseDeck(
        `Deck("A")\nTheme(preset: .${preset})\n${content}`,
      );
      expect(parseDeck(serialize(deck))).toEqual(deck);
      const theme = resolveTheme(deck.theme);
      expect(contrast(theme.color, theme.background)).toBeGreaterThanOrEqual(7);
      expect(contrast(theme.muted, theme.background)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrast(headerText(theme.accent), theme.accent),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("switches only the Theme call, preserving comments, raw strings, computed data and every other source byte", () => {
    const before =
      '// start\nDeck("A")\n// theme\nTheme(\n accent: "#16766d", material: .glass\n)\n' +
      content;
    for (const preset of themeIds) {
      const after = replaceTheme(before, { preset });
      expect(after).toBe(
        '// start\nDeck("A")\n// theme\n' +
          `Theme(preset: .${preset})\n` +
          content,
      );
      expect(parseDeck(after).slides).toEqual(parseDeck(before).slides);
      expect(replaceTheme(after, { preset })).toBe(after);
    }
  });
  it("inserts a missing Theme into flat and legacy Deck scopes without rewriting their bodies", () => {
    for (const source of [
      'Deck("A")\n' + content,
      'Deck("A") {\n' + content + "\n}",
    ]) {
      const after = replaceTheme(source, {
        preset: "paper",
        accent: "#123456",
      });
      expect(parseDeck(after).slides).toEqual(parseDeck(source).slides);
      expect(
        after.replace('Theme(preset: .paper, accent: "#123456")\n', ""),
      ).toBe(source);
    }
  });
  it("uses shared panel, table, code and backdrop colors and preserves layout and click stages", () => {
    let baseline: unknown;
    for (const preset of themeIds) {
      const deck = parseDeck(
          `Deck("A")\nTheme(preset: .${preset})\n${content}`,
        ),
        theme = resolveTheme(deck.theme);
      const elements = scene(deck, deck.slides[0], 0);
      expect(elements.find((e) => e.text === "结果")?.color).toBe(theme.color);
      expect(
        elements
          .filter((e) => e.kind === "rect")
          .some((e) => e.radius === theme.radius),
      ).toBe(true);
      expect(elements.some((e) => e.fill === theme.code)).toBe(true);
      expect(elements.some((e) => e.fill === theme.accent)).toBe(true);
      const code = elements.find((e) => e.text?.startsWith("Theme("))!;
      expect(code.mono).toBe(true);
      if (theme.material === "glass") {
        const backdrop = elements.find((e) => e.data)?.data!;
        const svg = atob(backdrop.split(",")[1]);
        expect(svg).toContain(theme.background);
        expect(svg).toContain(theme.glow);
      }
      const layout = elements
        .filter((e) => e.kind === "text")
        .map((e) => [e.text, e.x, e.y, e.w, e.h, e.size, e.step]);
      if (!baseline) baseline = layout;
      else expect(layout).toEqual(baseline);
      expect(timeline(elements).map((c) => [c.step, c.start, c.end])).toEqual([
        [1, 0, 620],
      ]);
    }
  });
  it("retains explicit theme and page overrides, including readable headers for bright custom accents", () => {
    const deck = parseDeck(
      'Deck("A") Theme(preset: .paper, color: "#123456", font: "Arial", material: .glass, accent: "#ffff00") Slide(title: "X") { Cards { Text("Y") } }.background("#112233").foreground("#abcdef")',
    );
    const theme = resolveTheme(deck.theme, deck.slides[0].background);
    expect(theme).toMatchObject({
      background: "#112233",
      color: "#123456",
      font: "Arial",
      material: "glass",
      dark: true,
    });
    expect(
      scene(deck, deck.slides[0], 0).find((e) => e.text === "X")?.color,
    ).toBe("#abcdef");
    expect(headerText(theme.accent)).toBe("#000000");
    expect(resolveTheme().background).toBe("#fafbf9");
    for (const accent of ["#777777", "#757575", "#808080", "#aabbcc"])
      expect(contrast(headerText(accent), accent)).toBeGreaterThanOrEqual(4.5);
  });
  it("reports unsupported presets and offers only preset enums in completion", () => {
    expect(() =>
      parseDeck('Deck("A") Theme(preset: .unknown) Slide(title: "X") {}'),
    ).toThrow(/未知主题.*\.aurora.*\.terminal/);
    const doc = 'Deck("A")\nTheme(preset: .';
    const result = completeDsl(
      new CompletionContext(EditorState.create({ doc }), doc.length, true),
      [],
    );
    expect(result?.options.map((o) => o.label).sort()).toEqual(
      [...themeIds].sort(),
    );
  });
  it("keeps all feature-tour pages within the canvas under every theme", () => {
    for (const preset of themeIds) {
      const deck = { ...showcaseDeck, theme: { preset } };
      deck.slides.forEach((slide, i) =>
        scene(deck, slide, i).forEach((e) => {
          expect(e.x).toBeGreaterThanOrEqual(0);
          expect(e.y).toBeGreaterThanOrEqual(0);
          expect(e.x + e.w).toBeLessThanOrEqual(1280);
          expect(e.y + e.h).toBeLessThanOrEqual(720);
        }),
      );
    }
  });
  it("preserves the selected theme, untouched source and all images across ZIP export/import", async () => {
    const source = replaceTheme('Deck("A")\n' + content, { preset: "ocean" });
    const project = {
      format: "easy-slide" as const,
      version: 1 as const,
      source,
      assets: {
        "assets/图片.png":
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=",
      },
    };
    const blob = await exportProjectArchive(project);
    expect(await importProjectArchive(await blob.arrayBuffer())).toEqual(
      project,
    );
  });
});
