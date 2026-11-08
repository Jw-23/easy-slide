import { parseDeck } from "./dsl";
/** The startup document is authored in the same flat DSL that users edit. */
export const showcaseDeck = parseDeck(String.raw`
Deck("Easy Slide 功能示例", author: "示例工程")
    .transition(.slide, duration: 650, direction: .left, easing: .easeOut)
Theme(accent: "#23796e", background: "#fafbf9", color: "#1c3430", font: "Arial", material: .glass)

let demoRate = 0.2
let demoLoss = x => x ^ 2 / 2
let demoRows = range(0, 6).map(k => row(k, (1 - demoRate) ^ k, demoLoss((1 - demoRate) ^ k)))
let demoCosts = [120, 180, 95, 240]

Slide(title: "Easy Slide\n功能示例", eyebrow: "01 / OVERVIEW", subtitle: "布局、公式、素材、材质与动画编排") {
    Cover {
        Text("20 页示例 · 在 DSL 面板中查看和修改源码").font(18)
        Equation(#"x_{k+1}=x_k-\eta\nabla f(x_k)"#)
            .glass(blur: 28, opacity: 0.62, radius: 28).padding(26)
    }
}.notes("此工程展示现有的全部组件与编排方式。右侧 DSL 面板可以查看源码，Ctrl / ⌘ + Space 呼出补全；所有示例均可直接导出 PPTX。演示中的数据与图表仅用于说明功能。")

Slide(title: "页面与布局\n分别声明", eyebrow: "02 / STRUCTURE", subtitle: "Deck、Theme 与 Slide 并列；布局由独立组件负责") {
    Section {
        Text("Cover · Section · Flow · Split · Cards · Compare · Timeline · ImageText").font(17)
    }
}.transition(.fade, duration: 550)
.notes("独立布局组件可组合、可嵌套。Slide 只声明标题、备注、背景与页级过渡。切换右侧布局组件可保留内容；旧版 Slide(.split, ...) 工程仍可读取。")

Slide(title: "双栏与毛玻璃面板", eyebrow: "03 / SPLIT + GLASS", subtitle: "点击一次，显示右侧公式；列表进入页面时逐项出现") {
    Split(spacing: 32) {
        Glass {
            Bullets(["左栏呈现关键思路", "右栏保留完整公式", "面板材质与内容独立"], title: "内容层次")
                .stagger(120)
        }.appear(.rise, duration: 500)
        Glass {
            Equation(#"x_{k+1}=x_k-\eta\nabla f(x_k)"#)
        }.glass(blur: 30, opacity: 0.64, radius: 30)
         .appear(.zoom, step: 1, delay: 150, duration: 700)
    }
}.notes("Split 负责双栏；Glass 负责面板。列表使用 stagger 交错入场；公式组在 step 1 时缩放出现。试着修改 blur、opacity、radius 或 spacing，并在下方动画编排中重播。")

Slide(title: "正文、引用与字号", eyebrow: "04 / FLOW", subtitle: "Flow 纵向排列，内容使用字体、颜色和内边距修饰符") {
    Flow(spacing: 24) {
        Text("一个页面只保留一个主要结论。正文解释依据，引用补充讨论角度。", title: "正文块")
            .font(25).frame(height: 150)
        Quote("局部信息在适当的结构假设下，能够导向全局结论。")
            .font(29).foreground("#23796e").glass(opacity: 0.56).padding(24)
    }
}.notes("这里使用 Text 的 title 参数与 Quote。font 控制正文大小，foreground 控制颜色，frame 的固定高度优先分配空间，padding 控制内部留白。")

Slide(title: "对比与并行动画", eyebrow: "05 / COMPARE", subtitle: "同一 step、相同 order 的内容并行启动") {
    Compare(spacing: 28) {
        Bullets(["固定步长，实现简单", "需要预先估计光滑常数", "便于理论分析"], title: "固定步长")
            .appear(.slideLeft, step: 1, order: 0, duration: 650, easing: .easeOut)
        Bullets(["局部自适应调整步长", "减少对先验常数的依赖", "每步增加函数计算"], title: "回溯线搜索")
            .appear(.slideRight, step: 1, order: 0, delay: 100, duration: 650, easing: .easeInOut)
    }
}.transition(.slide, direction: .right, duration: 700)
.notes("Compare 自动为两组内容添加卡片。一次点击触发两个方向不同的入场效果，右栏额外延迟 100ms。页级方向由 transition.direction 设置，独立于内容入场方向。")

Slide(title: "指标卡片与顺序编排", eyebrow: "06 / CARDS + ORDER", subtitle: "一次点击依次显示三项；后一 order 等前一组结束") {
    Cards(columns: 3, spacing: 24) {
        Metric("01", label: "局部信息", text: "先明确问题与输入。")
            .appear(.rise, step: 1, order: 0, duration: 500)
        Metric("02", label: "选择方法", text: "再解释假设与计算。")
            .appear(.rise, step: 1, order: 1, delay: 100, duration: 500)
        Metric("03", label: "验证结论", text: "最后说明结果与边界。")
            .appear(.rise, step: 1, order: 2, delay: 100, duration: 500)
    }
}.notes("三张卡片依次在 0、600、1200ms 开始。Metric 提供大号数值、label 和说明；Cards 提供可配置列数与默认主题面板。动画时间线显示每一组的实际起止时间。")

Slide(title: "里程碑与交错入场", eyebrow: "07 / TIMELINE", subtitle: "stagger 每隔固定时间启动下一项，可互相重叠") {
    Timeline(spacing: 24) {
        Text("定义范围、验收指标与基准数据。", title: "01 · 规划").font(22)
        Text("实现功能、进行评审并记录决策。", title: "02 · 实现").font(22)
        Text("完成验证、发布与后续跟踪。", title: "03 · 交付").font(22)
    }.appear(.rise, step: 1, duration: 650).stagger(180)
}.transition(.slide, direction: .up, duration: 700)
.notes("Timeline 横向排列里程碑卡片。子项分别在 0、180、360ms 开始。stagger 和 order 不同：前者按时间间隔启动，后者等待上一组结束。")

Slide(title: "本地图片与图文布局", eyebrow: "08 / IMAGE + ASSETS", subtitle: "示例图内嵌在工程中，导出后可离线重新导入") {
    ImageText(spacing: 32) {
        Image("assets/convergence.png").glass(opacity: 0.56).padding(14)
        Glass {
            Bullets(["素材面板可插入已有图片", "Ctrl / ⌘ + V 粘贴图片", "Chrome / Edge 可读取本地目录"], title: "图片来源")
        }
    }
}.transition(.zoom, duration: 700, easing: .spring)
.notes("图表为随工程附带的 PNG，不依赖外部 URL。工程 ZIP 包含 DSL、配置与原始图片；纯 .slide 文件不包含图片。选择文件夹后，可读取其中的工程压缩包、解压后的工程或图片。示例图展示二次函数上的迭代轨迹，仅用于演示。")

Slide(title: "自由组合布局容器", eyebrow: "09 / STACKS + GRID", subtitle: "HStack、VStack、Grid 与 Spacer 可嵌套使用") {
    HStack(spacing: 28) {
        VStack(spacing: 16) {
            Text("固定宽度的左栏").font(30).frame(height: 65)
            Text("右侧使用两列网格。Spacer 占据剩余空间；height 与 width 可单独指定。").font(23).frame(height: 150)
            Spacer
        }.frame(width: 410)
        Grid(columns: 2, spacing: 20) {
            Text("HStack\n水平排列").font(23).glass(opacity: 0.60).padding(24)
            Text("VStack\n垂直排列").font(23).glass(opacity: 0.60).padding(24)
            Text("Grid\n二维网格").font(23).glass(opacity: 0.60).padding(24)
            Text("Spacer\n分配留白").font(23).glass(opacity: 0.60).padding(24)
        }.appear(.fade, step: 1).stagger(100)
    }
}.transition(.slide, direction: .down, duration: 650)
.notes("HStack 左侧固定 width 410，右侧分配剩余宽度。左侧 VStack 使用两个固定高度块和一个 Spacer。Grid 提供二维网格；这些容器与八种预设布局组件可以互相组合。")

Slide(title: "叠层布局与材质边界", eyebrow: "10 / ZSTACK", subtitle: "后声明的内容位于上层，frame 可使用画布绝对坐标") {
    ZStack {
        Image("assets/convergence.png").frame(x: 74, y: 250, width: 750, height: 370)
        Glass {
            Text("叠放的说明面板", title: "ZStack").font(25).frame(height: 95)
            Text("网页实时模糊下层图表；PPTX 按入场时序采样下层内容。").font(21)
        }.frame(x: 640, y: 290, width: 520, height: 270)
         .glass(blur: 24, opacity: 0.72, radius: 28)
         .appear(.slideRight, step: 1, duration: 650)
    }
}.notes("ZStack 按声明顺序叠放内容。frame.x/y 是画布绝对坐标。网页 backdrop-filter 能实时模糊下层图表；PPTX 将入场时下层内容采样为静态材质，后续点击的内容不会提前出现在材质中。文字与公式仍独立保留动画，文字可选择保留版式或可编辑模式。")

Slide(title: "LaTeX 公式与命令补全", eyebrow: "11 / EQUATIONS", subtitle: "在 Equation 字符串中输入反斜杠，或按 Ctrl / ⌘ + Space") {
    Grid(columns: 2, spacing: 20) {
        Equation(#"\frac{a+b}{c}=\sqrt{x^2+y^2}"#).glass().padding(22)
        Equation(#"\int_0^1 x^2\,dx=\frac{1}{3}"#).glass().padding(22)
        Equation(#"A=\begin{bmatrix}a&b\\c&d\end{bmatrix}"#).glass().padding(20)
        Equation(#"f(x)=\begin{cases}x^2&x\geq0\\-x&x<0\end{cases}"#).glass().padding(20)
    }
}.notes("补全覆盖分式、积分、求和、希腊字母、集合、矩阵和分段函数，并提供排版预览与可 Tab 切换的占位符。试着把 frac 临时改成 frca：错误面板会显示 LaTeX 诊断与拼写建议；修复前保留最后有效预览。原始字符串无需双写反斜杠。")

Slide(title: "代码、表格与行级动画", eyebrow: "12 / CODE + TABLE", subtitle: "代码为纯文本，不会执行；表格首行作为表头") {
    Split(spacing: 28) {
        Glass {
            Code("function descend(x, eta) {\n  for (let k = 0; k < 20; k++) {\n    x = x - eta * gradient(x);\n  }\n  return x;\n}").font(20)
        }
        Glass {
            Table([["步长", "迭代次数", "状态"], ["0.1", "80", "稳定"], ["0.3", "28", "稳定"], ["1.8", "18", "震荡"]]).font(18)
                .appear(.fade, step: 1, duration: 450).stagger(120)
        }
    }
}.notes("Code 使用等宽字体，展示而不执行代码。Table 接受二维文本数组；数值内容要写为字符串。表格使用 stagger 逐行启动动画，表头与每行文字一起出现。数据仅用于演示。")

Slide(title: "用 DSL 计算表格数据", eyebrow: "13 / COMPUTED TABLE", subtitle: "修改顶部 demoRate；表格会重新计算每次迭代的数值") {
    Glass {
        Table(
            columns: [Column("迭代 k", width: 1, align: .center), Column("当前位置 x", width: 2, align: .right, format: "0.000"), Column("目标值 f(x)", width: 2, align: .right, format: "0.0000")],
            rows: demoRows
        ).tableStyle(rowHeight: 44, zebra: true, borders: .all, headerFill: "#23796e", borderColor: "#cddfd5")
         .appear(.fade, step: 1, duration: 350).stagger(70)
    }
}.notes("顶部 let 定义步长、损失函数和数据。range(0, 6) 不含终点，map 生成六行。Column 定义标题、宽度权重、对齐与数字格式。修改 demoRate 后，数据重新求值。样式编辑与布局切换会保留计算源码，PPTX 输出计算后的数值。")

Slide(title: "数组统计、筛选与条件表达式", eyebrow: "14 / EXPRESSIONS", subtitle: "数据、统计与显示格式分别定义") {
    Split(spacing: 28) {
        Glass {
            Code("let demoCosts = [120, 180, 95, 240]\n\nsum(demoCosts)\nmean(demoCosts)\ndemoCosts.filter(x => x > 150)\ndemoCosts.reduce((sum, x) => sum + x, 0)\npercent(0.15, 0)").font(19)
        }
        Glass {
            Table(columns: [Column("统计项", width: 2), Column("结果", width: 2, align: .right, format: "0.00")], rows: [
                ["合计", sum(demoCosts)],
                ["均值", mean(demoCosts)],
                ["大于 150", str(demoCosts.filter(x => x > 150).length) + " 项"],
                ["折扣", percent(0.15, 0)],
                ["折后合计", demoCosts.reduce((sum, x) => sum + x, 0) * 0.85],
                ["预算判断", sum(demoCosts) > 500 ? "超过预算" : "预算内"]
            ]).tableStyle(rowHeight: 42, zebra: true, borders: .horizontal)
        }
    }
}.notes("支持算术、幂、比较、布尔与条件表达式，数组下标从 0 开始。map 转换、filter 筛选、reduce 累计。fixed、percent、format 返回格式化文字；Column format 仅格式化数值，文字保持不变。计算有调用深度和工作量上限，不接触浏览器或网络 API。")

Slide(title: "六种内容入场效果", eyebrow: "15 / ENTRANCE EFFECTS", subtitle: "点击一次，按 order 顺序查看所有效果") {
    Cards(columns: 3, spacing: 20) {
        Text("淡入", title: "fade").font(23).appear(.fade, step: 1, order: 0, duration: 450)
        Text("向上浮入", title: "rise").font(23).appear(.rise, step: 1, order: 1, duration: 450)
        Text("从左侧进入", title: "slideLeft").font(23).appear(.slideLeft, step: 1, order: 2, duration: 450)
        Text("从右侧进入", title: "slideRight").font(23).appear(.slideRight, step: 1, order: 3, duration: 450)
        Text("轻微缩放", title: "zoom").font(23).appear(.zoom, step: 1, order: 4, duration: 450)
        Text("直接显示", title: "none").font(23).appear(.none, step: 1, order: 5)
    }
}.notes("appear 的六种效果分别为 fade、rise、slideLeft、slideRight、zoom、none。这里全部在 step 1 触发，order 决定组内先后。同一个 order 可有多个并行项，下一组等待上一组最晚完成的项。")

Slide(title: "四种缓动与点击阶段", eyebrow: "16 / EASING + STEPS", subtitle: "第一次点击显示前三项，下一次点击直接进入 step 3") {
    Flow(spacing: 12) {
        Text("linear · 匀速").font(23).glass(opacity: 0.58).padding(16)
            .appear(.slideLeft, step: 1, order: 0, duration: 850, easing: .linear)
        Text("easeOut · 柔和减速").font(23).glass(opacity: 0.58).padding(16)
            .appear(.slideLeft, step: 1, order: 0, delay: 150, duration: 850, easing: .easeOut)
        Text("easeInOut · 缓入缓出").font(23).glass(opacity: 0.58).padding(16)
            .appear(.slideLeft, step: 1, order: 0, delay: 300, duration: 850, easing: .easeInOut)
        Text("spring · 轻微弹性").font(23).glass(opacity: 0.58).padding(16)
            .appear(.slideLeft, step: 3, duration: 850, easing: .spring)
    }
}.notes("step 编号不必连续：此页只需两次点击，第二次直接触发 step 3。delay 在每个点击阶段内重新计算。PPTX 中的 spring 会近似为原生减速；其余缓动映射为加速与减速比例。")

Slide(title: "位置、字体与面板样式", eyebrow: "17 / STYLE + FRAME", subtitle: "所有坐标基于 1280 × 720 画布") {
    ZStack {
        Text("固定位置的正文", title: "frame + font")
            .frame(x: 90, y: 270, width: 500, height: 290)
            .font(31).foreground("#245e55").background("#e2eee8").padding(28)
        Text("独立毛玻璃材质", title: "glass + padding")
            .frame(x: 650, y: 310, width: 500, height: 260)
            .font(29).glass(blur: 36, opacity: 0.58, radius: 34).padding(30)
    }
}.notes("对比纯色 background 与毛玻璃 glass。frame 支持 x/y/width/height，font、foreground、padding、title 控制层次。右侧默认卡片材质影响 Cards 等自动卡片；显式 Glass 与 .glass() 会保留自己的材质。")

Slide(title: "页面样式覆盖与无过渡", eyebrow: "18 / PAGE OVERRIDES", subtitle: "页面可覆盖背景、文字色、过渡方式和演讲备注") {
    Flow(spacing: 24) {
        Text("本页使用独立的背景色和文字色。", title: "页面设置").font(27)
        Bullets(["background 覆盖当前页背景", "foreground 覆盖当前页默认文字色", "transition(.none) 关闭页级过渡"]).font(23)
    }
}.background("#eef2f8").foreground("#263b59").transition(.none)
.notes("全局 Theme 与页面覆盖的作用不同：在 Theme 中更改 accent、font、background、color、material 会影响默认主题；页面 background、foreground 仅覆盖当前页。Deck 的默认过渡在本页被 none 覆盖。")

Slide(title: "编辑、素材与工程文件", eyebrow: "19 / LOCAL WORKFLOW", subtitle: "示例中的操作均可在当前编辑器中完成") {
    Compare(spacing: 28) {
        Bullets(["DSL 补全：Ctrl / ⌘ + Space", "错误面板：行列位置、定位与建议", "粘贴图片：Ctrl / ⌘ + V", "素材面板：插入图片或连接文件夹"], title: "编辑与素材").font(21)
        Bullets(["保存工程：Ctrl / ⌘ + S", "工程 ZIP：DSL、配置与全部图片", "纯 .slide：只含声明式源码", "PPTX：文本、公式、材质与动画"], title: "保存与导出").font(21)
    }
}.notes("浏览器自动保存至 IndexedDB；重要内容请导出完整工程。工具栏的安装应用可将生产网站安装为 PWA；首次联网缓存完成后可离线编辑和导出，更新时先保存草稿。直接目录访问需要支持 File System Access 的浏览器及用户选择目录；连接目录后点击保存工程才会写入文件。备注只在编辑器显示，PPTX 中保存为演讲备注。")

Slide(title: "功能示例结束", eyebrow: "20 / REFERENCE", subtitle: "修改源码、重播动画，或导出完整工程与 PPTX") {
    Section {
        Text("切换示例可打开数学论坛与工程汇报工程。").font(18)
        Text("工具栏 → 安装应用；首次缓存完成后可离线编辑与导出。").font(18)
    }
}.transition(.fade, duration: 550)
.notes("本工程涵盖全部现有布局、内容类型、组合容器、修饰符和动画选项。素材图包含在工程 ZIP 中。既有本地工程不会被新版示例自动覆盖；需要时从切换示例打开此功能示例。")
`);
