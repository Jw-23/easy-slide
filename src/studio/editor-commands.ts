import type { StateCommand } from "@codemirror/state";
import { Transaction } from "@codemirror/state";
import type { Command, KeyBinding } from "@codemirror/view";
import { toggleLineComment } from "@codemirror/commands";

export const toggleDslComment: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return true;
  return toggleLineComment({
    state,
    dispatch: (transaction) =>
      dispatch(
        state.update({
          changes: transaction.changes,
          selection: transaction.selection,
          annotations: Transaction.userEvent.of("input.comment"),
          scrollIntoView: true,
        }),
      ),
  });
};

export function dslEditingKeymap(format: () => void): KeyBinding[] {
  const formatDocument: Command = (view) => {
    if (!view.state.readOnly) format();
    return true;
  };
  return [
    { key: "Mod-/", run: toggleDslComment, preventDefault: true },
    { key: "Mod-Shift-f", run: formatDocument, preventDefault: true },
    { key: "Shift-Alt-f", run: formatDocument, preventDefault: true },
  ];
}
