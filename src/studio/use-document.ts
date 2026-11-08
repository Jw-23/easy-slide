import { compileDocument } from "./compile-document";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { initialSource, initialAssets, showcaseDeck } from "../examples";
import { type Project } from "../dsl";
import { loadDraft, saveDraft } from "../storage";
import { DraftQueue, type SaveState } from "./draft-queue";
import { historyReducer, historyState, type HistoryAction } from "./history";
const initialProject: Project = {
  format: "easy-slide",
  version: 1,
  source: initialSource,
  assets: initialAssets,
};
function restoredProject(value: unknown): Project {
  const p = value as Project;
  // Invalid DSL is an intentional editable draft; restore it without compiling.
  if (
    p?.format !== "easy-slide" ||
    p.version !== 1 ||
    typeof p.source !== "string" ||
    !p.assets ||
    typeof p.assets !== "object" ||
    Array.isArray(p.assets) ||
    Object.values(p.assets).some((v) => typeof v !== "string")
  )
    throw Error("浏览器草稿格式损坏，请导入备份");
  return p;
}
export function useDocument(draftKey: string) {
  const [history, dispatch] = useReducer(
    historyReducer,
    historyState({ project: initialProject, page: 0 }),
  );
  const [page, setPage] = useState(0),
    [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState | "restoring">(
      "restoring",
    ),
    [saveError, setSaveError] = useState(""),
    [restoreFailed, setRestoreFailed] = useState(false);
  const current = useRef(history),
    pageRef = useRef(page),
    alive = useRef(true),
    permitSave = useRef(false),
    edited = useRef(false);
  current.current = history;
  pageRef.current = page;
  const queue = useMemo(
    () =>
      new DraftQueue<Project>(
        (p) => saveDraft(p, draftKey),
        (state, problem) => {
          if (alive.current) {
            setSaveState(state);
            setSaveError(
              problem instanceof Error
                ? problem.message
                : state === "error"
                  ? "浏览器草稿保存失败，请导出备份"
                  : "",
            );
          }
        },
      ),
    [draftKey],
  );
  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    loadDraft(draftKey)
      .then((value) => {
        if (cancelled) return;
        if (value)
          dispatch({
            type: "reset",
            value: { project: restoredProject(value), page: 0 },
          });
        permitSave.current = true;
      })
      .catch((problem) => {
        if (!cancelled) {
          setRestoreFailed(true);
          setSaveState("error");
          setSaveError(
            problem instanceof Error ? problem.message : "无法恢复浏览器草稿",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      alive.current = false;
      queue.dispose();
    };
  }, [draftKey, queue]);
  const project = history.present.project;
  useEffect(() => {
    if (ready && permitSave.current) queue.schedule(project);
  }, [project, ready, queue]);
  const lastValid = useRef(showcaseDeck);
  const parsed = useMemo(() => {
    try {
      const deck = compileDocument(project.source, lastValid.current);
      lastValid.current = deck;
      return { deck, error: null };
    } catch (problem) {
      return {
        deck: lastValid.current,
        error: problem instanceof Error ? problem : new Error(String(problem)),
      };
    }
  }, [project.source]);
  const active = Math.min(page, parsed.deck.slides.length - 1);
  function go(index: number) {
    const next = Math.max(0, Math.min(parsed.deck.slides.length - 1, index));
    pageRef.current = next;
    setPage(next);
  }
  function apply(action: HistoryAction) {
    current.current = historyReducer(current.current, action);
    dispatch(action);
  }
  function commit(next: Project, group?: string, target = pageRef.current) {
    if (!ready) return;
    edited.current = true;
    if (!restoreFailed) permitSave.current = true;
    apply({
      type: "change",
      value: { project: next, page: target },
      beforePage: pageRef.current,
      group,
      time: performance.now(),
    });
    pageRef.current = target;
    setPage(target);
  }
  function source(value: string, group?: string) {
    commit({ ...current.current.present.project, source: value }, group);
  }
  function undo() {
    const target = current.current.past.at(-1);
    if (!ready || !target) return;
    edited.current = true;
    apply({ type: "undo" });
    pageRef.current = target.page;
    setPage(target.page);
  }
  function redo() {
    const target = current.current.future[0];
    if (!ready || !target) return;
    edited.current = true;
    apply({ type: "redo" });
    pageRef.current = target.page;
    setPage(target.page);
  }
  async function persist() {
    if (!ready) throw Error("正在恢复草稿，请稍候");
    if (restoreFailed)
      throw Error(
        "未能读取原草稿，请先导出当前工程备份，再重新打开；当前编辑不会覆盖未恢复的草稿",
      );
    queue.schedule(current.current.present.project, 0);
    await queue.flush();
  }
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden")
        void queue.flush().catch(() => {});
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [queue]);
  useEffect(() => {
    if (!ready || saveState === "saved") return;
    const leaving = (event: BeforeUnloadEvent) => {
      if (!edited.current) return;
      void queue.flush().catch(() => {});
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leaving);
    return () => window.removeEventListener("beforeunload", leaving);
  }, [ready, saveState, queue]);
  return {
    project,
    ...parsed,
    active,
    slide: parsed.deck.slides[active],
    ready,
    saveState,
    saveError,
    restoreFailed,
    go,
    commit,
    source,
    undo,
    redo,
    persist,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
