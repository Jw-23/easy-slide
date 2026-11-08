import type { Deck, Slide } from "./dsl";
import type { Element } from "./scene";
export function svgData(svg: string): string {
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}
export function backdropData(deck: Deck, s: Slide): string {
  const bg = s.background || deck.theme?.background || "#fafbf9",
    accent = deck.theme?.accent || "#16766d";
  return svgData(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><radialGradient id="a"><stop stop-color="${accent}" stop-opacity=".26"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><radialGradient id="b"><stop stop-color="#a5b9ed" stop-opacity=".21"/><stop offset="1" stop-color="#a5b9ed" stop-opacity="0"/></radialGradient><radialGradient id="c"><stop stop-color="#eed7bb" stop-opacity=".20"/><stop offset="1" stop-color="#eed7bb" stop-opacity="0"/></radialGradient></defs><rect width="1280" height="720" fill="${bg}"/><ellipse cx="1100" cy="180" rx="560" ry="420" fill="url(#a)"/><ellipse cx="270" cy="720" rx="620" ry="400" fill="url(#b)"/><ellipse cx="650" cy="0" rx="400" ry="240" fill="url(#c)"/></svg>`,
  );
}
const images = new Map<string, Promise<HTMLImageElement>>();
async function load(data: string) {
  if (!images.has(data)) {
    images.set(
      data,
      (async () => {
        const img = new Image();
        img.src = data;
        await img.decode();
        return img;
      })(),
    );
  }
  return images.get(data)!;
}
export async function rasterSvg(data: string): Promise<string> {
  const img = await load(data);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("无法创建导出画布");
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}
/** PowerPoint has no live backdrop-filter: freeze only the material, preserving all foreground text and vectors. */
export async function glassTexture(
  e: Element,
  background: string,
): Promise<string> {
  const img = await load(background),
    canvas = document.createElement("canvas"),
    scale = 2;
  canvas.width = Math.max(1, Math.ceil(e.w * scale));
  canvas.height = Math.max(1, Math.ceil(e.h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("无法创建毛玻璃纹理");
  ctx.scale(scale, scale);
  const radius = Math.min(e.glass?.radius ?? 28, e.w / 2, e.h / 2);
  ctx.beginPath();
  ctx.roundRect(0, 0, e.w, e.h, radius);
  ctx.clip();
  ctx.filter = `blur(${e.glass?.blur ?? 24}px)`;
  ctx.drawImage(img, -e.x, -e.y, 1280, 720);
  ctx.filter = "none";
  ctx.globalAlpha = e.glass?.opacity ?? 0.68;
  ctx.fillStyle = e.fill || "#ffffff";
  ctx.fillRect(0, 0, e.w, e.h);
  ctx.globalAlpha = 1;
  const border = ctx.createLinearGradient(0, 0, e.w, e.h);
  border.addColorStop(0, "rgba(255,255,255,.92)");
  border.addColorStop(1, "rgba(255,255,255,.28)");
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(
    1,
    1,
    Math.max(0, e.w - 2),
    Math.max(0, e.h - 2),
    Math.max(0, radius - 1),
  );
  ctx.stroke();
  return canvas.toDataURL("image/png");
}
