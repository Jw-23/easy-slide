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
