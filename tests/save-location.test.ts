import { beforeEach, expect, it, vi } from "vitest";
const records = vi.hoisted(() => new Map<string, unknown>());
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => records.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    records.set(key, value);
  }),
}));
beforeEach(() => {
  records.clear();
  vi.resetModules();
});
it("restores a named save target after reload even with multiple files in the folder", async () => {
  const name = "我的证明.easy-slide";
  const folder = { name: "数学", getFileHandle: vi.fn(), values: vi.fn() };
  records.set("draft:save-location", { folder, filename: name });
  const storage = await import("../src/storage");
  const restored = await storage.loadProjectLocation();
  expect(await storage.projectFilename(restored!)).toBe(name);
  await storage.saveProjectLocation(restored);
  expect(records.get("draft:save-location")).toEqual({
    folder,
    filename: name,
  });
  expect(folder.values).not.toHaveBeenCalled();
});
it("clears the previous save target for a new project and isolates feature-tour drafts", async () => {
  records.set("tour:save-location", { filename: "tour.easy-slide" });
  const { saveProjectLocation, loadProjectLocation } =
    await import("../src/storage");
  await saveProjectLocation(null);
  expect(await loadProjectLocation()).toBeNull();
  expect(records.get("tour:save-location")).toEqual({
    filename: "tour.easy-slide",
  });
});
it("requests existing folder permission without asking the user to rename the project", async () => {
  const { ensureFolderWritePermission } = await import("../src/storage");
  const folder = {
    queryPermission: vi.fn(async () => "prompt"),
    requestPermission: vi.fn(async () => "granted"),
  };
  await ensureFolderWritePermission(folder as never);
  expect(folder.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
  folder.requestPermission.mockResolvedValue("denied");
  await expect(ensureFolderWritePermission(folder as never)).rejects.toThrow(
    /权限/,
  );
  folder.queryPermission.mockResolvedValue("granted");
  folder.requestPermission.mockClear();
  await ensureFolderWritePermission(folder as never);
  expect(folder.requestPermission).not.toHaveBeenCalled();
});
