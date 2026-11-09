import { describe, expect, it, vi } from "vitest";
import {
  EditorSelection,
  EditorState,
  type Transaction,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { slideLanguage } from "../src/editor-language";
import {
  dslEditingKeymap,
  toggleDslComment,
} from "../src/studio/editor-commands";
import { formatSource } from "../src/studio/format-source";

function document(
  doc: string,
  selection = EditorSelection.cursor(0),
  readOnly = false,
) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.create([selection]),
    extensions: [
      slideLanguage,
      EditorState.readOnly.of(readOnly),
      EditorState.allowMultipleSelections.of(true),
    ],
  });
  const transactions: Transaction[] = [];
  return {
    get state() {
      return state;
    },
    transactions,
    dispatch(tr: Transaction) {
      transactions.push(tr);
      state = tr.state;
    },
  };
}

describe("DSL editing commands", () => {
  it("toggles the current line with the DSL comment token, preserving indentation and marking a separate history action", () => {
    const text =
        'Deck("D")\nSlide(title:"A"){\n    Text("value // literal")\n}',
      pos = text.indexOf("Text(") + 7,
      target = document(text, EditorSelection.cursor(pos));
    expect(toggleDslComment(target)).toBe(true);
    expect(target.state.doc.toString()).toContain(
      '    // Text("value // literal")',
    );
    expect(target.state.selection.main.head).toBe(pos + 3);
    expect(target.transactions[0].isUserEvent("input.comment")).toBe(true);
    expect(toggleDslComment(target)).toBe(true);
    expect(target.state.doc.toString()).toBe(text);
    expect(target.state.selection.main.head).toBe(pos);
  });
  it("comments selected lines together, preserves nested comments and skips a trailing unselected line", () => {
    const text =
        '    Text("A")\n\n      // note\n    Equation(#"x^2"#)\nText("outside")',
      target = document(
        text,
        EditorSelection.range(0, text.indexOf('Text("outside")')),
      );
    toggleDslComment(target);
    expect(target.state.doc.toString()).toBe(
      '    // Text("A")\n\n    //   // note\n    // Equation(#"x^2"#)\nText("outside")',
    );
    toggleDslComment(target);
    expect(target.state.doc.toString()).toBe(text);
  });
  it("supports disjoint selections without commenting intermediate lines", () => {
    const text = 'Text("A")\nText("B")\nText("C")',
      target = document(text);
    target.dispatch(
      target.state.update({
        selection: EditorSelection.create([
          EditorSelection.cursor(1),
          EditorSelection.cursor(text.lastIndexOf("Text") + 1),
        ]),
      }),
    );
    toggleDslComment(target);
    expect(target.state.doc.toString()).toBe(
      '// Text("A")\nText("B")\n// Text("C")',
    );
    expect(target.state.selection.ranges).toHaveLength(2);
  });
  it("routes both format shortcuts to the same formatter and preserves comments and calculation", () => {
    const source =
        '// note\nDeck("D") let amount=2*3 Slide(title:"A"){Metric(fixed(amount))}',
      target = document(source),
      formatted: string[] = [],
      format = vi.fn(() =>
        formatted.push(formatSource(target.state.doc.toString())),
      ),
      bindings = dslEditingKeymap(format);
    for (const key of ["Mod-Shift-f", "Shift-Alt-f"])
      expect(
        bindings.find((b) => b.key === key)!.run!(
          target as unknown as EditorView,
        ),
      ).toBe(true);
    expect(format).toHaveBeenCalledTimes(2);
    expect(formatted[0]).toBe(formatted[1]);
    expect(formatted[0]).toContain("// note");
    expect(formatted[0]).toContain("amount = 2 * 3");
    expect(bindings.find((b) => b.key === "Mod-/")!.run).toBe(toggleDslComment);
  });
  it("can uncomment incomplete code but all shortcuts leave read-only documents untouched", () => {
    const unfinished = document('    // Text("unfinished');
    toggleDslComment(unfinished);
    expect(unfinished.state.doc.toString()).toBe('    Text("unfinished');
    const target = document('Text("locked")', undefined, true),
      format = vi.fn();
    for (const binding of dslEditingKeymap(format))
      expect(binding.run!(target as unknown as EditorView)).toBe(true);
    expect(target.transactions).toHaveLength(0);
    expect(format).not.toHaveBeenCalled();
  });
});
