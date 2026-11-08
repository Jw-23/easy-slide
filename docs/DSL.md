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
- 补全基于保留源码位置、可容忍未完成代码的 AST。括号未闭合、参数未写完或前面有错误时，仍会分析当前位置；注释与普通正文字符串中不会出现 DSL 候选。
- 候选按作用域和类型判断：只列出可见的 let 常量和回调参数，处理局部遮蔽、声明顺序及兄弟布局作用域。推断数组、二维表格、map/filter/reduce 回调、下标与用户函数的返回类型；相符类型优先显示，其他可见变量仍可用于继续构造表达式。
- 链式提示跟随接收者：Deck 只有 transition；Slide 支持过渡、背景、文字色和备注；Table 才提示 tableStyle。数组提示 map/filter/reduce/length，文本只提示 length。
- 参数名排除已经填写的参数，枚举跟随当前参数；在已有调用或参数名中间接受补全时，保留原有括号、冒号和值。调用中显示签名并高亮当前参数，悬停名称可查看推断类型与定义行。
- 支持行号、语法着色、括号匹配、自动闭合与四空格缩进。Image 的补全可使用工程内已有素材路径。
- Image/src 的普通或原始字符串提示素材；数字格式与颜色字符串提供对应候选，Equation 的公式字符串提供 LaTeX 补全。所有分析和计算在本地完成，补全仅静态推断类型，不运行函数或生成数组。
- 语法错误和参数错误显示行列、红色标记、说明与修正建议；常见拼写错误会给出候选名称。点击「定位」跳至错误处。
- 修改错误时画布保留上次有效预览，修复后自动同步。无效 DSL 不会导出为完整工程；可单独导出纯文本保留草稿。

## 语法规则

字符串使用双引号，支持 `\n`、`\t`、`\r`、`\"`、`\\`。公式推荐原始字符串 `#"\frac{a}{b}"#`，无需双写反斜杠；三引号支持多行。`//` 开头为行尾注释。数组使用 `[...]`，可嵌套。命名参数使用 `name: value`，枚举使用 `.name`。数值形式的正文、指标要用双引号。

专用解释器支持 let 常量、表达式和有界数组计算，不执行 JavaScript 或远程代码。使用 range、map、filter、reduce 生成数据，不提供通用命令执行或浏览器 API 访问。

## 工程与页面

`Deck("名称", author: "作者")` 为唯一工程头；前后可声明 let 常量，变量必须先定义再使用。可选 `version: 1`，默认为 1。之后为一个可选 `Theme` 和 1–200 个 `Slide`。

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

画布固定 1280 × 720（16:9）；正文一般分配在 x≈72–1208、y≈250–620。坐标和尺寸均为非负像素。公式和图片等比包含在区域内，其大小由区域控制，font 不影响公式与图片。长文建议拆页；网页与 PPTX 按内容框裁切超长文字，不自动缩小字号。

## 导出与兼容性

网页和 PPTX 共享场景与动画时间线，PPTX 使用原生 DrawingML 动画，保留点击组、并行/先后顺序、延迟、时长、逐项交错、页级过渡方向及备注。默认「保留版式」逐层保存网页渲染结果，文字成为高清图片；选择「可编辑文字」可保留文本编辑，并固定浏览器测得的换行、行距与边界。公式同时保留 SVG 与高清 PNG 回退，推荐 PowerPoint 2019+ / Microsoft 365。

位移与缩放按网页的 30px/60px 和 88% 起始比例输出关键帧，包含 spring 的回弹；透明度仍用原生淡入，缓动由播放器近似。页级过渡保留效果、方向与精确毫秒，同时提供旧版速度回退。不同播放器的过渡效果可能有差别；可编辑模式还受设备字体影响。已提供 LibreOffice 实际渲染与动画导入检查，不能代替 Microsoft PowerPoint 的实机放映验证。详见 [PPTX 说明](PPTX.md)。

工程导出为 `.easy-slide.zip`，保存原样源码、配置与全部原始图片，包含未使用的素材。ZIP 内的结构如下，可直接解压后通过素材面板打开该文件夹：

```text
project.easy-slide.json   工程清单
slides.slide             DSL 源码，包含主题、备注、计算和动画
assets/...               原始图片，保持相对路径
```

清单格式为 `{ format: "easy-slide-archive", version: 1, source: "slides.slide", assets: { "assets/a.png": { file: "assets/a.png", mime: "image/png" } } }`。图片保存为二进制文件，不内嵌在源码中。导入先读取并校验所有引用文件，成功后才替换当前工程；缺少文件时报告具体路径。

旧版 JSON `{ format: "easy-slide", version: 1, source: "DSL文本", assets: { "assets/a.png": "data:image/png;base64,..." } }` 仍可导入。纯 `.slide` 导出只保留源码，不包含图片；PPTX 是单独的演示文件导出选项。

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

网页使用真实 backdrop-filter。PPTX 将毛玻璃烘焙为纹理，采样下层背景、图片和文字，并根据入场时序排除后续点击才会出现的内容；保留圆角、透明度、边框与阴影。前景内容仍是独立对象并保留动画，可编辑模式中的文字仍可修改，公式保持 SVG。纹理不会随底层内容的后续移动或编辑而动态重新模糊，更改后需要重新导出。

## LaTeX 补全与诊断

在 Equation 的字符串里输入反斜杠，会补全分式、积分、求和、希腊字母、集合、矩阵、分段函数等命令；提示附有排版预览与用途。也可使用 Ctrl / ⌘ + Space 主动唤起。接受补全后用 Tab 在分子、分母等占位符间切换。

支持 `Equation(#"\frac{a}{b}"#)` 原始字符串，也支持需要双写反斜杠的普通字符串。未知命令、不匹配括号等会显示在 Equation 声明所在位置，并尽可能给出相近命令。出错时保留最后有效预览；不能导出包含错误公式的工程。

旧版 `Slide(.split, ...)` 仍可读取，保存/整理后统一写成独立 Split 组件。

## 变量、表达式与计算表格

```swift
Deck("优化过程")

let rate = 0.2
let loss = x => x ^ 2 / 2
let data = range(0, 6).map(k => [k, (1-rate)^k, loss((1-rate)^k)])

Slide(title: "迭代数据") {
    Glass {
        Table(
            columns: [
                Column("k", width: 1, align: .center),
                Column("x", width: 2, align: .right, format: "0.000"),
                Column("f(x)", width: 2, align: .right, format: "0.0000")
            ],
            rows: data
        ).tableStyle(rowHeight: 44, zebra: true, borders: .all)
    }
}
```

`let` 定义不可变常量，也可定义箭头函数。全局常量可放在 Deck 前或后；局部常量可放在 Slide 或布局容器中，必须在当前作用域的组件之前声明。内层可遮蔽外层变量，同一作用域不能重复声明。

### 表达式

- 数值：整数、小数、科学计数法，例如 `-3`、`.25`、`1e-3`。
- 算术：`+ - * / %`；幂使用 `^` 或 `**`，从右向左结合。支持括号、一元正负号。
- 比较：`< <= > >= == !=`；逻辑：`&& || !`；条件：`test ? yes : no`。逻辑和条件分支按需求值。
- `+` 也可拼接两个数组，或拼接文字与标量。文字示例：`"第 " + k + " 次"`。
- 数组：`[1, 2, 3]`，下标从 0 开始，例如 `values[0]`；长度为 `values.length`。
- 标量包括数值、文字、布尔和 null。Table 可直接接收这些标量，null 显示为破折号。Text 与 Metric 仍接收文字，数值可通过 `str`、`fixed`、`percent` 转换。

计算使用双精度浮点数；列格式控制显示精度，不提供任意精度算术。

### 函数与数组生成

| 函数                                                 | 含义                                                |
| ---------------------------------------------------- | --------------------------------------------------- |
| `range(end)` / `range(start, end, step)`             | 不包含终点的范围，默认从 0 开始、步长 1；支持负步长 |
| `repeat(value, count)`                               | 重复值生成数组                                      |
| `values.map((value, index) => ...)`                  | 生成新数组；index 参数可省略                        |
| `values.filter(value => condition)`                  | 根据布尔条件筛选                                    |
| `values.reduce((acc, value, index) => ..., initial)` | 累计计算；index 可省略                              |
| `sum` / `mean` / `min` / `max`                       | 接受数值数组，或一组数值参数                        |
| `pow` / `sqrt` / `abs` / `round` / `floor` / `ceil`  | 数值运算；round 可传第二个小数位参数                |
| `sin` / `cos` / `tan` / `exp` / `log` / `log10`      | 常用数学函数；三角函数使用弧度                      |
| `clamp(value, min, max)`                             | 限制范围                                            |
| `fixed(value, digits)` / `percent(value, digits)`    | 返回定点或百分比文字，小数位为 0–10                 |
| `format(value, "0.000")`                             | 按指定格式返回文字                                  |
| `str(value)` / `len(value)`                          | 标量转文字、数组或文字长度                          |
| `concat(a, b)` / `zip(a, b)` / `transpose(matrix)`   | 拼接数组、按最短长度配对、矩阵转置                  |
| `row(a, b, c)`                                       | 生成一行数据，等同 `[a, b, c]`                      |

例如：

```swift
let costs = [120, 180, 95, 240]
let total = sum(costs)
let high = costs.filter(x => x > 150)
let discounted = costs.map(x => round(x * 0.85, 2))
let status = total > 500 ? "超过预算" : "预算内"
let label = "合计：" + fixed(total, 2)
```

解释器不暴露网络、文件或浏览器对象。数组最多 2000 项，单次文稿求值最多 100000 步，函数调用最多 60 层。除零、无效开方、无限数值、未定义变量、下标越界及超限计算都会给出带行列位置的错误。箭头函数中的计算同样受限制。

### 表格组件

`Table(rows: data, columns: [Column(...)])` 可以使用变量或计算表达式。`Column("标题", width: 1, align: .right, format: "0.00")` 定义列：width 是正数权重，align 支持 left / center / right。格式支持 `0`、`0.000`、`0.0%`，也支持 `.3f`、`.1%`。格式只作用于数值，文字原样显示。

没有 columns 时，可使用 `headers: ["k", "value"]`。若两者均未定义，第一行沿用旧版行为作为表头。`header: false` 隐藏表头。每张表最多 100 行、20 列；演示页面建议只放适合阅读的行数，超多数据应分表或分页。

样式参数可直接写在 Table 中，或使用 `.tableStyle(...)`：

| 参数                          | 含义                                      |
| ----------------------------- | ----------------------------------------- |
| `rowHeight`                   | 期望行高，24–120 像素；空间不足时自动压缩 |
| `zebra`                       | true / false，控制交替行底色              |
| `borders`                     | none / horizontal / all                   |
| `headerFill` / `headerColor`  | 表头底色与文字色                          |
| `stripeColor` / `borderColor` | 交替行底色与边框色                        |
| `cellPadding`                 | 水平内边距，0–40 像素                     |

`.font()`、`.foreground()`、`.frame()`、`.appear()` 与 `.stagger()` 继续适用。表格按行保留动画，可编辑模式中的文字和边框保持可编辑；PPTX 保存求值后的结果，工程 ZIP 与 .slide 保存计算源码，重新导入后再次求值。

可视化编辑和布局切换会保留计算型内容块及 let 声明的源码，避免表格表达式被自动替换为静态数值。编辑器提供变量、计算函数、数组方法、Column 参数与表格样式补全。
