import type { Slide } from "./dsl";
export const pageStyleKeys = [
  "titleSize",
  "fontSize",
  "margin",
  "padding",
  "titleGap",
  "columnGap",
  "showFooter",
] as const;
export function pageGeometry(s: Slide, compact = !!s.dynamic) {
  const custom = compact || pageStyleKeys.some((k) => s[k] !== undefined);
  if (!custom)
    return {
      custom: false,
      title: { x: 72, y: 104, w: 1136, h: 80, size: 42 },
      subtitleY: 183,
      body: { x: 74, y: 250, w: 1132, h: 370 },
      footerY: 664,
      showFooter: true,
    };
  const margin = s.margin ?? 32,
    padding = s.padding ?? 8,
    size = s.titleSize ?? 32;
  const y = margin + (s.eyebrow ? 28 : 0),
    h = Math.ceil(size * 1.42 + 6);
  const subtitleY = y + h + 6,
    top = y + h + (s.subtitle ? 40 : 0) + (s.titleGap ?? 12) + padding;
  const bottom = 720 - margin - padding - (s.showFooter === false ? 0 : 28);
  const body = {
    x: margin + padding,
    y: top,
    w: 1280 - 2 * (margin + padding),
    h: bottom - top,
  };
  if (body.w < 120 || body.h < 64)
    throw Error("标题、margin 或 padding 过大，没有足够的正文空间");
  return {
    custom: true,
    title: { x: margin, y, w: 1280 - 2 * margin, h, size },
    subtitleY,
    body,
    footerY: 720 - margin - 24,
    showFooter: s.showFooter !== false,
  };
}
