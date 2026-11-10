import { describe, expect, it } from "vitest";
import { parseDeck, type Project } from "../src/dsl";
import { addImageAssets } from "../src/studio/image-import";
import { exportProjectArchive } from "../src/project-archive";
import type { SceneTarget } from "../src/studio/source-map";

const png = "data:image/png;base64,AAH+/w==";
const project: Project = {
  format: "easy-slide",
  version: 1,
  source:
    'Deck("D") Slide(title:"S"){VStack{Image("assets/pending.png") Text("保留内容")}}',
  assets: {},
};

describe("image import with unresolved references", () => {
  const cases: { name: string; target?: SceneTarget }[] = [
    { name: "global clipboard paste" },
    { name: "canvas paste", target: { scope: "slide", page: 0 } },
    {
      name: "nested context-menu paste",
      target: { scope: "block", page: 0, path: [0, 1] },
    },
  ];
  for (const { name, target } of cases) {
    it(`allows repeated ${name} without requiring unrelated images`, async () => {
      const first = addImageAssets(
        project,
        { "assets/first.png": png },
        0,
        true,
        target,
      );
      const next = addImageAssets(
        first,
        { "assets/second.png": png },
        0,
        true,
        target,
      );
      expect(next.assets).toEqual({
        "assets/first.png": png,
        "assets/second.png": png,
      });
      for (const path of ["pending", "first", "second"])
        expect(next.source).toContain(`Image("assets/${path}.png")`);
      expect(next.source).toContain('Text("保留内容")');
      expect(() => parseDeck(next.source)).not.toThrow();
      expect(project.assets).toEqual({});
      expect(project.source).not.toContain("first.png");
      await expect(exportProjectArchive(next)).rejects.toThrow(
        "assets/pending.png",
      );
      // Importing the pending asset makes the very same source portable again.
      const complete = addImageAssets(
        next,
        { "assets/pending.png": png },
        0,
        false,
      );
      await expect(exportProjectArchive(complete)).resolves.toBeInstanceOf(
        Blob,
      );
    });
  }
  it("supports asset-panel uploads without adding declarations", () => {
    const next = addImageAssets(project, { "assets/new.png": png }, 0, false);
    expect(next.source).toBe(project.source);
    expect(next.assets["assets/new.png"]).toBe(png);
  });
  it("still rejects invalid assets and paths atomically", () => {
    expect(() =>
      addImageAssets(project, { "assets/new.png": "bad" }, 0),
    ).toThrow(/图片/);
    expect(() =>
      addImageAssets(project, { "assets/../bad.png": png }, 0),
    ).toThrow(/路径/);
    expect(project.assets).toEqual({});
  });
});
