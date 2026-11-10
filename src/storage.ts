import { get, set } from "idb-keyval";
import type { Project } from "./dsl";
import {
  ARCHIVE_FILE,
  LEGACY_ARCHIVE_FILE,
  MAX_ARCHIVE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PROJECT_BYTES,
  MAX_ASSET_COUNT,
  MANIFEST_FILE,
  exportProjectArchive,
  importProjectArchive,
  readProjectManifest,
  validatePortableProject,
} from "./project-archive";
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
    abort?: () => Promise<void>;
  }>;
};
export async function chooseFolder(): Promise<FolderHandle> {
  const w = window as unknown as {
    showDirectoryPicker?: (options?: {
      mode: "readwrite";
    }) => Promise<FolderHandle>;
  };
  if (!w.showDirectoryPicker)
    throw Error(
      "此浏览器不支持直接读写文件夹，请使用 Chrome / Edge，或导入导出工程文件。",
    );
  return w.showDirectoryPicker({ mode: "readwrite" });
}
export const readData = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || Error(`无法读取图片：${file.name}`));
    r.onabort = () => reject(new DOMException("图片读取已取消", "AbortError"));
    r.readAsDataURL(file);
  });
const projectFiles = new WeakMap<FolderHandle, string>();
export async function projectFilename(
  dir: FolderHandle,
): Promise<string | null> {
  const known = projectFiles.get(dir);
  if (known) return known;
  for (const name of [ARCHIVE_FILE, LEGACY_ARCHIVE_FILE]) {
    try {
      await dir.getFileHandle(name);
      return name;
    } catch (e) {
      if ((e as Error).name !== "NotFoundError") throw e;
    }
  }
  const candidates: string[] = [];
  for await (const entry of dir.values())
    if (entry.kind === "file" && /\.easy-slide(?:\.zip)?$/i.test(entry.name))
      candidates.push(entry.name);
  if (candidates.length > 1)
    throw Error("文件夹中有多个项目压缩文件，请为每个工程使用单独的文件夹");
  return candidates[0] || null;
}
export async function folderProject(
  dir: FolderHandle,
): Promise<Project | null> {
  const filename = await projectFilename(dir);
  if (filename) {
    const file = await (await dir.getFileHandle(filename)).getFile();
    if (file.size > MAX_ARCHIVE_BYTES) throw Error("工程压缩包超过 256 MB");
    const project = await importProjectArchive(await file.arrayBuffer());
    projectFiles.set(dir, filename);
    return project;
  }
  let file: File;
  try {
    file = await (await dir.getFileHandle(MANIFEST_FILE)).getFile();
  } catch (e) {
    if ((e as DOMException).name === "NotFoundError") return null;
    throw e;
  }
  if (file.size > 280 * 1024 * 1024) throw Error("工程清单过大");
  const manifest = JSON.parse(await file.text());
  if (manifest?.format === "easy-slide")
    return validatePortableProject(manifest);
  return readProjectManifest(manifest, async (path, limit) => {
    const parts = path.split("/");
    let current = dir;
    let asset: File;
    try {
      for (const part of parts.slice(0, -1))
        current = await current.getDirectoryHandle(part);
      asset = await (
        await current.getFileHandle(parts[parts.length - 1])
      ).getFile();
    } catch (e) {
      if ((e as Error).name === "NotFoundError")
        throw Error(`工程文件夹缺少文件：${path}`);
      throw e;
    }
    if (asset.size > limit) throw Error(`文件过大：${path}`);
    return new Uint8Array(await asset.arrayBuffer());
  });
}
export async function folderImages(
  dir: FolderHandle,
  prefix = "",
  depth = 0,
  budget = { count: 0, bytes: 0 },
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (depth > 5) return result;
  for await (const entry of dir.values()) {
    if (entry.kind === "directory") {
      if (!entry.name.startsWith(".") && entry.name !== "node_modules")
        Object.assign(
          result,
          await folderImages(
            entry,
            prefix + entry.name + "/",
            depth + 1,
            budget,
          ),
        );
    } else if (/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) {
      const f = await entry.getFile();
      if (f.size <= MAX_IMAGE_BYTES) {
        if (++budget.count > MAX_ASSET_COUNT)
          throw Error(`文件夹最多导入 ${MAX_ASSET_COUNT} 张图片`);
        budget.bytes += f.size;
        if (budget.bytes > MAX_PROJECT_BYTES)
          throw Error("文件夹图片总量超过 200 MB");
        const relative = prefix + entry.name;
        result[
          relative.startsWith("assets/") ? relative : "assets/" + relative
        ] = await readData(f);
      }
    }
  }
  return result;
}
export function projectFileName(name: string) {
  name = name.trim();
  if (
    !name ||
    name.length > 180 ||
    /[\\/:*?"<>|\x00-\x1f]/.test(name) ||
    name === "." ||
    name === ".."
  )
    throw Error("请输入有效文件名，不含路径或特殊字符");
  name = name.replace(/\.easy-slide(?:\.zip)?$/i, "");
  if (!name || name === "." || name === "..") throw Error("请输入项目文件名称");
  const filename = name + ".easy-slide";
  if (new TextEncoder().encode(filename).byteLength > 240)
    throw Error("文件名过长，请缩短名称");
  return filename;
}
export async function writeFolder(
  dir: FolderHandle,
  p: Project,
  name?: string,
) {
  const filename =
    name !== undefined
      ? projectFileName(name)
      : (await projectFilename(dir)) || ARCHIVE_FILE;
  const archive = await exportProjectArchive(p);
  const file = await dir.getFileHandle(filename, {
    create: true,
  });
  const writer = await file.createWritable();
  try {
    await writer.write(archive);
    await writer.close();
    projectFiles.set(dir, filename);
    return filename;
  } catch (error) {
    try {
      await writer.abort?.();
    } catch {
      /* Preserve the original write failure. */
    }
    throw error;
  }
}
