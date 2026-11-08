import { PwaControls } from "./PwaControls";
import { pageLayout, withLayout, pageContent } from "./dsl";
import { MotionPanel } from "./MotionPanel";
import { DslEditor } from "./DslEditor";
import { timeline } from "./motion";
import { scene } from "./scene";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Play,
  Plus,
  FolderOpen,
  Download,
  ChevronLeft,
  ChevronRight,
  Code2,
  PanelLeft,
  ImagePlus,
  Check,
  BookOpen,
  X,
  Copy,
  Trash2,
  Monitor,
  FileText,
  Presentation,
  Layers,
  Save,
  Upload,
} from "lucide-react";
import {
  parseDeck,
  serialize,
  layouts,
  layoutLabels,
  type Deck,
  type Layout,
  type Project,
} from "./dsl";
import {
  initialSource,
  initialAssets,
  showcaseDeck,
  exampleAssetsFor,
  mathDeck,
  engineeringDeck,
} from "./examples";
import { SlideView } from "./SlideView";
import { download, exportPptx } from "./export";
import {
  exportProjectArchive,
  MAX_ARCHIVE_BYTES,
  importProjectArchive,
  projectArchiveName,
  validatePortableProject,
} from "./project-archive";
import {
  loadDraft,
  saveDraft,
  chooseFolder,
  folderProject,
  folderImages,
  writeFolder,
  readData,
  type FolderHandle,
} from "./storage";
export default function App() {
  // The versioned feature tour has its own draft; visiting it never replaces a user's working project.
  const featureTour =
    new URLSearchParams(window.location.search).get("example") === "features";
  const draftKey = featureTour
    ? new URLSearchParams(window.location.search).get("revision") === "1"
      ? "draft:feature-tour:1"
      : "draft:feature-tour:2"
    : "draft";
  const [source, setSource] = useState(initialSource),
    [assets, setAssets] = useState<Record<string, string>>({
      ...initialAssets,
    }),
    [index, setIndex] = useState(0),
    [tab, setTab] = useState<"design" | "dsl" | "assets">("design"),
    [modal, setModal] = useState<"export" | "help" | "templates" | null>(null),
    [playing, setPlaying] = useState(false),
    [step, setStep] = useState(0),
    [previewStep, setPreviewStep] = useState(Infinity),
    [previewEpoch, setPreviewEpoch] = useState(0),
    [bottomTab, setBottomTab] = useState<"notes" | "motion">("notes"),
    [toast, setToast] = useState(""),
    [saved, setSaved] = useState("正在恢复"),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [pptxTextMode, setPptxTextMode] = useState<"faithful" | "editable">(
      "faithful",
    ),
    [folder, setFolder] = useState<FolderHandle | null>(null),
    [confirm, setConfirm] = useState<Deck | null>(null);
  const lastDeck = useRef(showcaseDeck),
    importRef = useRef<HTMLInputElement>(null),
    imageRef = useRef<HTMLInputElement>(null);
  let error = "";
  let deck: Deck = lastDeck.current;
  try {
    deck = parseDeck(source);
    lastDeck.current = deck;
  } catch (e) {
    error = (e as Error).message;
  }
  const active = Math.min(index, deck.slides.length - 1),
    slide = deck.slides[active];
  const project = (): Project => ({
    format: "easy-slide",
    version: 1,
    source,
    assets,
  });
  function notify(m: string) {
    setToast(m);
  }
  useEffect(() => {
    loadDraft(draftKey)
      .then((p) => {
        if (p) {
          setSource(p.source);
          setAssets(p.assets);
        }
        setSaved("已保存在此浏览器");
      })
      .catch(() => setSaved("本地恢复失败，请导入工程"))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaved("保存中…");
    const t = setTimeout(() => {
      saveDraft(project(), draftKey)
        .then(() => setSaved("已保存在此浏览器"))
        .catch(() => setSaved("保存失败，请导出备份"));
    }, 700);
    return () => clearTimeout(t);
  }, [source, assets, ready]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  function update(d: Deck) {
    setSource(serialize(d));
  }
  function changeSlide(p: Record<string, unknown>) {
    if (error) return;
    if (
      p.blocks &&
      slide.blocks.length === 1 &&
      slide.blocks[0].type === "layout" &&
      !(p.blocks as import("./dsl").Block[]).some((b) => b.type === "layout")
    )
      p.blocks = [
        { ...slide.blocks[0], expressionSource: undefined, children: p.blocks },
      ];
    update({
      ...deck,
      slides: deck.slides.map((s, i) => (i === active ? { ...s, ...p } : s)),
    });
  }
  function go(n: number) {
    setIndex(Math.max(0, Math.min(deck.slides.length - 1, n)));
    setStep(0);
    setPreviewStep(Infinity);
  }
  function next() {
    const stages = [
      ...new Set(scene(deck, slide, active).map((e) => e.step)),
    ].sort((a, b) => a - b);
    const upcoming = stages.find((s) => s > step);
    if (upcoming !== undefined) setStep(upcoming);
    else go(active + 1);
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const input =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
      if (e.key === "Escape") {
        setPlaying(false);
        setModal(null);
      }
      if (playing && !input) {
        if (["ArrowRight", " ", "PageDown"].includes(e.key)) {
          e.preventDefault();
          next();
        }
        if (["ArrowLeft", "PageUp"].includes(e.key)) {
          e.preventDefault();
          go(active - 1);
        }
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if ((e as Error).name !== "AbortError") notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (error) {
      notify("请先修复 DSL，或导出纯文本保留草稿");
      return;
    }
    await task(async () => {
      await saveDraft(project(), draftKey);
      if (folder) {
        await writeFolder(folder, project());
        notify("工程已保存到 " + folder.name);
      } else {
        await downloadArchive();
      }
    });
  }
  async function downloadArchive() {
    download(
      await exportProjectArchive(project()),
      projectArchiveName(deck.title),
    );
    notify("已导出工程 ZIP");
  }
  async function exportArchive() {
    await task(async () => {
      await downloadArchive();
      setModal(null);
    });
  }
  async function openFolder() {
    await task(async () => {
      const dir = await chooseFolder();
      const p = await folderProject(dir);
      const imgs = await folderImages(dir);
      if (p) {
        setSource(p.source);
        setAssets({ ...imgs, ...p.assets });
        setIndex(0);
      } else setAssets((a) => ({ ...a, ...imgs }));
      setFolder(dir);
      notify(
        p
          ? "已打开工程 · " + dir.name
          : "已连接文件夹，点击「保存工程」写入当前内容",
      );
    });
  }
  async function importFile(file?: File) {
    if (!file) return;
    await task(async () => {
      if (file.size > 280 * 1024 * 1024) throw Error("工程文件过大");
      if (/\.zip$/i.test(file.name)) {
        if (file.size > MAX_ARCHIVE_BYTES) throw Error("工程压缩包超过 256 MB");
        const p = await importProjectArchive(await file.arrayBuffer());
        setSource(p.source);
        setAssets(p.assets);
        notify("工程已导入");
      } else if (/\.(slide|swift)$/i.test(file.name)) {
        const value = await file.text();
        parseDeck(value);
        setSource(value);
        notify("已导入 DSL，图片请从素材面板添加");
      } else {
        const p = validatePortableProject(JSON.parse(await file.text()));
        setSource(p.source);
        setAssets(p.assets);
        notify("工程已导入");
      }
      setFolder(null);
      setIndex(0);
    });
  }
  async function addImages(files: File[], insert = true) {
    if (error) {
      notify("请先修复 DSL 再添加图片");
      return;
    }
    await task(async () => {
      const added: Record<string, string> = {};
      for (const f of files) {
        if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type))
          throw Error("支持 PNG / JPG / WebP / GIF 图片");
        if (f.size > 20 * 1024 * 1024) throw Error("每张图片请小于 20MB");
        const name =
          "assets/" +
          crypto.randomUUID().slice(0, 8) +
          "-" +
          f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        added[name] = await readData(f);
      }
      setAssets((a) => ({ ...a, ...added }));
      if (insert) {
        changeSlide({
          blocks: [
            ...pageContent(slide),
            ...Object.keys(added).map((src) => ({ type: "image", src })),
          ],
        });
      }
      notify(`已添加 ${files.length} 张图片`);
    });
  }
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) {
        e.preventDefault();
        void addImages(files);
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  });
  function addSlide(layout: Layout = "content") {
    if (error) return;
    const slides = [...deck.slides];
    slides.splice(active + 1, 0, {
      layout,
      title: "新页面",
      eyebrow: String(active + 2).padStart(2, "0"),
      blocks:
        layout === "section"
          ? []
          : [
              {
                type: "text",
                text: "正文",
              },
            ],
    });
    update({ ...deck, slides });
    go(active + 1);
    setIndex(active + 1);
  }
  function template(d: Deck) {
    setConfirm(d);
    setModal(null);
  }
  function start() {
    if (error) {
      notify("请先修复 DSL 错误");
      return;
    }
    setPlaying(true);
    setStep(0);
  }
  return (
    <div className="app">
      <input
        hidden
        type="file"
        accept=".zip,.json,.slide,.swift"
        ref={importRef}
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        ref={imageRef}
        onChange={(e) => {
          void addImages(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <header className="topbar">
        <a className="brand" href="#" aria-label="Easy Slide 首页">
          <span className="brand-icon">
            <Layers size={20} />
          </span>
          easy<span>slide</span>
        </a>
        <div className="document-name">
          <span className="status-dot" />
          {deck.title}
          <span className="file-tag">.slide</span>
        </div>
        <div className="top-actions">
          <PwaControls
            beforeUpdate={() => saveDraft(project(), draftKey)}
            canUpdate={ready && !busy}
          />
          <button
            onClick={() => setModal("help")}
            className="icon-button"
            title="DSL 使用指南"
          >
            <BookOpen size={18} />
          </button>
          <button onClick={save} disabled={busy}>
            <Save size={15} />
            保存工程
          </button>
          <button onClick={() => setModal("export")} disabled={busy || !!error}>
            <Download size={15} />
            导出
          </button>
          <button className="primary" onClick={start}>
            <Play size={14} fill="currentColor" />
            演示
          </button>
        </div>
      </header>
      <div className={"workspace " + (tab === "dsl" ? "editing" : "")}>
        <aside className="sidebar">
          <div className="sidebar-top">
            <span>演示文稿</span>
            <span className="count">{deck.slides.length} 页</span>
            <button
              className="icon-button"
              title="添加幻灯片"
              onClick={() => addSlide()}
              disabled={!!error}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="slide-list">
            {deck.slides.map((s, i) => (
              <button
                className={"slide-item " + (i === active ? "selected" : "")}
                key={i}
                onClick={() => go(i)}
              >
                <span className="slide-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="thumb">
                  <SlideView deck={deck} slide={s} index={i} assets={assets} />
                </div>
                <div className="slide-label">
                  {s.title.replaceAll("\n", "")}
                  <small>{layoutLabels[pageLayout(s)]}</small>
                </div>
              </button>
            ))}
          </div>
          <button
            className="add-slide"
            onClick={() => addSlide()}
            disabled={!!error}
          >
            <Plus size={16} />
            添加幻灯片 <span>＋</span>
          </button>
        </aside>
        <main className="main">
          <div className="workspace-toolbar">
            <div className="breadcrumbs">
              {featureTour ? "功能示例" : "工程"}
              <ChevronRight size={13} />
              <strong>{deck.title}</strong>
            </div>
            <button className="quiet" onClick={() => setModal("templates")}>
              <Layers size={14} />
              切换示例
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="canvas-area">
            <div className="preview-wrap">
              <SlideView
                deck={deck}
                slide={slide}
                index={active}
                assets={assets}
                step={previewStep}
                epoch={previewEpoch}
                animate
              />
              <div className="preview-under">
                <span>
                  {String(active + 1).padStart(2, "0")}
                  <span className="slash">/</span>
                  {String(deck.slides.length).padStart(2, "0")}
                  <i /> {layoutLabels[pageLayout(slide)]}
                </span>
                <div>
                  <button
                    className="icon-button"
                    title="上一页"
                    disabled={active === 0}
                    onClick={() => go(active - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    className="icon-button"
                    title="下一页"
                    disabled={active === deck.slides.length - 1}
                    onClick={() => go(active + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                  <span className="divider" />
                  <Monitor size={14} />
                  <span>16:9</span>
                </div>
              </div>
            </div>
            <div className="bottom-tabs">
              <button
                className={bottomTab === "notes" ? "active" : ""}
                onClick={() => setBottomTab("notes")}
              >
                <FileText size={13} />
                演讲者备注
              </button>
              <button
                className={bottomTab === "motion" ? "active" : ""}
                onClick={() => setBottomTab("motion")}
              >
                <Play size={12} />
                动画编排{" "}
                <span>{timeline(scene(deck, slide, active)).length}</span>
              </button>
            </div>
            {bottomTab === "notes" ? (
              <div className="notes-panel">
                <div>
                  <FileText size={15} />
                  <span>演讲者备注</span>
                </div>
                <textarea
                  value={slide.notes || ""}
                  disabled={!!error}
                  placeholder="添加演讲者备注"
                  onChange={(e) => changeSlide({ notes: e.target.value })}
                />
              </div>
            ) : (
              <MotionPanel
                cues={timeline(scene(deck, slide, active))}
                step={previewStep}
                onPreview={(s) => {
                  setPreviewStep(s);
                  setPreviewEpoch((e) => e + 1);
                }}
                onAll={() => setPreviewStep(Infinity)}
                onEdit={() => setTab("dsl")}
              />
            )}
            <div className="canvas-tip">
              <span className="autosave">
                <Check size={13} />
                {saved}
              </span>
            </div>
          </div>
        </main>
        <aside className="inspector">
          <div className="tabs">
            <button
              className={tab === "design" ? "active" : ""}
              onClick={() => setTab("design")}
            >
              <PanelLeft size={14} />
              页面
            </button>
            <button
              className={tab === "dsl" ? "active" : ""}
              onClick={() => setTab("dsl")}
            >
              <Code2 size={14} />
              DSL
            </button>
            <button
              className={tab === "assets" ? "active" : ""}
              onClick={() => setTab("assets")}
            >
              <ImagePlus size={14} />
              素材
            </button>
          </div>
          {tab === "design" ? (
            <div className="inspector-content">
              <div className="section-heading">
                <span>布局组件</span>
                <span>LAYOUT</span>
              </div>
              <div className="layout-grid">
                {layouts.map((l) => (
                  <button
                    key={l}
                    disabled={!!error}
                    className={
                      "layout-option " +
                      (l === pageLayout(slide) ? "chosen" : "")
                    }
                    onClick={() => {
                      const updated = withLayout(slide, l);
                      changeSlide({
                        blocks: updated.blocks,
                        layout: undefined,
                      });
                    }}
                  >
                    <div className={"layout-mini " + l}>
                      <i />
                      <i />
                      <i />
                    </div>
                    <span>{layoutLabels[l]}</span>
                    {l === pageLayout(slide) && <Check size={11} />}
                  </button>
                ))}
              </div>
              <div className="section-heading separated">
                <span>内容</span>
                <span>CONTENT</span>
              </div>
              <label>
                页标题
                <textarea
                  rows={2}
                  aria-label="页标题"
                  value={slide.title}
                  disabled={!!error}
                  onChange={(e) => changeSlide({ title: e.target.value })}
                />
              </label>
              <label>
                副标题
                <input
                  value={slide.subtitle || ""}
                  disabled={!!error}
                  onChange={(e) => changeSlide({ subtitle: e.target.value })}
                />
              </label>
              <button className="edit-dsl" onClick={() => setTab("dsl")}>
                <Code2 size={15} />
                <div>
                  编辑 DSL<small>组件、布局与动画</small>
                </div>
                <ArrowUpRight size={15} />
              </button>
              <div className="section-heading separated">
                <span>动画与过渡</span>
                <span>MOTION</span>
              </div>
              <label>
                过渡效果
                <select
                  disabled={!!error}
                  value={slide.transition || deck.transition || "fade"}
                  onChange={(e) => changeSlide({ transition: e.target.value })}
                >
                  <option value="fade">柔和淡入 · Fade</option>
                  <option value="slide">自然推移 · Slide</option>
                  <option value="zoom">轻盈缩放 · Zoom</option>
                  <option value="none">无过渡</option>
                </select>
              </label>
              <div className="motion-settings">
                <label>
                  过渡方向
                  <select
                    aria-label="过渡方向"
                    disabled={!!error}
                    value={slide.direction || deck.direction || "left"}
                    onChange={(e) => changeSlide({ direction: e.target.value })}
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
                    disabled={!!error}
                    value={slide.easing || deck.easing || "easeOut"}
                    onChange={(e) => changeSlide({ easing: e.target.value })}
                  >
                    <option value="easeOut">柔和减速</option>
                    <option value="easeInOut">缓入缓出</option>
                    <option value="linear">匀速</option>
                    <option value="spring">轻盈弹性</option>
                  </select>
                </label>
              </div>
              <label className="range-label">
                持续时间<span>{slide.duration ?? deck.duration ?? 600} ms</span>
                <input
                  type="range"
                  disabled={!!error}
                  min={0}
                  max={3000}
                  step={50}
                  value={slide.duration ?? deck.duration ?? 600}
                  onChange={(e) =>
                    changeSlide({ duration: Number(e.target.value) })
                  }
                />
              </label>
              <div className="section-heading separated">
                <span>演示主题</span>
                <span>THEME</span>
              </div>
              <label>
                默认卡片材质
                <select
                  aria-label="默认卡片材质"
                  value={deck.theme?.material || "solid"}
                  disabled={!!error}
                  onChange={(e) =>
                    update({
                      ...deck,
                      theme: {
                        ...deck.theme,
                        material: e.target.value as "glass" | "solid",
                      },
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
                    type="color"
                    value={deck.theme?.accent || "#16766d"}
                    disabled={!!error}
                    onChange={(e) =>
                      update({
                        ...deck,
                        theme: { ...deck.theme, accent: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  背景色
                  <input
                    type="color"
                    value={deck.theme?.background || "#fafbf9"}
                    disabled={!!error}
                    onChange={(e) =>
                      update({
                        ...deck,
                        theme: { ...deck.theme, background: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
              <div className="slide-operations">
                <button
                  disabled={!!error}
                  onClick={() => {
                    const slides = [...deck.slides];
                    slides.splice(active + 1, 0, structuredClone(slide));
                    update({ ...deck, slides });
                    setIndex(active + 1);
                  }}
                >
                  <Copy size={13} />
                  复制此页
                </button>
                <button
                  disabled={deck.slides.length === 1 || !!error}
                  onClick={() => {
                    update({
                      ...deck,
                      slides: deck.slides.filter((_, i) => i !== active),
                    });
                    setIndex(Math.max(0, active - 1));
                  }}
                >
                  <Trash2 size={13} />
                  删除
                </button>
              </div>
            </div>
          ) : tab === "dsl" ? (
            <DslEditor
              value={source}
              onChange={setSource}
              assets={Object.keys(assets)}
              onFormat={() => {
                if (!error) update(deck);
              }}
              onHelp={() => setModal("help")}
            />
          ) : (
            <div className="inspector-content">
              <div className="section-heading">
                <span>工程素材</span>
                <span>{Object.keys(assets).length} 张</span>
              </div>
              <button
                className="upload-zone"
                onClick={() => imageRef.current?.click()}
              >
                <ImagePlus size={27} />
                <strong>添加本地图片</strong>
                <small>或直接粘贴到当前页面</small>
                <small>PNG / JPG / WebP / GIF · ≤ 20 MB</small>
              </button>
              <div className="asset-list">
                {Object.entries(assets).map(([key, src]) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (!error) {
                        changeSlide({
                          blocks: [
                            ...pageContent(slide),
                            { type: "image", src: key },
                          ],
                        });
                        notify("已插入到当前页");
                      }
                    }}
                    title={"点击插入：" + key}
                  >
                    <img src={src} />
                    <small>{key.split("/").pop()}</small>
                  </button>
                ))}
              </div>
              <button
                className="wide-button"
                disabled={busy}
                onClick={openFolder}
              >
                <FolderOpen size={15} />
                {folder ? folder.name : "打开本地文件夹"}
              </button>
              <p className="muted">打开工程 ZIP、解压后的工程或图片文件夹。</p>
              <button
                className="wide-button"
                onClick={() => importRef.current?.click()}
              >
                <Upload size={15} />
                导入工程
              </button>
            </div>
          )}
          {folder && (
            <div className="inspector-bottom">
              <FolderOpen size={16} />
              <div>
                {folder.name}
                <small>点击保存工程写入文件夹</small>
              </div>
            </div>
          )}
        </aside>
      </div>
      {error && (
        <div className="error-banner" onClick={() => setTab("dsl")}>
          DSL 有错误，正在显示上次有效预览：{error}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {playing && (
        <div className="presentation" tabIndex={-1}>
          <div className="presentation-slide">
            <SlideView
              deck={deck}
              slide={slide}
              index={active}
              assets={assets}
              step={step}
              animate
            />
          </div>
          <div className="presentation-controls">
            <button onClick={() => go(active - 1)} disabled={active === 0}>
              <ChevronLeft size={18} />
            </button>
            <span>
              {active + 1} / {deck.slides.length}
            </span>
            <button onClick={next}>
              <ChevronRight size={18} />
            </button>
            <span>方向键 / 空格继续 · Esc 退出</span>
            <button onClick={() => setPlaying(false)} title="退出演示">
              <X size={18} />
            </button>
          </div>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className={"modal " + (modal === "help" ? "help-modal" : "")}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "export" ? (
              <>
                <h2>导出</h2>
                <button
                  className="export-option"
                  onClick={exportArchive}
                  disabled={busy || !!error}
                >
                  <FolderOpen />
                  <div>
                    工程压缩包 <b>.zip</b>
                    <small>DSL、工程配置和全部图片</small>
                  </div>
                  <Download size={17} />
                </button>
                <fieldset className="pptx-text-mode">
                  <legend>PPTX 文字</legend>
                  <label>
                    <input
                      type="radio"
                      name="pptx-text"
                      checked={pptxTextMode === "faithful"}
                      onChange={() => setPptxTextMode("faithful")}
                    />
                    保留版式
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="pptx-text"
                      checked={pptxTextMode === "editable"}
                      onChange={() => setPptxTextMode("editable")}
                    />
                    可编辑文字
                  </label>
                  <small>
                    {pptxTextMode === "faithful"
                      ? "文字导出为图片；两种方式都保留动画。"
                      : "文字可在 PowerPoint 中修改，字体由演示设备决定。"}
                  </small>
                </fieldset>
                <button
                  className="export-option"
                  disabled={busy || !!error}
                  onClick={() =>
                    task(async () => {
                      await exportPptx(deck, assets, {
                        textMode: pptxTextMode,
                      });
                      notify("PPTX 已导出");
                      setModal(null);
                    })
                  }
                >
                  <Presentation />
                  <div>
                    PowerPoint <b>.pptx</b>
                    <small>
                      {pptxTextMode === "faithful"
                        ? "文字版式、矢量公式与动画"
                        : "可编辑文字、矢量公式与动画"}
                    </small>
                  </div>
                  <Download size={17} />
                </button>
                <button
                  className="export-option"
                  onClick={() =>
                    download(
                      new Blob([source], { type: "text/plain" }),
                      "slides.slide",
                    )
                  }
                >
                  <Code2 />
                  <div>
                    纯文本 DSL <b>.slide</b>
                    <small>仅源码，不包含图片</small>
                  </div>
                  <Download size={17} />
                </button>
                <p className="export-note">
                  动画在 PowerPoint 的幻灯片放映模式中播放。
                </p>
              </>
            ) : modal === "templates" ? (
              <>
                <h2>选择示例</h2>
                <div
                  className="template-card"
                  onClick={() => template(showcaseDeck)}
                >
                  <BookOpen />
                  <div>
                    <h3>功能示例</h3>
                    <p>20 页 · 全部组件、LaTeX、素材、材质与动画</p>
                  </div>
                  <ArrowUpRight />
                </div>
                <div
                  className="template-card"
                  onClick={() => template(mathDeck)}
                >
                  <span>∑</span>
                  <div>
                    <h3>数学论坛</h3>
                    <p>直觉 · 定理 · 推导 · 讨论</p>
                  </div>
                  <ArrowUpRight />
                </div>
                <div
                  className="template-card blue"
                  onClick={() => template(engineeringDeck)}
                >
                  <Layers />
                  <div>
                    <h3>工程汇报</h3>
                    <p>成果 · 方案 · 里程碑 · 决策</p>
                  </div>
                  <ArrowUpRight />
                </div>
              </>
            ) : (
              <>
                <span className="overline">EASY SLIDE DSL / V1</span>
                <h2>DSL 语法指南</h2>
                <p>
                  用类似 SwiftUI 的声明式语法描述演示文稿，Slide
                  只声明页面，布局使用独立组件。所有尺寸使用 1280 × 720
                  画布像素。
                </p>
                <pre>{`Deck("我的研究").transition(.slide, duration: 650)
Theme(accent: "#16766d")

Slide(title: "一个清晰的结论") {
  Split {
    Bullets(["提出问题", "建立模型", "验证结果"])
        .appear(.rise, step: 1, order: 0, duration: 500)
    Equation(#"E = mc^2"#)
        .appear(.zoom, step: 1, order: 1,
                delay: 150, duration: 700, easing: .easeOut)
  }
}.notes("先解释直觉，再展示公式")`}</pre>
                <h3>八种布局</h3>
                <p>
                  Cover 封面 · Section 章节 · Flow 正文 · Split 双栏 · Cards
                  卡片 · Compare 对比 · Timeline 时间线 · ImageText 图文
                </p>
                <h3>八类内容</h3>
                <p>
                  Text / Quote / Code 接受文字；Bullets 接受文本数组；Equation
                  接受 LaTeX 原始字符串；Image 接受素材路径；Metric 接受指标值和
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
                  分配空白。修饰符
                  .font()、.foreground()、.background()、.frame(x:, y:, width:,
                  height:)、.padding()、.step() 控制呈现；页面支持 .transition()
                  与 .notes()。用 .appear() 定义入场效果、step 点击阶段、order
                  组内顺序、delay 延迟、duration 时长和 easing
                  缓动。编辑器支持代码提示和行内错误定位。图片使用 assets/
                  相对路径，可在素材面板插入或粘贴。
                </p>
                <p className="muted">
                  直接读写目录需 Chrome / Edge +
                  localhost。其他浏览器可导入导出完整工程。数学公式由本地
                  MathJax 渲染，不加载 CDN。
                </p>
                <div className="help-actions">
                  <button
                    onClick={() => {
                      setModal(null);
                      setTab("dsl");
                    }}
                  >
                    开始编辑 DSL <ArrowUpRight size={14} />
                  </button>
                  <button onClick={() => importRef.current?.click()}>
                    导入文件 <Upload size={14} />
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section className="modal">
            <h2>
              切换到
              {confirm === showcaseDeck
                ? "功能示例"
                : confirm === mathDeck
                  ? "数学论坛"
                  : "工程汇报"}
              ？
            </h2>
            <p>这会替换当前工程，请先保存需要保留的内容。</p>
            <div className="confirm-actions">
              <button onClick={save}>导出当前工程</button>
              <button onClick={() => setConfirm(null)}>取消</button>
              <button
                className="primary"
                onClick={() => {
                  setSource(serialize(confirm));
                  setAssets(exampleAssetsFor(confirm));
                  setIndex(0);
                  setFolder(null);
                  setConfirm(null);
                }}
              >
                切换示例
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
