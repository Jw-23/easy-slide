# Easy Slide

演示文稿编辑器，可本地运行或静态托管。使用 SwiftUI 风格的声明式 DSL，支持数学论坛和工程汇报场景。

## 本地运行

需要 Node.js 22.12+（或 Node.js 24）与 npm。

```sh
npm ci
npm run dev
```

打开终端显示的 `http://127.0.0.1:5173`。默认仅监听本机，不绑定公网。首次安装需要网络，安装后预览、公式渲染、工程保存、导入导出均在本地完成，不使用账号、API、CDN 字体或云存储。

```sh
npm run build
npm run preview
npm test
```

## 安装应用与离线使用

生产构建提供 PWA 安装清单、应用图标与 Service Worker。打开 HTTPS 网站或本机 `localhost` / `127.0.0.1` 地址后，点击工具栏的「安装应用」。Chrome / Edge 支持浏览器原生安装窗口；iPhone / iPad 在 Safari 分享菜单选择「添加到主屏幕」，macOS Safari 使用「文件 → 添加到程序坞」。不支持原生安装提示的浏览器会显示操作说明；ChatGPT 内嵌预览可先在独立浏览器标签页打开。

首次联网加载并显示「离线资源已就绪」后，可断网重新打开、编辑、渲染公式和导出 PPTX。缓存包含应用代码与图标；工程和图片仍保存在当前浏览器的 IndexedDB。安装不会上传工程，也不会自动迁移其他浏览器或域名的草稿；重要工程应导出备份。

发现新版本后显示「保存并更新」。点击后先保存当前草稿，再刷新当前窗口；其他已打开的窗口保留当前编辑状态，分别提示更新。保存失败时保留当前页面并提示导出工程。应用安装是否可用取决于浏览器与系统支持。

`npm run dev` 不注册离线缓存，方便开发时立即查看修改。要在本机体验安装和离线行为，请执行 `npm run build && npm run preview`。

## Cloudflare 从仓库部署

已提供 `wrangler.jsonc`，使用 **Workers Static Assets** 从 GitHub 自动构建部署。连接 `Jw-23/easy-slide` 时，生产分支可选 `main`；预览尚未合并的更新可选择 `feat/local-slide-studio`。构建命令留空，部署命令使用 `npx wrangler deploy`。构建与 dist 目录已在配置中定义。

详见 [Cloudflare 部署说明](docs/CLOUDFLARE.md)，本地可运行 `npm run cf:check` 验证，不需要发布到账户。

## 使用

- 右键画布内容「定位到 DSL」，右键源码组件「定位到画布」；重复文本、嵌套布局、公式和表格按结构定位。菜单提供复制文本/组件、剪切、粘贴、创建副本和删除，复制组件时携带引用图片。
- DSL「格式化」按钮、右键「格式化文档」或 `Ctrl / ⌘ + Shift + F`（也可用 `Shift + Alt + F`）自动整理长参数换行与缩进，保留注释、计算和原始字符串。画布与编辑器均可用 `Ctrl / ⌘ + V` 粘贴。
- 页面列表支持筛选、键盘选择、上移、下移、复制和删除。上方按钮可收起侧栏或进入专注预览；编辑面板分隔线可拖动，也可聚焦后用左右方向键调整，Home / End 调到边界。布局偏好保存在当前浏览器。
- 小屏幕通过「页面列表 / 预览 / 页面 / DSL / 素材」切换工作区，编辑区保持独立滚动；备注和动画面板按需展开，画布按可用宽高适配。
- DSL 中使用 `Ctrl / ⌘ + /` 切换当前行或所选多行的 `//` 注释；也可点「注释」按钮或右键「切换行注释」。每次操作独立撤销，源码有错误时仍可取消注释。
- `Ctrl / ⌘ + Z` 撤销、`Ctrl / ⌘ + Shift + Z` 或 `Ctrl + Y` 重做；DSL 与可视化操作共用历史。`Ctrl / ⌘ + S` 保存工程，`Ctrl / ⌘ + Enter` 开始演示。工程名称在顶栏编辑，Enter 或失焦提交，Esc 取消。
- 左侧选择页面，右侧修改标题、布局与过渡；上方主题菜单可切换 10 套内置主题。切换只修改 Theme 声明，保留正文、计算和注释；预览与 PPTX 共用主题。DSL 面板编辑完整内容。
- 右侧「主题细节 → 默认卡片材质」可切换毛玻璃与纯色。网页实时模糊，PPTX 烘焙材质纹理，前景文字和公式保持独立。
- Equation 内输入反斜杠补全 LaTeX，提供排版预览、占位符与公式诊断。
- 「工程」菜单统一提供打开文件夹、导入、切换示例与使用指南。切换示例或导入工程可用撤销恢复，包含原来的图片。撤销历史仅保留在当前会话中，并设有容量上限。
- `Ctrl / ⌘ + V` 粘贴图片，或从素材面板添加。支持 PNG、JPG、WebP、GIF，每张最多 20MB。
- 编辑自动存入此浏览器的 IndexedDB；保存状态在底部状态栏显示。保存串行执行，待保存内容会合并为最新版本；保存失败可重试，也可直接导出 ZIP。浏览器数据可能被清理，重要内容请导出完整工程。
- 「保存工程」下载 `.easy-slide.zip`；「导出 → 工程压缩包」也会始终下载 ZIP，即使当前已连接文件夹。压缩包内包含原样 DSL、工程清单和全部原始图片，保留中文文件名、子目录以及未使用素材。重新导入会恢复源码、主题、备注、计算、动画与图片。
- 「工程 → 打开本地文件夹」可连接本地文件夹（Chrome / Edge + HTTPS 或 localhost）。优先打开目录中的 `project.easy-slide.zip`，也支持解压后的工程和旧版 `project.easy-slide.json`；没有工程时导入图片。连接目录后，「保存工程」写入 `project.easy-slide.zip`，不会删除目录中的其他文件；「导出」仍可单独下载。重启浏览器后需重新选择目录。打开完整工程不会扫描无关图片；纯图片文件夹扫描受到总量与数量限制。
- 导入支持工程 ZIP、旧版完整 JSON，以及 `.slide` / `.swift` 源码。ZIP 在全部文件读取和校验成功后才替换当前工程，缺失素材会显示具体路径。纯 DSL 不包含图片，需要单独添加素材。目录里的 `plot.png` 会映射为 `assets/plot.png`，子目录保留相对结构。
- 画布下方「动画编排」可查看每项的起止时间、重播某阶段，或显示完整页面。DSL 使用 `.appear(.rise, step: 1, order: 0, delay: 0, duration: 600, easing: .easeOut)` 控制动画。
- 点击「演示」进入沉浸视图；方向右键或空格逐步显示内容、切页，左方向键逐阶段回退并在前一页恢复最后阶段，Esc 退出。备注仅在编辑器显示。
- PPTX 默认使用「保留版式」：文字和图形按网页逐层渲染，保持字体与换行；也可选择「可编辑文字」，在 PowerPoint 中继续修改文本。两种方式都保留点击阶段、并行与先后顺序、延迟、时长、逐项交错及页面过渡；公式保留 SVG 和高清 PNG 回退。位移/缩放使用网页对应的轨迹与缓动关键帧。动画需在幻灯片放映模式播放；详见 [PPTX 导出与验证](docs/PPTX.md)。

## DSL

详见 [DSL 说明](docs/DSL.md)。所有内容在同一份声明式数据中定义，网页和 PPTX 共享布局引擎；由本地专用解释器处理声明与受限计算，不执行 JavaScript。格式版本为 `1`。Deck、Theme、每个 Slide 在顶层并列书写。布局通过独立 Cover / Split / Cards / Flow 等组件组合，也可嵌套 HStack、VStack、ZStack、Grid 与 Spacer；支持链式字体、颜色、尺寸、边距与动画设置；位置使用 `.position()`，尺寸使用 `.frame()`，呈现缩放使用 `.scale()`，默认以父内容区左下角为参考；Columns / Rows 可按权重分配空间，Panel 和 Heading / Caption / Numbered / 图元等基础元素用于组合内容；`func` 可定义带默认参数、局部计算及 Content / Slot 插槽的自定义布局。文字使用有源码范围的行内 AST 识别粗体、斜体、删除线、代码及 LaTeX 公式；Code 块保持原样。编辑器具有 CodeMirror 代码提示、语法着色和错误定位。标题、备注、布局、过渡和素材插入只改写对应源码片段；规范化格式是单独的显式操作。公式可用反引号原始字符串直接书写，如 ``Equation(`\frac{1}{n}`)``，无需双写反斜杠；三个反引号支持多行，旧的 `#"..."#` 语法继续兼容。DSL 是专用语言，不需要 Swift 工具链，也不执行 JavaScript。

```swift
Deck("一个清晰的结论", author: "研究组")
    .transition(.slide, duration: 650)

Theme(preset: .aurora)

Slide(title: "从直觉到证明") {
    Split {
        Bullets(["提出问题", "建立模型", "验证结论"])
            .appear(.rise, step: 1, order: 0, duration: 500)
        Equation(#"x_{k+1} = x_k - \eta \nabla f(x_k)"#)
            .appear(.zoom, step: 1, order: 1, delay: 150, duration: 700)
    }
}.notes("先解释假设，再给出结论")
```

数学环境 `Definition` / `Theorem` / `Proof` / `ProofStep` 等在普通 Slide 中默认自动续页，步骤编号跨页连续；`DynamicSlide` 支持双栏自然顺延，标题字号、正文与留白可按教学需求调整。完整用法见 [数学环境](docs/DSL.md#数学环境与自动续页)，应用模板中提供「数学证明」。

## 设计参考

参考资料用于设计声明式格式与导出实现，并未嵌入远程运行依赖：

- [SwiftUI 布局](https://developer.apple.com/documentation/swiftui/laying-out-a-simple-view)：容器组合与修饰符风格。
- [Slidev 语法](https://sli.dev/guide/syntax)：声明式页面与元数据的参考；本项目采用 SwiftUI 风格语法。
- [Slidev 布局](https://sli.dev/guide/layout)：有限布局优先，减少手动排版。
- [Slidev 动画](https://sli.dev/guide/animations)：页级过渡与逐步显示分离。
- [PptxGenJS 文本 API](https://gitbrent.github.io/PptxGenJS/docs/api-text/)：生成原生 PowerPoint 文本。
- [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)：经用户选择后读写本地目录。
- [PWA 安装条件](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)与 [Vite PWA 更新提示](https://vite-pwa-org.netlify.app/guide/prompt-for-update)：安装清单、离线缓存和用户确认后的版本更新。

内测中的 `.frame(x:, y:)` 已拆为尺寸 `.frame()`、位置 `.position()` 和缩放 `.scale()`；旧写法会给出迁移提示，详见 [位置与迁移](docs/DSL.md#位置尺寸和缩放)。

## 开发与验证

React + TypeScript + Vite；专用词法与语法解析器；MathJax 本地矢量公式；PptxGenJS + JSZip 导出；IndexedDB 自动保存。无应用后端。

编辑器补全使用独立的容错 AST，与运行时共享词法器和运算优先级；静态分析负责词法作用域、数组/回调/用户函数类型、参数与修饰符筛选、签名帮助和悬停说明。每份不可变文档缓存一次分析，单纯移动光标复用语法树；补全不执行 DSL 表达式。详见 [编辑体验](docs/DSL.md#编辑体验与错误提示)。

`npm test` 验证 DSL、AST 补全、动画、公式、工程 ZIP 的源码/图片往返、缺失文件、解压大小限制和文件夹兼容性。`npm run test:e2e` 执行 Chromium 浏览器测试，包含将 ZIP 导入全新浏览器并恢复粘贴图片（首次运行需 `npx playwright install chromium`）。

`npm run test:pwa` 构建生产产物并测试清单与图标、离线重新启动和 PPTX 导出、安装入口、版本等待与保存后更新、多窗口不强制刷新。测试用静态服务器及版本切换接口仅在本机测试中启用，不属于网站部署内容。应用图标源码为 `public/favicon.svg`，可选脚本 `python scripts/generate-pwa-icons.py` 生成 PNG 图标（仅运行该脚本时需要 Pillow）。

## 初始功能示例

首次启动打开 27 页「功能示例」。已有本地草稿优先恢复；通过「切换示例 → 功能示例」可打开新版示例，替换前仍可导出当前工程。

- 1–8 页：八种独立布局、正文与引用、玻璃面板、指标、对比、里程碑和内嵌图片。
- 9–12 页：组合容器、叠层与精确定位、LaTeX 分式/积分/矩阵/分段函数、代码和表格。
- 13–14 页：使用 let、range、map、filter、reduce 和条件表达式计算表格数据，设置列宽、对齐和数字格式。
- 15–18 页：全部入场效果、四种缓动、点击阶段与先后顺序、样式修饰符和页面覆盖。
- 19–20 页：编辑、素材、工程保存与导出操作参考。
- 21–25 页：基础元素、加权分栏和分区布局、参数化布局函数、Content 与 Slot 内容插槽。
- 26 页：正文内公式、粗体、斜体、删除线、行内代码与转义。
- 27 页：独立的布局尺寸、相对位置、参考点、自身锚点与缩放。

每页备注解释对应源码与操作方式。PNG 图表随工程导出，不依赖远程地址；可选开发脚本 `python scripts/generate-example-chart.py` 重建图表源码（仅运行该脚本时需要 matplotlib 与 numpy，网站运行不需要 Python）。

线上功能示例可直接通过 `/?example=features` 打开。此入口使用独立、按示例版本隔离的浏览器草稿，不会覆盖普通入口恢复的工作工程；在示例中进行的修改也会单独保存。普通首页默认恢复最近的工作工程，因此已保存的旧内容不会因网站发布而自动改变。

新版功能示例的草稿独立保存于修订版 6；`/?example=features` 打开最新版，`/?example=features&revision=1`、`revision=2`、`revision=3` 、`revision=4` 或 `revision=5` 可恢复此前独立入口保存的对应草稿。普通首页的工作工程不受影响。
