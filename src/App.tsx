import { ImageEditor } from "./components/ImageEditor";
import { ContextMenu } from "./components/ContextMenu";
import { useContextActions } from "./studio/use-context-actions";
import { useShortcuts } from "./studio/use-shortcuts";
import { lazy, Suspense, useRef, useState, type CSSProperties } from "react";
import {
  AlertCircle,
  Check,
  Code2,
  FileText,
  Focus,
  ImagePlus,
  LoaderCircle,
  Monitor,
  PanelLeft,
  PanelRight,
  X,
} from "lucide-react";
import { PwaControls } from "./PwaControls";
import { themePresets, type ThemeId } from "./themes";
import { StudioHeader } from "./components/StudioHeader";
import { SlideNavigator } from "./components/SlideNavigator";
import { CanvasWorkspace } from "./components/CanvasWorkspace";
import { Inspector, type InspectorTab } from "./components/Inspector";
import { PresentationView } from "./components/PresentationView";
import { StudioBoundary } from "./components/StudioBoundary";
import { useStudio } from "./studio/use-studio";
import { useWorkspace, type MobileView } from "./studio/use-workspace";
import type { StudioDialog } from "./components/StudioDialogs";
const StudioDialogs = lazy(() => import("./components/StudioDialogs"));
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const draftKey =
    params.get("example") === "features"
      ? `draft:feature-tour:${["1", "2", "3", "4", "5"].includes(params.get("revision") || "") ? params.get("revision") : "6"}`
      : "draft";
  const s = useStudio(draftKey),
    workspace = useWorkspace();
  const [tab, setTab] = useState<InspectorTab>("design"),
    [dialog, setDialog] = useState<StudioDialog | null>(null),
    [playing, setPlaying] = useState(false);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null),
    imageRef = useRef<HTMLInputElement>(null),
    inspectorRef = useRef<HTMLDivElement>(null);
  useShortcuts(s, () => setPlaying(true));
  const drag = useRef<{ x: number; width: number } | null>(null);
  function onTab(value: InspectorTab) {
    setTab(value);
    workspace.showInspector();
    workspace.setMobile(value);
  }
  function mobile(value: MobileView) {
    workspace.setMobile(value);
    if (value === "design" || value === "dsl" || value === "assets")
      setTab(value);
  }
  const context = useContextActions(
    s,
    () => onTab("dsl"),
    () => workspace.setMobile("preview"),
    () => imageRef.current?.click(),
    setEditingImage,
  );
  const saveLabel = {
    restoring: "正在恢复草稿…",
    pending: "等待保存…",
    saving: "保存中…",
    saved: "已保存在此浏览器",
    error: s.restoreFailed ? "草稿恢复失败，请导出备份" : "草稿保存失败",
  }[s.saveState];
  const width = tab === "dsl" ? workspace.codeWidth : workspace.designWidth;
  const modes = [
    { id: "pages", label: "页面列表", icon: PanelLeft },
    { id: "preview", label: "预览", icon: Monitor },
    { id: "design", label: "页面", icon: FileText },
    { id: "dsl", label: "DSL", icon: Code2 },
    { id: "assets", label: "素材", icon: ImagePlus },
  ] as const;
  return (
    <StudioBoundary project={s.project}>
      <div className="app" aria-busy={!s.ready}>
        <input
          hidden
          type="file"
          accept=".easy-slide,.zip,.json,.slide,.swift"
          ref={importRef}
          disabled={!s.ready || s.busy}
          onChange={(event) => {
            void s.importFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          ref={imageRef}
          disabled={!s.editable}
          onChange={(event) => {
            void s.addImages(Array.from(event.target.files || []));
            event.target.value = "";
          }}
        />
        <StudioHeader
          studio={s}
          onImport={() => importRef.current?.click()}
          onHelp={() => setDialog("help")}
          onTemplates={() => setDialog("templates")}
          onExport={() => setDialog("export")}
          onPresent={() => setPlaying(true)}
        >
          <PwaControls
            beforeUpdate={s.persist}
            canUpdate={s.ready && !s.busy}
          />
        </StudioHeader>
        <div className="workspace-toolbar">
          <div className="view-actions">
            <button
              className="icon-button"
              aria-label="显示页面列表"
              aria-pressed={workspace.sidebar}
              onClick={workspace.toggleSidebar}
            >
              <PanelLeft size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="显示编辑面板"
              aria-pressed={workspace.inspector}
              onClick={workspace.toggleInspector}
            >
              <PanelRight size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="专注预览"
              aria-pressed={workspace.focused}
              onClick={workspace.toggleFocus}
            >
              <Focus size={16} />
            </button>
          </div>
          <span className="current-page-name" title={s.slide.title}>
            {s.active + 1}. {s.slide.title.replaceAll("\n", " ")}
          </span>
          <label className="theme-picker">
            <span>主题</span>
            <select
              aria-label="演示主题"
              disabled={!s.editable}
              value={s.deck.theme?.preset || ""}
              onChange={(event) =>
                s.theme({ preset: event.target.value as ThemeId })
              }
            >
              <option value="" disabled>
                自定义
              </option>
              {themePresets.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {s.error && (
          <div className="document-error" role="alert">
            <AlertCircle size={14} />
            <span>DSL 有错误，保留上次有效预览</span>
            <button onClick={() => onTab("dsl")}>查看错误</button>
          </div>
        )}
        <nav className="mobile-modes" aria-label="工作区切换">
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-pressed={workspace.mobile === id}
              onClick={() => mobile(id)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
        <div
          className={`workspace ${tab === "dsl" ? "editing" : ""} ${workspace.sidebar ? "" : "sidebar-closed"} ${workspace.inspector ? "" : "inspector-closed"}`}
          data-mobile-view={workspace.mobile}
          style={
            {
              "--panel-width": `${width}px`,
              "--nav-width": workspace.sidebar ? "172px" : "0px",
            } as CSSProperties
          }
        >
          <div
            className="navigator-slot"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest(".slide-item"))
                workspace.setMobile("preview");
            }}
          >
            <SlideNavigator studio={s} onContextMenu={context.thumbnail} />
          </div>
          <CanvasWorkspace
            studio={s}
            onCode={() => onTab("dsl")}
            focus={context.focus}
            onContextMenu={context.canvas}
            onPaste={context.pasteEvent}
            onClearFocus={context.clearFocus}
          />
          <div
            className="workspace-splitter"
            role="separator"
            tabIndex={0}
            aria-label="调整编辑面板宽度"
            aria-orientation="vertical"
            aria-valuemin={tab === "dsl" ? 320 : 260}
            aria-valuemax={tab === "dsl" ? 900 : 520}
            aria-valuenow={width}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                x: event.clientX,
                width:
                  inspectorRef.current?.getBoundingClientRect().width || width,
              };
            }}
            onPointerMove={(event) => {
              if (drag.current)
                workspace.resize(
                  drag.current.width + drag.current.x - event.clientX,
                  tab === "dsl",
                );
            }}
            onPointerUp={(event) => {
              drag.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                workspace.resize(
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 900
                      : width + (event.key === "ArrowLeft" ? 20 : -20),
                  tab === "dsl",
                );
              }
            }}
          />
          <div className="inspector-slot" ref={inspectorRef}>
            <Inspector
              studio={s}
              onEditImage={setEditingImage}
              tab={tab}
              onTab={onTab}
              onHelp={() => setDialog("help")}
              onImages={() => imageRef.current?.click()}
              reveal={context.reveal}
              onEditorContext={context.editor}
              clipboard={context.clipboard}
            />
          </div>
        </div>
        <footer className="statusbar">
          <span
            className={`save-state ${s.saveState}`}
            title={s.saveError || undefined}
          >
            {s.saveState === "error" ? (
              <AlertCircle size={12} />
            ) : s.saveState === "saved" ? (
              <Check size={12} />
            ) : (
              <LoaderCircle size={12} className="spinning" />
            )}
            {saveLabel}
          </span>
          {s.saveState === "error" && !s.restoreFailed && (
            <button
              onClick={() => {
                void s
                  .persist()
                  .catch((problem) =>
                    s.notify(
                      problem instanceof Error
                        ? problem.message
                        : String(problem),
                      "error",
                    ),
                  );
              }}
            >
              重试保存
            </button>
          )}
          {s.folder && (
            <span className="folder-state" title={s.folder.name}>
              {s.folder.name} · {s.folderDirty ? "未写入" : "已同步"}
            </span>
          )}
          {s.operation ? (
            <span className="operation-state" role="status">
              <LoaderCircle size={12} className="spinning" />
              {s.operation}
            </span>
          ) : (
            <span className="document-meta">
              {s.deck.slides.length} 页 · 16:9
            </span>
          )}
        </footer>
        {s.notice && (
          <div
            className={`toast ${s.notice.kind}`}
            role={s.notice.kind === "error" ? "alert" : "status"}
          >
            {s.notice.kind === "error" ? (
              <AlertCircle size={16} />
            ) : (
              <Check size={16} />
            )}
            <span>{s.notice.message}</span>
            {s.notice.undo && s.canUndo && (
              <button
                disabled={s.busy}
                onClick={() => {
                  s.undo();
                  s.dismissNotice();
                }}
              >
                撤销
              </button>
            )}
            <button
              className="icon-button"
              aria-label="关闭提示"
              onClick={s.dismissNotice}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {editingImage && (
          <ImageEditor
            key={editingImage}
            path={editingImage}
            studio={s}
            onClose={() => setEditingImage(null)}
          />
        )}
        {context.menu && (
          <ContextMenu menu={context.menu} onClose={context.close} />
        )}
        {playing && (
          <PresentationView studio={s} onClose={() => setPlaying(false)} />
        )}
        {dialog && (
          <Suspense
            fallback={
              <div className="toast" role="status">
                正在打开窗口…
              </div>
            }
          >
            <StudioDialogs
              kind={dialog}
              studio={s}
              onClose={() => setDialog(null)}
            />
          </Suspense>
        )}
      </div>
    </StudioBoundary>
  );
}
