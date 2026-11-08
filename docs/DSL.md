# Easy Slide 声明式 DSL v1

使用类似 SwiftUI 的语法：声明组件，用花括号组合布局，用链式修饰符控制呈现。无需 Swift、编译器或云服务。文件扩展名 `.slide`（也接受 `.swift`）。

```swift
Deck("从局部到无限", author: "研究组") {
    Theme(accent: "#16766d", background: "#fafbf9", color: "#192c2a", font: "Arial")

    Slide(.content, title: "收敛的直觉", eyebrow: "01 / INTUITION") {
        HStack(spacing: 32) {
            VStack(spacing: 20) {
                Text("沿着梯度，寻找方向")
                    .font(32)
                    .frame(height: 70)
                Bullets(["计算局部梯度", "确定合适步长", "迭代直至收敛"])
            }
            VStack(spacing: 20) {
                Equation(#"x_{k+1}=x_k-\eta\nabla f(x_k)"#)
                Text("每一步，都更接近答案").font(20)
            }.padding(24).background("#eef2ef").step(1)
        }
    }.notes("先解释几何直觉，再展示公式")
}.transition(.slide, duration: 650)
```

## 语法规则

字符串使用双引号，支持 `\n`、`\t`、`\r`、`\"`、`\\`。公式推荐原始字符串 `#"\frac{a}{b}"#`，无需双写反斜杠；三引号字符串 `"""多行内容"""` 也可使用。`//` 开头的行尾注释会被忽略。数组使用 `[...]`，可嵌套。命名参数使用 `name: value`，枚举使用 `.name`。数值形式的正文、指标需要双引号。

这是专用语言：不支持变量、循环、函数、脚本执行或导入远程代码。错误会显示行列或具体声明；预览保留上一份有效内容。

## 工程与页面

`Deck("名称", author: "作者") { ... }` 为唯一根节点。可选 `version: 1`，默认为 1。内部包含一个可选 `Theme` 和 1–200 个 `Slide`。

`Theme` 的参数：`accent`、`background`、`color`、`font`。颜色为 `"#RRGGBB"`。字体需本机安装。

`Slide(.布局, title: "标题", eyebrow: "页眉", subtitle: "副标题") { ... }`。

| 布局        | 适用内容                                     |
| ----------- | -------------------------------------------- |
| `.cover`    | 大标题、摘要、署名，建议一个文字块和一个公式 |
| `.section`  | 章节、结束页                                 |
| `.content`  | 正文纵向分配；自由组合时推荐仅放一个容器     |
| `.split`    | 双栏，适合 2 块                              |
| `.grid`     | 最多三列自动换行，推荐 3–6 块                |
| `.compare`  | 双栏卡片对比                                 |
| `.timeline` | 横向里程碑卡片                               |
| `.image`    | 双栏图文                                     |

默认布局无需手动定位。要更灵活，在 `.content` 页中组合 `HStack`、`VStack`、`Grid`、`ZStack`。

页面修饰符：`.notes("讲述思路")`、`.background("#fafbf9")`、`.foreground("#192c2a")`、`.transition(.slide, duration: 650)`。

工程也支持 `.transition(...)` 作为全局默认值。可选 `.fade`、`.slide`、`.zoom`、`.none`。网页时长 0–3000 毫秒；PPTX 映射为快、中、慢三档速度。

## 布局组合

| 声明                                    | 行为                                         |
| --------------------------------------- | -------------------------------------------- |
| `HStack(spacing: 24) { ... }`           | 水平排列子内容，默认等分可用宽度             |
| `VStack(spacing: 24) { ... }`           | 垂直排列子内容，默认等分可用高度             |
| `Grid(columns: 2, spacing: 24) { ... }` | 固定列数、自动计算行数，等分单元格           |
| `ZStack { ... }`                        | 按声明顺序叠放，后面的内容在上层             |
| `Spacer`                                | 占据一份剩余空间，可配合 `.frame()` 固定尺寸 |

HStack 内指定 `.frame(width: ...)` 的子内容先获得固定宽度，其余平分剩余空间。VStack 对 height 同理。跨轴默认填满。`spacing` 默认 24，`columns` 范围 1–12。每页最多 30 个顶层块、300 个总块，最多 30 层嵌套。

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

每类组件接受一个未命名内容参数。也可用命名参数 `text:`；图片为 `src:`，指标为 `value:`，列表为 `items:`，表格为 `rows:`。组件支持 `title:` 参数，或 `.title("块标题")` 修饰符。

## 通用修饰符

| 修饰符                                           | 含义                                           |
| ------------------------------------------------ | ---------------------------------------------- |
| `.font(24)`                                      | 正文或指标字号；容器会传给后代作为默认值       |
| `.foreground("#16766d")`                         | 文字颜色；容器会传给后代                       |
| `.background("#eef2ef")`                         | 内容边界内添加背景                             |
| `.frame(width: 480, height: 320)`                | 固定尺寸，也可单独设某一维                     |
| `.frame(x: 80, y: 250, width: 500, height: 300)` | 在画布中绝对定位                               |
| `.padding(24)`                                   | 内容边界内缩                                   |
| `.step(1)`                                       | 网页演示在第几次点击后出现，0–30；容器控制整组 |
| `.title("标题")`                                 | 添加内容块标题                                 |

画布 1280 × 720（16:9）。正文默认分配在 x≈72–1208、y≈250–620；坐标与尺寸均为非负像素。绝对 x/y 使用画布坐标。自动卡片的边距之外还可添加 padding。

公式和图片等比包含在分配区域内；字号通过区域大小控制，`.font()` 不影响公式和图片。代码为纯文本等宽显示。长文建议拆页，网页裁切超长内容，PPTX 尝试缩小字体。检查预览后再导出。

## 导出与本地资源

PPTX：可编辑文本、矢量公式、原始图片、页级过渡和演讲备注。推荐 PowerPoint 2019+ / Microsoft 365。网页支持 `.step()` 逐项显示；PPTX 会同时展示全部内容，暂不输出逐项入场动画。

完整工程 JSON：`{ format: "easy-slide", version: 1, source: "DSL文本", assets: { "assets/a.png": "data:image/png;base64,..." } }`。导出导入保留原始 source 和图片。`.slide` 纯文本导出不包含图片。

图片通过素材面板、文件夹读取、粘贴导入。使用素材面板所示的 `assets/` 路径；支持 PNG、JPEG、WebP、GIF。禁止 HTTP、file 与目录穿越路径。不执行声明中的磁盘访问。
