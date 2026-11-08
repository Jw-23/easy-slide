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
  await expect(page.locator(".slide-item")).toHaveCount(20);
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
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存工程", exact: true }).click();
  const source = JSON.parse(
    await readFile((await (await backup).path())!, "utf8"),
  ).source;
  await editor.fill('Deck("broken") {}');
  await expect(page.locator(".editor-diagnostic")).toContainText("1–200");
  await expect(page.locator(".preview-wrap")).toContainText("本地测试标题");
  await editor.fill(source);
  await page.locator(".slide-item").nth(2).click();
  await page.getByRole("button", { name: "演示", exact: true }).click();
  const formula = page.locator('.presentation img[alt^="x_"]').locator("..");
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
  ).toHaveLength(20);
  const first = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(first).toContain("本地测试标题");
  expect(first).toContain("<p:transition");
  expect(first).toContain("<p:push");
  const animated = await zip.file("ppt/slides/slide6.xml")!.async("string");
  expect(animated).toContain("<p:timing>");
  expect(animated).toContain('presetClass="entr"');
  expect(animated).toContain('delay="600"');
  expect(animated).toContain('delay="1200"');
  const invalidXml = await page.evaluate(
    async (str) =>
      new DOMParser()
        .parseFromString(str, "application/xml")
        .querySelector("parsererror")?.textContent,
    animated,
  );
  expect(invalidXml).toBeUndefined();
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
  await expect(page.locator(".asset-list img")).toHaveCount(2);
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
  await expect(page.locator('.preview-wrap img[alt^="x_"]')).toBeVisible();
  await page.getByRole("button", { name: "DSL 使用指南" }).click();
  await expect(page.locator(".help-modal")).toBeVisible();
  expect(remote).toEqual([]);
});
test("flat authoring offers completion, located diagnostics and timed playback", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.locator(".tabs").getByRole("button", { name: "DSL" }).click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  await editor.fill('Deck("提示")\nSlide(.content, title: "测试") {\n    Te');
  await page.keyboard.press("Control+Space");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("Text");
  await page
    .locator(".cm-tooltip-autocomplete li")
    .filter({ hasText: "Text" })
    .first()
    .click();
  await expect(editor).toContainText('Text("正文")');
  await editor.fill(
    'Deck("提示")\nSlide(.content, title: "测试") {\n    Text("错误").font(-3)\n}',
  );
  const diagnostic = page.locator(".editor-diagnostic");
  await expect(diagnostic).toContainText("第 3 行");
  await expect(diagnostic).toContainText("size 必须是非负数字");
  await diagnostic.getByRole("button", { name: /定位/ }).click();
  await expect(editor).toBeFocused();
  await editor.fill(
    'Deck("提示")\nSlide(.content,title:"测试"){Text("A").appear(.',
  );
  await page.keyboard.press("Control+Space");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText(
    "slideLeft",
  );
  await editor.fill(`Deck("编排测试").transition(.none)
Slide(.content, title: "定义出现顺序") {
 Text("首先出现").appear(.rise, step: 1, order: 0, duration: 400)
 Text("接续出现").appear(.zoom, step: 1, order: 1, delay: 150, duration: 500, easing: .linear)
 Text("下一次点击").appear(.fade, step: 3, duration: 300)
}`);
  await expect(page.locator(".editor-diagnostic")).toHaveCount(0);
  await expect(page.locator(".preview-wrap")).toContainText("定义出现顺序");
  await page.getByRole("button", { name: /动画编排/ }).click();
  await expect(page.locator(".motion-panel")).toContainText("550–1050 ms");
  await page
    .locator(".stage-chips")
    .getByRole("button", { name: "点击 1", exact: true })
    .click();
  const animation = await page
    .locator(".preview-wrap [data-motion]")
    .filter({ hasText: "接续出现" })
    .evaluate((e) => e.getAnimations()[0]?.effect?.getTiming());
  expect(animation).toMatchObject({
    delay: 550,
    duration: 500,
    easing: "linear",
  });
  await page.getByRole("button", { name: "演示", exact: true }).click();
  await page.keyboard.press("Space");
  await expect(
    page.locator(".presentation [data-motion]").filter({ hasText: "首先出现" }),
  ).toHaveCSS("opacity", "1");
  await page.keyboard.press("Space");
  await expect(
    page
      .locator(".presentation [data-motion]")
      .filter({ hasText: "下一次点击" }),
  ).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/flat-dsl-editor.png",
    fullPage: true,
  });
});
test("independent layouts, LaTeX completion and glass export work together", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.locator(".tabs").getByRole("button", { name: "DSL" }).click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  await editor.fill('Deck("公式")\nSlide(title:"公式提示"){Equation(#"\\fr');
  await page.keyboard.press("Control+Space");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText(
    "\\frac",
  );
  await page
    .locator(".cm-tooltip-autocomplete li")
    .filter({ hasText: "\\frac" })
    .first()
    .click();
  await expect(editor).toContainText("\\frac{分子}{分母}");
  await editor.fill('Deck("公式")\nSlide(title:"公式提示"){Equation("\\\\fr');
  await page.keyboard.press("Control+Space");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText(
    "\\frac",
  );
  await page
    .locator(".cm-tooltip-autocomplete li")
    .filter({ hasText: "\\frac" })
    .first()
    .click();
  await expect(editor).toContainText("\\\\frac{分子}{分母}");
  await editor.fill(
    'Deck("公式")\nSlide(title:"公式提示"){Equation(#"\\frca{a}{b}"#)}',
  );
  await expect(page.locator(".editor-diagnostic")).toContainText("LaTeX");
  await expect(page.locator(".editor-diagnostic")).toContainText("frac");
  await editor.fill(`Deck("毛玻璃研究报告")
Theme(accent:"#256e76", material:.glass)
Slide(title:"公式与结论", eyebrow:"RESULTS") {
 Split(spacing:32) {
  Glass {Bullets(["局部梯度决定方向", "步长控制收敛速度"],title:"主要结论")}
  Glass {Equation(#"x_{k+1}=x_k-\\eta\\nabla f(x_k)"#)}.glass(blur:28,opacity:0.64,radius:30)
 }
}`);
  await expect(page.locator(".editor-diagnostic")).toHaveCount(0);
  await expect(page.locator(".preview-wrap")).toContainText("公式与结论");
  const pane = page
    .locator('.preview-wrap div[style*="backdrop-filter"]')
    .first();
  await expect(pane).toHaveCSS("backdrop-filter", /blur\(24px\)/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: /PowerPoint/ }).click();
  const file = await download;
  const zip = await JSZip.loadAsync(await readFile((await file.path())!));
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).toContain("局部梯度决定方向");
  expect(xml).toContain("<p:pic>");
  expect(
    Object.keys(zip.files).filter(
      (x) => x.startsWith("ppt/media/") && x.endsWith(".png"),
    ).length,
  ).toBeGreaterThanOrEqual(3);
  const error = await page.evaluate(
    (x) =>
      new DOMParser()
        .parseFromString(x, "application/xml")
        .querySelector("parsererror")?.textContent,
    xml,
  );
  expect(error).toBeUndefined();
  await page.screenshot({
    path: "test-results/glass-latex-layout.png",
    fullPage: true,
  });
});
test("the full startup tour renders without missing assets or clipped text and can be reopened", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".slide-item")).toHaveCount(20);
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await page.locator(".slide-item").nth(i).click();
    await expect(page.locator(".preview-wrap .missing-image")).toHaveCount(0);
    await expect
      .poll(() =>
        page
          .locator(".preview-wrap img")
          .evaluateAll((images) =>
            images.every(
              (i) =>
                (i as HTMLImageElement).complete &&
                (i as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    const overflow = await page.locator(".preview-wrap").evaluate((root) =>
      Array.from(
        root.querySelectorAll<HTMLElement>('div[style*="overflow: hidden"]'),
      )
        .filter(
          (e) => e.textContent?.trim() && e.scrollHeight > e.clientHeight + 2,
        )
        .map((e) => ({
          text: e.textContent,
          height: e.clientHeight,
          required: e.scrollHeight,
        })),
    );
    expect(overflow, `startup tour page ${i + 1}`).toEqual([]);
    if ([0, 7, 12].includes(i))
      await page.locator(".preview-wrap .slide-frame").screenshot({
        path: `test-results/tour-${i + 1}.png`,
        animations: "disabled",
      });
  }
  await page.getByRole("button", { name: "切换示例", exact: true }).click();
  await page.locator(".template-card").filter({ hasText: "数学论坛" }).click();
  await page
    .locator(".modal")
    .getByRole("button", { name: "切换示例", exact: true })
    .click();
  await expect(page.locator(".slide-item")).toHaveCount(7);
  await page.locator(".tabs").getByRole("button", { name: "素材" }).click();
  await expect(page.locator(".asset-list img")).toHaveCount(0);
  await page.getByRole("button", { name: "切换示例", exact: true }).click();
  await page.locator(".template-card").filter({ hasText: "功能示例" }).click();
  await page
    .locator(".modal")
    .getByRole("button", { name: "切换示例", exact: true })
    .click();
  await expect(page.locator(".slide-item")).toHaveCount(20);
  await expect(page.locator(".asset-list img")).toHaveCount(1);
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".slide-item")).toHaveCount(20);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存工程", exact: true }).click();
  const p = JSON.parse(await readFile((await (await dl).path())!, "utf8"));
  expect(p.assets["assets/convergence.png"]).toMatch(
    /^data:image\/png;base64,/,
  );
});
test("direct feature tour isolates its saved draft from the existing working project", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "页标题", exact: true })
    .fill("保留的工作工程");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.goto("/?example=features");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".slide-item")).toHaveCount(20);
  await expect(page.locator(".preview-wrap")).toContainText("Easy Slide");
  await expect(page.locator(".preview-wrap")).not.toContainText(
    "保留的工作工程",
  );
  await page
    .getByRole("textbox", { name: "页标题", exact: true })
    .fill("演示里的修改");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.locator(".preview-wrap")).toContainText("保留的工作工程");
  await page.goto("/?example=features");
  await expect(page.locator(".preview-wrap")).toContainText("演示里的修改");
});
test("calculated table updates, survives visual edits and exports aligned data", async ({
  page,
}) => {
  await page.goto("/?example=features");
  await expect(
    page.getByText("已保存在此浏览器", { exact: true }),
  ).toBeVisible();
  await page.locator(".tabs").getByRole("button", { name: "DSL" }).click();
  const editor = page.getByRole("textbox", { name: "DSL 编辑器" });
  const source = `Deck("计算报表")
let rate = 0.2
let data = range(0,4).map(k => [k, (1-rate)^k])
Slide(title:"计算表格") {
 Glass {
  Table(columns:[Column("k",width:1,align:.center),Column("x",width:3,align:.right,format:"0.000")], rows:data)
   .tableStyle(rowHeight:50,borders:.all,zebra:true,headerFill:"#23796e")
 }
}`;
  await editor.fill(source);
  await expect(page.locator(".editor-diagnostic")).toHaveCount(0);
  await expect(page.locator(".preview-wrap")).toContainText("0.640");
  const cell = page
    .locator(".preview-wrap div")
    .filter({ hasText: /^0\.640$/ })
    .last();
  await expect(cell).toHaveCSS("text-align", "right");
  await editor.fill(source.replace("let rate = 0.2", "let rate = 0.5"));
  await expect(page.locator(".preview-wrap")).toContainText("0.250");
  await page
    .locator(".tabs")
    .getByRole("button", { name: "页面", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "页标题", exact: true })
    .fill("改过标题");
  await page.locator(".tabs").getByRole("button", { name: "DSL" }).click();
  await expect(editor).toContainText("let rate = 0.5");
  await expect(editor).toContainText("rows:data");
  await editor.fill(source.replace("rows:data", "rows: [[1 / 0]]"));
  await expect(page.locator(".editor-diagnostic")).toContainText(
    "除数不能为 0",
  );
  await expect(page.locator(".preview-wrap")).toContainText("0.250");
  await editor.fill(source.replace("let rate = 0.2", "let rate = 0.5"));
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: /PowerPoint/ }).click();
  const zip = await JSZip.loadAsync(await readFile((await (await dl).path())!));
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).toContain("0.250");
  expect(xml).toContain('algn="r"');
  await page.screenshot({
    path: "test-results/computed-table.png",
    fullPage: true,
  });
});
