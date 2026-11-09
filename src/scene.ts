import { contentHeight, mathMetrics, textHeight } from "./content-measure";
import { mathHeading, proofEnds } from "./math-environments";
import { parseRichText, type RichDocument } from "./rich-text";
import type { SceneTarget } from "./studio/source-map";
import { resolveTheme, headerText } from "./themes";
import { tableModel } from "./table";
import { backdropData } from "./materials";
import { pageLayout, type positionAnchors } from "./dsl";
import type { Block, Deck, Slide, Motion, GlassStyle } from "./dsl";
export const TEXT_LINE_HEIGHT = 1.42;
type Bounds = { x: number; y: number; w: number; h: number };
function anchorPoint(
  anchor: (typeof positionAnchors)[number],
): [number, number] {
  return [
    anchor === "left" || anchor.endsWith("Left")
      ? 0
      : anchor === "right" || anchor.endsWith("Right")
        ? 1
        : 0.5,
    anchor === "top" || anchor.startsWith("top")
      ? 0
      : anchor === "bottom" || anchor.startsWith("bottom")
        ? 1
        : 0.5,
  ];
}
export type Element = {
  source?: SceneTarget;
  kind: "text" | "rect" | "image" | "equation";
  shape?: "ellipse";
  glass?: GlassStyle;
  data?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  rich?: RichDocument;
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
  const slideBounds: Bounds = { x: 0, y: 0, w: 1280, h: 720 },
    contentBounds: Bounds = { x: 74, y: 250, w: 1132, h: 370 };
  let pendingTransform = { scale: 1, x: 0, y: 0 };
  const layoutPath = [0];
  let pageRoot = s.blocks[0];
  while (pageRoot?.type === "component" && pageRoot.children?.length === 1) {
    layoutPath.push(0);
    pageRoot = pageRoot.children[0];
  }
  const intrinsic = (b: Block): number | undefined =>
    b.h ??
    (b.type === "math"
      ? contentHeight(b, 1132, theme.font, 22)
      : b.type === "divider"
        ? Math.max(16, (b.thickness ?? 2) + 12)
        : b.type === "heading"
          ? (b.size ?? [44, 32, 26, 21][(b.level ?? 2) - 1]) *
              TEXT_LINE_HEIGHT +
            8
          : b.type === "caption"
            ? 36
            : b.type === "badge"
              ? 42
              : b.type === "progress"
                ? b.label || b.showValue !== false
                  ? 76
                  : 36
                : undefined);

  let activeMotion: Motion | undefined,
    activeKey: string | undefined,
    counter = 0;
  let activeSource: SceneTarget = { scope: "slide", page: index };
  const atSource = (source: SceneTarget, render: () => void) => {
    const previous = activeSource;
    activeSource = source;
    render();
    activeSource = previous;
  };
  const push = (el: Element) =>
    e.push({
      ...el,
      source: activeSource,
      appear: activeMotion,
      motionKey: activeKey,
    });
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
  ) => {
    const rich = !mono ? parseRichText(t) : undefined;
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
      ...(rich?.formatted ? { rich } : {}),
    });
  };
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
    atSource(
      s.background
        ? { scope: "slide", page: index, field: "background" }
        : deck.theme
          ? { scope: "theme", page: index }
          : { scope: "slide", page: index },
      () =>
        push({
          kind: "image",
          data: backdropData(deck, s),
          x: 0,
          y: 0,
          w: 1280,
          h: 720,
          step: 0,
        }),
    );
  if (s.eyebrow)
    atSource({ scope: "slide", page: index, field: "eyebrow" }, () =>
      text(s.eyebrow!, 72, 48, 1100, 24, 13, accent, true),
    );
  const preset = pageLayout(s);
  const cover = ["cover", "section"].includes(preset);
  if (cover) {
    rect(72, 119, 44, 4, accent, 2);
    atSource({ scope: "slide", page: index, field: "title" }, () =>
      text(
        s.title,
        72,
        155,
        preset === "cover" ? 760 : 1136,
        250,
        68,
        fg,
        true,
      ),
    );
    if (s.subtitle)
      atSource({ scope: "slide", page: index, field: "subtitle" }, () =>
        text(s.subtitle!, 76, 430, 1000, 70, 25, muted),
      );
  } else {
    atSource({ scope: "slide", page: index, field: "title" }, () =>
      text(s.title, 72, 104, 1136, 80, 42, fg, true),
    );
    if (s.subtitle)
      atSource({ scope: "slide", page: index, field: "subtitle" }, () =>
        text(s.subtitle!, 74, 183, 1130, 45, 19, muted),
      );
  }
  atSource(
    { scope: "deck", page: index, field: deck.author ? "author" : "title" },
    () => text(deck.author || deck.title, 72, 664, 1000, 20, 12, muted),
  );
  text(String(index + 1).padStart(2, "0"), 1160, 662, 50, 22, 14, accent, true);
  function block(
    b: Block,
    x: number,
    y: number,
    w: number,
    h: number,
    card: boolean,
    path: number[],
    parent: Bounds = contentBounds,
  ) {
    const previousSource = activeSource;
    activeSource = { scope: "block", page: index, path };
    const previousMotion = activeMotion,
      previousKey = activeKey;
    if (b.appear) {
      activeMotion = b.appear;
      activeKey = "motion-" + counter++;
    } else if (!activeKey && ((b.step || 0) > 0 || b.stagger !== undefined)) {
      activeMotion = { effect: "rise", duration: 450 };
      activeKey = "motion-" + counter++;
    }
    w = b.w ?? w;
    h = b.h ?? h;
    let anchor: [number, number] = [0.5, 0.5];
    if (b.position) {
      const pos = b.position,
        reference = pos.relativeTo === "slide" ? slideBounds : parent,
        ref = anchorPoint(pos.reference || "bottomLeft");
      anchor = anchorPoint(pos.anchor || pos.reference || "bottomLeft");
      let targetX = reference.x + reference.w * ref[0] + (pos.x ?? 0),
        targetY = reference.y + reference.h * ref[1] - (pos.y ?? 0);
      if (pos.relativeTo === "slide") {
        targetX = (targetX - pendingTransform.x) / pendingTransform.scale;
        targetY = (targetY - pendingTransform.y) / pendingTransform.scale;
      }
      x = targetX - w * anchor[0];
      y = targetY - h * anchor[1];
    }
    const first = e.length,
      scale = b.scale ?? 1,
      pivotX = x + w * anchor[0],
      pivotY = y + h * anchor[1];
    const previousTransform = pendingTransform;
    pendingTransform = {
      scale: previousTransform.scale * scale,
      x: previousTransform.x + previousTransform.scale * pivotX * (1 - scale),
      y: previousTransform.y + previousTransform.scale * pivotY * (1 - scale),
    };
    renderBlock(b, x, y, w, h, card);
    pendingTransform = previousTransform;
    if (scale !== 1)
      for (let i = first; i < e.length; i++) {
        const item = e[i],
          glassRadius = item.glass?.radius ?? item.radius ?? 28;
        item.x = pivotX + (item.x - pivotX) * scale;
        item.y = pivotY + (item.y - pivotY) * scale;
        item.w *= scale;
        item.h *= scale;
        if (item.size !== undefined) item.size *= scale;
        if (item.radius !== undefined) item.radius *= scale;
        if (item.glass)
          item.glass = {
            ...item.glass,
            blur: (item.glass.blur ?? 24) * scale,
            radius: glassRadius * scale,
          };
      }
    activeMotion = previousMotion;
    activeKey = previousKey;
    activeSource = previousSource;
  }
  function renderBlock(
    b: Block,
    x: number,
    y: number,
    w: number,
    h: number,
    card: boolean,
  ) {
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
    if (b.type === "panel" && !b.glass)
      rect(x, y, w, h, b.fill || panel, b.radius ?? theme.radius, step);
    const padding =
      (b.type === "math" ? 0 : b.padding) ??
      (b.type === "panel" ? 24 : b.type === "glass" && !card ? 28 : 0);
    if (padding) {
      x += padding;
      y += padding;
      w = Math.max(0, w - 2 * padding);
      h = Math.max(0, h - 2 * padding);
    }
    if (b.title && b.type !== "math") {
      text(b.title, x, y, w, 44, 23, c, true, step);
      y += 54;
      h -= 54;
    }
    if (b.type === "math") {
      const m = mathMetrics(b, w, theme.font, b.size ?? 22),
        children = b.children || [],
        gap = b.gap ?? 18,
        plain = [
          "Proof",
          "Solution",
          "Derivation",
          "Reasoning",
          "ProofStep",
        ].includes(b.environment || "");
      if (!b.glass && (!plain || b.fill))
        rect(x, y, w, h, b.fill || panel, b.radius ?? 14, step);
      rect(x, y, plain ? 2 : 4, h, accent, 1, step);
      const innerX = x + m.pad + 4,
        innerY = y + m.pad + m.heading + 12;
      text(
        mathHeading(b),
        innerX,
        y + m.pad,
        m.inner,
        m.heading,
        m.size,
        c,
        true,
        step,
      );
      let cursor = innerY;
      if (b.text) {
        text(
          b.text,
          innerX,
          cursor,
          m.inner,
          m.body - 12,
          m.size,
          c,
          false,
          step,
        );
        cursor += m.body;
      }
      children.forEach((child, i) => {
        const ch = contentHeight(child, m.inner, theme.font, m.size);
        block(
          {
            ...child,
            size: child.size ?? m.size,
            color: child.color || b.color,
            step: Math.max(step, child.step || 0),
            ...(b.stagger !== undefined
              ? {
                  appear: {
                    ...(child.appear ||
                      activeMotion || { effect: "rise" as const }),
                    delay:
                      (child.appear?.delay ?? activeMotion?.delay ?? 0) +
                      i * b.stagger,
                  },
                }
              : {}),
          },
          innerX,
          cursor,
          m.inner,
          ch,
          false,
          [...(activeSource.scope === "block" ? activeSource.path : []), i],
          {
            x: innerX,
            y: innerY,
            w: m.inner,
            h: Math.max(0, h - m.pad - (innerY - y) - m.reason - m.footer),
          },
        );
        cursor += ch + (i < children.length - 1 ? gap : 0);
      });
      if (b.reason) {
        cursor += 10;
        text(
          "依据：" + b.reason,
          innerX,
          cursor,
          m.inner,
          m.reason - 10,
          Math.max(15, m.size - 4),
          muted,
          false,
          step,
        );
        cursor += m.reason - 10;
      }
      if (proofEnds(b)) {
        const lastStep = (nodes: Block[]): number =>
          Math.max(
            step,
            ...nodes.map((n) =>
              Math.max(n.step || 0, lastStep(n.children || [])),
            ),
          );
        const closingStep = lastStep(children),
          previousMotion = activeMotion,
          previousKey = activeKey;
        activeMotion = {
          effect: "fade",
          duration: 180,
          order:
            1 +
            Math.max(
              -1,
              ...e
                .filter((el) => el.step === closingStep && el.motionKey)
                .map((el) => el.appear?.order ?? 0),
            ),
        };
        activeKey = "motion-qed-" + counter++;
        text(
          "∎",
          innerX,
          cursor + 6,
          m.inner,
          24,
          20,
          accent,
          true,
          closingStep,
        );
        e[e.length - 1].align = "right";
        activeMotion = previousMotion;
        activeKey = previousKey;
      }
      return;
    }
    if (b.type === "pageBreak" || b.type === "columnBreak") return;
    if (b.type === "spacer") return;
    if (b.type === "heading" || b.type === "caption") {
      text(
        b.text || "",
        x,
        y,
        w,
        h,
        b.size ??
          (b.type === "heading" ? [44, 32, 26, 21][(b.level ?? 2) - 1] : 16),
        b.color || (b.type === "caption" ? muted : fg),
        b.type === "heading",
        step,
      );
      return;
    }
    if (b.type === "rectangle" || b.type === "circle") {
      if (b.type === "circle") {
        const d = Math.min(w, h);
        push({
          kind: "rect",
          shape: "ellipse",
          x: x + (w - d) / 2,
          y: y + (h - d) / 2,
          w: d,
          h: d,
          fill: b.fill || b.color || accent,
          radius: d / 2,
          step,
        });
      } else rect(x, y, w, h, b.fill || b.color || accent, b.radius ?? 0, step);
      return;
    }
    if (b.type === "divider") {
      const t = Math.min(
        b.thickness ?? 2,
        b.orientation === "vertical" ? w : h,
      );
      if (b.orientation === "vertical")
        rect(x + (w - t) / 2, y, t, h, b.color || theme.border, 0, step);
      else rect(x, y + (h - t) / 2, w, t, b.color || theme.border, 0, step);
      return;
    }
    if (b.type === "badge") {
      const size = b.size ?? 18,
        bw =
          b.w ??
          Math.min(
            w,
            Math.max(
              60,
              Array.from(b.text || "").reduce(
                (n, c) => n + (/[\u0000-\u00ff]/.test(c) ? size * 0.6 : size),
                0,
              ) + 28,
            ),
          ),
        bh = Math.min(h, 42);
      rect(x, y, bw, bh, b.fill || panel, b.radius ?? bh / 2, step);
      text(
        b.text || "",
        x + 10,
        y + Math.max(0, (bh - size * TEXT_LINE_HEIGHT) / 2),
        Math.max(0, bw - 20),
        bh,
        size,
        b.color || accent,
        true,
        step,
      );
      e[e.length - 1].align = "center";
      return;
    }
    if (b.type === "progress") {
      const size = b.size ?? 18,
        label = b.label || "",
        show = b.showValue !== false,
        offset = label || show ? 36 : Math.max(0, (h - 12) / 2),
        barY = y + Math.min(offset, Math.max(0, h - 12)),
        bh = Math.min(12, h);
      if (label)
        text(label, x, y, w - (show ? 75 : 0), 30, size, c, true, step);
      if (show) {
        text(
          `${Math.round((b.progress ?? 0) * 100)}%`,
          x + Math.max(0, w - 70),
          y,
          70,
          30,
          size,
          accent,
          true,
          step,
        );
        e[e.length - 1].align = "right";
      }
      rect(x, barY, w, bh, panel, bh / 2, step);
      rect(x, barY, w * (b.progress ?? 0), bh, b.fill || accent, bh / 2, step);
      return;
    }

    if (b.type === "layout") {
      renderLayout(
        b.preset || "content",
        b.children || [],
        x,
        y,
        w,
        h,
        activeSource.scope === "block" &&
          activeSource.path.join(".") === layoutPath.join(".") &&
          s.blocks.length === 1,
        b,
      );
      return;
    }
    if (
      [
        "hstack",
        "vstack",
        "zstack",
        "grid",
        "glass",
        "component",
        "panel",
        "columns",
        "rows",
        "columnFlow",
      ].includes(b.type)
    ) {
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
          [
            ...(activeSource.scope === "block" ? activeSource.path : []),
            children.indexOf(c),
          ],
          { x, y, w, h },
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
        const row = b.type === "hstack" || b.type === "columns",
          lengthOf = (c: Block) => (row ? c.w : intrinsic(c)),
          fixed = children.reduce((sum, c) => sum + (lengthOf(c) ?? 0), 0),
          flex = children.reduce(
            (sum, c, i) =>
              sum + (lengthOf(c) === undefined ? (b.weights?.[i] ?? 1) : 0),
            0,
          );
        const each = Math.max(
          0,
          ((row ? w : h) - gap * Math.max(0, children.length - 1) - fixed) /
            Math.max(1, flex),
        );
        let cursor = row ? x : y;
        children.forEach((c, i) => {
          const length = lengthOf(c) ?? each * (b.weights?.[i] ?? 1);
          child(
            c,
            row
              ? cursor
              : x +
                  (b.alignment === "center"
                    ? Math.max(0, w - (c.w ?? w)) / 2
                    : b.alignment === "trailing"
                      ? Math.max(0, w - (c.w ?? w))
                      : 0),
            row
              ? y +
                  (b.alignment === "center"
                    ? Math.max(0, h - (c.h ?? h)) / 2
                    : b.alignment === "bottom"
                      ? Math.max(0, h - (c.h ?? h))
                      : 0)
              : cursor,
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
    } else if (b.type === "bullets" || b.type === "numbered") {
      const items = b.items || [];
      const gap = Math.min(74, h / Math.max(items.length, 1)),
        markerWidth =
          b.type === "numbered"
            ? Math.max(
                36,
                String(items.length).length * (b.size || 23) * 0.65 + 14,
              )
            : 23;
      let itemY = y;
      items.forEach((item, i) => {
        const rowHeight = b.measured
          ? textHeight(item, Math.max(1, w - 40), b.size || 23, theme.font) + 10
          : gap;
        const oldMotion = activeMotion,
          oldKey = activeKey;
        if (b.stagger !== undefined) {
          activeMotion = {
            ...(activeMotion || { effect: "rise" }),
            delay: (activeMotion?.delay ?? 0) + i * b.stagger,
          };
          activeKey = oldKey + "-item-" + i;
        }
        if (b.type === "numbered")
          text(
            `${i + (b.start ?? 1)}.`,
            x,
            itemY,
            markerWidth - 6,
            Math.max(0, rowHeight - 5),
            b.size || 23,
            accent,
            true,
            step,
          );
        else rect(x, itemY + 11, 6, 6, accent, 3, step);
        text(
          item,
          x + markerWidth,
          itemY,
          Math.max(0, w - markerWidth),
          Math.max(0, rowHeight - 5),
          b.size || 23,
          c,
          false,
          step,
        );
        itemY += rowHeight;
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
        [...(activeSource.scope === "block" ? activeSource.path : []), i],
        { x, y, w, h },
      );
    }
    if (preset === "center") {
      const heights = bs.map(
          (b) =>
            intrinsic(b) ??
            Math.min(100, (h - gap * Math.max(0, n - 1)) / Math.max(1, n)),
        ),
        total = heights.reduce((a, b) => a + b, 0) + gap * Math.max(0, n - 1);
      let cy = y + Math.max(0, (h - total) / 2);
      bs.forEach((b, i) => {
        const bw = Math.min(w, b.w ?? 900),
          bh = Math.min(heights[i], Math.max(0, y + h - cy));
        place(b, i, x + (w - bw) / 2, cy, bw, bh);
        cy += heights[i] + gap;
      });
    } else if (
      preset === "sidebar" ||
      preset === "headerBody" ||
      preset === "focus"
    ) {
      const vertical = preset === "headerBody",
        available = (vertical ? h : w) - gap,
        lead =
          available *
          (preset === "focus" ? 0.68 : preset === "sidebar" ? 0.3 : 0.25);
      if (bs[0])
        place(
          bs[0],
          0,
          x,
          y,
          vertical ? w : lead,
          vertical ? lead : h,
          preset === "focus",
        );
      const rest = bs.slice(1),
        rh =
          (vertical ? h - lead - gap : h) - gap * Math.max(0, rest.length - 1);
      rest.forEach((b, i) =>
        place(
          b,
          i + 1,
          vertical ? x : x + lead + gap,
          (vertical ? y + lead + gap : y) +
            i * (rh / Math.max(1, rest.length) + gap),
          vertical ? w : w - lead - gap,
          rh / Math.max(1, rest.length),
          preset === "focus",
        ),
      );
    } else if (preset === "threeColumns") {
      const rows = Math.ceil(n / 3) || 1,
        cw = (w - 2 * gap) / 3,
        ch = (h - (rows - 1) * gap) / rows;
      bs.forEach((b, i) =>
        place(
          b,
          i,
          x + (i % 3) * (cw + gap),
          y + Math.floor(i / 3) * (ch + gap),
          cw,
          ch,
        ),
      );
    } else if (root && ["cover", "section"].includes(preset)) {
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
      const fixed = bs.reduce((sum, b) => sum + (intrinsic(b) ?? 0), 0),
        flex = bs.filter((b) => intrinsic(b) === undefined).length,
        ch = Math.max(
          0,
          (h - gap * Math.max(0, n - 1) - fixed) / Math.max(1, flex),
        );
      let cy = y;
      bs.forEach((b, i) => {
        const bh = intrinsic(b) ?? ch;
        place(b, i, x, cy, w, bh);
        cy += bh + gap;
      });
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
        [i],
      ),
    );
  return e;
}
