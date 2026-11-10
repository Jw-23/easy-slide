import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { importProjectArchive } from "../../src/project-archive";
async function cached(page: import("@playwright/test").Page) {
  await page.goto("/?example=features");
  await expect(page.locator(".slide-item")).toHaveCount(27);
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}
test("browser recognises the manifest, icons and offline app shell", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await cached(page);
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>("link[rel=manifest]")!;
    return (await fetch(link.href)).json();
  });
  expect(manifest).toMatchObject({
    id: "/",
    name: "Easy Slide",
    display: "standalone",
    start_url: "/",
    scope: "/",
  });
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const dimensions = await page.evaluate(async (src: string) => {
      const i = new Image();
      i.src = src;
      await i.decode();
      return [i.naturalWidth, i.naturalHeight];
    }, icon.src);
    expect(dimensions.join("x")).toBe(icon.sizes);
  }
  const cdp = await context.newCDPSession(page),
    nativeManifest = await cdp.send("Page.getAppManifest");
  expect(nativeManifest.errors).toEqual([]);
  expect(
    (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors,
  ).toEqual([]);
  await page
    .getByRole("textbox", { name: "页标题", exact: true })
    .fill("离线保存的工程");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  offline.on("pageerror", (e) => errors.push(e.message));
  await offline.goto("/?example=features");
  await expect(offline.locator(".preview-wrap")).toContainText(
    "离线保存的工程",
  );
  await offline.locator(".slide-item").nth(12).click();
  await expect(offline.locator(".preview-wrap")).toContainText("0.640");
  await offline.getByRole("button", { name: "导出", exact: true }).click();
  const archiveDownload = offline.waitForEvent("download");
  await offline.getByRole("button", { name: /工程压缩包/ }).click();
  const archive = await archiveDownload;
  expect(archive.suggestedFilename()).toMatch(/\.easy-slide\.zip$/);
  const project = await importProjectArchive(
    await readFile((await archive.path())!),
  );
  expect(project.assets["assets/convergence.png"]).toMatch(
    /^data:image\/png;base64,/,
  );
  expect(project.source).toContain("离线保存的工程");
  await offline.getByRole("button", { name: "导出", exact: true }).click();
  const dl = offline.waitForEvent("download");
  await offline.getByRole("button", { name: /PowerPoint/ }).click();
  const zip = await JSZip.loadAsync(await readFile((await (await dl).path())!));
  expect(
    Object.keys(zip.files).filter((x) => /^ppt\/slides\/slide\d+.xml$/.test(x)),
  ).toHaveLength(27);
  expect(errors).toEqual([]);
});
test("install UI is absent while offline caching remains available", async ({
  page,
}) => {
  await cached(page);
  await expect(
    page.getByRole("button", { name: "安装应用", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "安装 Easy Slide" }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(
    true,
  );
});
test("a waiting version updates only after saving and leaves other windows open", async ({
  page,
  context,
}) => {
  await cached(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await other.evaluate(() => ((window as any).__keepOpen = "still here"));
  await page.request.post("/__test__/release-next");
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r!.update();
  });
  const update = page.getByRole("button", { name: "保存并更新", exact: true });
  await expect(update).toBeVisible();
  await page
    .getByRole("textbox", { name: "页标题", exact: true })
    .fill("更新前的最后修改");
  await update.click();
  await expect(page.locator(".preview-wrap")).toContainText("更新前的最后修改");
  await expect(update).toHaveCount(0);
  expect(await other.evaluate(() => (window as any).__keepOpen)).toBe(
    "still here",
  );
  await expect(
    other.getByRole("button", { name: "保存并更新", exact: true }),
  ).toBeVisible();
});

test("a failed draft save keeps the current editor and waiting version intact", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if ((window as any).__failSave)
        throw new DOMException("Storage full", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await cached(page);
  await page
    .getByRole("textbox", { name: "页标题", exact: true })
    .fill("保留当前编辑内容");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.request.post("/__test__/release-next");
  await page.evaluate(async () => {
    (window as any).__failSave = true;
    (window as any).__keepOpen = "not reloaded";
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  const update = page.getByRole("button", { name: "保存并更新", exact: true });
  await expect(update).toBeVisible();
  await update.click();
  await expect(page.getByRole("alert")).toContainText("草稿保存失败");
  expect(await page.evaluate(() => (window as any).__keepOpen)).toBe(
    "not reloaded",
  );
  expect(
    await page.evaluate(
      async () => !!(await navigator.serviceWorker.getRegistration())?.waiting,
    ),
  ).toBe(true);
  await expect(page.locator(".preview-wrap")).toContainText("保留当前编辑内容");
  await page.evaluate(() => ((window as any).__failSave = false));
  await update.click();
  await expect(update).toHaveCount(0);
  await expect(page.locator(".preview-wrap")).toContainText("保留当前编辑内容");
});
