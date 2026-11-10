import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  MousePointer2,
  Crop as CropIcon,
  Type,
  Pipette,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Check,
  RotateCcw,
  RotateCw,
  Scaling,
  FileImage,
} from "lucide-react";
import { Dialog } from "./Dialog";
import {
  cropRect,
  colorValues,
  renderImage,
  textBounds,
  transformText,
  type ImageEdit,
  type TextEdit,
  type Crop,
  type Point,
} from "../image-edit";
import type { Project } from "../dsl";
import type { Studio } from "../studio/use-studio";
import { renameImage } from "../studio/image-actions";
import "./image-editor.css";
type Document = { edits: ImageEdit[]; crop: Crop | null };
type Mode = "select" | "crop" | "text" | "erase" | "pick";
export function ImageEditor({
  path,
  studio: s,
  onClose,
}: {
  path: string;
  studio: Studio;
  onClose: () => void;
}) {
  const [snapshot] = useState(s.project),
    stored = snapshot.imageDocuments?.[path];
  const [name, setName] = useState(path.split("/").pop()!),
    [mode, setMode] = useState<Mode>("select"),
    [doc, setDoc] = useState<Document>({
      edits: stored?.edits || [],
      crop: stored?.crop || null,
    }),
    [past, setPast] = useState<Document[]>([]),
    [future, setFuture] = useState<Document[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [typing, setTyping] = useState(false),
    [color, setColor] = useState("#ffffff"),
    [brush, setBrush] = useState(24),
    [sample, setSample] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null),
    field = useRef<HTMLTextAreaElement>(null),
    current = useRef(doc),
    textBefore = useRef<Document | null>(null);
  current.current = doc;
  function preview(next: Document) {
    current.current = next;
    setDoc(next);
  }
  const gesture = useRef<{
    start: Point;
    before: Document;
    index?: number;
    kind?: "move" | "scale" | "rotate";
    paint?: Extract<ImageEdit, { kind: "erase" }>;
  } | null>(null);
  const text =
    selected !== null && doc.edits[selected]?.kind === "text"
      ? (doc.edits[selected] as TextEdit)
      : null;
  function remember(before: Document) {
    setPast((xs) => [...xs, before].slice(-50));
    setFuture([]);
  }
  function commit(next: Document) {
    remember(current.current);
    current.current = next;
    preview(next);
  }
  function replaceText(patch: Partial<TextEdit>, transient = false) {
    if (selected === null || !text) return;
    const next = {
      ...current.current,
      edits: current.current.edits.map((e, i) =>
        i === selected && e.kind === "text" ? { ...e, ...patch } : e,
      ),
    };
    if (transient) {
      current.current = next;
      preview(next);
    } else commit(next);
  }
  useEffect(() => {
    const data = snapshot.assets[stored?.originalPath || path];
    if (!data || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(data)) {
      setError("素材不存在或不是支持的本地图片");
      return;
    }
    const img = new Image();
    let alive = true;
    img.onload = () => {
      if (!alive) return;
      if (img.naturalWidth * img.naturalHeight > 32_000_000) {
        setError("图片超过 3200 万像素，请先缩小后编辑");
        return;
      }
      image.current = img;
      canvas.current!.width = img.naturalWidth;
      canvas.current!.height = img.naturalHeight;
      setReady(true);
    };
    img.onerror = () => setError("图片无法解码");
    img.src = data;
    return () => {
      alive = false;
    };
  }, [path, snapshot, stored]);
  useEffect(() => {
    if (!ready || !canvas.current || !image.current) return;
    renderImage(
      canvas.current.getContext("2d")!,
      image.current,
      doc.edits.filter((e) => e.kind !== "text"),
    );
  }, [ready, doc]);
  useEffect(() => {
    if (!ready || !canvas.current) return;
    const measure = () =>
      setZoom(
        canvas.current!.getBoundingClientRect().width / canvas.current!.width,
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas.current);
    return () => ro.disconnect();
  }, [ready]);
  useEffect(() => {
    if (typing) field.current?.focus();
  }, [typing, selected]);
  function point(e: PointerEvent): Point {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  }
  function startText(
    e: PointerEvent,
    index: number,
    kind: "move" | "scale" | "rotate",
  ) {
    if (saving || e.button !== 0) return;
    if (typing) endTyping();
    e.preventDefault();
    e.stopPropagation();
    setSelected(index);
    setTyping(false);
    gesture.current = { start: point(e), before: current.current, index, kind };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    if (g.index !== undefined) {
      const original = g.before.edits[g.index] as TextEdit;
      preview({
        ...g.before,
        edits: g.before.edits.map((edit, i) =>
          i === g.index ? transformText(original, g.start, p, g.kind!) : edit,
        ),
      });
    } else if (g.paint) {
      g.paint = { ...g.paint, points: [...g.paint.points, p] };
      preview({ ...g.before, edits: [...g.before.edits, g.paint] });
    } else
      preview({
        ...g.before,
        crop: cropRect(
          g.start,
          p,
          canvas.current!.width,
          canvas.current!.height,
        ),
      });
  }
  function finish() {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (
      g.index === undefined &&
      !g.paint &&
      current.current.crop &&
      (current.current.crop.w < 2 || current.current.crop.h < 2)
    ) {
      preview(g.before);
      return;
    }
    if (JSON.stringify(g.before) !== JSON.stringify(current.current))
      remember(g.before);
  }
  function endTyping() {
    setTyping(false);
    if (
      textBefore.current &&
      JSON.stringify(textBefore.current) !== JSON.stringify(current.current)
    )
      remember(textBefore.current);
    textBefore.current = null;
  }
  function undo() {
    if (!past.length) return;
    setFuture((xs) => [...xs, current.current]);
    preview(past.at(-1)!);
    setPast((xs) => xs.slice(0, -1));
    setTyping(false);
    setSelected(null);
  }
  function redo() {
    if (!future.length) return;
    setPast((xs) => [...xs, current.current]);
    preview(future.at(-1)!);
    setFuture((xs) => xs.slice(0, -1));
    setSelected(null);
  }
  async function save() {
    setError("");
    setSaving(true);
    try {
      if (!name.trim()) throw Error("请输入图片名称");
      let project: Project = snapshot,
        newName = name;
      if (doc.edits.length || doc.crop || stored) {
        const full = document.createElement("canvas");
        full.width = canvas.current!.width;
        full.height = canvas.current!.height;
        renderImage(full.getContext("2d")!, image.current!, doc.edits);
        const c = doc.crop || { x: 0, y: 0, w: full.width, h: full.height },
          out = document.createElement("canvas");
        out.width = c.w;
        out.height = c.h;
        out
          .getContext("2d")!
          .drawImage(full, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
        const originalPath =
          stored?.originalPath ||
          `assets/.image-original/${crypto.randomUUID()}-${path.split("/").pop()}`;
        project = {
          ...snapshot,
          assets: {
            ...snapshot.assets,
            [originalPath]: snapshot.assets[stored?.originalPath || path],
            [path]: out.toDataURL("image/png"),
          },
          imageDocuments: {
            ...snapshot.imageDocuments,
            [path]: { originalPath, edits: doc.edits, crop: doc.crop },
          },
        };
        newName = newName.replace(/\.[^.]+$/, "") + ".png";
      }
      project = renameImage(project, path, newName);
      if (!s.contextCommit(snapshot, project)) {
        setError("工程已变更，请重新打开编辑器");
        return;
      }
      s.notify("图片与文字图层已保存", "success");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  const tools = [
    ["select", "选择文字", MousePointer2],
    ["crop", "裁剪", CropIcon],
    ["text", "添加文字", Type],
    ["pick", "取背景色", Pipette],
    ["erase", "涂抹擦除", Eraser],
  ] as const;
  return (
    <Dialog
      title="编辑图片"
      onClose={onClose}
      busy={saving}
      className="image-editor"
    >
      <div
        className="image-editor-toolbar"
        role="toolbar"
        aria-label="图片编辑工具"
      >
        <FileImage size={16} aria-hidden />
        <input
          className="image-filename"
          aria-label="文件名"
          title="文件名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
        />
        <div className="image-tools">
          {tools.map(([id, title, Icon]) => (
            <button
              className="icon-button"
              key={id}
              title={title}
              aria-label={title}
              aria-pressed={mode === id}
              disabled={!ready || saving}
              onClick={() => {
                setMode(id);
                setTyping(false);
                if (id !== "select") setSelected(null);
              }}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          aria-label="撤销编辑"
          title="撤销编辑"
          disabled={!past.length || saving}
          onClick={undo}
        >
          <Undo2 size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="重做"
          title="重做"
          disabled={!future.length || saving}
          onClick={redo}
        >
          <Redo2 size={17} />
        </button>
        {doc.crop && (
          <button
            className="icon-button"
            aria-label="取消裁剪"
            title="取消裁剪"
            disabled={saving}
            onClick={() => commit({ ...doc, crop: null })}
          >
            <RotateCcw size={17} />
          </button>
        )}
        <button
          className="icon-button image-save"
          aria-label="保存图片与名称"
          title="保存图片与名称"
          disabled={
            saving || !s.editable || (!ready && name === path.split("/").pop())
          }
          onClick={() => void save()}
        >
          <Check size={19} />
        </button>
      </div>
      {text && (
        <div className="image-text-settings" role="group" aria-label="文字样式">
          <input
            aria-label="字体"
            title="字体（使用本机已安装字体）"
            list="image-fonts"
            maxLength={160}
            value={text.font || "Arial, sans-serif"}
            disabled={saving}
            onChange={(e) =>
              replaceText({ font: e.target.value.replace(/[;\r\n]/g, "") })
            }
          />
          <datalist id="image-fonts">
            {[
              "Arial, sans-serif",
              "Microsoft YaHei, sans-serif",
              "PingFang SC, sans-serif",
              "SimSun, serif",
              "Times New Roman, serif",
              "Georgia, serif",
              "Courier New, monospace",
            ].map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <input
            aria-label="字号"
            title="字号"
            type="number"
            min={4}
            max={500}
            value={Math.round(text.size * 10) / 10}
            disabled={saving}
            onChange={(e) =>
              replaceText({
                size: Math.max(4, Math.min(500, Number(e.target.value) || 4)),
              })
            }
          />
          <input
            aria-label="文字颜色"
            title="文字颜色"
            type="color"
            value={text.color}
            disabled={saving}
            onChange={(e) => replaceText({ color: e.target.value })}
          />
          <RotateCw size={15} aria-hidden />
          <input
            aria-label="文字旋转角度"
            title="旋转角度"
            type="number"
            min={-180}
            max={180}
            value={Math.round(text.rotation || 0)}
            disabled={saving}
            onChange={(e) =>
              replaceText({
                rotation: Math.max(
                  -180,
                  Math.min(180, Number(e.target.value) || 0),
                ),
              })
            }
          />
          <button
            className="icon-button"
            title="删除文字"
            aria-label="删除文字"
            disabled={saving}
            onClick={() => {
              commit({
                ...doc,
                edits: doc.edits.filter((_, i) => i !== selected),
              });
              setSelected(null);
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
      {(mode === "erase" || mode === "pick") && (
        <div className="image-brush-settings">
          <input
            aria-label="颜色"
            title="背景覆盖色"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          {mode === "erase" && (
            <input
              aria-label="画笔大小"
              title="画笔大小"
              type="number"
              min={1}
              max={1000}
              value={brush}
              onChange={(e) =>
                setBrush(
                  Math.max(1, Math.min(1000, Number(e.target.value) || 1)),
                )
              }
            />
          )}
        </div>
      )}
      <div className="image-edit-viewport">
        <div
          className="image-edit-surface"
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={() => {
            const g = gesture.current;
            gesture.current = null;
            if (g) preview(g.before);
          }}
        >
          <canvas
            ref={canvas}
            aria-label="图片编辑画布"
            onPointerDown={(e) => {
              if (!ready || saving || e.button !== 0) return;
              const p = point(e);
              if (typing) endTyping();
              setSelected(null);
              setTyping(false);
              if (mode === "select") return;
              if (mode === "pick") {
                const [r, g, b] = canvas
                    .current!.getContext("2d")!
                    .getImageData(
                      Math.max(0, Math.min(canvas.current!.width - 1, p.x)),
                      Math.max(0, Math.min(canvas.current!.height - 1, p.y)),
                      1,
                      1,
                    ).data,
                  v = colorValues(r, g, b);
                setColor(v.hex);
                setSample(`${v.hex} · ${v.rgb} · ${v.binary}`);
                return;
              }
              if (mode === "text") {
                const index = doc.edits.length;
                commit({
                  ...doc,
                  edits: [
                    ...doc.edits,
                    {
                      kind: "text",
                      text: "文字",
                      point: p,
                      size: 24,
                      color: "#192c2a",
                      font: "Arial, sans-serif",
                      rotation: 0,
                    },
                  ],
                });
                setSelected(index);
                setMode("select");
                setTyping(true);
                return;
              }
              gesture.current = {
                start: p,
                before: current.current,
                ...(mode === "erase"
                  ? {
                      paint: { kind: "erase", points: [p], color, size: brush },
                    }
                  : {}),
              };
              e.currentTarget.setPointerCapture(e.pointerId);
              if (mode === "erase")
                preview({
                  ...doc,
                  edits: [...doc.edits, gesture.current.paint!],
                });
            }}
          />
          {ready &&
            doc.edits.map((edit, index) => {
              if (edit.kind !== "text") return null;
              const b = textBounds(edit, canvas.current?.getContext("2d"));
              const active = index === selected;
              return (
                <div
                  key={index}
                  className={`image-text-object ${active ? "selected" : ""}`}
                  data-text-index={index}
                  style={{
                    left: edit.point.x * zoom,
                    top: edit.point.y * zoom,
                    width: b.w * zoom,
                    height: b.h * zoom,
                    transform: `rotate(${edit.rotation || 0}deg)`,
                    fontFamily: edit.font || "Arial, sans-serif",
                    fontSize: edit.size * zoom,
                    color: edit.color,
                    pointerEvents:
                      mode === "select" || mode === "text" ? "auto" : "none",
                  }}
                  onPointerDown={(e) => {
                    if (typing && active) return;
                    startText(e, index, "move");
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelected(index);
                    textBefore.current = current.current;
                    setTyping(true);
                  }}
                >
                  {active && typing ? (
                    <textarea
                      ref={field}
                      aria-label="标注文字"
                      wrap="off"
                      value={edit.text}
                      disabled={saving}
                      onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        replaceText(
                          { text: e.target.value.slice(0, 20000) },
                          true,
                        )
                      }
                      onBlur={endTyping}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Escape" ||
                          ((e.ctrlKey || e.metaKey) && e.key === "Enter")
                        ) {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <span>{edit.text || " "}</span>
                  )}
                  {active && !typing && (
                    <>
                      <button
                        className="image-text-handle rotate"
                        aria-label="旋转文字"
                        title="拖动旋转"
                        onPointerDown={(e) => startText(e, index, "rotate")}
                      >
                        <RotateCw size={13} />
                      </button>
                      <button
                        className="image-text-handle scale"
                        aria-label="缩放文字"
                        title="拖动缩放"
                        onPointerDown={(e) => startText(e, index, "scale")}
                      >
                        <Scaling size={13} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          {doc.crop && (
            <div
              className="image-crop-box"
              style={{
                left: doc.crop.x * zoom,
                top: doc.crop.y * zoom,
                width: doc.crop.w * zoom,
                height: doc.crop.h * zoom,
              }}
            />
          )}
        </div>
      </div>
      <div className="image-editor-status">
        {mode === "text"
          ? "点击图片添加文字"
          : mode === "select"
            ? "双击文字编辑 · 拖动移动 · 拖动角点缩放或旋转"
            : mode === "crop"
              ? "拖动选择裁剪区域"
              : mode === "pick"
                ? "点击背景取色"
                : "用当前背景色涂抹覆盖"}
        <span>保存为 PNG，保留原图与可编辑图层</span>
      </div>
      {sample && (
        <input
          className="sample-value"
          aria-label="取色结果"
          readOnly
          value={sample}
          onFocus={(e) => e.target.select()}
        />
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
