import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import {
  captureReplacement,
  replacementChanges,
  searchMatches,
  searchProblem,
  MAX_SEARCH_MATCHES,
} from "../src/studio/search-replace";
const apply = (
  source: string,
  search: string,
  replace: string,
  regexp = true,
) => {
  const state = EditorState.create({ doc: source });
  const query = new SearchQuery({ search, replace, regexp, literal: true });
  return state
    .update({
      changes: replacementChanges(
        state,
        query,
        searchMatches(state, query).matches,
      ),
    })
    .state.doc.toString();
};
describe("project search and capture replacements", () => {
  it("replaces numeric and named captures across multiple slides and preserves LaTeX backslashes", () => {
    expect(
      apply(
        'Slide(title:"A") Text {x_12} Slide(title:"B") Text{x_34}',
        "x_(?<index>\\d+)",
        String.raw`\alpha_{$<index>}`,
      ),
    ).toBe(
      'Slide(title:"A") Text {\\alpha_{12}} Slide(title:"B") Text{\\alpha_{34}}',
    );
    expect(apply("x_12 x_34", "(x)_(\\d+)", "$2:$1")).toBe("12:x 34:x");
    expect(apply("x", "x", String.raw`\nabla f + \frac{1}{n}`)).toBe(
      String.raw`\nabla f + \frac{1}{n}`,
    );
  });
  it("supports full matches, escaped dollars, optional groups and digit fallback without undefined output", () => {
    const match = /(?<first>a)(b)?/.exec("a")!;
    expect(
      captureReplacement("$& $$ $1 $2 $12 $01 $99 $<first> $<absent>", match),
    ).toBe("a $ a  a2 a $99 a ");
    expect(captureReplacement("$<absent>", /a/.exec("a")!)).toBe("$<absent>");
  });
  it("keeps capture markers and search backslashes literal when regex is off", () => {
    expect(
      apply(String.raw`\nabla \nabla`, String.raw`\nabla`, "$1\\frac", false),
    ).toBe("$1\\frac $1\\frac");
  });
  it("handles multiline matches, lookbehind, start-of-document zero-width matches and astral characters", () => {
    expect(apply("a\nb", "^", ">")).toBe(">a\n>b");
    expect(apply("😀x", "(?=.)", "|")).toBe("|😀|x");
    expect(apply("ab\ncd", "(ab)\\s+(cd)", "$2:$1")).toBe("cd:ab");
    expect(apply("x1 y1", "(?<=x)(\\d)", "[$1]")).toBe("x[1] y1");
  });
  it("matches case and whole-word flags consistently with Chinese and code identifiers", () => {
    const state = EditorState.create({ doc: "Foo foo food _foo 中文 中文词" });
    const matches = (search: string, regexp = false, caseSensitive = false) =>
      searchMatches(
        state,
        new SearchQuery({
          search,
          regexp,
          wholeWord: true,
          caseSensitive,
          literal: true,
        }),
      ).matches;
    expect(matches("foo")).toHaveLength(2);
    expect(matches("foo", true)).toHaveLength(2);
    expect(matches("foo", true, true)).toHaveLength(1);
    expect(matches("中文", true)).toHaveLength(1);
  });
  it("rejects invalid patterns, bounds match counts and rejects excessive replacement output", () => {
    const state = EditorState.create({
      doc: "x".repeat(MAX_SEARCH_MATCHES + 1),
    });
    const invalid = new SearchQuery({ search: "(", regexp: true });
    expect(searchProblem(invalid)).toContain("正则表达式无效");
    expect(searchMatches(state, invalid).matches).toEqual([]);
    expect(
      searchMatches(state, new SearchQuery({ search: "x" })).truncated,
    ).toBe(true);
    expect(() => apply("xx", "x", "z".repeat(1_000_001))).toThrow(/超过/);
    expect(apply("aaa", "a", "")).toBe("");
  });
});
