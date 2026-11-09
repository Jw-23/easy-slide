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
  await expect(editor).toContainText("`\\frac{分子}{分母}");
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
