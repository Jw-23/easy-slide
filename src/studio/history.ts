import type { Project } from "../dsl";
export type Revision = { project: Project; page: number };
export type History = {
  past: Revision[];
  present: Revision;
  future: Revision[];
  group?: string;
  time: number;
};
export type HistoryAction =
  | {
      type: "change";
      value: Revision;
      group?: string;
      time: number;
      beforePage?: number;
    }
  | { type: "reset"; value: Revision }
  | { type: "undo" }
  | { type: "redo" };
export const sameProject = (a: Project, b: Project) =>
  a.source === b.source &&
  a.assets === b.assets &&
  a.imageDocuments === b.imageDocuments;
export const historyState = (value: Revision): History => ({
  past: [],
  present: value,
  future: [],
  time: 0,
});
function bounded(past: Revision[], present: Revision) {
  // Image strings are shared between snapshots. Bound additional retained assets,
  // source memory and revision count rather than copying binary image contents.
  const images = new Set(Object.values(present.project.assets));
  let bytes = 0,
    sourceBytes = 0,
    start = past.length;
  for (let i = past.length - 1; i >= 0 && past.length - i <= 50; i--) {
    sourceBytes +=
      past[i].project.source.length * 2 +
      JSON.stringify(past[i].project.imageDocuments || {}).length * 2;
    for (const data of Object.values(past[i].project.assets))
      if (!images.has(data)) {
        bytes += data.length * 2;
        images.add(data);
      }
    if (
      (bytes > 64 * 1024 * 1024 || sourceBytes > 8 * 1024 * 1024) &&
      i !== past.length - 1
    )
      break;
    start = i;
  }
  return past.slice(start);
}
export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === "reset") return historyState(action.value);
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future],
      time: 0,
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return {
      past: bounded([...state.past, state.present], state.future[0]),
      present: state.future[0],
      future: state.future.slice(1),
      time: 0,
    };
  }
  if (sameProject(state.present.project, action.value.project)) return state;
  const merge =
    !!action.group &&
    action.group === state.group &&
    action.time - state.time < 650 &&
    !state.future.length;
  return {
    past: bounded(
      merge
        ? state.past
        : [
            ...state.past,
            { ...state.present, page: action.beforePage ?? state.present.page },
          ],
      action.value,
    ),
    present: action.value,
    future: [],
    group: action.group,
    time: action.time,
  };
}
