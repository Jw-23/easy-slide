# Easy Slide

一个在浏览器本地处理内容的演示文稿工作台，可本地运行或静态托管。用类似 SwiftUI 的声明式 DSL，把数学论坛和工程汇报变成层次清晰的幻灯片。

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

已提供 `wrangler.jsonc`，使用 **Workers Static Assets** 从 GitHub 自动构建部署。连接 `Jw-23/easy-slide` 时，目前请选择完整代码所在的 `feat/local-slide-studio` 分支；构建命令留空，部署命令使用 `npx wrangler deploy`。构建与 dist 目录已在配置中定义。

详见 [Cloudflare 部署说明](docs/CLOUDFLARE.md)，本地可运行 `npm run cf:check` 验证，不需要发布到账户。

## 使用

- 左侧选择页面，右侧修改标题、布局、主题和过渡；DSL 面板编辑完整内容。
- 右侧「默认卡片材质」可切换毛玻璃与纯色。网页实时模糊，PPTX 烘焙材质纹理，前景文字和公式保持独立。
- Equation 内输入反斜杠补全 LaTeX，提供排版预览、占位符与公式诊断。
- 内置数学论坛与工程汇报示例。切换前可导出当前工程。
- `Ctrl / ⌘ + V` 粘贴图片，或从素材面板添加。支持 PNG、JPG、WebP、GIF，每张最多 20MB。
- 编辑自动存入此浏览器的 IndexedDB；保存状态在画布下方显示。浏览器数据可能被清理，重要内容请导出完整工程。
- 「保存工程」下载 `.easy-slide.json`，内含 DSL 和全部图片，可原样重新导入。`.slide` 导出仅保存 DSL。
- 素材面板可连接本地文件夹（Chrome / Edge + localhost）。若存在 `project.easy-slide.json`，会打开工程；否则导入文件夹内的图片。点击「保存工程」在目录中写入 `project.easy-slide.json` 与 `slides.slide`。图片嵌入 JSON，不必手动复制。重启浏览器后需重新选择目录。
- 导入文件支持完整工程 JSON 或 `.slide` / `.swift` DSL。导入 DSL 后，需添加其引用的图片。目录里的 `plot.png` 会映射为 `assets/plot.png`，子目录保留相对结构。图片以素材面板所示的相对路径为准。
- 画布下方「动画编排」可查看每项的起止时间、重播某阶段，或显示完整页面。DSL 使用 `.appear(.rise, step: 1, order: 0, delay: 0, duration: 600, easing: .easeOut)` 控制动画。
- 点击「演示」进入沉浸视图；方向右键或空格逐步显示内容、切页，左键返回上一页，Esc 退出。备注仅在编辑器显示。
- PPTX 导出保留可编辑文本、数据表单元文字、矢量公式、图片与页级过渡。公式以 SVG 插入，推荐 Microsoft PowerPoint 2019+ / Microsoft 365。网页和 PPTX 均保留 step 点击阶段、order 组内顺序、delay 延迟、duration 时长与入场效果。PPTX 弹性缓动近似为减速；页级时长包含现代 PowerPoint 精确毫秒与旧版三档回退。不同系统字体、换行与圆角可能有少量差异。

## DSL

详见 [DSL 说明](docs/DSL.md)。所有内容在同一份声明式数据中定义，网页和 PPTX 共享布局引擎；由本地专用解释器处理声明与受限计算，不执行 JavaScript。格式版本为 `1`。Deck、Theme、每个 Slide 在顶层并列书写。布局通过独立 Cover / Split / Cards / Flow 等组件组合，也可嵌套 HStack、VStack、ZStack、Grid 与 Spacer；支持链式字体、颜色、尺寸、边距与动画设置。编辑器具有 CodeMirror 代码提示、语法着色和错误定位。DSL 是专用语言，不需要 Swift 工具链，也不执行 JavaScript。

```swift
Deck("一个清晰的结论", author: "研究组")
    .transition(.slide, duration: 650)

Theme(accent: "#16766d")

Slide(title: "从直觉到证明") {
    Split {
        Bullets(["提出问题", "建立模型", "验证结论"])
            .appear(.rise, step: 1, order: 0, duration: 500)
        Equation(#"x_{k+1} = x_k - \eta \nabla f(x_k)"#)
            .appear(.zoom, step: 1, order: 1, delay: 150, duration: 700)
    }
}.notes("先解释假设，再给出结论")
```

## 设计参考

参考资料用于设计声明式格式与导出实现，并未嵌入远程运行依赖：

- [SwiftUI 布局](https://developer.apple.com/documentation/swiftui/laying-out-a-simple-view)：容器组合与修饰符风格。
- [Slidev 语法](https://sli.dev/guide/syntax)：声明式页面与元数据的参考；本项目采用 SwiftUI 风格语法。
- [Slidev 布局](https://sli.dev/guide/layout)：有限布局优先，减少手动排版。
- [Slidev 动画](https://sli.dev/guide/animations)：页级过渡与逐步显示分离。
- [PptxGenJS 文本 API](https://gitbrent.github.io/PptxGenJS/docs/api-text/)：生成原生 PowerPoint 文本。
- [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)：经用户选择后读写本地目录。
- [PWA 安装条件](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)与 [Vite PWA 更新提示](https://vite-pwa-org.netlify.app/guide/prompt-for-update)：安装清单、离线缓存和用户确认后的版本更新。

## 开发与验证

React + TypeScript + Vite；专用词法与语法解析器；MathJax 本地矢量公式；PptxGenJS + JSZip 导出；IndexedDB 自动保存。无应用后端。

`npm test` 验证扁平/旧版 DSL 往返、带位置错误、代码补全、动画时间线、原生 PPTX 动画节点、模板布局边界与公式。`npm run test:e2e` 执行 Chromium 浏览器测试（首次运行需 `npx playwright install chromium`）。

`npm run test:pwa` 构建生产产物并测试清单与图标、离线重新启动和 PPTX 导出、安装入口、版本等待与保存后更新、多窗口不强制刷新。测试用静态服务器及版本切换接口仅在本机测试中启用，不属于网站部署内容。应用图标源码为 `public/favicon.svg`，可选脚本 `python scripts/generate-pwa-icons.py` 生成 PNG 图标（仅运行该脚本时需要 Pillow）。

## 初始功能示例

首次启动打开 20 页「功能示例」。已有本地草稿优先恢复；通过「切换示例 → 功能示例」可打开新版示例，替换前仍可导出当前工程。

- 1–8 页：八种独立布局、正文与引用、玻璃面板、指标、对比、里程碑和内嵌图片。
- 9–12 页：组合容器、叠层与精确定位、LaTeX 分式/积分/矩阵/分段函数、代码和表格。
- 13–14 页：使用 let、range、map、filter、reduce 和条件表达式计算表格数据，设置列宽、对齐和数字格式。
- 15–18 页：全部入场效果、四种缓动、点击阶段与先后顺序、样式修饰符和页面覆盖。
- 19–20 页：编辑、素材、工程保存与导出操作参考。

每页备注解释对应源码与操作方式。PNG 图表随工程导出，不依赖远程地址；可选开发脚本 `python scripts/generate-example-chart.py` 重建图表源码（仅运行该脚本时需要 matplotlib 与 numpy，网站运行不需要 Python）。

线上功能示例可直接通过 `/?example=features` 打开。此入口使用独立、按示例版本隔离的浏览器草稿，不会覆盖普通入口恢复的工作工程；在示例中进行的修改也会单独保存。普通首页默认恢复最近的工作工程，因此已保存的旧内容不会因网站发布而自动改变。

新版功能示例的草稿独立保存于修订版 2；`/?example=features` 打开最新版，`/?example=features&revision=1` 可恢复此前独立入口保存的修订版 1 草稿。普通首页的工作工程不受影响。
