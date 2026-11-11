import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
const source = String.raw`Deck("Rich") Theme(preset:.paper)
Slide(title:"**富文本**") {
 VStack(spacing:24){
  Text(#"普通 **粗体** 与 *斜体*、~~旧值~~，公式 $\frac{1}{n}$ 与 \(x^2\)。"#).frame(height:160).appear(.rise,step:1,duration:650)
  Text("**原生粗体** 与 *原生斜体*、~~原生旧值~~").frame(height:80)
  Code("**literal** $x$").frame(height:80)
 }
}`;
async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "rich.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "easy-slide",
          version: 1,
          source,
          assets: {},
        }),
      ),
    });
  await expect(page.locator(".preview-wrap")).toContainText("原生粗体");
}
test("renders nested styles and inline math, with wrapping and DSL navigation", async ({
  page,
}) => {
  await open(page);
  const preview = page.locator(".preview-wrap");
  await expect(
    preview.locator("[data-rich-run]").filter({ hasText: /^粗体$/ }),
  ).toHaveCSS("font-weight", "650");
  await expect(
    preview.locator("[data-rich-run]").filter({ hasText: /^斜体$/ }),
  ).toHaveCSS("font-style", "italic");
  await expect(preview.locator("img[data-inline-math]")).toHaveCount(2);
  await expect(preview).toContainText("**literal** $x$");
  for (const img of await preview.locator("img[data-inline-math]").all()) {
    await expect(img).toHaveJSProperty("complete", true);
    expect(
      await img.evaluate((node: HTMLImageElement) => node.naturalWidth),
    ).toBeGreaterThan(0);
  }
  await preview
    .locator("img[data-inline-math]")
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "定位到 DSL", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  await expect(editor).toBeFocused();
  await expect(page.locator(".cm-activeLine")).toContainText("普通 **粗体**");
});
test("exports native styles and mixed paragraph vectors with valid motion targets", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await open(page);
  for (const mode of ["保留版式", "可编辑文字"]) {
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByRole("radio", { name: mode }).check();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /PowerPoint/ }).click();
    const zip = await JSZip.loadAsync(
        await readFile((await (await download).path())!),
      ),
      xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    const vectors = await Promise.all(
      Object.keys(zip.files)
        .filter((p) => p.startsWith("ppt/media/") && p.endsWith(".svg"))
        .map((p) => zip.file(p)!.async("string")),
    );
    const paragraph = vectors.find(
      (svg) => svg.includes("普通") && svg.includes("<path"),
    )!;
    expect(paragraph).toBeDefined();
    expect(paragraph).not.toContain("foreignObject");
    expect(
      await page.evaluate(
        (svg) =>
          new DOMParser()
            .parseFromString(svg, "image/svg+xml")
            .querySelector("parsererror")?.textContent,
        paragraph,
      ),
    ).toBeUndefined();
    expect(xml).toContain('nodeType="clickEffect"');
    expect(xml).toContain('dur="650"');
    if (mode === "可编辑文字") {
      expect(xml).toContain("原生粗体");
      expect(xml).toContain('i="1"');
      expect(xml).toContain('strike="sngStrike"');
    }
  }
});

test("backtick strings keep single LaTeX backslashes through completion and formatting", async ({
  page,
}) => {
  await open(page);
  await page
    .locator(".tabs")
    .getByRole("tab", { name: "DSL", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  await editor.fill('Deck("Raw") Slide(title:"A"){Equation(`\\fr');
  await page.keyboard.press("Control+Space");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText(
    "\\frac",
  );
  await page
    .locator(".cm-tooltip-autocomplete li")
    .filter({ hasText: "\\frac" })
    .first()
    .click();
  await expect(editor).toContainText("`\\frac{numerator}{denominator}");
  await expect(editor).not.toContainText("`\\\\frac");
  await editor.fill(
    'Deck("Raw") Slide(title:"A"){Text(`**误差**为 $\\frac{1}{n}$`) Equation(`\\nabla f(x)`)}',
  );
  await expect(page.locator(".editor-diagnostic")).toHaveCount(0);
  await expect(page.locator(".preview-wrap img[data-inline-math]")).toHaveCount(
    1,
  );
  await editor.focus();
  await page.keyboard.press("Control+Shift+f");
  await expect(editor).toContainText("`\\nabla f(x)`");
  await expect(page.locator(".preview-wrap")).toContainText("误差");
});

test("position reference and scale keep the bottom-left point and preview coordinates stable", async ({
  page,
}) => {
  await open(page);
  await page
    .locator(".tabs")
    .getByRole("tab", { name: "DSL", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  await editor.fill(
    'Deck("Position") Theme(preset:.paper) Slide(title:"S"){Panel(fill:"#eeeeee"){ZStack{Rectangle(fill:"#ff0000").frame(width:100,height:50).position(x:10,y:15).scale(2)}}.frame(width:500,height:300).padding(20).position(x:100,y:220,relativeTo:.slide)}',
  );
  await expect(page.locator(".editor-diagnostic")).toHaveCount(0);
  await expect
    .poll(async () =>
      page.locator(".preview-wrap [data-scene-element]").evaluateAll((nodes) =>
        nodes
          .filter(
            (n) => (n as HTMLElement).style.background === "rgb(255, 0, 0)",
          )
          .map((n) => {
            const s = (n as HTMLElement).style;
            return [s.left, s.top, s.width, s.height];
          }),
      ),
    )
    .toEqual([["130px", "365px", "200px", "100px"]]);
  await editor.fill(
    'Deck("Position") Slide(title:"S"){Text("X").frame(x:10,y:20)}',
  );
  await expect(page.locator(".editor-diagnostic")).toContainText("position");
});

test("long proofs indent paragraphs and keep display equations at the body font size", async ({
  page,
}, testInfo) => {
  await open(page);
  const proof =
    'Deck("KKT") Theme(preset:.paper) DynamicSlide(title:"KKT 条件",fontSize:22){Proof{Text(`\n    设 $\\lambda\\ge0$，考虑下列驻点条件。\n    $$Hx+q+G^T\\lambda+E^T\\nu=0$$\n    由**互补松弛**可得 $\\lambda_i(G_ix-h_i)=0$。\n`).indent(2) Equation(`\\lambda\\ge0`).frame(height:100) Equation(`Hx+q+G^T\\lambda+E^T\\nu=0`).frame(height:100)}}';
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "proof.slide",
      mimeType: "text/plain",
      buffer: Buffer.from(proof),
    });
  const preview = page.locator(".preview-wrap");
  await expect(preview).toContainText("　　设");
  await expect(preview.locator("img[data-inline-math]")).toHaveCount(3);
  const sizes = await preview
    .locator("[data-scene-element]")
    .evaluateAll((elements) => {
      const standalone = elements.filter((el) =>
        el.querySelector("img:not([data-inline-math])"),
      );
      const embedded = elements
        .flatMap((el) =>
          Array.from(
            el.querySelectorAll<HTMLImageElement>("img[data-inline-math]"),
          ),
        )
        .filter((img) => img.style.display === "block");
      return {
        standalone: standalone.map((el) => ({
          w: parseFloat((el as HTMLElement).style.width),
          h: parseFloat((el as HTMLElement).style.height),
        })),
        embedded: embedded.map((img) => ({
          w: img.offsetWidth,
          h: img.offsetHeight,
        })),
      };
    });
  expect(sizes.standalone).toHaveLength(2);
  expect(sizes.embedded).toHaveLength(1);
  expect(Math.abs(sizes.standalone[1].w - sizes.embedded[0].w)).toBeLessThan(2);
  expect(Math.abs(sizes.standalone[1].h - sizes.embedded[0].h)).toBeLessThan(2);
  expect(sizes.standalone[0].h).toBeLessThan(40);
  await preview.screenshot({ path: testInfo.outputPath("proof.png") });
});
