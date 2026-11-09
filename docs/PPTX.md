# PPTX 导出

「导出」中可选择两种文字模式，两种都输出原生 PowerPoint 动画。动画在幻灯片放映模式播放，编辑视图默认显示全部对象。

| 模式             | 内容与用途                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 保留版式（默认） | 文字与图形逐层以 3 倍分辨率渲染，固定字体、换行、字重、边界和层级；文字成为图片，适合直接演示。                             |
| 可编辑文字       | 文字保留为文本框，使用浏览器测得的换行、1.42 倍行距、零段间距和固定字号；图片与材质保持独立。设备字体仍可能影响字形和字重。 |

导出保留 1280 × 720 画布比例、图片等比包含、表格列宽与对齐、页面备注。公式提供内嵌 SVG 及按目标尺寸生成的高清 PNG 回退。WebP 会转换为 PNG，避免播放器缺少 WebP 支持。

纯格式段落在「可编辑文字」模式保留粗体、斜体、删除线与行内等宽代码。含行内公式的段落在两种模式下均使用一个独立 SVG 层及 3 倍 PNG 回退，保留浏览器测得的混排换行、公式基线和动画；该段文字在 PowerPoint 中作为图像编辑。SVG 使用文字和 MathJax 路径，不依赖 foreignObject。

数学环境按内容高度生成的续页会作为独立幻灯片导出，保留环境编号、续页标题、连续步骤和最终证毕符号。备注和页面过渡沿用原始声明，片段的入场动画按各物理页面播放。

## 动画

- step 0 自动播放，每个不同的非零 step 对应一次点击；跳过空阶段，与网页一致。
- 相同 order 并行，后续 order 等前组结束后开始，叠加 delay 与 stagger；保留 duration。
- 计算得到的小数毫秒按 PPTX 要求舍入为整数毫秒。
- fade 使用原生淡入；rise、slideLeft、slideRight 除淡入外，还保留 30px/60px 的实际位移；zoom 从 88% 到 100%。
- 位移/尺寸关键帧采样网页的缓动曲线，spring 保留回弹；透明度使用原生效果，缓动由播放器近似。
- none 只在规定阶段设置为可见，不添加淡入。
- 页面过渡保留效果、方向和毫秒时长；旧版播放器使用三档速度回退。页级缓动由原生过渡实现。

每个场景元素按固定名称映射到实际图形 ID；不依赖输出中的图形顺序。导出保留独立的内容层，没有把整页合成一张静态截图。

毛玻璃采样下层图文，并根据时序排除后续点击才会显示的内容。PPTX 内是静态材质，无法随底层内容后续动画或编辑动态重算模糊。

## 验证

浏览器测试检查两种模式的图形目标、点击组、关键帧、备注、SVG/PNG 回退，以及玻璃不提前暴露后续阶段。可选的实际文件检查使用 LibreOffice 渲染 PDF，并导入为 ODP 检查动画：

```sh
PPTX_QA_DIR=/absolute/output npx playwright test tests/browser/pptx-export.spec.ts
python scripts/verify-pptx.py /absolute/output
```

第二条命令需要 LibreOffice、pdftoppm、Pillow 和 lxml，只用于开发验证。输出网页/PPTX/差异对照图及 report.json。若目录中另有 baseline.pptx，也会输出旧文件的对照结果。

固定测试工程包含中文与英文换行、空行、公式、表格、图片下层玻璃、自动阶段和三个点击阶段。LibreOffice 验证不代表已在 Microsoft PowerPoint 实机放映；不同播放器对动画和过渡的解释仍可能存在差异。

实现参考：[Microsoft PresentationML 动画](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-animation)、[LibreOffice 的原生动画测试文件](https://github.com/LibreOffice/core/blob/master/sd/qa/unit/data/pptx/connector-shape-animations.pptx)。
