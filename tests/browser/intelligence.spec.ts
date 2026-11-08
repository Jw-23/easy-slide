import { test, expect, type Page } from "@playwright/test";
async function editAt(page: Page, marked: string) {
  const pos = marked.indexOf("¦"),
    doc = marked.replace("¦", "");
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  await editor.fill(doc);
  await page.keyboard.press("Control+End");
  for (let i = 0; i < doc.length - pos; i++)
    await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Control+Space");
  return editor;
}
test("AST completions preserve existing calls and labels and display the active parameter", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.locator(".tabs").getByRole("button", { name: "DSL" }).click();
  const editor = await editAt(
    page,
    'Deck("AST")\nSlide(title:"A"){Text("A").fo¦nt(24)}',
  );
  const popup = page.locator(".cm-tooltip-autocomplete");
  await expect(popup).toContainText("font");
  await expect(popup).not.toContainText("transition");
  await expect(popup).not.toContainText("tableStyle");
  await popup.getByRole("option").filter({ hasText: "font" }).click();
  await expect(editor).toContainText('Text("A").font(24)');
  await expect(editor).not.toContainText("font(24)(24)");
  await expect(page.locator(".editor-diagnostic")).toHaveCount(0);
  await editAt(
    page,
    'Deck("AST")\nSlide(title:"A"){Text("A").appear(.fade, dur¦ation: 125)}',
  );
  await popup.getByRole("option").filter({ hasText: "duration:" }).click();
  await expect(editor).toContainText("duration: 125");
  await expect(editor).not.toContainText("duration::");
  await expect(page.locator(".editor-diagnostic")).toHaveCount(0);
  await editAt(
    page,
    'Deck("AST")\nSlide(title:"A"){Text("A").appear(.fade, easing: .¦)}',
  );
  await expect(popup).toContainText("easeOut");
  await expect(popup).not.toContainText("slideLeft");
  await expect(
    page.locator(".dsl-signature strong").filter({ hasText: "easing" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/ast-completion.png",
    fullPage: true,
  });
});
test("callback and inferred array completions work in the actual editor", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.locator(".tabs").getByRole("button", { name: "DSL" }).click();
  await editAt(
    page,
    'let values=range(0,3).map((sample,index)=>sa¦)\nDeck("AST")\nSlide(title:"A"){Text("B")}',
  );
  const popup = page.locator(".cm-tooltip-autocomplete");
  await expect(popup).toContainText("sample");
  await expect(
    popup.getByRole("option").filter({ hasText: "sample" }),
  ).toContainText("Number");
  await popup.getByRole("option").filter({ hasText: "sample" }).click();
  await expect(page.locator(".editor-diagnostic")).toHaveCount(0);
  await editAt(
    page,
    'let values=range(0,3).map(x=>[x])\nDeck("AST")\nSlide(title:"A"){Table(rows:values.¦)}',
  );
  await expect(popup).toContainText("map");
  await expect(popup).toContainText("filter");
  await expect(popup).toContainText("length");
  await expect(popup).not.toContainText("foreground");
});
