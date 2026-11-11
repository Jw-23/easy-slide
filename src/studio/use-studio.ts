import { pageGroup, groupMoveTarget } from "./page-groups";
import { formatSource } from "./format-source";
import type { SceneTarget } from "./source-map";
import { addImageAssets } from "./image-import";
import { useEffect, useRef, useState } from "react";
import {
  parseDeck,
  serialize,
  type Deck,
  type Layout,
  type Project,
} from "../dsl";
import { exampleAssetsFor } from "../examples";
import { replaceTheme } from "../theme-source";
import type { ThemeOptions } from "../themes";
import { download } from "../download";
import {
  exportProjectArchive,
  importProjectArchive,
  MAX_ARCHIVE_BYTES,
  MAX_IMAGE_BYTES,
  projectArchiveName,
  validatePortableProject,
  validateEditableProject,
} from "../project-archive";
import {
  chooseFolder,
  folderImages,
  folderProject,
  readData,
  writeFolder,
  projectFilename,
  projectFileName,
  loadProjectLocation,
  saveProjectLocation,
  ensureFolderWritePermission,
  type FolderHandle,
} from "../storage";
import { useDocument } from "./use-document";
import {
  addSlideSource,
  appendSlideBlocks,
  deleteSlideSource,
  duplicateSlideSource,
  editSlide,
  moveSlideSource,
  setSlideLayout,
  renameDeck,
  type SlideEdit,
} from "./source-edits";
export type Notice = {
  id: number;
  message: string;
  kind: "success" | "error";
  undo?: boolean;
};
export function useStudio(draftKey: string) {
  const doc = useDocument(draftKey);
  const [operation, setOperation] = useState(""),
    [notice, setNotice] = useState<Notice | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [locationVersion, setLocationVersion] = useState(0);
  const [folder, setFolder] = useState<FolderHandle | null>(null),
    [folderVersion, setFolderVersion] = useState<typeof doc.project | null>(
      null,
    );
  const [saveRequest, setSaveRequest] = useState<{
    project: Project;
    folder: FolderHandle | null;
    name: string;
    asNew: boolean;
  } | null>(null);
  const locked = useRef(false),
    current = useRef(doc);
  current.current = doc;
  const locationWrites = useRef(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    setLocationReady(false);
    loadProjectLocation(draftKey)
      .then((dir) => {
        if (!cancelled) setFolder(dir);
      })
      .catch((error) => {
        if (!cancelled)
          notify(
            "无法恢复保存位置：" +
              (error instanceof Error ? error.message : String(error)),
            "error",
          );
      })
      .finally(() => {
        if (!cancelled) setLocationReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [draftKey]);
  useEffect(() => {
    if (!locationReady) return;
    locationWrites.current = locationWrites.current
      .then(() => saveProjectLocation(folder, draftKey))
      .catch((error) => {
        notify(
          "保存位置未能记住：" +
            (error instanceof Error ? error.message : String(error)),
          "error",
        );
      });
  }, [folder, locationReady, locationVersion, draftKey]);
  const busy = !!operation || !locationReady,
    editable = doc.ready && !doc.error && !busy;
  function notify(
    message: string,
    kind: Notice["kind"] = "success",
    undo = false,
  ) {
    setNotice({ id: Date.now(), message, kind, undo });
  }
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(
      () => setNotice(null),
      notice.kind === "error" ? 9000 : 4500,
    );
    return () => clearTimeout(timeout);
  }, [notice]);
  async function run(label: string, job: () => Promise<void>) {
    if (locked.current || !current.current.ready || !locationReady)
      return false;
    locked.current = true;
    setNotice(null);
    setOperation(label);
    try {
      await job();
      return true;
    } catch (problem) {
      if (!(problem instanceof Error && problem.name === "AbortError"))
        notify(
          problem instanceof Error ? problem.message : String(problem),
          "error",
        );
      return false;
    } finally {
      locked.current = false;
      setOperation("");
    }
  }
  function mutate(action: () => string, group?: string, page = doc.active) {
    if (!editable || locked.current) return;
    try {
      const source = action();
      parseDeck(source);
      doc.commit({ ...doc.project, source }, group, page);
    } catch (problem) {
      notify(
        problem instanceof Error ? problem.message : String(problem),
        "error",
      );
    }
  }
  function field(patch: SlideEdit) {
    mutate(
      () => editSlide(doc.project.source, doc.active, patch),
      `field:${doc.active}:${Object.keys(patch).sort().join(",")}`,
    );
  }
  function layout(value: Layout) {
    mutate(() => setSlideLayout(doc.project.source, doc.active, value));
  }
  function theme(value: ThemeOptions) {
    mutate(() => replaceTheme(doc.project.source, value), "theme");
  }
  function add() {
    mutate(
      () => addSlideSource(doc.project.source, doc.active),
      undefined,
      pageGroup(doc.deck, doc.active).last + 1,
    );
  }
  function duplicate() {
    mutate(
      () => duplicateSlideSource(doc.project.source, doc.active),
      undefined,
      pageGroup(doc.deck, doc.active).last + 1,
    );
  }
  function remove() {
    mutate(
      () => deleteSlideSource(doc.project.source, doc.active),
      undefined,
      Math.max(0, pageGroup(doc.deck, doc.active).first - 1),
    );
  }
  function move(direction: -1 | 1) {
    mutate(
      () => moveSlideSource(doc.project.source, doc.active, direction),
      undefined,
      groupMoveTarget(doc.deck, doc.active, direction),
    );
  }
  function text(source: string, independent = false) {
    if (doc.ready && !locked.current)
      doc.source(source, independent ? undefined : "dsl");
  }
  function undo() {
    if (!locked.current) doc.undo();
  }
  function redo() {
    if (!locked.current) doc.redo();
  }
  function insertImage(path: string) {
    mutate(() =>
      appendSlideBlocks(doc.project.source, doc.active, [
        `Image(${JSON.stringify(path)})`,
      ]),
    );
  }
  function template(deck: Deck | Project) {
    if (!doc.ready || locked.current) return;
    doc.commit(
      "format" in deck
        ? validatePortableProject(deck)
        : {
            format: "easy-slide",
            version: 1,
            source: serialize(deck),
            assets: exampleAssetsFor(deck),
          },
      undefined,
      0,
    );
    setFolder(null);
    setFolderVersion(null);
    notify("已打开模板，可撤销恢复原工程", "success", true);
  }
  async function save(asNew = false) {
    if (current.current.error) {
      notify("请先修复 DSL，或导出纯文本保留草稿", "error");
      return;
    }
    const snapshot = current.current.project;
    await run("正在保存工程…", async () => {
      if (folder && !asNew) await ensureFolderWritePermission(folder);
      const existing = folder ? await projectFilename(folder) : null;
      if (asNew || !existing) {
        const title =
          current.current.deck.title
            .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
            .slice(0, 60) || "未命名";
        setSaveRequest({
          project: snapshot,
          folder,
          name: existing || projectFileName(title),
          asNew,
        });
        return;
      }
      const filename = await writeFolder(folder!, snapshot);
      setFolderVersion(snapshot);
      try {
        await current.current.persist();
      } catch {
        /* Draft status retains its own error. */
      }
      notify(`工程已保存到 ${folder!.name}/${filename}`);
    });
  }
  async function confirmSave(name: string, chooseOther = false) {
    const request = saveRequest;
    if (!request) return false;
    return run("正在保存项目文件…", async () => {
      const filename = projectFileName(name);
      if (current.current.project !== request.project)
        throw Error("工程已变更，请关闭保存窗口后重试");
      const dir = (!chooseOther && request.folder) || (await chooseFolder());
      await ensureFolderWritePermission(dir);
      await writeFolder(dir, request.project, filename);
      setLocationVersion((version) => version + 1);
      setFolder(dir);
      setFolderVersion(request.project);
      try {
        await current.current.persist();
      } catch {
        /* Draft status retains its own error. */
      }
      setSaveRequest(null);
      notify(`工程已保存到 ${dir.name}/${filename}`);
    });
  }

  async function archive() {
    if (current.current.error) return false;
    const snapshot = current.current.project,
      title = current.current.deck.title;
    return run("正在打包工程…", async () => {
      download(await exportProjectArchive(snapshot), projectArchiveName(title));
      notify("已导出工程 ZIP");
    });
  }
  async function pptx(textMode: "faithful" | "editable") {
    if (current.current.error) return false;
    const { deck, project } = current.current;
    return run("正在准备 PPTX…", async () => {
      const { exportPptx } = await import("../export");
      await exportPptx(deck, project.assets, {
        textMode,
        onProgress: (page, total) =>
          setOperation(`正在导出 PPTX · ${page}/${total}`),
      });
      notify("PPTX 已导出");
    });
  }
  function sourceFile() {
    download(
      new Blob([current.current.project.source], { type: "text/plain" }),
      "slides.slide",
    );
  }
  async function openFolder() {
    await run("正在读取文件夹…", async () => {
      const dir = await chooseFolder(),
        project = await folderProject(dir);
      // A packaged project already owns its complete asset manifest. Do not scan
      // unrelated folders or accidentally attach thousands of extra files.
      if (project) {
        doc.commit(project, undefined, 0);
        setFolderVersion(project);
      } else {
        const images = await folderImages(dir),
          latest = current.current.project;
        const next = { ...latest, assets: { ...latest.assets, ...images } };
        validateEditableProject(next);
        doc.commit(next);
        setFolderVersion(null);
      }
      setFolder(dir);
      notify(
        project
          ? "已打开工程 · " + dir.name
          : "已连接文件夹，保存工程将写入当前内容",
        "success",
        !!project,
      );
    });
  }
  async function importFile(file?: File) {
    if (!file) return;
    await run("正在导入工程…", async () => {
      if (file.size > MAX_ARCHIVE_BYTES) throw Error("工程文件超过 256 MB");
      let project;
      if (/\.(zip|easy-slide)$/i.test(file.name))
        project = await importProjectArchive(await file.arrayBuffer());
      else if (/\.(slide|swift)$/i.test(file.name)) {
        if (file.size > 2 * 1024 * 1024) throw Error("DSL 源码最多 2 MB");
        const source = await file.text();
        // A text import keeps current images so matching relative paths still work.
        parseDeck(source);
        project = { ...current.current.project, source };
      } else project = validatePortableProject(JSON.parse(await file.text()));
      doc.commit(project, undefined, 0);
      setFolder(null);
      setFolderVersion(null);
      notify(
        /\.(slide|swift)$/i.test(file.name)
          ? "已导入 DSL，图片可从素材面板添加"
          : "工程已导入，可撤销恢复原工程",
        "success",
        true,
      );
    });
  }
  async function addImages(files: File[], insert = true, target?: SceneTarget) {
    if (!files.length) return;
    if (!editable || locked.current) {
      notify("请先完成当前操作并修复 DSL 再添加图片", "error");
      return;
    }
    const snapshot = doc.project,
      page = target?.page ?? doc.active;
    await run("正在添加图片…", async () => {
      const added: Record<string, string> = {};
      for (const file of files) {
        if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type))
          throw Error("支持 PNG / JPG / WebP / GIF 图片");
        if (file.size > MAX_IMAGE_BYTES) throw Error("每张图片请小于 20 MB");
        const name =
          file.name.replace(/[\\/\u0000-\u001f]/g, "_") || "image.png";
        added[`assets/${crypto.randomUUID().slice(0, 8)}-${name}`] =
          await readData(file);
      }
      const project = addImageAssets(snapshot, added, page, insert, target);
      doc.commit(project, undefined, page);
      notify(`已添加 ${files.length} 张图片`, "success", true);
    });
  }
  function contextCommit(
    expected: typeof doc.project,
    next: typeof doc.project,
    page = doc.active,
  ) {
    if (!editable || locked.current) return false;
    if (
      expected.source !== current.current.project.source ||
      expected.assets !== current.current.project.assets ||
      expected.imageDocuments !== current.current.project.imageDocuments
    ) {
      notify("工程已变更，请重新打开菜单后操作", "error");
      return false;
    }
    try {
      parseDeck(next.source);
      if (
        next.assets !== expected.assets ||
        next.imageDocuments !== expected.imageDocuments
      )
        validateEditableProject(next);
      doc.commit(next, undefined, page);
      return true;
    } catch (problem) {
      notify(
        problem instanceof Error ? problem.message : String(problem),
        "error",
      );
      return false;
    }
  }
  return {
    ...doc,
    contextCommit,
    busy,
    editable,
    operation,
    notice,
    dismissNotice: () => setNotice(null),
    notify,
    folder,
    folderDirty:
      !!folder &&
      (folderVersion?.source !== doc.project.source ||
        folderVersion?.assets !== doc.project.assets ||
        folderVersion?.imageDocuments !== doc.project.imageDocuments),
    field,
    layout,
    theme,
    add,
    duplicate,
    remove,
    move,
    text,
    undo,
    redo,
    insertImage,
    template,
    save,
    saveAs: () => save(true),
    saveRequest,
    confirmSave,
    cancelSave: () => setSaveRequest(null),
    archive,
    pptx,
    sourceFile,
    openFolder,
    importFile,
    addImages,
    rename: (title: string) =>
      mutate(() => renameDeck(doc.project.source, title), "deck-title"),
    format: () => mutate(() => formatSource(doc.project.source)),
  };
}
export type Studio = ReturnType<typeof useStudio>;
