import { get, set } from "idb-keyval";
import { validateProject, type Project } from "./dsl";
export const loadDraft = (key = "draft") => get<Project>(key);
export const saveDraft = (p: Project, key = "draft") => set(key, p);
export type FolderHandle = {
  name: string;
  getFileHandle: (
    name: string,
    opts?: { create?: boolean },
  ) => Promise<FileHandle>;
  getDirectoryHandle: (
    name: string,
    opts?: { create?: boolean },
  ) => Promise<FolderHandle>;
  values: () => AsyncIterableIterator<FileHandle & FolderHandle>;
};
type FileHandle = {
  kind: string;
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{
    write: (data: string | Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};
export async function chooseFolder(): Promise<FolderHandle> {
  const w = window as unknown as {
    showDirectoryPicker?: () => Promise<FolderHandle>;
  };
  if (!w.showDirectoryPicker)
    throw Error(
      "此浏览器不支持直接读写文件夹，请使用 Chrome / Edge，或导入导出工程文件。",
    );
  return w.showDirectoryPicker();
}
export const readData = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
export async function folderProject(
  dir: FolderHandle,
): Promise<Project | null> {
  try {
    const f = await dir.getFileHandle("project.easy-slide.json");
    return validateProject(JSON.parse(await (await f.getFile()).text()));
  } catch (e) {
    if ((e as DOMException).name === "NotFoundError") return null;
    throw e;
  }
}
export async function folderImages(
  dir: FolderHandle,
  prefix = "",
  depth = 0,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (depth > 5) return result;
  for await (const entry of dir.values()) {
    if (entry.kind === "directory") {
      if (!entry.name.startsWith(".") && entry.name !== "node_modules")
        Object.assign(
          result,
          await folderImages(entry, prefix + entry.name + "/", depth + 1),
        );
    } else if (/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) {
      const f = await entry.getFile();
      if (f.size <= 20 * 1024 * 1024) {
        const relative = prefix + entry.name;
        result[
          relative.startsWith("assets/") ? relative : "assets/" + relative
        ] = await readData(f);
      }
    }
  }
  return result;
}
export async function writeFolder(dir: FolderHandle, p: Project) {
  const file = await dir.getFileHandle("project.easy-slide.json", {
    create: true,
  });
  const writer = await file.createWritable();
  await writer.write(JSON.stringify(p, null, 2));
  await writer.close();
  const dsl = await dir.getFileHandle("slides.slide", { create: true });
  const w = await dsl.createWritable();
  await w.write(p.source);
  await w.close();
}
