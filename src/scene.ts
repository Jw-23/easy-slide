import type { Block, Deck, Slide } from "./dsl";
export type Element = {
  kind: "text" | "rect" | "image" | "equation";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  src?: string;
  size?: number;
  color?: string;
  bold?: boolean;
  fill?: string;
  radius?: number;
  step: number;
  mono?: boolean;
  opacity?: number;
};
export function scene(deck: Deck, s: Slide, index: number): Element[] {
  const accent = deck.theme?.accent || "#16766d",
    fg = s.color || deck.theme?.color || "#192c2a";
  const dark =
    parseInt(
      (s.background || deck.theme?.background || "#fafbf9").slice(1),
      16,
    ) < 0x444444;
  const muted = dark ? "#b6c1c1" : "#71817e",
    panel = dark ? "#263633" : "#eef2ef";
  const e: Element[] = [];
  const text = (
    t: string,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    c = fg,
    bold = false,
    step = 0,
    mono = false,
  ) =>
    e.push({
      kind: "text",
      text: t,
      x,
      y,
      w,
      h,
      size,
      color: c,
      bold,
      step,
      mono,
    });
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill = panel,
    radius = 22,
    step = 0,
  ) => e.push({ kind: "rect", x, y, w, h, fill, radius, step });
  text(s.eyebrow || "EASY SLIDE", 72, 48, 1100, 24, 14, accent, true);
  const cover = ["cover", "section"].includes(s.layout);
  if (cover) {
    rect(72, 119, 44, 4, accent, 2);
    text(
      s.title,
      72,
      155,
      s.layout === "cover" ? 760 : 1136,
      250,
      68,
      fg,
      true,
    );
    if (s.subtitle) text(s.subtitle, 76, 430, 1000, 70, 25, muted);
  } else {
    text(s.title, 72, 104, 1136, 80, 42, fg, true);
    if (s.subtitle) text(s.subtitle, 74, 183, 1130, 45, 19, muted);
  }
  text(deck.author || deck.title, 72, 664, 1000, 20, 12, muted);
  text(String(index + 1).padStart(2, "0"), 1160, 662, 50, 22, 14, accent, true);
  function block(
    b: Block,
    x: number,
    y: number,
    w: number,
    h: number,
    card: boolean,
  ) {
    x = b.x ?? x;
    y = b.y ?? y;
    w = b.w ?? w;
    h = b.h ?? h;
    const step = b.step || 0,
      c = b.color || fg;
    if (card) {
      rect(x, y, w, h, panel, 24, step);
      x += 30;
      y += 28;
      w -= 60;
      h -= 56;
    }
    if (b.background) rect(x, y, w, h, b.background, 12, step);
    if (b.padding) {
      x += b.padding;
      y += b.padding;
      w = Math.max(0, w - 2 * b.padding);
      h = Math.max(0, h - 2 * b.padding);
    }
    if (b.title) {
      text(b.title, x, y, w, 44, 23, c, true, step);
      y += 54;
      h -= 54;
    }
    if (b.type === "spacer") return;
    if (["hstack", "vstack", "zstack", "grid"].includes(b.type)) {
      const children = b.children || [],
        gap = b.gap ?? 24;
      const child = (
        c: Block,
        cx: number,
        cy: number,
        cw: number,
        ch: number,
      ) =>
        block(
          {
            ...c,
            color: c.color || b.color,
            size: c.size ?? b.size,
            step: Math.max(c.step || 0, step),
          },
          cx,
          cy,
          Math.max(0, cw),
          Math.max(0, ch),
          false,
        );
      if (b.type === "zstack") children.forEach((c) => child(c, x, y, w, h));
      else if (b.type === "grid") {
        const cols = b.columns || 2,
          rows = Math.ceil(children.length / cols) || 1,
          cw = (w - gap * (cols - 1)) / cols,
          ch = (h - gap * (rows - 1)) / rows;
        children.forEach((c, i) =>
          child(
            c,
            x + (i % cols) * (cw + gap),
            y + Math.floor(i / cols) * (ch + gap),
            cw,
            ch,
          ),
        );
      } else {
        const row = b.type === "hstack",
          axis = row ? "w" : "h",
          fixed = children.reduce((sum, c) => sum + (c[axis] ?? 0), 0),
          flex = children.filter((c) => c[axis] === undefined).length;
        const each = Math.max(
          0,
          ((row ? w : h) - gap * Math.max(0, children.length - 1) - fixed) /
            Math.max(1, flex),
        );
        let cursor = row ? x : y;
        children.forEach((c) => {
          const length = c[axis] ?? each;
          child(
            c,
            row ? cursor : x,
            row ? y : cursor,
            row ? length : w,
            row ? h : length,
          );
          cursor += length + gap;
        });
      }
      return;
    }
    if (b.type === "equation") {
      e.push({
        kind: "equation",
        text: b.text || "",
        x,
        y,
        w,
        h,
        color: c,
        step,
      });
    } else if (b.type === "image") {
      e.push({ kind: "image", src: b.src, x, y, w, h, step });
    } else if (b.type === "metric") {
      text(b.value || "", x, y, w, 100, b.size || 66, accent, true, step);
      if (b.label) text(b.label, x, y + 110, w, 50, 22, c, true, step);
      if (b.text)
        text(
          b.text,
          x,
          y + (b.label ? 174 : 120),
          w,
          100,
          19,
          muted,
          false,
          step,
        );
    } else if (b.type === "bullets") {
      const items = b.items || [];
      const gap = Math.min(74, h / Math.max(items.length, 1));
      items.forEach((item, i) => {
        rect(x, y + i * gap + 11, 6, 6, accent, 3, step);
        text(
          item,
          x + 23,
          y + i * gap,
          w - 23,
          gap - 5,
          b.size || 23,
          c,
          false,
          step,
        );
      });
    } else if (b.type === "table") {
      const rows = b.rows || [];
      const cols = Math.max(1, ...rows.map((r) => r.length)),
        rh = Math.min(64, h / Math.max(rows.length, 1));
      rows.forEach((r, i) => {
        rect(x, y + i * rh, w, rh - 2, i === 0 ? accent : panel, 4, step);
        r.forEach((v, j) =>
          text(
            v,
            x + 16 + (j * w) / cols,
            y + i * rh + 12,
            w / cols - 28,
            rh - 16,
            b.size || 18,
            i === 0 ? "#ffffff" : c,
            i === 0,
            step,
          ),
        );
      });
    } else if (b.type === "quote") {
      rect(x, y, 4, h, accent, 2, step);
      text(
        "“" + (b.text || "") + "”",
        x + 28,
        y,
        w - 28,
        h,
        b.size || 32,
        c,
        false,
        step,
      );
    } else if (b.type === "code") {
      rect(x, y, w, h, dark ? "#142320" : "#e5ebe8", 12, step);
      text(
        b.text || "",
        x + 24,
        y + 24,
        w - 48,
        h - 48,
        b.size || 19,
        c,
        false,
        step,
        true,
      );
    } else text(b.text || "", x, y, w, h, b.size || 24, c, false, step);
  }
  const bs = s.blocks,
    n = bs.length;
  if (cover) {
    bs.forEach((b, i) =>
      block(
        b,
        b.type === "equation" ? 760 : 76,
        b.type === "equation" ? 250 : 548,
        b.type === "equation" ? 430 : 1050,
        b.type === "equation" ? 155 : 70,
        false,
      ),
    );
  } else if (
    s.layout === "split" ||
    s.layout === "compare" ||
    s.layout === "image"
  ) {
    bs.forEach((b, i) => {
      const row = Math.floor(i / 2),
        rows = Math.ceil(n / 2),
        h = 370 / rows - 16;
      block(
        b,
        72 + (i % 2) * 580,
        252 + row * (h + 16),
        556,
        h,
        s.layout === "compare",
      );
    });
  } else if (s.layout === "grid" || s.layout === "timeline") {
    const cols = Math.min(n, 3) || 1,
      rows = Math.ceil(n / cols),
      w = (1136 - (cols - 1) * 20) / cols,
      h = (370 - (rows - 1) * 20) / Math.max(rows, 1);
    bs.forEach((b, i) =>
      block(
        b,
        72 + (i % cols) * (w + 20),
        252 + Math.floor(i / cols) * (h + 20),
        w,
        h,
        true,
      ),
    );
  } else {
    const h = 370 / Math.max(n, 1);
    bs.forEach((b, i) => block(b, 74, 250 + i * h, 1132, h - 16, false));
  }
  return e;
}
