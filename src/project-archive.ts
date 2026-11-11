import JSZip from "jszip";
import { parseDeck, validateProject, type Block, type Project } from "./dsl";

export const ARCHIVE_FILE = "project.easy-slide";
export const LEGACY_ARCHIVE_FILE = "project.easy-slide.zip";
export const MANIFEST_FILE = "project.easy-slide.json";
export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const SOURCE_FILE = "slides.slide";
const MAX_SOURCE = 2_000_000;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 200 * 1024 * 1024;
export const MAX_ASSET_COUNT = 1000;
const MAX_MANIFEST = 8 * 1024 * 1024;
const imageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
type Manifest = {
  format: "easy-slide-archive";
  version: 1;
  source: string;
  assets: Record<string, { file: string; mime: string }>;
  imageDocuments?: Project["imageDocuments"];
};
export type ProjectFileReader = (
  path: string,
  limit: number,
) => Promise<Uint8Array>;
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });

function relativePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 1024 &&
    path.split("/").length <= 32 &&
    !/[\\:\x00-\x1f]/.test(path) &&
    path
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== "..")
  );
}
function assetPath(path: unknown): path is string {
  return relativePath(path) && path.startsWith("assets/");
}
function parseJson(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw Error(`${name} 不是有效的 UTF-8 JSON 文件`);
  }
}
function validateAssetPath(path: string) {
  if (!assetPath(path)) throw Error(`素材路径无效：${path}`);
}

/** Validate editable content; image references may still be waiting for import. */
export function validateEditableProject(input: unknown): Project {
  const project = validateProject(input),
    keys = Object.keys(project.assets);
  if (encoder.encode(project.source).byteLength > MAX_SOURCE)
    throw Error("DSL 源码最多 2 MB");
  if (keys.length > MAX_ASSET_COUNT)
    throw Error(`工程最多包含 ${MAX_ASSET_COUNT} 个素材`);
  let total = encoder.encode(project.source).byteLength;
  for (const key of keys) {
    validateAssetPath(key);
    const { bytes } = decodeImage(project.assets[key], key);
    total += bytes.byteLength;
    if (total > MAX_PROJECT_BYTES) throw Error("工程内容超过 200 MB");
  }
  return project;
}

/** Archives must contain every referenced image, including those in nested layouts. */
export function validatePortableProject(input: unknown): Project {
  const project = validateEditableProject(input);
  const blocks = parseDeck(project.source).slides.flatMap(
    (slide) => slide.blocks,
  );
  while (blocks.length) {
    const block: Block = blocks.pop()!;
    if (block.src && !Object.hasOwn(project.assets, block.src))
      throw Error(`缺少工程素材：${block.src}`);
    if (block.children) blocks.push(...block.children);
  }
  return project;
}
function decodeImage(data: string, path: string) {
  const match = data.match(
    /^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]*)$/,
  );
  if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
    throw Error(`图片无效或超过 20 MB：${path}`);
  let raw: string;
  try {
    raw = atob(match[2]);
  } catch {
    throw Error(`图片编码无效：${path}`);
  }
  if (!raw.length || raw.length > MAX_IMAGE_BYTES)
    throw Error(`图片无效或超过 20 MB：${path}`);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return { mime: match[1], bytes };
}
function imageData(bytes: Uint8Array, mime: string) {
  // Keep argument lists bounded for large images; spread on a whole image can overflow the stack.
  let raw = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:${mime};base64,${btoa(raw)}`;
}
export async function exportProjectArchive(input: Project): Promise<Blob> {
  const project = validatePortableProject(input),
    zip = new JSZip();
  const manifest: Manifest = {
    format: "easy-slide-archive",
    version: 1,
    source: SOURCE_FILE,
    assets: Object.create(null),
    ...(project.imageDocuments
      ? { imageDocuments: project.imageDocuments }
      : {}),
  };
  zip.file(SOURCE_FILE, project.source);
  for (const [path, data] of Object.entries(project.assets)) {
    const { bytes, mime } = decodeImage(data, path);
    manifest.assets[path] = { file: path, mime };
    // Images already have compression; store their exact bytes without recompressing them.
    zip.file(path, bytes, { compression: "STORE", createFolders: false });
  }
  const manifestJson = JSON.stringify(manifest, null, 2);
  if (encoder.encode(manifestJson).byteLength > MAX_MANIFEST)
    throw Error("图片编辑图层或工程清单过大，请减少图层后导出");
  zip.file(MANIFEST_FILE, manifestJson);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
export function projectArchiveName(title: string) {
  return (
    (title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim() || "未命名") +
    ".easy-slide.zip"
  );
}

/** Shared by ZIP import and importing an extracted project directory. */
export async function readProjectManifest(
  input: unknown,
  read: ProjectFileReader,
): Promise<Project> {
  const value = input as Partial<Manifest>;
  if (
    !value ||
    value.format !== "easy-slide-archive" ||
    value.version !== 1 ||
    !relativePath(value.source) ||
    !value.assets ||
    typeof value.assets !== "object" ||
    Array.isArray(value.assets)
  )
    throw Error("不是支持的 Easy Slide 工程清单");
  const entries = Object.entries(value.assets);
  if (entries.length > MAX_ASSET_COUNT)
    throw Error(`工程最多包含 ${MAX_ASSET_COUNT} 个素材`);
  const descriptors = entries.map(([path, asset]) => {
    validateAssetPath(path);
    if (!asset || !assetPath(asset.file) || !imageTypes.has(asset.mime))
      throw Error(`工程素材配置无效：${path}`);
    return { path, file: asset.file, mime: asset.mime };
  });
  const sourceBytes = await read(value.source, MAX_SOURCE);
  let source: string;
  try {
    source = decoder.decode(sourceBytes);
  } catch {
    throw Error("DSL 源码不是有效的 UTF-8 文件");
  }
  const assets: Record<string, string> = Object.create(null);
  let total = sourceBytes.length;
  for (const { path, file, mime } of descriptors) {
    const bytes = await read(file, MAX_IMAGE_BYTES);
    if (!bytes.length) throw Error(`图片文件为空：${file}`);
    total += bytes.length;
    if (total > MAX_PROJECT_BYTES) throw Error("工程内容超过 200 MB");
    assets[path] = imageData(bytes, mime);
  }
  return validatePortableProject({
    format: "easy-slide",
    version: 1,
    source,
    assets,
    ...(value.imageDocuments ? { imageDocuments: value.imageDocuments } : {}),
  });
}
function readEntry(
  entry: JSZip.JSZipObject,
  limit: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let size = 0,
      failed = false;
    const chunks: Uint8Array[] = [];
    // JSZip 3 exposes this streaming API at runtime but omits it from JSZipObject's typings.
    const stream = (
      entry as JSZip.JSZipObject & {
        internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
      }
    ).internalStream("uint8array");
    stream.on("data", (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        stream.pause();
        reject(Error(`文件过大：${entry.name}`));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("error", (error) => {
      failed = true;
      reject(Error(`文件读取失败：${entry.name}（${error.message}）`));
    });
    stream.on("end", () => {
      if (failed) return;
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(bytes);
    });
    stream.resume();
  });
}
export async function importProjectArchive(
  input: ArrayBuffer | Uint8Array,
): Promise<Project> {
  if (input.byteLength > MAX_ARCHIVE_BYTES)
    throw Error("工程压缩包超过 256 MB");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input);
  } catch {
    throw Error("无法打开工程压缩包，请选择有效的 Easy Slide ZIP 文件");
  }
  const files = Object.values(zip.files);
  if (files.length > MAX_ASSET_COUNT * 32 + 10) throw Error("压缩包内文件过多");
  for (const entry of files) {
    const original =
      (entry as JSZip.JSZipObject & { unsafeOriginalName?: string })
        .unsafeOriginalName ?? entry.name;
    if (
      !relativePath(entry.dir ? original.replace(/\/$/, "") : original) ||
      original !== entry.name
    )
      throw Error(`压缩包内路径无效：${original}`);
  }
  const read: ProjectFileReader = async (path, limit) => {
    const entry = zip.file(path);
    if (!entry) throw Error(`工程压缩包缺少文件：${path}`);
    return readEntry(entry, limit);
  };
  const manifest = parseJson(
    await read(MANIFEST_FILE, MAX_MANIFEST),
    MANIFEST_FILE,
  );
  // Also accept ZIPs containing a legacy, self-contained JSON project at the root.
  if ((manifest as Project)?.format === "easy-slide")
    return validatePortableProject(manifest);
  return readProjectManifest(manifest, read);
}
