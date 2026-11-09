import { afterEach, expect, it, vi } from "vitest";
import { StudioClipboard } from "../src/studio/clipboard";
import type { ComponentClip } from "../src/studio/component-clipboard";
afterEach(() => vi.unstubAllGlobals());
it("keeps component metadata only while system text still matches the copied component", async () => {
  let system = "";
  const clip: ComponentClip = {
    text: 'Text("A")',
    block: { type: "text", text: "A" },
    assets: {},
    bindings: [],
    images: [],
    snapshotOnly: false,
  };
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: async (text: string) => {
        system = text;
      },
      read: async () => {
        throw Error("unsupported");
      },
      readText: async () => system,
    },
  });
  const clipboard = new StudioClipboard();
  expect(await clipboard.write(clip.text, clip)).toBe(true);
  expect((await clipboard.read()).component).toBe(clip);
  system = "external text";
  expect(await clipboard.read()).toEqual({ text: "external text" });
  system = "";
  expect(await clipboard.read()).toEqual({ text: "" });
});
it("uses the application clipboard when read permission is denied and reports no clipboard otherwise", async () => {
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: async () => {},
      read: async () => {
        throw Error("denied");
      },
      readText: async () => {
        throw Error("denied");
      },
    },
  });
  const clipboard = new StudioClipboard();
  await expect(clipboard.read()).rejects.toThrow("Ctrl / ⌘ + V");
  await clipboard.write("local");
  expect(await clipboard.read()).toEqual({
    text: "local",
    component: undefined,
    local: true,
  });
});
it("reads clipboard images as original binary files", async () => {
  const data = new Blob(["image"], { type: "image/png" });
  vi.stubGlobal("navigator", {
    clipboard: {
      read: async () => [{ types: ["image/png"], getType: async () => data }],
    },
  });
  const result = await new StudioClipboard().read();
  expect(result.files).toHaveLength(1);
  expect(result.files![0].type).toBe("image/png");
  expect(await result.files![0].text()).toBe("image");
});
