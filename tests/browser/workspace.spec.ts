import { test, expect, type Page } from "@playwright/test";
const source = `// keep this comment
Deck("Workflow")
Theme(preset:.paper)
let rows=range(0,3).map(k=>[k,k^2])
Slide(title:"First") { Cards { Table(columns:[Column("k"),Column("square")],rows:rows) Text("stage").appear(.rise,step:2) } }
Slide(title:"Second"){Flow{Text("body")}}`;
async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "workflow.json",
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
  await expect(page.locator(".preview-wrap")).toContainText("First");
}
test("visual edits, page actions and DSL share undo without rewriting calculations", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("textbox", { name: "页标题", exact: true })
    .fill("Changed");
  await page.getByRole("combobox", { name: "演示主题" }).selectOption("ocean");
  await page
    .locator(".history-actions")
    .getByRole("button", { name: "撤销", exact: true })
    .click();
  await expect(page.getByRole("combobox", { name: "演示主题" })).toHaveValue(
    "paper",
  );
  await page
    .locator(".tabs")
    .getByRole("tab", { name: "DSL", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  await expect(editor).toContainText("// keep this comment");
  await expect(editor).toContainText("rows:rows");
  await expect(editor).toContainText('title:"Changed"');
  await editor.focus();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".preview-wrap")).toContainText("First");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".preview-wrap")).toContainText("Changed");
  await page.getByRole("button", { name: "下移此页", exact: true }).click();
  await expect(page.locator(".slide-label").first()).toContainText("Second");
  await page.getByRole("button", { name: "复制此页", exact: true }).click();
  await expect(page.locator(".slide-item")).toHaveCount(3);
  await page.getByRole("button", { name: "删除此页", exact: true }).click();
  await expect(page.locator(".slide-item")).toHaveCount(2);
  await page
    .locator(".history-actions")
    .getByRole("button", { name: "撤销", exact: true })
    .click();
  await expect(page.locator(".slide-item")).toHaveCount(3);
});
test("panels resize, focus mode restores, dialogs trap focus and restore the trigger", async ({
  page,
}) => {
  await open(page);
  const separator = page.getByRole("separator", { name: "调整编辑面板宽度" });
  const before = Number(await separator.getAttribute("aria-valuenow"));
  await separator.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", String(before + 20));
  await page.getByRole("button", { name: "专注预览", exact: true }).click();
  await expect(page.locator(".inspector")).toBeHidden();
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.getByRole("button", { name: "专注预览", exact: true }).click();
  await expect(page.locator(".inspector")).toBeVisible();
  const trigger = page.getByRole("button", { name: "导出", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "导出", exact: true });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => document.activeElement?.closest("dialog") !== null,
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
test("small screens use one pane, keep the viewport clear and support presentation stage backtracking", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const modes = page.getByRole("navigation", { name: "工作区切换" });
  await modes.getByRole("button", { name: "DSL", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "DSL 编辑器" })).toBeVisible();
  await expect(page.locator(".main")).toBeHidden();
  await modes.getByRole("button", { name: "页面列表", exact: true }).click();
  await page.locator(".slide-item").first().click();
  await expect(page.locator(".main")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "演示", exact: true }).click();
  const stage = page
    .locator(".presentation [data-motion]")
    .filter({ hasText: "stage" });
  await expect(stage).toHaveCSS("opacity", "0");
  await page.keyboard.press("Space");
  await expect(stage).toHaveCSS("opacity", "1");
  await page.keyboard.press("ArrowLeft");
  await expect(stage).toHaveCSS("opacity", "0");
  await page.keyboard.press("Escape");
  await expect(page.locator(".presentation")).toHaveCount(0);
});
