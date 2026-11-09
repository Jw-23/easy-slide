import { test, expect } from "@playwright/test";
const source = `Deck("数学") Theme(preset:.paper)
Slide(title:"归纳证明") {
 Proof {
  ProofStep("初始情形"){Text("初始内容")}
  PageBreak()
  ProofStep("递推情形"){Text("递推内容").appear(.rise,step:1)}
 }
}
Slide(title:"讨论"){Text("讨论")}`;

test("continues math environments and edits whole groups with source navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "math.json",
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
  await expect(page.locator(".slide-item")).toHaveCount(3);
  await expect(page.locator(".preview-wrap")).toContainText("步骤 1");
  await page.locator(".slide-item").nth(1).click();
  await expect(page.locator(".preview-wrap")).toContainText("步骤 2");
  await page
    .getByRole("textbox", { name: "页标题", exact: true })
    .fill("更新的证明");
  await expect(page.locator(".slide-label").first()).toContainText(
    "更新的证明",
  );
  await page
    .locator(".preview-wrap [data-scene-element]")
    .filter({ hasText: /^递推内容$/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "定位到 DSL", exact: true }).click();
  await expect(page.locator(".cm-activeLine")).toContainText(
    'Text("递推内容")',
  );
  await page.getByRole("button", { name: "复制动态页组", exact: true }).click();
  await expect(page.locator(".slide-item")).toHaveCount(5);
  await page.getByRole("button", { name: "删除动态页组", exact: true }).click();
  await expect(page.locator(".slide-item")).toHaveCount(3);
});
