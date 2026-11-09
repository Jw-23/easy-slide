import { test, expect, type Page } from "@playwright/test";
const source = `// retain this comment
Deck("Navigation")
Theme(preset:.paper)
let rows=range(0,3).map(k=>[k,k^2])
Slide(title:"Same") {
    Split {
        Text("Same")
        Text("Same").appear(.rise,step:2,order:1,delay:120,duration:650,easing:.easeInOut)
    }
}
Slide(title:"Second") {
    Flow {
        Text("tail")
    }
}`;
async function open(page: Page) {
  await page.addInitScript(() => {
    let text = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          text = value;
        },
        read: async () => {
          throw Error("unsupported");
        },
        readText: async () => text,
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "navigation.json",
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
  await expect(page.locator(".preview-wrap")).toContainText("Same");
}
test("right-click navigation distinguishes repeated text and reveals another page from its DSL", async ({
  page,
}) => {
  await open(page);
  const repeated = page
    .locator(".preview-wrap [data-scene-element]")
    .filter({ hasText: /^Same$/ });
  await expect(repeated).toHaveCount(3);
  await repeated.nth(2).click({ button: "right" });
  await page.getByRole("menuitem", { name: "定位到 DSL", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  await expect(editor).toBeVisible();
  await expect(page.locator(".cm-activeLine")).toContainText("step:2");
  const tail = page.locator(".cm-line").filter({ hasText: 'Text("tail")' });
  await tail.scrollIntoViewIfNeeded();
  await tail.click({ button: "right", position: { x: 80, y: 8 } });
  await page.getByRole("menuitem", { name: "定位到画布", exact: true }).click();
  await expect(page.locator(".preview-wrap")).toContainText("tail");
  await expect(page.locator(".preview-wrap .source-highlight")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /第 2 页 Second/ }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("幻灯片画布", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".source-highlight")).toHaveCount(0);
});
test("component copy, paste, delete and undo work from the canvas menu", async ({
  page,
}) => {
  await open(page);
  const repeated = () =>
    page
      .locator(".preview-wrap [data-scene-element]")
      .filter({ hasText: /^Same$/ });
  await repeated().nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "复制组件", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("已复制");
  await repeated().nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "粘贴", exact: true }).click();
  await expect(repeated()).toHaveCount(4);
  await repeated().nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "删除组件", exact: true }).click();
  await expect(repeated()).toHaveCount(3);
  await page
    .locator(".history-actions")
    .getByRole("button", { name: "撤销", exact: true })
    .click();
  await expect(repeated()).toHaveCount(4);
});
test("formatting wraps parameters, retains comments, supports undo and context menus remain on screen", async ({
  page,
}) => {
  await open(page);
  await page
    .locator(".tabs")
    .getByRole("tab", { name: "DSL", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  await expect(editor).toBeVisible();
  await editor.focus();
  await page.keyboard.press("Control+Shift+f");
  await expect(
    page.locator(".cm-line").filter({ hasText: /^\s+step: 2,$/ }),
  ).toHaveCount(1);
  await expect(editor).toContainText("// retain this comment");
  await expect(editor).toContainText("rows = range");
  await page.keyboard.press("Control+z");
  await expect(editor).toContainText("step:2,order:1");
  const frame = page.getByLabel("幻灯片画布", { exact: true }),
    box = (await frame.boundingBox())!;
  await frame.click({
    button: "right",
    position: { x: box.width - 4, y: box.height - 4 },
  });
  const menu = page.getByRole("menu"),
    bounds = (await menu.boundingBox())!,
    viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});
