import { it, expect, vi } from "vitest";
import { folderImages, type FolderHandle } from "../src/storage";
it("maps an existing assets directory without duplicating the assets prefix", async () => {
  vi.stubGlobal(
    "FileReader",
    class {
      result = "data:image/png;base64,AA==";
      onload?: () => void;
      readAsDataURL() {
        this.onload?.();
      }
    },
  );
  const file = {
    kind: "file",
    name: "plot.png",
    getFile: async () => ({ size: 1 }),
  };
  const nested = {
    kind: "directory",
    name: "assets",
    async *values() {
      yield file;
    },
  };
  const dir = {
    async *values() {
      yield nested;
    },
  };
  const result = await folderImages(dir as unknown as FolderHandle);
  expect(Object.keys(result)).toEqual(["assets/plot.png"]);
  vi.unstubAllGlobals();
});
it("stops a folder image scan at its aggregate limit before decoding excess files", async () => {
  let decoded = 0;
  vi.stubGlobal(
    "FileReader",
    class {
      result = "data:image/png;base64,AA==";
      onload?: () => void;
      readAsDataURL() {
        decoded++;
        this.onload?.();
      }
    },
  );
  const dir = {
    async *values() {
      for (let i = 0; i < 11; i++)
        yield {
          kind: "file",
          name: `${i}.png`,
          getFile: async () => ({ size: 20 * 1024 * 1024 }),
        };
    },
  };
  try {
    await expect(folderImages(dir as unknown as FolderHandle)).rejects.toThrow(
      "总量超过 200 MB",
    );
    expect(decoded).toBe(10);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("aborts a failed folder write so its temporary file does not remain open", async () => {
  const { writeFolder } = await import("../src/storage");
  const abort = vi.fn(async () => {}),
    close = vi.fn(async () => {});
  const writer = {
    write: async () => {
      throw Error("磁盘空间不足");
    },
    abort,
    close,
  };
  const dir = {
    getFileHandle: async () => ({ createWritable: async () => writer }),
  };
  await expect(
    writeFolder(dir as unknown as FolderHandle, {
      format: "easy-slide",
      version: 1,
      source: 'Deck("A") Slide(title:"B") {}',
      assets: {},
    }),
  ).rejects.toThrow("磁盘空间不足");
  expect(abort).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
});
