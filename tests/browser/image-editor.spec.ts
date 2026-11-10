import { test, expect } from "@playwright/test";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XkAAAAASUVORK5CYII=";
test("renames an image from the canvas menu and preserves references through undo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  const source =
    'Deck("D") Slide(title:"S"){Image("assets/old.png").frame(width:100,height:80)}';
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "images.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "easy-slide",
          version: 1,
          source,
          assets: { "assets/old.png": png },
        }),
      ),
    });
  const image = page.locator(".preview-wrap [data-image-asset=true]");
  await expect(image).toBeVisible();
  const before = (await image.boundingBox())!;
  await page.mouse.move(before.x + 10, before.y + 10);
  await page.mouse.down();
  await page.mouse.move(before.x + 60, before.y + 40, { steps: 6 });
  await page.mouse.up();
  const after = (await image.boundingBox())!;
  expect(after.x - before.x).toBeCloseTo(50, 0);
  expect(after.y - before.y).toBeCloseTo(30, 0);
  await image.click({ button: "right" });
  await page.getByRole("menuitem", { name: "编辑图片 / 重命名" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑图片" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("文件名").fill("new.png");
  await dialog.getByRole("button", { name: "保存图片与名称" }).click();
  await expect(dialog).toBeHidden();
  await expect(image.locator("img")).toHaveAttribute("alt", "assets/new.png");
  await page
    .locator(".history-actions")
    .getByRole("button", { name: "撤销", exact: true })
    .click();
  await expect(image.locator("img")).toHaveAttribute("alt", "assets/old.png");
});
test("samples RGB and hex, annotates, crops and saves actual PNG pixels", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 120;
    c.height = 90;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 120, 90);
    ctx.fillStyle = "#000000";
    ctx.fillRect(50, 30, 10, 10);
    return c.toDataURL();
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "pixels.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "easy-slide",
          version: 1,
          source:
            'Deck("D") Slide(title:"S"){Image("assets/old.png").frame(width:120,height:90)}',
          assets: { "assets/old.png": data },
        }),
      ),
    });
  await page
    .locator(".preview-wrap [data-image-asset=true]")
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "编辑图片 / 重命名" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑图片" }),
    canvas = dialog.getByLabel("图片编辑画布");
  await expect(canvas).toHaveAttribute("width", "120");
  await dialog.getByRole("button", { name: "取背景色", exact: true }).click();
  await canvas.click({ position: { x: 10, y: 10 } });
  await expect(dialog.getByLabel("取色结果")).toHaveValue(
    /#ffffff.*rgb\(255, 255, 255\)/,
  );
  await dialog.getByRole("button", { name: "涂抹擦除", exact: true }).click();
  await canvas.click({ position: { x: 55, y: 35 } });
  await expect
    .poll(() =>
      canvas.evaluate((c: HTMLCanvasElement) =>
        Array.from(c.getContext("2d")!.getImageData(55, 35, 1, 1).data).join(
          ",",
        ),
      ),
    )
    .toBe("255,255,255,255");
  await dialog.getByRole("button", { name: "添加文字", exact: true }).click();
  await canvas.click({ position: { x: 10, y: 10 } });
  await dialog.getByLabel("标注文字").fill("A");
  await dialog.getByRole("button", { name: "裁剪", exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 4 });
  await page.mouse.up();
  await dialog.getByRole("button", { name: "保存图片与名称" }).click();
  await expect(dialog).toBeHidden();
  const image = page.locator(".preview-wrap [data-image-asset=true] img");
  await expect
    .poll(() => image.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBe(80);
  await expect
    .poll(() => image.evaluate((i: HTMLImageElement) => i.naturalHeight))
    .toBe(60);
});

test("text objects remain directly editable and transformable after saving and reopening", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 400;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 600, 400);
    return c.toDataURL();
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "text.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "easy-slide",
          version: 1,
          source:
            'Deck("D") Slide(title:"S"){Image("assets/result.png").frame(width:600,height:400)}',
          assets: { "assets/result.png": data },
        }),
      ),
    });
  await page
    .locator(".preview-wrap [data-image-asset=true]")
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "编辑图片 / 重命名" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑图片" }),
    canvas = dialog.getByLabel("图片编辑画布");
  await expect(canvas).toHaveAttribute("width", "600");
  await dialog.getByRole("button", { name: "添加文字", exact: true }).click();
  await canvas.click({ position: { x: 80, y: 90 } });
  await dialog.getByLabel("标注文字").fill("Editable");
  await dialog.getByLabel("字体", { exact: true }).fill("Georgia, serif");
  await dialog.getByLabel("字号", { exact: true }).fill("32");
  await dialog.getByLabel("文字旋转角度").fill("30");
  const object = dialog.locator(".image-text-object.selected");
  await expect(object).toHaveCSS("font-family", "Georgia, serif");
  await object.dblclick();
  await dialog.getByLabel("标注文字").fill("Revised");
  await dialog.getByLabel("标注文字").press("Control+Enter");
  const box = (await object.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 40,
    box.y + box.height / 2 + 25,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(dialog.getByRole("button", { name: "缩放文字" })).toBeVisible();
  await dialog.getByRole("button", { name: "保存图片与名称" }).click();
  await expect(dialog).toBeHidden();
  await page
    .locator(".preview-wrap [data-image-asset=true]")
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "编辑图片 / 重命名" }).click();
  await dialog.locator(".image-text-object").dblclick();
  await expect(dialog.getByLabel("标注文字")).toHaveValue("Revised");
  await expect(dialog.getByLabel("文字旋转角度")).toHaveValue("30");
  await expect(dialog.getByLabel("字体", { exact: true })).toHaveValue(
    "Georgia, serif",
  );
});
