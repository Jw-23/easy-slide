import { it, expect, vi } from "vitest";
import {
  transformText,
  textBounds,
  renderImage,
  type TextEdit,
} from "../src/image-edit";
import {
  validatePortableProject,
  exportProjectArchive,
  importProjectArchive,
} from "../src/project-archive";
import { renameImage } from "../src/studio/image-actions";
import type { Project } from "../src/dsl";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=";
const text: TextEdit = {
  kind: "text",
  point: { x: 20, y: 30 },
  text: "结果\nValue",
  color: "#ff0000",
  size: 20,
  font: "Georgia, serif",
  rotation: 10,
};
function project(): Project {
  return {
    format: "easy-slide",
    version: 1,
    source: 'Deck("D") Slide(title:"S"){Image("assets/result.png")}',
    assets: {
      "assets/result.png": png,
      "assets/.image-original/original.png": png,
    },
    imageDocuments: {
      "assets/result.png": {
        originalPath: "assets/.image-original/original.png",
        edits: [text],
        crop: { x: 5, y: 6, w: 50, h: 40 },
      },
    },
  };
}
it("moves, uniformly scales and rotates text around its anchor without mutating history", () => {
  expect(
    transformText(text, { x: 25, y: 40 }, { x: 40, y: 60 }, "move").point,
  ).toEqual({ x: 35, y: 50 });
  expect(
    transformText(text, { x: 40, y: 30 }, { x: 60, y: 30 }, "scale").size,
  ).toBe(40);
  expect(
    transformText(text, { x: 40, y: 30 }, { x: 20, y: 50 }, "rotate").rotation,
  ).toBe(100);
  expect(
    transformText(text, { x: 20, y: 30 }, { x: 999999, y: 999999 }, "scale")
      .size,
  ).toBe(500);
  expect(text.point).toEqual({ x: 20, y: 30 });
  expect(text.rotation).toBe(10);
  expect(textBounds(text).h).toBe(52);
});
it("renders the same font, rotation and local line offsets as editable text objects", () => {
  const c = {
    canvas: { width: 100, height: 100 },
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillText: vi.fn(),
    font: "",
    textBaseline: "",
  };
  renderImage(
    c as unknown as CanvasRenderingContext2D,
    {} as HTMLImageElement,
    [text],
  );
  expect(c.font).toBe("20px Georgia, serif");
  expect(c.translate).toHaveBeenCalledWith(20, 30);
  expect(c.rotate).toHaveBeenCalledWith((10 * Math.PI) / 180);
  expect(c.fillText.mock.calls).toEqual([
    ["结果", 0, 0],
    ["Value", 0, 26],
  ]);
});
it("keeps original pixels, editable layers and crop through ZIP and asset renaming", async () => {
  const p = project(),
    next = renameImage(p, "assets/result.png", "renamed.png");
  expect(next.imageDocuments?.["assets/renamed.png"].edits[0]).toEqual(text);
  expect(next.imageDocuments?.["assets/result.png"]).toBeUndefined();
  const blob = await exportProjectArchive(next),
    imported = await importProjectArchive(
      new Uint8Array(await blob.arrayBuffer()),
    );
  expect(imported).toEqual(next);
  expect(
    imported.assets[
      imported.imageDocuments!["assets/renamed.png"].originalPath
    ],
  ).toBe(png);
});
it("rejects missing originals and malformed layer transforms before changing a project", () => {
  const p = project();
  delete p.assets["assets/.image-original/original.png"];
  expect(() => validatePortableProject(p)).toThrow(/图层引用/);
  const bad = project();
  (bad.imageDocuments!["assets/result.png"].edits[0] as TextEdit).rotation =
    Infinity;
  expect(() => validatePortableProject(bad)).toThrow(/文字图层/);
  const badCrop = project();
  badCrop.imageDocuments!["assets/result.png"].crop = {
    x: 0,
    y: 0,
    w: -1,
    h: 10,
  };
  expect(() => validatePortableProject(badCrop)).toThrow(/裁剪/);
});
