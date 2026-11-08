# Easy Slide 声明式 DSL

使用类似 SwiftUI 的声明和链式修饰符，但保持工程扁平：**Deck、Theme、每个 Slide 都在顶层并列书写**，不再用 Deck 的花括号包裹全部页面。仅在需要组合布局时使用 HStack 等容器。

```swift
Deck("从局部，到无限", author: "林知远 · 数学论坛")
    .transition(.slide, duration: 650, direction: .left, easing: .easeOut)

Theme(accent: "#16766d", background: "#fafbf9")

Slide(title: "从局部，到无限。", subtitle: "一个关于最优解的故事") {
    Cover {
        Text("林知远 / 应用数学研究组").font(18)
    }
}

Slide(title: "每一步，都更接近答案") {
    Split {
        Bullets(["计算梯度", "选择步长", "迭代收敛"], title: "关键思路")
            .appear(.rise, step: 1, order: 0, duration: 500)
        Equation(#"x_{k+1}=x_k-\eta\nabla f(x_k)"#)
            .appear(.zoom, step: 1, order: 1, delay: 150, duration: 700, easing: .easeOut)
    }
}.notes("先给出直觉，再引入公式")
```

保存为 `.slide`（也接受 `.swift`），无需 Swift 编译器、账号或云服务。旧版 `Deck(...) { Slide(...) {...} }` 继续兼容。点击 DSL 编辑器工具栏的「整理为扁平结构」可转换当前工程；整理和可视化字段编辑会重新生成规范源码，移除注释，纯 DSL 输入、保存与导入导出则保留原文。

## 编辑体验与错误提示

- 输入名称会显示组件、修饰符、参数和枚举补全；`Ctrl / ⌘ + Space` 主动呼出补全，也可点编辑器上方星光按钮。箭头键选择，Enter / Tab 接受，Esc 关闭。
- 支持行号、语法着色、括号匹配、自动闭合与四空格缩进。Image 的补全可使用工程内已有素材路径。
- 语法错误和参数错误显示行列、红色标记、说明与修正建议；常见拼写错误会给出候选名称。点击「定位」跳至错误处。
- 修改错误时画布保留上次有效预览，修复后自动同步。无效 DSL 不会导出为完整工程；可单独导出纯文本保留草稿。

## 语法规则

字符串使用双引号，支持 `\n`、`\t`、`\r`、`\"`、`\\`。公式推荐原始字符串 `#"\frac{a}{b}"#`，无需双写反斜杠；三引号支持多行。`//` 开头为行尾注释。数组使用 `[...]`，可嵌套。命名参数使用 `name: value`，枚举使用 `.name`。数值形式的正文、指标要用双引号。

专用解析器不会执行声明中的代码；不支持变量、循环、函数或远程代码导入。

## 工程与页面

`Deck("名称", author: "作者")` 为唯一工程头，必须位于首个声明。可选 `version: 1`，默认为 1。之后为一个可选 `Theme` 和 1–200 个 `Slide`。

`Theme` 可设置 `accent`、`background`、`color`、`font`、`material`。颜色为 `"#RRGGBB"`。字体需本机安装。

`Slide(title: "标题", eyebrow: "页眉", subtitle: "副标题") { 布局组件 { 内容 } }`。Slide 只负责页面元数据与页级过渡，不接收布局参数。

| 布局        | 适用内容                                     |
| ----------- | -------------------------------------------- |
| `Cover`     | 大标题、摘要、署名，建议一个文字块和一个公式 |
| `Section`   | 章节、结束页                                 |
| `Flow`      | 正文纵向分配；自由组合时可仅放一个容器       |
| `Split`     | 双栏，适合 2 块                              |
| `Cards`     | 最多三列自动换行，推荐 3–6 块                |
| `Compare`   | 双栏卡片对比                                 |
| `Timeline`  | 横向里程碑卡片                               |
| `ImageText` | 双栏图文                                     |

页面修饰符：`.notes("讲述思路")`、`.background("#fafbf9")`、`.foreground("#192c2a")`、`.transition(...)`。

## 动画编排

```swift
Slide(title: "依次揭示三个结论") {
    Cards {
        Metric("01", label: "方向")
            .appear(.rise, step: 1, order: 0, duration: 500)
        Metric("02", label: "步长")
            .appear(.fade, step: 1, order: 1, delay: 100, duration: 400)
        Metric("03", label: "收敛")
            .appear(.zoom, step: 2, duration: 600, easing: .spring)
    }
}
```

| 参数                  | 含义                                                                                        | 默认值               |
| --------------------- | ------------------------------------------------------------------------------------------- | -------------------- |
| `.appear(.效果, ...)` | `fade` 淡入、`rise` 上浮、`slideLeft` 从左、`slideRight` 从右、`zoom` 缩放、`none` 直接显示 | 无显式动画时直接显示 |
| `step`                | 第几次点击触发，0 为进入页面时；0–30 整数                                                   | 0                    |
| `order`               | **同一 step 中**的先后分组，0–100 整数                                                      | 0                    |
| `delay`               | 相对本 order 开始时间的延迟，0–10000 毫秒                                                   | 0                    |
| `duration`            | 入场时长，0–10000 毫秒                                                                      | 600                  |
| `easing`              | `linear`、`easeOut`、`easeInOut`、`spring`                                                  | `easeOut`            |

同一个 step、同一个 order 的内容同时开始，各自计算 delay。下一 order 从上一 order 最晚完成时开始，再加自身 delay。例如 A 时长 500ms，B 同序号延迟 200ms、时长 600ms，则这组在 800ms 完成；下一序号 C 延迟 100ms，则在 900ms 开始。

`step` 编号不需要连续：1、3 表示两次点击，界面会跳过没有内容的阶段。同一阶段会自动播放其全部 order。不同 step 不共享延迟时间轴。

`.step(1)` 作为简写继续支持，使用默认上浮 450ms；同时使用 `.appear()` 时，step 参数或后写的 `.step()` 决定点击阶段。

容器的 `.appear()` 会作用于内容组。子内容可另设 `.appear()` 覆盖效果、另设 `.step()` 延后触发；子项不能早于父容器的 step。

画布下方「动画编排」提供时间线、阶段选择、重播和完整页面视图；点击某个条目可重播其阶段。正式演示使用空格或右方向键继续。

### 页级过渡

```swift
Deck("演示").transition(.slide, duration: 650, direction: .left, easing: .easeOut)

Slide(title: "下一页") {
    Text("内容")
}.transition(.zoom, duration: 800, easing: .spring)
```

Deck 设置全局默认；Slide 可覆盖。效果 `fade / slide / zoom / none`，方向 `left / right / up / down`（用于 slide），时长 0–3000ms。缓动同入场动画。

## 布局组合

| 声明                                    | 行为                         |
| --------------------------------------- | ---------------------------- |
| `HStack(spacing: 24) { ... }`           | 水平排列，默认等分可用宽度   |
| `VStack(spacing: 24) { ... }`           | 垂直排列，默认等分可用高度   |
| `Grid(columns: 2, spacing: 24) { ... }` | 固定列数、自动计算行数       |
| `ZStack { ... }`                        | 后声明的内容叠放在上层       |
| `Spacer`                                | 占据一份剩余空间，可固定尺寸 |

HStack 内的 `.frame(width: ...)` 先分配固定宽度，其余平分剩余空间；VStack 对 height 同理。跨轴默认填满。spacing 默认 24，columns 为 1–12。每页最多 30 个顶层块、300 个总块，最多 30 层嵌套。

## 内容组件

```swift
Text("正文").font(24)
Bullets(["要点一", "要点二"], title: "关键思路")
Equation(#"f(x)-f(x^*) \leq \frac{C}{k}"#)
Image("assets/plot.png")
Metric("99.95%", label: "可用性", text: "过去 30 天")
Code("const answer = 42;")
Quote("一个有价值的问题，是研究的起点。")
Table([["事项", "状态"], ["基准测试", "已完成"]])
```

每类组件接受一个未命名内容参数；也可用命名参数 text，图片为 src，指标为 value，列表为 items，表格为 rows。可选 title 为块标题。

| 通用修饰符                                       | 含义                          |
| ------------------------------------------------ | ----------------------------- |
| `.font(24)`                                      | 正文/指标字号；容器可传给后代 |
| `.foreground("#16766d")`                         | 文字颜色，可继承              |
| `.background("#eef2ef")`                         | 内容背景                      |
| `.frame(width: 480, height: 320)`                | 固定尺寸，可单独设某一维      |
| `.frame(x: 80, y: 250, width: 500, height: 300)` | 画布绝对定位                  |
| `.padding(24)`                                   | 内容边界内缩                  |
| `.title("标题")`                                 | 内容块标题                    |

画布固定 1280 × 720（16:9）；正文一般分配在 x≈72–1208、y≈250–620。坐标和尺寸均为非负像素。公式和图片等比包含在区域内，其大小由区域控制，font 不影响公式与图片。长文建议拆页；网页裁切超长文字，PPTX 尝试缩小字体。

## 导出与兼容性

网页和 PPTX 共享场景与动画时间线，PPTX 使用原生 DrawingML 入场动画树，保留点击组、相对顺序、延迟、时长、页级过渡方向及备注。文本可编辑，公式为 SVG，推荐 PowerPoint 2019+ / Microsoft 365。

不同播放器对动画支持存在差异：PPTX 的弹性缓动近似为减速，其余缓动映射为原生加减速；页级时长附带现代 PowerPoint 的精确毫秒与旧版三档回退。入场轨迹、字体与网页可能有差别。当前自动测试检查导出 XML 与目标对象，不替代桌面 PowerPoint 播放验证。

完整工程 JSON：`{ format: "easy-slide", version: 1, source: "DSL文本", assets: { "assets/a.png": "data:image/png;base64,..." } }`。纯 `.slide` 导出不包含图片。

图片经素材面板、文件夹或粘贴导入。使用 `assets/` 相对路径；支持 PNG、JPEG、WebP、GIF。禁止远程 HTTP、file 与目录穿越路径。

### 列表、表格与容器的逐项交错

```swift
Slide(title: "依次展开思路") {
    Bullets(["提出问题", "建立模型", "验证结论"])
        .appear(.rise, step: 1, duration: 500)
        .stagger(120)
}
```

`.stagger(120)` 让后一个子项比前一个晚 120ms 启动，可相互重叠。适用于 Bullets 列表条目、Table 表格行，以及布局组件、Glass、HStack / VStack / Grid / ZStack 的直接子项。与 order 不同，stagger 不等待前项完成。与 delay 叠加，范围 0–10000ms；同时作用于网页与 PPTX。

## 独立布局组件与毛玻璃

布局不再是 Slide 的选项。例如 `Slide(title: "对比") { Split { ... } }`。布局组件可以相互嵌套、接收 `.padding()`、`.frame()`、`.appear()` 等通用修饰符。Cover / Section 作为页面唯一根布局时负责大标题；其他组合在常规标题下排版。无布局组件时，页面将顶层内容默认纵向等分。

`Cards(columns: 3, spacing: 24)` 设置卡片列数与间距；Split、Compare、ImageText 设置 spacing；Flow 纵向排列，Timeline 横向排列里程碑卡片。右侧「布局组件」按钮替换根布局组件，保留内部内容。

```swift
Deck("研究报告")
Theme(accent: "#256e76", material: .glass)

Slide(title: "主要结论") {
    Split(spacing: 32) {
        Glass {
            Bullets(["局部信息决定方向", "合适步长保证稳定"])
        }
        Glass {
            Equation(#"x_{k+1}=x_k-\eta\nabla f(x_k)"#)
        }.glass(blur: 28, opacity: 0.64, radius: 30)
    }
}
```

`Glass { ... }` 是独立面板组件，默认纵向排列内容、内边距 28px；也可在任意内容或布局上使用 `.glass(blur: 24, opacity: 0.68, radius: 28)`。blur 为 0–80px，opacity 为 0–1，radius 为 0–100px。Theme 的 `.glass` 材质为卡片布局添加面板与低对比渐变背景；`.solid` 使用纯色面板。右侧「默认卡片材质」可切换主题材质。

网页使用真实 backdrop-filter。PowerPoint 不支持实时背景模糊，因此导出把渐变背景与毛玻璃面板纹理烘焙成图片；前景文字保持可编辑，公式保持 SVG，入场动画保留。纹理模糊采样的是页面背景，不会动态重新模糊后续移动或修改的内容，也不会采样叠层中其他图片/文字。更改材质后重新导出即可更新纹理。

## LaTeX 补全与诊断

在 Equation 的字符串里输入反斜杠，会补全分式、积分、求和、希腊字母、集合、矩阵、分段函数等命令；提示附有排版预览与用途。也可使用 Ctrl / ⌘ + Space 主动唤起。接受补全后用 Tab 在分子、分母等占位符间切换。

支持 `Equation(#"\frac{a}{b}"#)` 原始字符串，也支持需要双写反斜杠的普通字符串。未知命令、不匹配括号等会显示在 Equation 声明所在位置，并尽可能给出相近命令。出错时保留最后有效预览；不能导出包含错误公式的工程。

旧版 `Slide(.split, ...)` 仍可读取，保存/整理后统一写成独立 Split 组件。
