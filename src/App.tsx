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
  Command,
  MoreHorizontal,
  Presentation,
  Layers,
  Save,
  Upload,
} from "lucide-react";
import {
  parseDeck,
  serialize,
  validateProject,
  layouts,
  layoutLabels,
  type Deck,
  type Layout,
  type Project,
  type Block,
} from "./dsl";
import { initialSource, mathDeck, engineeringDeck } from "./examples";
import { SlideView } from "./SlideView";
import { download, exportPptx } from "./export";
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
  const [source, setSource] = useState(initialSource),
    [assets, setAssets] = useState<Record<string, string>>({}),
    [index, setIndex] = useState(0),
    [tab, setTab] = useState<"design" | "dsl" | "assets">("design"),
    [modal, setModal] = useState<"export" | "help" | "templates" | null>(null),
    [playing, setPlaying] = useState(false),
    [step, setStep] = useState(0),
    [toast, setToast] = useState(""),
    [saved, setSaved] = useState("正在恢复"),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [folder, setFolder] = useState<FolderHandle | null>(null),
    [confirm, setConfirm] = useState<Deck | null>(null);
  const lastDeck = useRef(mathDeck),
    importRef = useRef<HTMLInputElement>(null),
    imageRef = useRef<HTMLInputElement>(null),
    editorRef = useRef<HTMLTextAreaElement>(null);
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
    loadDraft()
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
      saveDraft(project())
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
    update({
      ...deck,
      slides: deck.slides.map((s, i) => (i === active ? { ...s, ...p } : s)),
    });
  }
  function go(n: number) {
    setIndex(Math.max(0, Math.min(deck.slides.length - 1, n)));
    setStep(0);
  }
  function next() {
    const stages = (bs: Block[]): number[] =>
      bs.flatMap((b) => [b.step || 0, ...stages(b.children || [])]);
    const max = Math.max(0, ...stages(slide.blocks));
    if (step < max) setStep(step + 1);
    else go(active + 1);
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const input =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;
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
      await saveDraft(project());
      if (folder) {
        await writeFolder(folder, project());
        notify("工程已保存到 " + folder.name);
      } else {
        download(
          new Blob([JSON.stringify(project(), null, 2)], {
            type: "application/json",
          }),
          deck.title + ".easy-slide.json",
        );
        notify("已导出本地工程，包含全部图片");
      }
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
      const value = await file.text();
      if (/\.(slide|swift)$/i.test(file.name)) {
        parseDeck(value);
        setSource(value);
        notify("已导入 DSL，图片请从素材面板添加");
      } else {
        const p = validateProject(JSON.parse(value));
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
            ...slide.blocks,
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
      title: "一个新的想法",
      eyebrow: `${String(active + 2).padStart(2, "0")} / YOUR NEXT IDEA`,
      subtitle: "用清晰的内容，让想法被看见。",
      blocks:
        layout === "section"
          ? []
          : [
              {
                type: "text",
                text: "在右侧编辑内容，或用 DSL 完整描述这一页。",
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
        accept=".json,.slide,.swift"
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
          <b>LOCAL</b>
        </a>
        <div className="document-name">
          <span className="status-dot" />
          {deck.title}
          <span className="file-tag">.slide</span>
        </div>
        <div className="top-actions">
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
      <div className="workspace">
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
                  <small>{layoutLabels[s.layout]}</small>
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
          <div className="sidebar-bottom">
            <span className="status-dot" />
            仅在本地 · 内容属于你
          </div>
        </aside>
        <main className="main">
          <div className="workspace-toolbar">
            <div className="breadcrumbs">
              我的工作台
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
            <div className="canvas-heading">
              <div>
                <span className="overline">YOUR IDEAS, BEAUTIFULLY TOLD.</span>
                <h1>
                  让想法，自然成篇<span>。</span>
                </h1>
              </div>
              <span className="local-badge">
                <span className="status-dot" />
                本地工作空间
              </span>
            </div>
            <div className="preview-wrap">
              <SlideView
                deck={deck}
                slide={slide}
                index={active}
                assets={assets}
                animate
              />
              <div className="preview-under">
                <span>
                  {String(active + 1).padStart(2, "0")}
                  <span className="slash">/</span>
                  {String(deck.slides.length).padStart(2, "0")}
                  <i /> {layoutLabels[slide.layout]}
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
            <div className="notes-panel">
              <div>
                <FileText size={15} />
                <span>演讲者备注</span>
                <small>给自己的一点提示</small>
              </div>
              <textarea
                value={slide.notes || ""}
                disabled={!!error}
                placeholder="添加这一页的讲述思路，演示时仅你可见…"
                onChange={(e) => changeSlide({ notes: e.target.value })}
              />
            </div>
            <div className="canvas-tip">
              <Command size={13} />
              <span>⌘ / Ctrl + V 粘贴图片</span>
              <i />
              <span>⌘ / Ctrl + S 保存工程</span>
              <span className="autosave">
                <Check size={13} />
                {saved}
              </span>
            </div>
          </div>
          <footer>
            <span>少一些排版，多一些思考。</span>
            <span>
              EASY SLIDE <b>✦</b> MADE FOR IDEAS
            </span>
          </footer>
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
                <span>页面布局</span>
                <span>LAYOUT</span>
              </div>
              <div className="layout-grid">
                {layouts.map((l) => (
                  <button
                    key={l}
                    disabled={!!error}
                    className={
                      "layout-option " + (l === slide.layout ? "chosen" : "")
                    }
                    onClick={() => changeSlide({ layout: l })}
                  >
                    <div className={"layout-mini " + l}>
                      <i />
                      <i />
                      <i />
                    </div>
                    <span>{layoutLabels[l]}</span>
                    {l === slide.layout && <Check size={11} />}
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
                  用 DSL 编辑完整内容<small>文字、公式、图片，一处掌控</small>
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
              <label className="range-label">
                持续时间<span>{slide.duration ?? deck.duration ?? 600} ms</span>
                <input
                  type="range"
                  disabled={!!error}
                  min={0}
                  max={2000}
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
            <div className="dsl-panel">
              <div className="dsl-heading">
                <span>slides.slide</span>
                <button
                  className="icon-button"
                  title="DSL 语法指南"
                  onClick={() => setModal("help")}
                >
                  <BookOpen size={15} />
                </button>
              </div>
              <p>修改即预览，整个演示文稿由你掌控。</p>
              <textarea
                ref={editorRef}
                spellCheck={false}
                aria-label="DSL 编辑器"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
              <div className={"dsl-validation " + (error ? "invalid" : "")}>
                <span className="status-dot" />
                {error || "语法正确 · 实时同步"}
              </div>
            </div>
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
                            ...slide.blocks,
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
              <p className="muted">
                读取文件夹中的工程和图片。首次需要浏览器授予目录访问权限；工程保存时写入所选目录。
              </p>
              <button
                className="wide-button"
                onClick={() => importRef.current?.click()}
              >
                <Upload size={15} />
                导入工程 / DSL
              </button>
            </div>
          )}
          <div className="inspector-bottom">
            <FolderOpen size={16} />
            <div>
              {folder ? folder.name : "本地优先，安心创作"}
              <small>
                {folder
                  ? "点击顶部保存工程写入文件夹"
                  : "无需账号，无需上传到云端"}
              </small>
            </div>
          </div>
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
                <span className="overline">TAKE YOUR IDEAS WITH YOU</span>
                <h2>让想法，走得更远。</h2>
                <p>本地导出，随时继续。</p>
                <button
                  className="export-option"
                  disabled={busy || !!error}
                  onClick={() =>
                    task(async () => {
                      await exportPptx(deck, assets);
                      notify("PPTX 已导出");
                      setModal(null);
                    })
                  }
                >
                  <Presentation />
                  <div>
                    PowerPoint <b>.pptx</b>
                    <small>可编辑文本、矢量公式、原生页面过渡</small>
                  </div>
                  <Download size={17} />
                </button>
                <button
                  className="export-option"
                  onClick={save}
                  disabled={busy}
                >
                  <FolderOpen />
                  <div>
                    完整工程 <b>.json</b>
                    <small>包含 DSL 与全部图片，支持重新导入</small>
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
                    <small>易于版本管理，图片需单独保留</small>
                  </div>
                  <Download size={17} />
                </button>
                <p className="export-note">
                  网页支持按 step 逐项呈现；PPTX
                  导出全部内容，并保留页级过渡。PowerPoint
                  的逐项入场动画暂不支持。
                </p>
              </>
            ) : modal === "templates" ? (
              <>
                <span className="overline">A GOOD PLACE TO START</span>
                <h2>从一个好故事开始。</h2>
                <p>选择适合你的场景，替换为自己的内容。</p>
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
                <h2>内容有结构，表达有自由。</h2>
                <p>
                  用类似 SwiftUI
                  的声明式语法描述演示文稿，支持嵌套布局与链式修饰符。所有尺寸使用
                  1280 × 720 画布像素。
                </p>
                <pre>{`Deck("我的研究") {
    Theme(accent: "#16766d")
    Slide(.content, title: "一个清晰的结论") {
        HStack(spacing: 32) {
            VStack(spacing: 20) {
                Text("从直觉到证明").font(32)
                Bullets(["提出问题", "建立模型", "验证结果"])
            }
            Equation(#"E = mc^2"#).step(1)
        }
    }.notes("先解释直觉，再展示公式")
}.transition(.slide, duration: 650)`}</pre>
                <h3>八种布局</h3>
                <p>
                  cover 封面 · section 章节 · content 正文 · split 双栏 · grid
                  卡片 · compare 对比 · timeline 时间线 · image 图文
                </p>
                <h3>八类内容</h3>
                <p>
                  Text / Quote / Code 接受文字；Bullets 接受文本数组；Equation
                  接受 LaTeX 原始字符串；Image 接受素材路径；Metric 接受指标值和
                  label；Table 接受二维数组。
                </p>
                <h3>精确控制</h3>
                <p>
                  使用 HStack / VStack / ZStack / Grid 自由嵌套，Spacer
                  分配空白。修饰符
                  .font()、.foreground()、.background()、.frame(x:, y:, width:,
                  height:)、.padding()、.step() 控制呈现；页面支持 .transition()
                  与 .notes()。图片使用 assets/
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
              切换到{confirm === mathDeck ? "数学论坛" : "工程汇报"}示例？
            </h2>
            <p>这会替换当前工程，请先保存需要保留的内容。</p>
            <div className="confirm-actions">
              <button onClick={save}>导出当前工程</button>
              <button onClick={() => setConfirm(null)}>取消</button>
              <button
                className="primary"
                onClick={() => {
                  setSource(serialize(confirm));
                  setAssets({});
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
