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
import { showcaseDeck, mathDeck, engineeringDeck } from "../examples";
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
            ? "选择示例"
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
                : "文字可编辑，字体由演示设备决定。"}
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
              detail: "20 页 · 组件、主题、公式与动画",
              icon: BookOpen,
            },
            {
              deck: mathDeck,
              title: "数学论坛",
              detail: "定理、推导与讨论",
              icon: Code2,
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
            Ctrl / ⌘ + Shift + F 整理长参数换行，注释和计算表达式会保留。
          </p>
          <h3>主题</h3>
          <p>
            上方主题菜单提供 10 套样式。Theme(preset: .paper) 切换预设，可追加
            accent、background、color、font、material 覆盖默认值。切换菜单只修改
            Theme 声明；页面和组件的显式样式优先。
          </p>
          <h3>八种布局</h3>
          <p>
            Cover 封面 · Section 章节 · Flow 正文 · Split 双栏 · Cards 卡片 ·
            Compare 对比 · Timeline 时间线 · ImageText 图文
          </p>
          <h3>八类内容</h3>
          <p>
            Text / Quote / Code 接受文字；Bullets 接受文本数组；Equation 接受
            LaTeX 原始字符串；Image 接受素材路径；Metric 接受指标值和
            label；Table 接受二维数组。
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
          <h3>布局与动画</h3>
          <p>
            使用 HStack / VStack / ZStack / Grid 自由嵌套，Spacer
            分配空白。修饰符 .font()、.foreground()、.background()、.frame(x:,
            y:, width:, height:)、.padding()、.step() 控制呈现；页面支持
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
