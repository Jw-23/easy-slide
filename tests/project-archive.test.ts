import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  exportProjectArchive,
  importProjectArchive,
  projectArchiveName,
  MANIFEST_FILE,
  ARCHIVE_FILE,
  LEGACY_ARCHIVE_FILE,
} from "../src/project-archive";
import { folderProject, writeFolder, type FolderHandle } from "../src/storage";
import type { Project } from "../src/dsl";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=";
const source = `// 保留注释与计算源码\nlet picture="assets/图 表/收敛.png"\nlet rows=range(3).map(k=>[k,k*k])\nDeck("工程",author:"作者").transition(.slide)\nTheme(material:.glass)\nSlide(title:"数据"){VStack{Image(picture).appear(.rise,step:1) Table(rows:rows)}}.notes("备注")`;
const project: Project = {
  format: "easy-slide",
  version: 1,
  source,
  assets: { "assets/图 表/收敛.png": png, "assets/未使用的图片.png": png },
};
async function bytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}
async function fixtureZip() {
  return JSZip.loadAsync(await bytes(await exportProjectArchive(project)));
}
async function encoded(zip: JSZip) {
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

describe("portable project ZIP", () => {
  it("stores the exact source and every original image, including unused and nested Unicode paths", async () => {
    const archive = await exportProjectArchive(project),
      buffer = await bytes(archive),
      zip = await JSZip.loadAsync(buffer);
    expect(archive.type).toBe("application/zip");
    expect(await zip.file("slides.slide")!.async("string")).toBe(source);
    const manifest = JSON.parse(await zip.file(MANIFEST_FILE)!.async("string"));
    expect(manifest).toMatchObject({
      format: "easy-slide-archive",
      version: 1,
      source: "slides.slide",
    });
    expect(Object.keys(manifest.assets)).toEqual(Object.keys(project.assets));
    expect(JSON.stringify(manifest)).not.toContain("data:image");
    expect(Object.values(zip.files).every((entry) => !entry.dir)).toBe(true);
    for (const [path, data] of Object.entries(project.assets))
      expect(await zip.file(path)!.async("base64")).toBe(data.split(",")[1]);
    expect(await importProjectArchive(buffer)).toEqual(project);
  });
  it("retains MIME types and byte content rather than relying on filename extensions", async () => {
    const p: Project = {
      format: "easy-slide",
      version: 1,
      source: 'Deck("x")\nSlide(title:"y"){Text("z")}',
      assets: {},
    };
    for (const mime of ["png", "jpeg", "webp", "gif"])
      p.assets[`assets/${mime}.bin`] = `data:image/${mime};base64,AAH+/w==`;
    expect(
      await importProjectArchive(await bytes(await exportProjectArchive(p))),
    ).toEqual(p);
    expect(projectArchiveName('A/B:"C"')).toBe("A_B__C_.easy-slide.zip");
  });
  it("can import its own export with a large manifest of long Unicode asset names", async () => {
    const assets: Record<string, string> = {};
    for (let i = 0; i < 400; i++)
      assets[`assets/${"图".repeat(500)}-${i}.png`] = png;
    const p: Project = {
      format: "easy-slide",
      version: 1,
      source: 'Deck("x")\nSlide(title:"y"){Text("z")}',
      assets,
    };
    expect(
      await importProjectArchive(await bytes(await exportProjectArchive(p))),
    ).toEqual(p);
  });
  it("rejects an incomplete project instead of silently dropping an image", async () => {
    await expect(
      exportProjectArchive({ ...project, assets: {} }),
    ).rejects.toThrow("assets/图 表/收敛.png");
    const zip = await fixtureZip();
    zip.remove("assets/图 表/收敛.png");
    await expect(importProjectArchive(await encoded(zip))).rejects.toThrow(
      "缺少文件：assets/图 表/收敛.png",
    );
  });
  it("rejects missing source, unsupported formats and invalid ZIPs with actionable messages", async () => {
    const zip = await fixtureZip();
    zip.remove("slides.slide");
    await expect(importProjectArchive(await encoded(zip))).rejects.toThrow(
      "slides.slide",
    );
    const unsupported = await fixtureZip();
    unsupported.file(
      MANIFEST_FILE,
      JSON.stringify({
        format: "easy-slide-archive",
        version: 99,
        source: "slides.slide",
        assets: {},
      }),
    );
    await expect(
      importProjectArchive(await encoded(unsupported)),
    ).rejects.toThrow("工程清单");
    await expect(
      importProjectArchive(new Uint8Array([1, 2, 3])),
    ).rejects.toThrow("无法打开工程压缩包");
  });
  it("rejects unsafe paths before JSZip's path sanitization can hide them", async () => {
    const zip = await fixtureZip();
    zip.file("../escape.png", "bad");
    await expect(importProjectArchive(await encoded(zip))).rejects.toThrow(
      "路径无效",
    );
    await expect(
      exportProjectArchive({
        ...project,
        assets: { ...project.assets, "assets/../escape.png": png },
      }),
    ).rejects.toThrow("路径无效");
    const descriptor = await fixtureZip();
    descriptor.file(
      MANIFEST_FILE,
      JSON.stringify({
        format: "easy-slide-archive",
        version: 1,
        source: "slides.slide",
        assets: { "assets/x.png": { file: "../x.png", mime: "image/png" } },
      }),
    );
    await expect(
      importProjectArchive(await encoded(descriptor)),
    ).rejects.toThrow("素材配置无效");
  });
  it("bounds decompression before parsing large source files", async () => {
    const zip = await fixtureZip();
    zip.file("slides.slide", " ".repeat(2_000_001));
    await expect(importProjectArchive(await encoded(zip))).rejects.toThrow(
      "文件过大：slides.slide",
    );
  });
  it("preserves a legacy self-contained JSON project inside an archive", async () => {
    const zip = new JSZip();
    zip.file(MANIFEST_FILE, JSON.stringify(project));
    expect(await importProjectArchive(await encoded(zip))).toEqual(project);
  });
});

function directory(files: Map<string, Uint8Array>, prefix = ""): FolderHandle {
  const missing = () => new DOMException("Missing", "NotFoundError");
  return {
    name: prefix || "工程",
    async getFileHandle(name, options) {
      const path = prefix + name;
      if (!options?.create && !files.has(path)) throw missing();
      return {
        kind: "file",
        name,
        async getFile() {
          return new File([new Uint8Array(files.get(path)!)], name);
        },
        async createWritable() {
          return {
            async write(value) {
              files.set(
                path,
                typeof value === "string"
                  ? new TextEncoder().encode(value)
                  : new Uint8Array(await value.arrayBuffer()),
              );
            },
            async close() {},
          };
        },
      };
    },
    async getDirectoryHandle(name) {
      const next = prefix + name + "/";
      if (![...files.keys()].some((p) => p.startsWith(next))) throw missing();
      return directory(files, next);
    },
    async *values() {},
  };
}
describe("project directory interoperability", () => {
  it("saves a ZIP in the chosen folder and opens it ahead of a stale legacy file", async () => {
    const files = new Map<string, Uint8Array>();
    files.set(MANIFEST_FILE, new TextEncoder().encode('{"old":"file"}'));
    await writeFolder(directory(files), project);
    expect(files.has(ARCHIVE_FILE)).toBe(true);
    expect(await folderProject(directory(files))).toEqual(project);
    expect(new TextDecoder().decode(files.get(MANIFEST_FILE))).toBe(
      '{"old":"file"}',
    );
  });
  it("reads an extracted ZIP folder with source and nested original images", async () => {
    const zip = await fixtureZip(),
      files = new Map<string, Uint8Array>();
    for (const entry of Object.values(zip.files))
      if (!entry.dir) files.set(entry.name, await entry.async("uint8array"));
    expect(await folderProject(directory(files))).toEqual(project);
    files.delete("assets/图 表/收敛.png");
    await expect(folderProject(directory(files))).rejects.toThrow(
      "assets/图 表/收敛.png",
    );
  });
  it("still opens old JSON directories and treats an image-only folder as having no project", async () => {
    expect(
      await folderProject(
        directory(
          new Map([
            [MANIFEST_FILE, new TextEncoder().encode(JSON.stringify(project))],
          ]),
        ),
      ),
    ).toEqual(project);
    expect(await folderProject(directory(new Map()))).toBeNull();
  });
});

it("overwrites the same project package on repeated folder saves", async () => {
  const files = new Map<string, Uint8Array>(),
    dir = directory(files);
  expect(await writeFolder(dir, project)).toBe(ARCHIVE_FILE);
  const changed = {
    ...project,
    source: project.source.replace('Deck("工程"', 'Deck("更新后的工程"'),
  };
  await writeFolder(dir, changed);
  expect([...files.keys()]).toEqual([ARCHIVE_FILE]);
  expect(await folderProject(dir)).toEqual(changed);
});
it("writes back the opened legacy ZIP filename instead of creating a second package", async () => {
  const blob = await exportProjectArchive(project),
    files = new Map([
      [LEGACY_ARCHIVE_FILE, new Uint8Array(await blob.arrayBuffer())],
    ]),
    dir = directory(files);
  expect(await folderProject(dir)).toEqual(project);
  const changed = { ...project, source: project.source + "\n// Updated" };
  expect(await writeFolder(dir, changed)).toBe(LEGACY_ARCHIVE_FILE);
  expect([...files.keys()]).toEqual([LEGACY_ARCHIVE_FILE]);
  expect(await folderProject(dir)).toEqual(changed);
});
it("recognizes a uniquely named project and preserves that filename when saving", async () => {
  const blob = await exportProjectArchive(project),
    files = new Map([
      ["my-report.easy-slide", new Uint8Array(await blob.arrayBuffer())],
    ]),
    dir = directory(files);
  dir.values = async function* () {
    for (const name of files.keys())
      yield { ...dir, ...(await dir.getFileHandle(name)) };
  };
  expect(await folderProject(dir)).toEqual(project);
  expect(await writeFolder(dir, project)).toBe("my-report.easy-slide");
  expect(files.size).toBe(1);
});
it("aborts failed writes and preserves the previously opened package", async () => {
  const blob = await exportProjectArchive(project),
    old = new Uint8Array(await blob.arrayBuffer()),
    files = new Map([[ARCHIVE_FILE, old]]),
    dir = directory(files);
  await folderProject(dir);
  let aborted = false;
  const original = dir.getFileHandle;
  dir.getFileHandle = async (name, opts) => {
    const handle = await original(name, opts);
    return {
      ...handle,
      createWritable: async () => ({
        write: async () => {
          throw Error("disk full");
        },
        close: async () => {},
        abort: async () => {
          aborted = true;
        },
      }),
    };
  };
  await expect(writeFolder(dir, project)).rejects.toThrow("disk full");
  expect(aborted).toBe(true);
  expect(files.get(ARCHIVE_FILE)).toBe(old);
});
