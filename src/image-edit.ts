export type Point = { x: number; y: number };
export type ImageEdit =
  | { kind: "text"; point: Point; text: string; color: string; size: number }
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
  for (const e of edits) {
    ctx.save();
    ctx.fillStyle = e.color;
    ctx.strokeStyle = e.color;
    if (e.kind === "text") {
      ctx.font = `${e.size}px Arial, sans-serif`;
      ctx.textBaseline = "top";
      e.text
        .split("\n")
        .forEach((s, i) =>
          ctx.fillText(s, e.point.x, e.point.y + i * e.size * 1.3),
        );
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
