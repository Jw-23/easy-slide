import type {
  EditorContext,
  RevealRequest,
} from "../studio/use-context-actions";
import type { StudioClipboard } from "../studio/clipboard";
import { lazy, Suspense, useRef } from "react";
import { Code2, ImagePlus, PanelLeft, Upload } from "lucide-react";
import { layouts, layoutLabels, pageLayout, type Slide } from "../dsl";
import { resolveTheme } from "../themes";
import type { Studio } from "../studio/use-studio";
const DslEditor = lazy(() =>
  import("../DslEditor").then((module) => ({ default: module.DslEditor })),
);
export type InspectorTab = "design" | "dsl" | "assets";
export function Inspector({
  studio: s,
  tab,
  onTab,
  onHelp,
  onImages,
  reveal,
  onEditorContext,
  clipboard,
}: {
  studio: Studio;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  onHelp: () => void;
  onImages: () => void;
  reveal?: RevealRequest | null;
  onEditorContext?: (context: EditorContext) => void;
  clipboard?: StudioClipboard;
}) {
  const theme = resolveTheme(s.deck.theme),
    locked = !s.editable,
    slide = s.slide;
  const session = useRef({ anchor: 0, head: 0, scrollTop: 0 });
  const tabs = [
    { id: "design", label: "页面", icon: PanelLeft },
    { id: "dsl", label: "DSL", icon: Code2 },
    { id: "assets", label: "素材", icon: ImagePlus },
  ] as const;
  return (
    <aside className="inspector" aria-label="编辑面板">
      <div className="tabs" role="tablist" aria-label="编辑模式">
        {tabs.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            role="tab"
            id={`editor-tab-${id}`}
            aria-controls={`editor-panel-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? "active" : ""}
            onClick={() => onTab(id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? tabs[(i + 1) % tabs.length]
                  : event.key === "ArrowLeft"
                    ? tabs[(i + tabs.length - 1) % tabs.length]
                    : undefined;
              if (next) {
                event.preventDefault();
                onTab(next.id);
                document.getElementById(`editor-tab-${next.id}`)?.focus();
              }
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
      <div
        className={`inspector-body ${tab}`}
        role="tabpanel"
        id={`editor-panel-${tab}`}
        aria-labelledby={`editor-tab-${tab}`}
      >
        {tab === "design" ? (
          <div className="inspector-content">
            <section className="settings-section">
              <h3>第 {s.active + 1} 页</h3>
              <label>
                页标题
                <textarea
                  rows={2}
                  aria-label="页标题"
                  value={slide.dynamic?.title ?? slide.title}
                  disabled={locked}
                  onChange={(e) => s.field({ title: e.target.value })}
                />
              </label>
              <label>
                副标题
                <input
                  value={slide.subtitle || ""}
                  disabled={locked}
                  onChange={(e) => s.field({ subtitle: e.target.value })}
                />
              </label>
            </section>
            <section className="settings-section">
              <h3>
                {slide.dynamic
                  ? `动态续页 ${slide.dynamic.part + 1} / ${slide.dynamic.total}`
                  : "布局"}
              </h3>
              {slide.dynamic && (
                <p className="muted">
                  标题与页面操作作用于整组，内容按高度自动续页。
                </p>
              )}
              <div className="layout-grid">
                {(slide.dynamic
                  ? (["content", "split"] as const)
                  : layouts
                ).map((layout) => (
                  <button
                    key={layout}
                    disabled={
                      locked ||
                      (slide.dynamic?.independentColumns &&
                        layout === "content")
                    }
                    title={
                      slide.dynamic?.independentColumns && layout === "content"
                        ? "独立左右栏需在 DSL 中调整结构"
                        : undefined
                    }
                    aria-pressed={
                      layout ===
                      (slide.dynamic
                        ? slide.dynamic.columns === 2
                          ? "split"
                          : "content"
                        : pageLayout(slide))
                    }
                    className={`layout-option ${layout === (slide.dynamic ? (slide.dynamic.columns === 2 ? "split" : "content") : pageLayout(slide)) ? "chosen" : ""}`}
                    onClick={() => s.layout(layout)}
                  >
                    <div aria-hidden="true" className={`layout-mini ${layout}`}>
                      <i />
                      <i />
                      <i />
                    </div>
                    <span>
                      {slide.dynamic
                        ? layout === "split"
                          ? "双栏"
                          : "单栏"
                        : layoutLabels[layout]}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <details className="settings-section" open>
              <summary>页面过渡</summary>
              <label>
                过渡效果
                <select
                  aria-label="过渡效果"
                  disabled={locked}
                  value={slide.transition || s.deck.transition || "fade"}
                  onChange={(e) =>
                    s.field({
                      transition: e.target.value as Slide["transition"],
                    })
                  }
                >
                  <option value="fade">淡入</option>
                  <option value="slide">推移</option>
                  <option value="zoom">缩放</option>
                  <option value="none">无过渡</option>
                </select>
              </label>
              <div className="motion-settings">
                <label>
                  过渡方向
                  <select
                    aria-label="过渡方向"
                    disabled={locked}
                    value={slide.direction || s.deck.direction || "left"}
                    onChange={(e) =>
                      s.field({
                        direction: e.target.value as Slide["direction"],
                      })
                    }
                  >
                    <option value="left">向左</option>
                    <option value="right">向右</option>
                    <option value="up">向上</option>
                    <option value="down">向下</option>
                  </select>
                </label>
                <label>
                  缓动曲线
                  <select
                    aria-label="缓动曲线"
                    disabled={locked}
                    value={slide.easing || s.deck.easing || "easeOut"}
                    onChange={(e) =>
                      s.field({ easing: e.target.value as Slide["easing"] })
                    }
                  >
                    <option value="easeOut">减速</option>
                    <option value="easeInOut">缓入缓出</option>
                    <option value="linear">匀速</option>
                    <option value="spring">弹性</option>
                  </select>
                </label>
              </div>
              <label className="range-label">
                持续时间
                <output>{slide.duration ?? s.deck.duration ?? 600} ms</output>
                <input
                  aria-label="过渡持续时间"
                  type="range"
                  min={0}
                  max={3000}
                  step={50}
                  disabled={locked}
                  value={slide.duration ?? s.deck.duration ?? 600}
                  onChange={(e) =>
                    s.field({ duration: Number(e.target.value) })
                  }
                />
              </label>
            </details>
            <details className="settings-section">
              <summary>主题细节</summary>
              <label>
                默认卡片材质
                <select
                  aria-label="默认卡片材质"
                  disabled={locked}
                  value={theme.material}
                  onChange={(e) =>
                    s.theme({
                      ...s.deck.theme,
                      material: e.target.value as "glass" | "solid",
                    })
                  }
                >
                  <option value="glass">毛玻璃</option>
                  <option value="solid">纯色</option>
                </select>
              </label>
              <div className="theme-row">
                <label>
                  强调色
                  <input
                    aria-label="强调色"
                    type="color"
                    value={theme.accent}
                    disabled={locked}
                    onChange={(e) =>
                      s.theme({ ...s.deck.theme, accent: e.target.value })
                    }
                  />
                </label>
                <label>
                  背景色
                  <input
                    aria-label="主题背景色"
                    type="color"
                    value={theme.background}
                    disabled={locked}
                    onChange={(e) =>
                      s.theme({ ...s.deck.theme, background: e.target.value })
                    }
                  />
                </label>
              </div>
            </details>
            <button className="edit-dsl" onClick={() => onTab("dsl")}>
              <Code2 size={14} />
              编辑 DSL
            </button>
          </div>
        ) : tab === "dsl" ? (
          <Suspense
            fallback={
              <p className="empty-state" role="status">
                正在打开编辑器…
              </p>
            }
          >
            <DslEditor
              value={s.project.source}
              onChange={s.text}
              assets={Object.keys(s.project.assets)}
              onFormat={s.format}
              onHelp={onHelp}
              onUndo={s.undo}
              onRedo={s.redo}
              readOnly={!s.ready || s.busy}
              session={session.current}
              reveal={reveal}
              onContextMenu={onEditorContext}
              clipboard={clipboard}
              onMessage={(message) => s.notify(message)}
            />
          </Suspense>
        ) : (
          <div className="inspector-content">
            <div className="panel-heading">
              <h3>素材</h3>
              <span>{Object.keys(s.project.assets).length} 张</span>
            </div>
            <button
              className="upload-zone"
              disabled={locked}
              onClick={onImages}
            >
              <Upload size={20} />
              <strong>添加图片</strong>
              <small>支持粘贴 · 每张 ≤ 20 MB</small>
            </button>
            <div className="asset-list">
              {Object.entries(s.project.assets).map(([path, src]) => (
                <button
                  key={path}
                  disabled={locked}
                  onClick={() => s.insertImage(path)}
                  title={`插入 ${path}`}
                >
                  <img src={src} alt={path.split("/").pop()} loading="lazy" />
                  <small>{path.split("/").pop()}</small>
                </button>
              ))}
            </div>
            {!Object.keys(s.project.assets).length && (
              <p className="empty-state">尚未添加图片</p>
            )}
            <p className="muted">PNG / JPG / WebP / GIF</p>
          </div>
        )}
      </div>
    </aside>
  );
}
