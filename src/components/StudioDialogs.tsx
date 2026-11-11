import { SavedTemplates } from "./SavedTemplates";
import { useState } from "react";
import {
  BookOpen,
  Code2,
  Download,
  FolderOpen,
  Layers,
  Presentation,
} from "lucide-react";
import { Dialog } from "./Dialog";
import {
  showcaseDeck,
  mathDeck,
  engineeringDeck,
  mathProofDeck,
  researchDeck,
} from "../examples";
import type { Deck } from "../dsl";
import type { Studio } from "../studio/use-studio";
export type StudioDialog = "export" | "help" | "templates";
export default function StudioDialogs({
  kind,
  studio: s,
  onClose,
}: {
  kind: StudioDialog;
  studio: Studio;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"faithful" | "editable">("faithful"),
    [template, setTemplate] = useState<Deck | null>(null);
  if (template)
    return (
      <Dialog
        title="切换示例？"
        busy={s.busy}
        onClose={() => setTemplate(null)}
      >
        <p>将打开「{template.title}」。当前工程可通过撤销恢复。</p>
        <div className="confirm-actions">
          <button onClick={() => setTemplate(null)}>取消</button>
          <button
            className="primary"
            onClick={() => {
              s.template(template);
              onClose();
            }}
          >
            切换示例
          </button>
        </div>
      </Dialog>
    );
  return (
    <Dialog
      title={
        kind === "export"
          ? "导出"
          : kind === "templates"
            ? "示例与我的模板"
            : "DSL 语法指南"
      }
      busy={s.busy}
      onClose={onClose}
      className={kind === "help" ? "help-modal" : ""}
    >
      {kind === "export" ? (
        <>
          {s.notice?.kind === "error" && (
            <p className="inline-error" role="alert">
              {s.notice.message}
            </p>
          )}
          {s.error && (
            <p className="inline-error">DSL 有错误，可先导出纯文本保留草稿。</p>
          )}
          <button
            className="export-option"
            disabled={s.busy || !!s.error}
            onClick={async () => {
              if (await s.archive()) onClose();
            }}
          >
            <FolderOpen />
            <div>
              工程压缩包 <b>.zip</b>
              <small>DSL、工程配置和全部图片</small>
            </div>
            <Download size={17} />
          </button>
          <fieldset className="pptx-text-mode" disabled={s.busy || !!s.error}>
            <legend>PPTX 文字</legend>
            <label>
              <input
                type="radio"
                name="pptx-text"
                checked={mode === "faithful"}
                onChange={() => setMode("faithful")}
              />
              保留版式
            </label>
            <label>
              <input
                type="radio"
                name="pptx-text"
                checked={mode === "editable"}
                onChange={() => setMode("editable")}
              />
              可编辑文字
            </label>
            <small>
              {mode === "faithful"
                ? "文字导出为图片；两种方式都保留动画。"
                : "纯文字可编辑；含行内公式的段落保留为图像，字体由演示设备决定。"}
            </small>
          </fieldset>
          <button
            className="export-option"
            disabled={s.busy || !!s.error}
            onClick={async () => {
              if (await s.pptx(mode)) onClose();
            }}
          >
            <Presentation />
            <div>
              PowerPoint <b>.pptx</b>
              <small>页面内容、公式、备注与动画</small>
            </div>
            <Download size={17} />
          </button>
          <button
            className="export-option"
            disabled={s.busy}
            onClick={() => {
              s.sourceFile();
              onClose();
            }}
          >
            <Code2 />
            <div>
              纯文本 DSL <b>.slide</b>
              <small>仅源码，不包含图片</small>
            </div>
            <Download size={17} />
          </button>
          <p className="export-note">
            {s.operation || "动画在 PowerPoint 幻灯片放映模式中播放。"}
          </p>
        </>
      ) : kind === "templates" ? (
        <>
          {[
            {
              deck: showcaseDeck,
              title: "功能示例",
              detail: `${showcaseDeck.slides.length} 页 · 数学讲解、证明与组件用法`,
              icon: BookOpen,
            },
            {
              deck: mathDeck,
              title: "数学论坛",
              detail: "定理、推导与讨论",
              icon: Code2,
            },
            {
              deck: mathProofDeck,
              title: "数学证明",
              detail: "自然分栏、自动续页与证明步骤",
              icon: Code2,
            },
            {
              deck: researchDeck,
              title: "研发成果汇报",
              detail: "左下实验大图、右上说明与交付计划",
              icon: Layers,
            },
            {
              deck: engineeringDeck,
              title: "工程汇报",
              detail: "成果、方案与里程碑",
              icon: Layers,
            },
          ].map(({ deck, title, detail, icon: Icon }) => (
            <button
              className="template-card"
              key={title}
              onClick={() => setTemplate(deck)}
            >
              <Icon />
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
            </button>
          ))}
          <SavedTemplates studio={s} onClose={onClose} />
        </>
      ) : (
        <>
          <p>
            用类似 SwiftUI 的声明式语法描述演示文稿，Slide
            只声明页面，布局使用独立组件。所有尺寸使用 1280 × 720 画布像素。
          </p>
          <pre>{`Deck("我的研究").transition(.slide, duration: 650)
Theme(preset: .aurora)

Slide(title: "一个清晰的结论") {
  Split {
    Bullets(["提出问题", "建立模型", "验证结果"])
        .appear(.rise, step: 1, order: 0, duration: 500)
    Equation(#"E = mc^2"#)
        .appear(.zoom, step: 1, order: 1,
                delay: 150, duration: 700, easing: .easeOut)
  }
}.notes("先解释直觉，再展示公式")`}</pre>
          <h3>定位、右键与格式化</h3>
          <p>
            右键画布内容可定位到
            DSL，右键源码可定位到对应页面与内容。菜单提供复制、剪切、粘贴和组件操作。使用「格式化」或
            Ctrl / ⌘ + Shift + F 或 Shift + Alt + F
            整理长参数换行，注释和计算表达式会保留。Ctrl / ⌘ + /
            切换当前行或所选多行的注释，也可使用「注释」按钮或右键菜单。
          </p>
          <h3>主题</h3>
          <p>
            上方主题菜单提供 10 套样式。Theme(preset: .paper) 切换预设，可追加
            accent、background、color、font、material 覆盖默认值。切换菜单只修改
            Theme 声明；页面和组件的显式样式优先。
          </p>
          <h3>预设布局</h3>
          <p>
            Cover 封面 · Section 章节 · Flow 正文 · Split 双栏 · Cards 卡片 ·
            Compare 对比 · Timeline 时间线 · ImageText 图文 · Center 居中 ·
            Sidebar 侧栏 · HeaderBody 上下 · ThreeColumns 三栏 · Focus 主次
          </p>
          <h3>内容与基础元素</h3>
          <p>
            Text / Quote / Code 接受文字；Bullets 接受文本数组；Equation 接受
            LaTeX 原始字符串；Image 接受素材路径；Metric 接受指标值和
            label；Table 接受二维数组。Heading 设置标题层级，Caption
            写说明；Numbered 编号，Divider 分隔；Rectangle / Circle
            绘制图元，Badge 显示徽标，Progress 接收 0–1 的进度值。
          </p>
          <h3>数学环境与自动续页</h3>
          <p>
            普通 Slide 中的
            Definition、Theorem、Lemma、Proposition、Corollary、Problem、Given、Solution、Proof、ProofStep、Derivation、Reasoning
            按内容高度自动续页。环境重复标题，步骤连续编号，Proof
            仅在最后显示证毕符号。模板「数学证明」展示完整用法。
          </p>
          <pre>
            {
              'Slide(title: "证明") {\n    Proof {\n        ProofStep("第一步", reason: "已知条件") { Text(`由 $a=b$ 得到结论。`) }\n        ProofStep("第二步") { Equation(`a^2=b^2`) }\n    }\n}'
            }
          </pre>
          <p>
            DynamicSlide(columns: 2)
            按第一栏、第二栏、下一页自然顺延，无需分别定义左右栏。 titleSize
            设置标题字号，fontSize 设置正文（8–64），margin 设置页边距，padding
            设置内容内边距，columnGap 设置栏间距，titleGap
            设置标题与正文间距。showFooter: false 隐藏页脚，增加可用空间。
            PageBreak() 和 ColumnBreak()
            可手动控制换页、换栏；页面操作作用于整组续页。
          </p>
          <h3>正文与公式</h3>
          <pre>
            {
              "Text {\n    设 $x>0$，\n    下面证明**非负性**。\n\n    $$\\frac{x^2}{2} \\ge 0$$\n\n    因此结论成立。\n}.indent(2)"
            }
          </pre>
          <p>
            Text 的花括号内可以直接写正文，无需引号或转义反斜线。
            单个源码换行连续显示，空一行才生成显示换行；公式内部的换行保留。
            .indent(2) 设置段首缩进，闭包后可继续使用 .font() 等修饰符。
          </p>
          <pre>
            {
              "Text(`**结论**：误差为 $\\frac{1}{n}$，*收敛*。`)\nEquation(`\\nabla f(x)`)"
            }
          </pre>
          <p>
            支持 **粗体**、*斜体*、~~删除线~~ 和反引号行内代码，可嵌套。
            公式使用 $…$ 或反斜杠括号，独立显示使用 $$…$$ 或反斜杠方括号。
            反引号包裹的原始字符串无需双写公式反斜杠；三个反引号支持多行和内嵌行内代码。原有
            #"..."# 继续可用。未闭合时保留原文。行内公式有 LaTeX 提示，Code
            块与行内代码保持原样。
          </p>
          <h3>计算与表格</h3>
          <pre>{`let data = range(0, 6).map(k => [k, k^2])
Slide(title: "计算数据") {
    Table(columns: [Column("k", align: .center),
                    Column("k²", align: .right, format: "0.00")],
          rows: data)
        .tableStyle(zebra: true, borders: .all)
}`}</pre>
          <p>
            支持 let 常量、算术与条件表达式、数组下标、map / filter /
            reduce，以及 sum、mean、round、fixed、percent
            等函数。计算在本地解释执行；错误会显示行列位置。表格可设置表头、列宽、对齐、数字格式、行高与边框。
          </p>
          <h3>自定义布局</h3>
          <pre>{`func ResultPanel(title, gap = 16) {
    Panel(radius: 20) {
        VStack(spacing: gap) {
            Heading(title, level: 2)
            Content()
        }
    }
}
// 在 Slide 中调用：
ResultPanel(title: "结论") {
    Numbered(["误差下降", "结果可复现"])
    Progress(mean([0.7, 0.9]), label: "验证进度")
}`}</pre>
          <p>
            func 支持默认参数和局部 let 计算。Content()
            放入所有剩余内容，Slot(0) 放入第一个子项；每项只放置一次。Columns /
            Rows 用 weights 分配剩余宽度或高度，Panel
            提供面板。函数名、参数与插槽均有代码提示。
          </p>
          <h3>位置、尺寸与缩放</h3>
          <pre>{`Image("assets/plot.png")
    .frame(width: 400, height: 200)
    .position(x: 24, y: 24,
              reference: .bottomLeft, anchor: .bottomLeft)
    .scale(1.5)`}</pre>
          <p>
            position 默认参考父内容区的左下角，x 向右、y 向上。 reference
            选择参考点，anchor 选择元素自身锚点，relativeTo: .slide
            使用整个画布。frame 设置布局占位，scale
            按锚点缩放最终内容，保持位置； 没有 position 时默认围绕中心缩放。旧
            frame 的 x/y 参数请改用 position。
          </p>
          <h3>布局与动画</h3>
          <p>
            使用 HStack / VStack / ZStack / Grid 自由嵌套，Spacer
            分配空白。修饰符
            .font()、.foreground()、.background()、.frame(width:,
            height:)、.position(x:, y:, reference:,
            anchor:)、.scale()、.padding()、.step() 控制呈现；页面支持
            .transition() 与 .notes()。用 .appear() 定义入场效果、step
            点击阶段、order 组内顺序、delay 延迟、duration 时长和 easing
            缓动。编辑器支持代码提示和行内错误定位。图片使用 assets/
            相对路径，可在素材面板插入或粘贴。
          </p>
          <p className="muted">
            直接读写目录需 Chrome / Edge 与安全上下文（HTTPS 或
            localhost）。其他浏览器可导入导出完整工程。数学公式由本地 MathJax
            渲染，不加载 CDN。
          </p>
        </>
      )}
    </Dialog>
  );
}
