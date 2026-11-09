import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { exportFixture } from "../fixtures/pptx-export";
import { scene } from "../../src/scene";
import { timeline } from "../../src/motion";
import { mathSvg } from "../../src/math";

test("PPTX preserves browser text layers, vectors, click groups, keyframes and stable shape targets", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".slide-item")).toHaveCount(25);
  const output = process.env.PPTX_QA_DIR ?? testInfo.outputPath("pptx");
  await mkdir(output, { recursive: true });
  for (let index = 0; index < exportFixture.slides.length; index++) {
    await page.evaluate(async (index) => {
      const path = "/tests/browser/render-harness.tsx";
      (await import(path)).showReference(index);
    }, index);
    const reference = page.locator("#pptx-reference");
    await expect(reference.locator(".slide-canvas")).toContainText(
      exportFixture.slides[index].title,
    );
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll<HTMLImageElement>("#pptx-reference img"),
      ].every((i) => i.complete && i.naturalWidth > 0),
    );
    await reference.screenshot({
      path: join(output, `reference-${index + 1}.png`),
    });
  }
  for (const mode of ["faithful", "editable"] as const) {
    const download = page.waitForEvent("download");
    await page.evaluate(async (mode) => {
      const path = "/tests/browser/render-harness.tsx";
      await (await import(path)).exportReference(mode);
    }, mode);
    const file = await download;
    await file.saveAs(join(output, `${mode}.pptx`));
    const zip = await JSZip.loadAsync(await readFile((await file.path())!));
    for (let index = 0; index < exportFixture.slides.length; index++) {
      const xml = await zip
        .file(`ppt/slides/slide${index + 1}.xml`)!
        .async("string");
      const expected = timeline(
        scene(exportFixture, exportFixture.slides[index], index),
      );
      const result = await page.evaluate(
        ({ xml }) => {
          const dom = new DOMParser().parseFromString(xml, "application/xml");
          const p =
              "http://schemas.openxmlformats.org/presentationml/2006/main",
            a = "http://schemas.openxmlformats.org/drawingml/2006/main";
          const all = (name: string) => [
            ...dom.getElementsByTagNameNS(p, name),
          ];
          return {
            error: dom.querySelector("parsererror")?.textContent,
            shapeIds: all("cNvPr").map((e) => e.getAttribute("id")),
            targetIds: all("spTgt").map((e) => e.getAttribute("spid")),
            click: all("cTn").filter(
              (e) => e.getAttribute("nodeType") === "clickEffect",
            ).length,
            ids: all("cTn").map((e) => e.getAttribute("id")),
            text: dom.getElementsByTagNameNS(a, "t").length,
            fade: all("animEffect").every(
              (e) => e.getAttribute("filter") === "fade",
            ),
            order: all("cSld")[0]?.parentElement?.children
              ? [...all("cSld")[0].parentElement!.children].map(
                  (e) => e.localName,
                )
              : [],
          };
        },
        { xml },
      );
      expect(result.error).toBeUndefined();
      expect(new Set(result.ids).size).toBe(result.ids.length);
      expect(result.targetIds.every((id) => result.shapeIds.includes(id))).toBe(
        true,
      );
      expect(result.click).toBe(
        new Set(expected.filter((c) => c.step > 0).map((c) => c.step)).size,
      );
      expect(result.fade).toBe(true);
      if (index !== 1)
        expect(result.order.indexOf("timing")).toBeGreaterThan(
          result.order.indexOf("cSld"),
        );
      if (mode === "faithful") expect(result.text).toBe(0);
      else {
        expect(result.text).toBeGreaterThan(0);
        expect(xml).not.toContain("normAutofit");
        expect(xml).toContain('vertOverflow="clip"');
      }
      if (index === 2) {
        expect(xml).toContain("#ppt_x-0.046875");
        expect(xml).toContain("#ppt_y+0.041666667");
        expect(xml).toContain("#ppt_w*0.88");
        expect(xml).toContain('presetID="1"');
        expect(xml).toContain('delay="780"');
      }
    }
    const first = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(first).toContain('mc:Ignorable="p14"');
    expect(first).toContain('p14:dur="780"');
    expect(first).toContain("asvg:svgBlip");
    const pngFormulas = Object.keys(zip.files).filter((name) =>
      name.endsWith(".png"),
    );
    const resolutions = await Promise.all(
      pngFormulas.map(async (name) => {
        const bytes = await zip.file(name)!.async("nodebuffer");
        return bytes.readUInt32BE(16);
      }),
    );
    if (mode === "faithful")
      expect(Math.max(...resolutions)).toBeGreaterThanOrEqual(1000 * 3);
    const equationIndex = scene(
      exportFixture,
      exportFixture.slides[0],
      0,
    ).findIndex((e) => e.kind === "equation");
    const fallback = await page.evaluate(
      ({ xml, name }) => {
        const dom = new DOMParser().parseFromString(xml, "application/xml"),
          p = "http://schemas.openxmlformats.org/presentationml/2006/main",
          a = "http://schemas.openxmlformats.org/drawingml/2006/main";
        const picture = [...dom.getElementsByTagNameNS(p, "pic")].find(
          (pic) =>
            pic.getElementsByTagNameNS(p, "cNvPr")[0].getAttribute("name") ===
            name,
        )!;
        return {
          rid: picture
            .getElementsByTagNameNS(a, "blip")[0]
            .getAttributeNS(
              "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
              "embed",
            ),
          width:
            (Number(
              picture
                .getElementsByTagNameNS(a, "xfrm")[0]
                .getElementsByTagNameNS(a, "ext")[0]
                .getAttribute("cx"),
            ) /
              914400) *
            96,
          height:
            (Number(
              picture
                .getElementsByTagNameNS(a, "xfrm")[0]
                .getElementsByTagNameNS(a, "ext")[0]
                .getAttribute("cy"),
            ) /
              914400) *
            96,
        };
      },
      { xml: first, name: `easy-slide-element-${equationIndex}` },
    );
    const rels = await zip
      .file("ppt/slides/_rels/slide1.xml.rels")!
      .async("string");
    const target = await page.evaluate(
      ({ rels, rid }) => {
        const dom = new DOMParser().parseFromString(rels, "application/xml");
        return [...dom.documentElement.children]
          .find((e) => e.getAttribute("Id") === rid)!
          .getAttribute("Target")!;
      },
      { rels, rid: fallback.rid },
    );
    const fallbackPng = await zip
      .file("ppt/" + target.replace(/^\.\.\//, ""))!
      .async("nodebuffer");
    expect(
      Math.abs(fallbackPng.readUInt32BE(16) - fallback.width * 3),
    ).toBeLessThan(1.01);
    const equation = scene(exportFixture, exportFixture.slides[0], 0)[
      equationIndex
    ];
    const vector = atob(mathSvg(equation.text!, equation.color!).split(",")[1])
      .match(/viewBox="([^"]+)"/)![1]
      .split(/\s+/)
      .map(Number);
    expect(fallback.width / fallback.height).toBeCloseTo(
      vector[2] / vector[3],
      5,
    );
    const note = await zip
      .file("ppt/notesSlides/notesSlide1.xml")!
      .async("string");
    expect(note).toContain("源码中的备注");
    if (mode === "editable") {
      expect(first).toContain("<a:t>0.640</a:t>");
      expect(first).toContain('build="allAtOnce"');
    }
  }
  expect(errors).toEqual([]);
});

test("glass includes underlying imagery without revealing a future click stage", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".slide-item")).toHaveCount(25);
  const pixels = await page.evaluate(async () => {
    const path = "/src/pptx-render.ts",
      { renderExportLayers, loadExportImage } = await import(path);
    const deck = {
      version: 1,
      title: "A",
      slides: [{ title: "B", blocks: [] }],
    };
    const background = {
      kind: "rect",
      x: 0,
      y: 0,
      w: 200,
      h: 100,
      fill: "#123456",
      radius: 0,
      step: 0,
    };
    const blue = {
      ...background,
      fill: "#0000ff",
      step: 1,
      motionKey: "future",
      appear: { effect: "fade" },
    };
    const glass = {
      kind: "rect",
      x: 20,
      y: 20,
      w: 100,
      h: 50,
      fill: "#ffffff",
      radius: 0,
      step: 0,
      glass: { blur: 0, opacity: 0, radius: 0 },
    };
    const result = [];
    for (const underlay of [
      blue,
      { ...blue, step: 0, motionKey: undefined, appear: undefined },
    ]) {
      const layers = await renderExportLayers(
        deck,
        deck.slides[0],
        [background, underlay, glass],
        {},
      );
      const img = await loadExportImage(layers[2].data),
        c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      result.push([...ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data]);
    }
    return result;
  });
  // CSS saturate(130%) changes the green background, while a future blue object stays absent.
  expect(pixels[0]).toEqual([9, 53, 98, 255]);
  expect(pixels[1]).toEqual([0, 0, 255, 255]);
});
