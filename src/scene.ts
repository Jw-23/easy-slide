import { resolveTheme, headerText } from "./themes";
import { tableModel } from "./table";
import { backdropData } from "./materials";
import { pageLayout } from "./dsl";
import type { Block, Deck, Slide, Motion, GlassStyle } from "./dsl";
export const TEXT_LINE_HEIGHT = 1.42;
export type Element = {
  kind: "text" | "rect" | "image" | "equation";
  glass?: GlassStyle;
  data?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  src?: string;
  size?: number;
  color?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  fill?: string;
  radius?: number;
  step: number;
  mono?: boolean;
  opacity?: number;
  appear?: Motion;
  motionKey?: string;
};
export function scene(deck: Deck, s: Slide, index: number): Element[] {
  const theme = resolveTheme(deck.theme, s.background),
    { accent, muted, panel } = theme,
    fg = s.color || theme.color;
  const e: Element[] = [];
  let activeMotion: Motion | undefined,
    activeKey: string | undefined,
    counter = 0;
  const push = (el: Element) =>
    e.push({ ...el, appear: activeMotion, motionKey: activeKey });
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
    push({
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
  ) => push({ kind: "rect", x, y, w, h, fill, radius, step });
  const glassBlocks = (bs: Block[]): boolean =>
    bs.some(
      (b) => b.glass || b.type === "glass" || glassBlocks(b.children || []),
    );
  if (theme.material === "glass" || glassBlocks(s.blocks))
    push({
      kind: "image",
      data: backdropData(deck, s),
      x: 0,
      y: 0,
      w: 1280,
      h: 720,
      step: 0,
    });
  if (s.eyebrow) text(s.eyebrow, 72, 48, 1100, 24, 13, accent, true);
  const preset = pageLayout(s);
  const cover = ["cover", "section"].includes(preset);
  if (cover) {
    rect(72, 119, 44, 4, accent, 2);
    text(s.title, 72, 155, preset === "cover" ? 760 : 1136, 250, 68, fg, true);
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
    const previousMotion = activeMotion,
      previousKey = activeKey;
    if (b.appear) {
      activeMotion = b.appear;
      activeKey = "motion-" + counter++;
    } else if (!activeKey && ((b.step || 0) > 0 || b.stagger !== undefined)) {
      activeMotion = { effect: "rise", duration: 450 };
      activeKey = "motion-" + counter++;
    }
    renderBlock(b, x, y, w, h, card);
    activeMotion = previousMotion;
    activeKey = previousKey;
  }
  function renderBlock(
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
      if (theme.material === "glass" || b.glass)
        push({
          kind: "rect",
          x,
          y,
          w,
          h,
          fill: theme.surface,
          radius: b.glass?.radius ?? theme.radius,
          glass: b.glass || {},
          step,
        });
      else rect(x, y, w, h, panel, theme.radius, step);
      x += 30;
      y += 28;
      w -= 60;
      h -= 56;
    }
    if (!card && b.glass)
      push({
        kind: "rect",
        x,
        y,
        w,
        h,
        fill: theme.surface,
        radius: b.glass.radius ?? theme.radius,
        glass: b.glass,
        step,
      });
    if (b.background) rect(x, y, w, h, b.background, 12, step);
    const padding = b.padding ?? (b.type === "glass" && !card ? 28 : 0);
    if (padding) {
      x += padding;
      y += padding;
      w = Math.max(0, w - 2 * padding);
      h = Math.max(0, h - 2 * padding);
    }
    if (b.title) {
      text(b.title, x, y, w, 44, 23, c, true, step);
      y += 54;
      h -= 54;
    }
    if (b.type === "spacer") return;
    if (b.type === "layout") {
      renderLayout(
        b.preset || "content",
        b.children || [],
        x,
        y,
        w,
        h,
        b === s.blocks[0] && s.blocks.length === 1,
        b,
      );
      return;
    }
    if (["hstack", "vstack", "zstack", "grid", "glass"].includes(b.type)) {
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
            appear:
              b.stagger === undefined
                ? c.appear
                : {
                    ...(c.appear || activeMotion || { effect: "rise" }),
                    delay:
                      (c.appear?.delay ?? activeMotion?.delay ?? 0) +
                      children.indexOf(c) * b.stagger,
                  },
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
      push({
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
      push({ kind: "image", src: b.src, x, y, w, h, step });
    } else if (b.type === "metric") {
      text(
        b.value || "",
        x,
        y,
        w,
        100,
        Math.min(b.size || 66, w / Math.max(1, (b.value || "").length * 0.6)),
        accent,
        true,
        step,
      );
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
        const oldMotion = activeMotion,
          oldKey = activeKey;
        if (b.stagger !== undefined) {
          activeMotion = {
            ...(activeMotion || { effect: "rise" }),
            delay: (activeMotion?.delay ?? 0) + i * b.stagger,
          };
          activeKey = oldKey + "-item-" + i;
        }
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
        activeMotion = oldMotion;
        activeKey = oldKey;
      });
    } else if (b.type === "table") {
      const opts = b.table || {},
        model = tableModel(b.rows || [], opts),
        rh = Math.min(opts.rowHeight ?? 56, h / Math.max(model.rows.length, 1)),
        border = opts.borders ?? "horizontal";
      model.rows.forEach((row, i) => {
        const oldMotion = activeMotion,
          oldKey = activeKey;
        if (b.stagger !== undefined) {
          activeMotion = {
            ...(activeMotion || { effect: "rise" }),
            delay: (activeMotion?.delay ?? 0) + i * b.stagger,
          };
          activeKey = oldKey + "-row-" + i;
        }
        const fill = row.header
          ? opts.headerFill || accent
          : opts.zebra !== false && i % 2 === 0
            ? opts.stripeColor || panel
            : theme.surface;
        rect(x, y + i * rh, w, rh, fill, i === 0 ? 6 : 0, step);
        let cx = x;
        row.cells.forEach((value, j) => {
          const cw = w * model.widths[j],
            pad = Math.min(opts.cellPadding ?? 12, cw / 4),
            vpad = Math.min(8, rh * 0.15);
          text(
            value,
            cx + pad,
            y + i * rh + vpad,
            Math.max(0, cw - pad * 2),
            Math.max(0, rh - vpad * 2),
            Math.min(b.size || 18, rh * 0.48),
            row.header
              ? opts.headerColor || headerText(opts.headerFill || accent)
              : c,
            row.header,
            step,
          );
          e[e.length - 1].align = model.columns[j].align || "left";
          if (border === "all" && j > 0)
            rect(
              cx,
              y + i * rh,
              1,
              rh,
              opts.borderColor || theme.border,
              0,
              step,
            );
          cx += cw;
        });
        if (border !== "none")
          rect(
            x,
            y + (i + 1) * rh - 1,
            w,
            1,
            opts.borderColor || theme.border,
            0,
            step,
          );
        if (border === "all") {
          rect(x, y + i * rh, 1, rh, opts.borderColor || theme.border, 0, step);
          rect(
            x + w - 1,
            y + i * rh,
            1,
            rh,
            opts.borderColor || theme.border,
            0,
            step,
          );
          if (i === 0)
            rect(x, y, w, 1, opts.borderColor || theme.border, 0, step);
        }
        activeMotion = oldMotion;
        activeKey = oldKey;
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
      rect(x, y, w, h, theme.code, 12, step);
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
  function renderLayout(
    preset: import("./dsl").Layout,
    bs: Block[],
    x: number,
    y: number,
    w: number,
    h: number,
    root = false,
    owner?: Block,
  ) {
    const n = bs.length,
      gap = owner?.gap ?? 24;
    function place(
      b: Block,
      i: number,
      bx: number,
      by: number,
      bw: number,
      bh: number,
      card = false,
    ) {
      block(
        {
          ...b,
          color: b.color || owner?.color,
          size: b.size ?? owner?.size,
          step: Math.max(b.step || 0, owner?.step || 0),
          appear:
            owner?.stagger === undefined
              ? b.appear
              : {
                  ...(b.appear || activeMotion || { effect: "rise" }),
                  delay:
                    (b.appear?.delay ?? activeMotion?.delay ?? 0) +
                    i * owner.stagger,
                },
        },
        bx,
        by,
        Math.max(0, bw),
        Math.max(0, bh),
        card,
      );
    }
    if (root && ["cover", "section"].includes(preset)) {
      bs.forEach((b, i) =>
        place(
          b,
          i,
          b.type === "equation" ? 760 : 76,
          b.type === "equation" ? 250 : 548,
          b.type === "equation" ? 430 : 1050,
          b.type === "equation" ? 155 : 70,
        ),
      );
    } else if (["split", "compare", "image"].includes(preset)) {
      const rows = Math.ceil(n / 2) || 1,
        cw = (w - gap) / 2,
        ch = (h - gap * (rows - 1)) / rows;
      bs.forEach((b, i) =>
        place(
          b,
          i,
          x + (i % 2) * (cw + gap),
          y + Math.floor(i / 2) * (ch + gap),
          cw,
          ch,
          preset === "compare",
        ),
      );
    } else if (preset === "grid" || preset === "timeline") {
      const cols = owner?.columns || Math.min(n, 3) || 1,
        rows = Math.ceil(n / cols) || 1,
        cw = (w - gap * (cols - 1)) / cols,
        ch = (h - gap * (rows - 1)) / rows;
      bs.forEach((b, i) =>
        place(
          b,
          i,
          x + (i % cols) * (cw + gap),
          y + Math.floor(i / cols) * (ch + gap),
          cw,
          ch,
          true,
        ),
      );
    } else {
      const ch = (h - gap * Math.max(0, n - 1)) / Math.max(n, 1);
      bs.forEach((b, i) => place(b, i, x, y + i * (ch + gap), w, ch));
    }
  }
  if (s.layout) renderLayout(s.layout, s.blocks, 74, 250, 1132, 370, true);
  else
    s.blocks.forEach((b, i) =>
      block(
        b,
        74,
        250 + (i * 370) / Math.max(1, s.blocks.length),
        1132,
        370 / Math.max(1, s.blocks.length),
        false,
      ),
    );
  return e;
}
