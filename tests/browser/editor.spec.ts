import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
test("edit, persist, stage content, export and reimport a portable project", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".slide-item")).toHaveCount(7);
  await page
    .getByRole("textbox", { name: "页标题", exact: true })
    .fill("本地测试标题");
  await expect(page.locator(".preview-wrap")).toContainText("本地测试标题");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".preview-wrap")).toContainText("本地测试标题");
  await page.locator(".tabs").getByRole("button", { name: "DSL" }).click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  const source = await editor.inputValue();
  await editor.fill('Deck("broken") {}');
  await expect(page.locator(".dsl-validation")).toContainText("1–200");
  await expect(page.locator(".preview-wrap")).toContainText("本地测试标题");
  await editor.fill(source);
  await page.locator(".slide-item").nth(2).click();
  await page.getByRole("button", { name: "演示", exact: true }).click();
  const formula = page.locator(".presentation img");
  await expect(formula).toHaveCSS("opacity", "0");
  await page.keyboard.press("Space");
  await expect(formula).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  const projectDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存工程", exact: true }).click();
  const p = await projectDownload;
  const project = JSON.parse(await readFile((await p.path())!, "utf8"));
  expect(project.format).toBe("easy-slide");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "roundtrip.easy-slide.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.locator(".preview-wrap")).toContainText("本地测试标题");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: /PowerPoint/ }).click();
  const file = await dl;
  const zip = await JSZip.loadAsync(await readFile((await file.path())!));
  expect(
    Object.keys(zip.files).filter((x) => /^ppt\/slides\/slide\d+.xml$/.test(x)),
  ).toHaveLength(7);
  const first = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(first).toContain("本地测试标题");
  expect(first).toContain("<p:transition");
  expect(first).toContain("<p:push");
  expect(Object.keys(zip.files).some((x) => x.endsWith(".svg"))).toBeTruthy();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/editor.png", fullPage: true });
});
test("clipboard images survive full project export", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const blob = await (
      await fetch(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=",
      )
    ).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "pasted.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt }));
  });
  await expect(page.getByRole("status")).toContainText("1 张图片");
  await page.locator(".tabs").getByRole("button", { name: "素材" }).click();
  await expect(page.locator(".asset-list img")).toHaveCount(1);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存工程", exact: true }).click();
  const p = JSON.parse(await readFile((await (await dl).path())!, "utf8"));
  expect(Object.values(p.assets)[0]).toMatch(/^data:image\/png;base64,/);
  expect(p.source).toContain("pasted.png");
});
test("folder access loads assets and writes a self contained project locally", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const written: Record<string, string> = {};
    (window as any).__written = written;
    const missing = () => new DOMException("Missing", "NotFoundError");
    const directory = {
      name: "local-project",
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!options?.create) throw missing();
        return {
          async createWritable() {
            return {
              async write(text: string) {
                written[name] = text;
              },
              async close() {},
            };
          },
        };
      },
      async *values() {},
    };
    (window as any).showDirectoryPicker = async () => directory;
  });
  await page.locator(".tabs").getByRole("button", { name: "素材" }).click();
  await page
    .getByRole("button", { name: "打开本地文件夹", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("已连接文件夹");
  await page.getByRole("button", { name: "保存工程", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存到");
  const result = await page.evaluate(() => (window as any).__written);
  expect(JSON.parse(result["project.easy-slide.json"]).format).toBe(
    "easy-slide",
  );
  expect(result["slides.slide"]).toContain("Deck(");
});
test("all runtime requests stay local, including math rendering and help", async ({
  page,
}) => {
  const remote: string[] = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:5173/")
    )
      remote.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator(".preview-wrap img")).toBeVisible();
  await page.getByRole("button", { name: "DSL 使用指南" }).click();
  await expect(page.locator(".help-modal")).toBeVisible();
  expect(remote).toEqual([]);
});
