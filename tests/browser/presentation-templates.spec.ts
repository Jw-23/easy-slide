import { test, expect } from "@playwright/test";
async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
}
test("presentation uses the whole viewport and wheel steps while controls float only near the bottom", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "play.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "easy-slide",
          version: 1,
          assets: {},
          source:
            'Deck("D") Slide(title:"First"){Text("First step").appear(.rise,step:1) Text("Second step").appear(.rise,step:2)} Slide(title:"Second"){Text("Next page")}',
        }),
      ),
    });
  await page.getByRole("button", { name: "演示", exact: true }).click();
  const play = page.getByRole("dialog", { name: "幻灯片放映" }),
    controls = play.locator(".presentation-controls");
  await expect(play).toBeVisible();
  await expect(play).toHaveCSS("padding-top", "0px");
  await expect(play).toHaveCSS("padding-bottom", "0px");
  await page.mouse.move(20, 20);
  await expect(controls).toHaveCSS("opacity", "0");
  const size = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  await page.mouse.move(size.width / 2, size.height - 30);
  await expect(controls).toHaveCSS("opacity", "1");
  await page.mouse.move(size.width / 2, size.height / 2);
  await page.mouse.wheel(0, 100);
  await expect(
    play.locator("[data-scene-element]").filter({ hasText: /^First step$/ }),
  ).toHaveCSS("visibility", "visible");
  await expect(
    play.locator("[data-scene-element]").filter({ hasText: /^Second step$/ }),
  ).toHaveCSS("visibility", "hidden");
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 100);
  await expect(
    play.locator("[data-scene-element]").filter({ hasText: /^Second step$/ }),
  ).toHaveCSS("visibility", "visible");
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 100);
  await expect(play).toContainText("Next page");
  await page.keyboard.press("Escape");
  await expect(play).toHaveCount(0);
});
test("saves the engineering example as a reusable local template across reloads", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "工程", exact: true }).click();
  await page.getByRole("menuitem", { name: "示例与模板", exact: true }).click();
  await page.getByRole("button", { name: /研发成果汇报 左下实验大图/ }).click();
  await page.getByRole("button", { name: "切换示例", exact: true }).click();
  await expect(page.locator(".preview-wrap")).toContainText("研发成果总览");
  await page.getByRole("button", { name: "工程", exact: true }).click();
  await page.getByRole("menuitem", { name: "示例与模板", exact: true }).click();
  await page.getByLabel("模板名称", { exact: true }).fill("我的研发汇报");
  await page.getByRole("button", { name: "保存当前工程", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "我的研发汇报", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "工程", exact: true }).click();
  await page.getByRole("menuitem", { name: "示例与模板", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "我的研发汇报", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我的研发汇报", exact: true }).click();
  await expect(page.locator(".slide-item")).toHaveCount(3);
});

test("Ctrl+S selects a folder once and overwrites its dedicated project file without a download", async ({
  page,
}) => {
  await ready(page);
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.evaluate(() => {
    const files: Record<string, number[]> = {};
    let picks = 0,
      writes = 0;
    (window as any).__saveStats = () => ({
      picks,
      writes,
      names: Object.keys(files),
    });
    const dir = {
      name: "local",
      getFileHandle: async (name: string, opts?: { create?: boolean }) => {
        if (!opts?.create && !files[name])
          throw new DOMException("Missing", "NotFoundError");
        return {
          kind: "file",
          name,
          getFile: async () => new File([new Uint8Array(files[name])], name),
          createWritable: async () => {
            let pending: number[];
            return {
              write: async (blob: Blob) => {
                pending = Array.from(new Uint8Array(await blob.arrayBuffer()));
              },
              close: async () => {
                files[name] = pending;
                writes++;
              },
              abort: async () => {},
            };
          },
        };
      },
      values: async function* () {},
    };
    (window as any).showDirectoryPicker = async () => {
      picks++;
      return dir;
    };
  });
  await page.keyboard.press("Control+s");
  const saveDialog = page.getByRole("dialog", { name: "保存项目文件" });
  await expect(saveDialog).toBeVisible();
  await saveDialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__saveStats())).toEqual({
    picks: 0,
    writes: 0,
    names: [],
  });
  await page.keyboard.press("Control+s");
  await saveDialog.getByLabel("项目文件名").fill("我的项目");
  await saveDialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(saveDialog).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => (window as any).__saveStats().writes))
    .toBe(1);
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => page.evaluate(() => (window as any).__saveStats().writes))
    .toBe(2);
  expect(await page.evaluate(() => (window as any).__saveStats())).toEqual({
    picks: 1,
    writes: 2,
    names: ["我的项目.easy-slide"],
  });
  expect(downloads).toBe(0);
  await page.keyboard.press("Control+Shift+s");
  const saveAsDialog = page.getByRole("dialog", { name: "工程另存为" });
  await expect(saveAsDialog).toBeVisible();
  await expect(saveAsDialog.getByLabel("项目文件名")).toHaveValue(
    "我的项目.easy-slide",
  );
  await saveAsDialog.getByLabel("项目文件名").fill("另存副本");
  await saveAsDialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(saveAsDialog).toBeHidden();
  await page.keyboard.press("Control+s");
  await expect
    .poll(() => page.evaluate(() => (window as any).__saveStats().writes))
    .toBe(4);
  expect(
    await page.evaluate(() => (window as any).__saveStats().names),
  ).toEqual(["我的项目.easy-slide", "另存副本.easy-slide"]);
  expect(downloads).toBe(0);
  await expect(
    page.getByRole("button", { name: "安装应用", exact: true }),
  ).toHaveCount(0);
});

test("reload retains the saved project filename; only Save As opens the naming dialog", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "proof.slide",
      mimeType: "text/plain",
      buffer: Buffer.from('Deck("保存测试") Slide(title:"S"){Text("正文")}'),
    });
  await expect(page.locator(".preview-wrap")).toContainText("正文");
  await page.evaluate(async () => {
    const folder = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("save-regression", { create: true });
    (window as any).showDirectoryPicker = async () => folder;
  });
  await page.keyboard.press("Control+s");
  const first = page.getByRole("dialog", { name: "保存项目文件" });
  await first.getByLabel("项目文件名").fill("原工程");
  await first.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".toast.success")).toContainText(
    "原工程.easy-slide",
  );
  // Wait for the structured-cloned FileSystemDirectoryHandle to reach IndexedDB.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        return new Promise<string | undefined>((resolve, reject) => {
          const open = indexedDB.open("keyval-store");
          open.onsuccess = () => {
            const db = open.result;
            const read = db
              .transaction("keyval")
              .objectStore("keyval")
              .get("draft:save-location");
            read.onsuccess = () => {
              resolve(read.result?.filename);
              db.close();
            };
            read.onerror = () => {
              reject(read.error);
              db.close();
            };
          };
          open.onerror = () => reject(open.error);
        });
      }),
    )
    .toBe("原工程.easy-slide");
  await page.reload();
  await expect(page.locator(".preview-wrap")).toContainText("正文");
  await page.keyboard.press("Control+s");
  await expect(page.locator(".toast.success")).toContainText(
    "原工程.easy-slide",
  );
  await expect(page.getByRole("dialog", { name: "保存项目文件" })).toHaveCount(
    0,
  );
  await page.keyboard.press("Control+Shift+s");
  const saveAs = page.getByRole("dialog", { name: "工程另存为" });
  await expect(saveAs.getByLabel("项目文件名")).toHaveValue(
    "原工程.easy-slide",
  );
  await saveAs.getByLabel("项目文件名").fill("副本");
  await saveAs.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".toast.success")).toContainText("副本.easy-slide");
  await expect
    .poll(() =>
      page.evaluate(async () => {
        return new Promise<string | undefined>((resolve, reject) => {
          const open = indexedDB.open("keyval-store");
          open.onsuccess = () => {
            const db = open.result;
            const read = db
              .transaction("keyval")
              .objectStore("keyval")
              .get("draft:save-location");
            read.onsuccess = () => {
              resolve(read.result?.filename);
              db.close();
            };
            read.onerror = () => {
              reject(read.error);
              db.close();
            };
          };
          open.onerror = () => reject(open.error);
        });
      }),
    )
    .toBe("副本.easy-slide");
  await page.reload();
  await expect(page.locator(".preview-wrap")).toContainText("正文");
  await page.keyboard.press("Control+s");
  await expect(page.locator(".toast.success")).toContainText("副本.easy-slide");
  const names = await page.evaluate(async () => {
    const folder = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("save-regression");
    const names: string[] = [];
    for await (const name of (folder as any).keys()) names.push(name);
    return names.sort();
  });
  expect(names).toEqual(["副本.easy-slide", "原工程.easy-slide"]);
});
