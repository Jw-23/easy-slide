import { test, expect, type Page } from "@playwright/test";
const source =
  'Deck("搜索")\nSlide(title:"A"){Text{ x_12 x_34 }}\nSlide(title:"B"){Text{ x_56 }}';
async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "search.slide",
      mimeType: "text/plain",
      buffer: Buffer.from(source),
    });
  await expect(page.locator(".preview-wrap")).toContainText("x_12");
}
test("global entry and shortcuts share the Chinese panel and replace captured groups across slides with one undo", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.keyboard.press("Control+h");
  const panel = page.getByRole("search", { name: "全局搜索替换" });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("textbox", { name: "替换为", exact: true }),
  ).toBeFocused();
  await panel.getByRole("textbox", { name: "搜索整个工程" }).fill("x_(\\d+)");
  await panel
    .getByRole("button", { name: "使用正则表达式", exact: true })
    .click();
  await panel
    .getByRole("textbox", { name: "替换为", exact: true })
    .fill("y_{$1}");
  await expect(panel.locator(".dsl-search-count")).toContainText("/ 3");
  await expect(panel.locator(".dsl-search-preview")).toContainText("y_{12}");
  await panel
    .getByRole("button", { name: "替换整个工程中的全部匹配", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  await expect(editor).toContainText("y_{12} y_{34}");
  await expect(editor).toContainText("y_{56}");
  await expect(panel.locator(".dsl-search-result")).toHaveText("已替换 3 处");
  await page.keyboard.press("Escape");
  await editor.focus();
  await page.keyboard.press("Control+z");
  await expect(editor).toContainText("x_12 x_34");
  await expect(editor).toContainText("x_56");
  await page.keyboard.press("Control+Alt+f");
  await expect(
    panel.getByRole("textbox", { name: "替换为", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Control+f");
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("textbox", { name: "搜索整个工程" }),
  ).toBeFocused();
  await expect(
    panel.getByRole("textbox", { name: "替换为", exact: true }),
  ).toHaveValue("y_{$1}");
  await panel
    .getByRole("textbox", { name: "搜索整个工程" })
    .fill("x_(?<index>\\d+)");
  await panel
    .getByRole("textbox", { name: "替换为", exact: true })
    .fill(String.raw`\alpha_{$<index>}`);
  await panel
    .getByRole("button", { name: "替换整个工程中的全部匹配", exact: true })
    .click();
  await expect(editor).toContainText(String.raw`\alpha_{12}`);
  await expect(editor).not.toContainText("undefined");
  await page.screenshot({ path: testInfo.outputPath("search-replace.png") });
  expect(errors).toEqual([]);
});
test("invalid patterns disable replacement, literal mode preserves backslashes and navigation wraps", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "全局搜索替换", exact: true }).click();
  const panel = page.getByRole("search", { name: "全局搜索替换" }),
    input = panel.getByRole("textbox", { name: "搜索整个工程" });
  await input.fill("(");
  await panel
    .getByRole("button", { name: "使用正则表达式", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("正则表达式无效");
  await expect(
    panel.getByRole("button", {
      name: "替换整个工程中的全部匹配",
      exact: true,
    }),
  ).toBeDisabled();
  await input.fill("x_(\\d+)");
  await expect(panel.getByRole("alert")).toBeHidden();
  await input.press("Enter");
  await expect(panel.locator(".dsl-search-count")).toHaveText("1 / 3");
  await input.press("Shift+Enter");
  await expect(panel.locator(".dsl-search-count")).toHaveText("3 / 3");
  await panel.getByRole("textbox", { name: "替换为", exact: true }).fill("$1");
  await panel
    .getByRole("button", { name: "替换当前匹配", exact: true })
    .click();
  await expect(panel.locator(".dsl-search-count")).toHaveText("1 / 2");
  await expect(page.getByRole("textbox", { name: "DSL 编辑器" })).toContainText(
    "Text{ 56 }",
  );
  await panel
    .getByRole("button", { name: "使用正则表达式", exact: true })
    .click();
  await input.fill("x_12");
  await panel
    .getByRole("textbox", { name: "替换为", exact: true })
    .fill(String.raw`\nabla $1`);
  await panel
    .getByRole("button", { name: "替换当前匹配", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "DSL 编辑器" })).toContainText(
    String.raw`\nabla $1`,
  );
  await input.press("Escape");
  await page
    .locator(".tabs")
    .getByRole("tab", { name: "素材", exact: true })
    .click();
  await page
    .locator(".tabs")
    .getByRole("tab", { name: "DSL", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
});
test("zero-width matches progress, local input undo stays local, and repeated edits update counts", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press("Control+f");
  const panel = page.getByRole("search", { name: "全局搜索替换" }),
    input = panel.getByRole("textbox", { name: "搜索整个工程" });
  await input.fill("^");
  await panel
    .getByRole("button", { name: "使用正则表达式", exact: true })
    .click();
  await expect(panel.locator(".dsl-search-count")).toContainText("/ 3");
  await expect(panel.locator(".dsl-search-count")).toHaveText("1 / 3");
  await input.press("Enter");
  await expect(panel.locator(".dsl-search-count")).toHaveText("2 / 3");
  await input.press("Enter");
  await expect(panel.locator(".dsl-search-count")).toHaveText("3 / 3");
  await panel.getByRole("textbox", { name: "替换为", exact: true }).fill("// ");
  await panel
    .getByRole("button", { name: "替换整个工程中的全部匹配", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "DSL 编辑器" })).toContainText(
    "// Deck",
  );
  // The replacement is allowed to edit invalid DSL so search can also repair it.
  await expect(page.locator(".editor-diagnostic")).toBeVisible();
  await input.fill("^// ");
  await panel.getByRole("textbox", { name: "替换为", exact: true }).fill("");
  await panel
    .getByRole("button", { name: "替换整个工程中的全部匹配", exact: true })
    .click();
  await expect(page.locator(".editor-diagnostic")).toHaveCount(0);
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  const before = await editor.textContent();
  await input.press("End");
  await input.pressSequentially("suffix");
  await input.press("Control+z");
  await expect(editor).toHaveText(before!);
});

test("the unified search panel fits a narrow screen and the global button opens it", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: "全局搜索替换", exact: true }).click();
  const panel = page.getByRole("search", { name: "全局搜索替换" });
  await expect(panel).toBeVisible();
  await panel.getByRole("textbox", { name: "搜索整个工程" }).fill("x_");
  await expect(panel.locator(".dsl-search-count")).toContainText("/ 3");
  expect(
    await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("search-mobile.png") });
});
