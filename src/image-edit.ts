export type Point = { x: number; y: number };
export type ImageEdit =
  | {
      kind: "text";
      point: Point;
      text: string;
      color: string;
      size: number;
      font?: string;
      rotation?: number;
    }
  | { kind: "erase"; points: Point[]; color: string; size: number };
export type Crop = { x: number; y: number; w: number; h: number };
export function cropRect(
  a: Point,
  b: Point,
  width: number,
  height: number,
): Crop {
  const x = Math.max(0, Math.min(width - 1, Math.floor(Math.min(a.x, b.x)))),
    y = Math.max(0, Math.min(height - 1, Math.floor(Math.min(a.y, b.y))));
  return {
    x,
    y,
    w: Math.max(1, Math.min(width - x, Math.ceil(Math.max(a.x, b.x)) - x)),
    h: Math.max(1, Math.min(height - y, Math.ceil(Math.max(a.y, b.y)) - y)),
  };
}
export function colorValues(r: number, g: number, b: number) {
  return {
    hex: "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join(""),
    rgb: `rgb(${r}, ${g}, ${b})`,
    binary: [r, g, b].map((v) => v.toString(2).padStart(8, "0")).join(" "),
  };
}
export function renderImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  edits: ImageEdit[],
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(image, 0, 0);
  for (const e of [
    ...edits.filter((e) => e.kind !== "text"),
    ...edits.filter((e) => e.kind === "text"),
  ]) {
    ctx.save();
    ctx.fillStyle = e.color;
    ctx.strokeStyle = e.color;
    if (e.kind === "text") {
      ctx.font = `${e.size}px ${e.font || "Arial, sans-serif"}`;
      ctx.translate(e.point.x, e.point.y);
      ctx.rotate(((e.rotation || 0) * Math.PI) / 180);
      ctx.textBaseline = "top";
      e.text
        .split("\n")
        .forEach((s, i) => ctx.fillText(s, 0, i * e.size * 1.3));
    } else {
      ctx.lineWidth = e.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      e.points.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.stroke();
      if (e.points.length === 1) {
        ctx.beginPath();
        ctx.arc(e.points[0].x, e.points[0].y, e.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

export type TextEdit = Extract<ImageEdit, { kind: "text" }>;
export type ImageDocument = {
  originalPath: string;
  edits: ImageEdit[];
  crop: Crop | null;
};
export function textBounds(
  edit: TextEdit,
  ctx?: CanvasRenderingContext2D | null,
) {
  if (ctx) ctx.font = `${edit.size}px ${edit.font || "Arial, sans-serif"}`;
  return {
    w:
      Math.max(
        edit.size,
        ...edit.text
          .split("\n")
          .map((line) =>
            ctx
              ? ctx.measureText(line).width
              : Array.from(line).length * edit.size,
          ),
      ) + 4,
    h: Math.max(1, edit.text.split("\n").length) * edit.size * 1.3,
  };
}
export function transformText(
  edit: TextEdit,
  start: Point,
  end: Point,
  kind: "move" | "scale" | "rotate",
): TextEdit {
  if (kind === "move")
    return {
      ...edit,
      point: {
        x: edit.point.x + end.x - start.x,
        y: edit.point.y + end.y - start.y,
      },
    };
  const a = { x: start.x - edit.point.x, y: start.y - edit.point.y },
    b = { x: end.x - edit.point.x, y: end.y - edit.point.y };
  if (kind === "scale")
    return {
      ...edit,
      size: Math.max(
        4,
        Math.min(
          500,
          (edit.size * Math.hypot(b.x, b.y)) /
            Math.max(1, Math.hypot(a.x, a.y)),
        ),
      ),
    };
  return {
    ...edit,
    rotation:
      (((edit.rotation || 0) +
        ((Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x)) * 180) / Math.PI +
        540) %
        360) -
      180,
  };
}
export function validateImageDocuments(
  docs: unknown,
  assets: Record<string, string>,
): asserts docs is Record<string, ImageDocument> {
  if (docs === undefined) return;
  if (
    !docs ||
    typeof docs !== "object" ||
    Array.isArray(docs) ||
    new TextEncoder().encode(JSON.stringify(docs)).byteLength > 4_000_000
  )
    throw Error("图片编辑图层数据无效或过大");
  const finite = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1_000_000;
  const point = (p: Point) => p && finite(p.x) && finite(p.y);
  for (const [path, d] of Object.entries(
    docs as Record<string, ImageDocument>,
  )) {
    if (
      !Object.hasOwn(assets, path) ||
      !d ||
      !Object.hasOwn(assets, d.originalPath) ||
      !Array.isArray(d.edits) ||
      d.edits.length > 2000
    )
      throw Error("图片编辑图层引用无效");
    if (
      d.crop !== null &&
      (!point(d.crop) ||
        !finite(d.crop.w) ||
        !finite(d.crop.h) ||
        d.crop.w < 1 ||
        d.crop.h < 1 ||
        d.crop.x < 0 ||
        d.crop.y < 0 ||
        d.crop.w > 32768 ||
        d.crop.h > 32768 ||
        d.crop.w * d.crop.h > 32_000_000)
    )
      throw Error("图片裁剪参数无效");
    for (const e of d.edits) {
      if (
        !e ||
        !/^#[0-9a-f]{6}$/i.test(e.color) ||
        !finite(e.size) ||
        e.size < 1 ||
        e.size > 1000
      )
        throw Error("图片图层样式无效");
      if (e.kind === "text") {
        if (
          !point(e.point) ||
          typeof e.text !== "string" ||
          e.text.length > 20000 ||
          (e.font !== undefined &&
            (typeof e.font !== "string" || e.font.length > 160)) ||
          (e.rotation !== undefined && !finite(e.rotation))
        )
          throw Error("文字图层无效");
      } else if (
        e.kind !== "erase" ||
        !Array.isArray(e.points) ||
        e.points.length > 100000 ||
        !e.points.every(point)
      )
        throw Error("涂抹图层无效");
    }
  }
}
