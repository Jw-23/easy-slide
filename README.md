# Easy Slide

一个只在本地运行的演示文稿工作台。用类似 SwiftUI 的声明式 DSL，把数学论坛和工程汇报变成层次清晰的幻灯片。

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

详见 [DSL 说明](docs/DSL.md)。所有内容在同一份声明式数据中定义，网页和 PPTX 共享布局引擎；不执行 DSL 中的脚本或组件。格式版本为 `1`。Deck、Theme、每个 Slide 在顶层并列书写。布局通过独立 Cover / Split / Cards / Flow 等组件组合，也可嵌套 HStack、VStack、ZStack、Grid 与 Spacer；支持链式字体、颜色、尺寸、边距与动画设置。编辑器具有 CodeMirror 代码提示、语法着色和错误定位。DSL 是专用语言，不需要 Swift 工具链，也不执行 JavaScript。

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

## 开发与验证

React + TypeScript + Vite；专用词法与语法解析器；MathJax 本地矢量公式；PptxGenJS + JSZip 导出；IndexedDB 自动保存。无应用后端。

`npm test` 验证扁平/旧版 DSL 往返、带位置错误、代码补全、动画时间线、原生 PPTX 动画节点、模板布局边界与公式。`npm run test:e2e` 执行 Chromium 浏览器测试（首次运行需 `npx playwright install chromium`）。
