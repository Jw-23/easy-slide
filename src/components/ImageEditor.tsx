import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import {
  cropRect,
  colorValues,
  renderImage,
  type ImageEdit,
  type Crop,
  type Point,
} from "../image-edit";
import type { Project } from "../dsl";
import type { Studio } from "../studio/use-studio";
import { renameImage } from "../studio/image-actions";
import "./image-editor.css";
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
    [name, setName] = useState(path.split("/").pop()!),
    [mode, setMode] = useState<"crop" | "text" | "erase" | "pick">("crop"),
    [edits, setEdits] = useState<ImageEdit[]>([]),
    [redo, setRedo] = useState<ImageEdit[]>([]),
    [crop, setCrop] = useState<Crop | null>(null),
    [draft, setDraft] = useState<ImageEdit | null>(null),
    [label, setLabel] = useState("文字"),
    [color, setColor] = useState("#ffffff"),
    [size, setSize] = useState(24),
    [sample, setSample] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null),
    gesture = useRef<{ start: Point; edit?: ImageEdit } | null>(null);
  useEffect(() => {
    const data = snapshot.assets[path];
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
  }, [path, snapshot]);
  useEffect(() => {
    if (ready && canvas.current && image.current)
      renderImage(canvas.current.getContext("2d")!, image.current, [
        ...edits,
        ...(draft ? [draft] : []),
      ]);
  }, [ready, edits, draft]);
  function point(e: React.PointerEvent): Point {
    const c = canvas.current!,
      r = c.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(c.width - 1, ((e.clientX - r.left) * c.width) / r.width),
      ),
      y: Math.max(
        0,
        Math.min(c.height - 1, ((e.clientY - r.top) * c.height) / r.height),
      ),
    };
  }
  function add(edit: ImageEdit) {
    setEdits((xs) => [...xs, edit]);
    setRedo([]);
  }
  async function save() {
    setError("");
    setSaving(true);
    try {
      let project: Project = snapshot;
      const changed = !!crop || edits.length > 0;
      let newName = name;
      if (changed) {
        const out = document.createElement("canvas"),
          c = crop || {
            x: 0,
            y: 0,
            w: canvas.current!.width,
            h: canvas.current!.height,
          };
        out.width = c.w;
        out.height = c.h;
        out
          .getContext("2d")!
          .drawImage(canvas.current!, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
        project = {
          ...snapshot,
          assets: { ...snapshot.assets, [path]: out.toDataURL("image/png") },
        };
        newName = newName.replace(/\.[^.]+$/, "") + ".png";
      }
      project = renameImage(project, path, newName);
      if (!s.contextCommit(snapshot, project)) {
        setError("工程已变更，请关闭并重新打开图片编辑器后保存");
        return;
      }
      s.notify("图片及 DSL 引用已更新", "success");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      title="编辑图片"
      onClose={onClose}
      busy={saving}
      className="image-editor"
    >
      <div className="image-editor-toolbar">
        <label>
          文件名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </label>
        <div className="image-tools">
          {(
            [
              ["crop", "裁剪"],
              ["text", "添加文字"],
              ["pick", "取背景色"],
              ["erase", "涂抹擦除"],
            ] as const
          ).map(([id, title]) => (
            <button
              key={id}
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              {title}
            </button>
          ))}
        </div>
        <label>
          颜色
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <label>
          {mode === "text" ? "字号" : "画笔大小"}
          <input
            type="number"
            min={1}
            max={1000}
            value={size}
            onChange={(e) =>
              setSize(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))
            }
          />
        </label>
        {mode === "text" && (
          <label>
            标注文字
            <textarea
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
        )}
        <button
          disabled={!edits.length || saving}
          onClick={() => {
            setRedo((xs) => [...xs, edits.at(-1)!]);
            setEdits((xs) => xs.slice(0, -1));
          }}
        >
          撤销编辑
        </button>
        <button
          disabled={!redo.length || saving}
          onClick={() => {
            setEdits((xs) => [...xs, redo.at(-1)!]);
            setRedo((xs) => xs.slice(0, -1));
          }}
        >
          重做
        </button>
        <button disabled={!crop || saving} onClick={() => setCrop(null)}>
          取消裁剪
        </button>
      </div>
      <p className="muted">
        裁剪：拖出矩形；标注：输入文字后点击图片；取色：点击背景；擦除：用当前颜色涂抹覆盖。保存会更新所有引用，像素编辑保存为
        PNG（GIF 保存为静态图片）。
      </p>
      <div className="image-edit-viewport">
        <div className="image-edit-surface">
          <canvas
            ref={canvas}
            aria-label="图片编辑画布"
            onPointerDown={(e) => {
              if (!ready || saving || e.button !== 0) return;
              const p = point(e);
              if (mode === "pick") {
                const [r, g, b] = canvas
                    .current!.getContext("2d")!
                    .getImageData(p.x, p.y, 1, 1).data,
                  v = colorValues(r, g, b);
                setColor(v.hex);
                setSample(`${v.hex} · ${v.rgb} · 二进制 ${v.binary}`);
                return;
              }
              if (mode === "text") {
                if (label.trim())
                  add({ kind: "text", point: p, text: label, color, size });
                return;
              }
              e.currentTarget.setPointerCapture(e.pointerId);
              gesture.current = {
                start: p,
                ...(mode === "erase"
                  ? {
                      edit: {
                        kind: "erase",
                        points: [p],
                        color,
                        size,
                      } as ImageEdit,
                    }
                  : {}),
              };
              if (mode === "erase") setDraft(gesture.current.edit!);
              else setCrop(null);
            }}
            onPointerMove={(e) => {
              const g = gesture.current;
              if (!g) return;
              const p = point(e);
              if (g.edit?.kind === "erase") {
                g.edit = { ...g.edit, points: [...g.edit.points, p] };
                setDraft(g.edit);
              } else
                setCrop(
                  cropRect(
                    g.start,
                    p,
                    canvas.current!.width,
                    canvas.current!.height,
                  ),
                );
            }}
            onPointerUp={(e) => {
              const g = gesture.current;
              if (!g) return;
              if (g.edit) add(g.edit);
              else {
                const end = point(e);
                setCrop(
                  Math.abs(end.x - g.start.x) < 2 ||
                    Math.abs(end.y - g.start.y) < 2
                    ? null
                    : cropRect(
                        g.start,
                        end,
                        canvas.current!.width,
                        canvas.current!.height,
                      ),
                );
              }
              gesture.current = null;
              setDraft(null);
            }}
            onPointerCancel={() => {
              gesture.current = null;
              setDraft(null);
            }}
          />
          {crop && (
            <div
              className="image-crop-box"
              style={{
                left: `${(crop.x / (canvas.current?.width || 1)) * 100}%`,
                top: `${(crop.y / (canvas.current?.height || 1)) * 100}%`,
                width: `${(crop.w / (canvas.current?.width || 1)) * 100}%`,
                height: `${(crop.h / (canvas.current?.height || 1)) * 100}%`,
              }}
            />
          )}
        </div>
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
      <div className="image-editor-footer">
        <button disabled={saving} onClick={onClose}>
          取消
        </button>
        <button
          disabled={
            saving || !s.editable || (!ready && name === path.split("/").pop())
          }
          onClick={() => void save()}
        >
          保存图片与名称
        </button>
      </div>
    </Dialog>
  );
}
