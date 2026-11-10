import { it, expect } from "vitest";
import { TemplateStore } from "../src/studio/template-store";
import {
  wheelNavigator,
  nextPosition,
  previousPosition,
} from "../src/studio/presentation";
import { researchDeck, exampleAssetsFor } from "../src/examples";
import { scene } from "../src/scene";
import { serialize, parseDeck, type Project } from "../src/dsl";
import {
  validatePortableProject,
  exportProjectArchive,
  importProjectArchive,
} from "../src/project-archive";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=";
const project: Project = {
  format: "easy-slide",
  version: 1,
  source: 'Deck("Custom") Slide(title:"S"){Image("assets/p.png")}',
  assets: { "assets/p.png": png, "assets/original.png": png },
  imageDocuments: {
    "assets/p.png": {
      originalPath: "assets/original.png",
      crop: null,
      edits: [
        {
          kind: "text",
          point: { x: 0, y: 0 },
          text: "Label",
          size: 24,
          color: "#000000",
          font: "Georgia",
          rotation: 30,
        },
      ],
    },
  },
};
it("saves and restores custom template images and editable layers without replacing the working project", async () => {
  let data: unknown;
  const store = new TemplateStore(
    async () => data,
    async (next) => {
      data = structuredClone(next);
    },
  );
  await Promise.all([
    store.save("First", project),
    store.save("Second", project),
  ]);
  const entries = await store.list();
  expect(entries.map((e) => e.name)).toEqual(["First", "Second"]);
  expect(entries[0].project).toEqual(project);
  const renamed = await store.rename(entries[0].id, "Renamed");
  expect(renamed[0].name).toBe("Renamed");
  const restored = await importProjectArchive(
    new Uint8Array(
      await (await exportProjectArchive(renamed[0].project)).arrayBuffer(),
    ),
  );
  expect(restored).toEqual(project);
  await expect(store.save("Renamed", project)).rejects.toThrow(/已存在/);
  expect(await store.remove(entries[0].id)).toHaveLength(1);
  expect(project.assets["assets/p.png"]).toBe(png);
});
it("preserves the old library on failed writes and serializes subsequent operations", async () => {
  let data: unknown;
  let fail = true;
  const store = new TemplateStore(
    async () => data,
    async (value) => {
      if (fail) throw Error("quota");
      data = value;
    },
  );
  await expect(store.save("First", project)).rejects.toThrow("quota");
  expect(data).toBeUndefined();
  fail = false;
  await store.save("Second", project);
  expect((await store.list()).map((t) => t.name)).toEqual(["Second"]);
  const corrupt = new TemplateStore(
    async () => ({ version: 2, items: [] }),
    async () => {
      throw Error("must not write");
    },
  );
  await expect(corrupt.save("New", project)).rejects.toThrow(/格式无效/);
});
it("advances each wheel gesture once and preserves stage-by-stage forward/backward navigation", () => {
  const wheel = wheelNavigator();
  expect(wheel(10, 0)).toBe(0);
  expect(wheel(40, 10)).toBe(1);
  for (let t = 30; t < 900; t += 20) expect(wheel(5, t)).toBe(0);
  expect(wheel(-100, 1300)).toBe(-1);
  expect(wheel(3, 1800, 1)).toBe(1);
  expect(wheel(-1, 2300, 2)).toBe(-1);
  expect(nextPosition({ page: 0, step: 0 }, [0, 1, 2], 3)).toEqual({
    page: 0,
    step: 1,
  });
  expect(nextPosition({ page: 0, step: 2 }, [0, 1, 2], 3)).toEqual({
    page: 1,
    step: 0,
  });
  expect(previousPosition({ page: 1, step: 0 }, [0], [0, 1, 2])).toEqual({
    page: 0,
    step: 2,
  });
});
it("opens a portable engineering example with a large lower-left figure and upper-right explanation", () => {
  expect(researchDeck.slides).toHaveLength(3);
  expect(parseDeck(serialize(researchDeck))).toEqual(researchDeck);
  const p = validatePortableProject({
    format: "easy-slide",
    version: 1,
    source: serialize(researchDeck),
    assets: exampleAssetsFor(researchDeck),
  });
  expect(Object.keys(p.assets)).toEqual(["assets/research-benchmark.png"]);
  const elements = scene(researchDeck, researchDeck.slides[1], 1),
    figure = elements.find((e) => e.src === "assets/research-benchmark.png")!,
    heading = elements.find((e) => e.text === "主要结论")!;
  expect(figure.x).toBe(24);
  expect(figure.y + figure.h).toBe(696);
  expect(figure.w).toBe(860);
  expect(heading.x).toBeGreaterThan(900);
  expect(heading.y).toBeLessThan(figure.y + 100);
  for (const [i, s] of researchDeck.slides.entries())
    for (const e of scene(researchDeck, s, i)) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.x + e.w).toBeLessThanOrEqual(1280);
      expect(e.y + e.h).toBeLessThanOrEqual(720);
    }
});
