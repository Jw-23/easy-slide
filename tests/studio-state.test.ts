import { afterEach, describe, expect, it, vi } from "vitest";
import {
  historyReducer,
  historyState,
  type History,
} from "../src/studio/history";
import { DraftQueue } from "../src/studio/draft-queue";
import { nextPosition, previousPosition } from "../src/studio/presentation";
import { compileDocument } from "../src/studio/compile-document";
import { parseDeck, type Project } from "../src/dsl";
const project = (
  source: string,
  assets: Record<string, string> = {},
): Project => ({ format: "easy-slide", version: 1, source, assets });
const revision = (
  source: string,
  page = 0,
  assets?: Record<string, string>,
) => ({ project: project(source, assets), page });
function change(
  state: History,
  source: string,
  time: number,
  group?: string,
  beforePage?: number,
) {
  return historyReducer(state, {
    type: "change",
    value: revision(source, beforePage),
    group,
    time,
    beforePage,
  });
}
afterEach(() => vi.useRealTimers());
describe("document history", () => {
  it("coalesces typing, keeps independent actions separate and restores page selection", () => {
    let state = historyState(revision("A"));
    state = change(state, "B", 100, "title:5", 5);
    state = change(state, "C", 400, "title:5", 5);
    expect(state.past).toHaveLength(1);
    expect(state.past[0].page).toBe(5);
    state = change(state, "D", 500, "theme");
    state = historyReducer(state, { type: "undo" });
    expect(state.present.project.source).toBe("C");
    state = historyReducer(state, { type: "undo" });
    expect(state.present.project.source).toBe("A");
    expect(state.present.page).toBe(5);
    state = historyReducer(state, { type: "redo" });
    expect(state.present.project.source).toBe("C");
    state = change(state, "replacement", 600, "title:5");
    expect(state.future).toEqual([]);
    expect(state.past.at(-1)?.project.source).toBe("C");
  });
  it("restores imported image sets atomically with the source", () => {
    const original = revision("A", 3, { "a.png": "data:a" }),
      imported = revision("B", 0, { "b.png": "data:b" });
    let state = historyReducer(historyState(original), {
      type: "change",
      value: imported,
      time: 1,
    });
    expect(state.present).toBe(imported);
    state = historyReducer(state, { type: "undo" });
    expect(state.present).toEqual(original);
    expect(state.present.project.assets).toBe(original.project.assets);
    state = historyReducer(state, { type: "redo" });
    expect(state.present).toBe(imported);
  });
  it("bounds retained history and keeps the newest revision undoable", () => {
    let state = historyState(revision("0"));
    for (let i = 1; i <= 80; i++) state = change(state, String(i), i * 1000);
    expect(state.past).toHaveLength(50);
    expect(historyReducer(state, { type: "undo" }).present.project.source).toBe(
      "79",
    );
    const reset = historyReducer(state, {
      type: "reset",
      value: revision("restored"),
    });
    expect(reset.past).toEqual([]);
    expect(reset.future).toEqual([]);
  });
});
describe("ordered draft persistence", () => {
  it("writes only the newest debounced draft", async () => {
    vi.useFakeTimers();
    const writes: string[] = [],
      states: string[] = [];
    const queue = new DraftQueue<string>(
      async (value) => {
        writes.push(value);
      },
      (state) => states.push(state),
    );
    queue.schedule("A");
    queue.schedule("B");
    queue.schedule("C");
    await vi.advanceTimersByTimeAsync(600);
    expect(writes).toEqual(["C"]);
    expect(states.at(-1)).toBe("saved");
    queue.dispose();
  });
  it("never lets a slow old write overwrite a newer draft or report an old save as current", async () => {
    const writes: string[] = [],
      states: string[] = [];
    let release!: () => void;
    const queue = new DraftQueue<string>(
      async (value) => {
        if (value === "A")
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        writes.push(value);
      },
      (state) => states.push(state),
    );
    queue.schedule("A");
    const first = queue.flush();
    queue.schedule("B");
    queue.schedule("C");
    const flush = queue.flush();
    expect(flush).toBe(first);
    release();
    await flush;
    expect(writes).toEqual(["A", "C"]);
    expect(states.filter((state) => state === "saved")).toHaveLength(1);
    expect(states.at(-1)).toBe("saved");
    queue.dispose();
  });
  it("reports failures, retries explicitly and still commits a newer draft after an old failure", async () => {
    let fails = true;
    const states: string[] = [],
      queue = new DraftQueue<string>(
        async () => {
          if (fails) throw Error("quota");
        },
        (state) => states.push(state),
      );
    queue.schedule("A");
    await expect(queue.flush()).rejects.toThrow("quota");
    expect(states.at(-1)).toBe("error");
    fails = false;
    queue.schedule("A");
    await queue.flush();
    expect(states.at(-1)).toBe("saved");
    queue.dispose();
    let reject!: (error: Error) => void;
    const written: string[] = [];
    const another = new DraftQueue<string>(
      async (value) => {
        if (value === "old")
          await new Promise<void>((_, r) => {
            reject = r;
          });
        written.push(value);
      },
      () => {},
    );
    another.schedule("old");
    const flush = another.flush();
    another.schedule("new");
    reject(Error("old failure"));
    await flush;
    expect(written).toEqual(["new"]);
    another.dispose();
  });
});
it("reuses untouched pages and theme across compilation without mutating previous documents", () => {
  const before =
    'Deck("A") Theme(preset:.paper) Slide(title:"B"){Text("b")} Slide(title:"C"){Text("c")}';
  const previous = parseDeck(before),
    next = compileDocument(
      before.replace('title:"B"', 'title:"Changed"'),
      previous,
    );
  expect(next.slides[0]).not.toBe(previous.slides[0]);
  expect(next.slides[1]).toBe(previous.slides[1]);
  expect(next.theme).toBe(previous.theme);
  expect(previous.slides[0].title).toBe("B");
});
it("navigates each click stage in both directions and stops at deck boundaries", () => {
  expect(nextPosition({ page: 0, step: 0 }, [0, 2, 5], 2)).toEqual({
    page: 0,
    step: 2,
  });
  expect(nextPosition({ page: 0, step: 5 }, [0, 2, 5], 2)).toEqual({
    page: 1,
    step: 0,
  });
  expect(nextPosition({ page: 1, step: 5 }, [0, 5], 2)).toEqual({
    page: 1,
    step: 5,
  });
  expect(previousPosition({ page: 1, step: 5 }, [0, 2, 5], [0, 7])).toEqual({
    page: 1,
    step: 2,
  });
  expect(previousPosition({ page: 1, step: 0 }, [0, 2, 5], [0, 7])).toEqual({
    page: 0,
    step: 7,
  });
  expect(previousPosition({ page: 0, step: 0 }, [0], [])).toEqual({
    page: 0,
    step: 0,
  });
});
