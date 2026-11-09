import type { Block, Slide } from "./dsl";
import {
  contentHeight,
  mathMetrics,
  splitText,
  measureBlock,
} from "./content-measure";
import { mathHeading } from "./math-environments";
export type PaginationOptions = {
  columns?: number;
  spacing?: number;
  fontSize?: number;
  maxPages?: number;
};
export type DynamicInfo = {
  sourceIndex: number;
  source: string;
  part: number;
  total: number;
  title: string;
  columns: number;
  independentColumns: boolean;
};
export function needsPagination(blocks: Block[]): boolean {
  return blocks.some(
    (b) =>
      ["math", "pageBreak", "columnBreak", "columnFlow"].includes(b.type) ||
      needsPagination(b.children || []),
  );
}
export function markSource(blocks: Block[], path: number[] = []): Block[] {
  return blocks.map((b, i) =>
    b.flowGenerated || b.sourcePath
      ? b
      : {
          ...b,
          sourcePath: [...path, i],
          ...(b.children
            ? { children: markSource(b.children, [...path, i]) }
            : {}),
        },
  );
}
function assertFlow(blocks: Block[]) {
  for (const b of blocks) {
    if (b.position || b.scale !== undefined)
      throw Error(
        "自动续页环境不能混用 position / scale；请使用布局容器，或在 Slide 中设置 autoPages: false 手动排版",
      );
    if (b.children) assertFlow(b.children);
  }
}
function hasBreak(b: Block): boolean {
  return (b.children || []).some(
    (c) => c.type === "pageBreak" || c.type === "columnBreak" || hasBreak(c),
  );
}
function splitBlock(
  b: Block,
  w: number,
  max: number,
  font: string,
  size: number,
): Block[] {
  if (b.type === "pageBreak" || b.type === "columnBreak") return [b];
  if (b.w !== undefined && b.w > w)
    throw Error("固定 width 超出自动页栏宽，请减小宽度或改用单栏");
  w = b.w ?? w;
  const h = contentHeight(b, w, font, size),
    forced = (b.children || []).some(
      (c) => c.type === "pageBreak" || c.type === "columnBreak" || hasBreak(c),
    );
  if (h <= max && !forced) return [measureBlock(b, w, font, size)];
  if (b.h !== undefined || b.keepTogether)
    throw Error(
      `${b.type === "math" ? mathHeading(b) : b.type} 超出一栏高度；请移除固定 height / keepTogether、拆分公式或调整字号`,
    );
  if (["text", "caption", "quote"].includes(b.type))
    return splitText(b, w, max, font, size);
  if (["bullets", "numbered"].includes(b.type)) {
    const chunks: Block[] = [];
    let items: string[] = [],
      start = b.start ?? 1;
    for (const item of b.items || []) {
      const candidate = { ...b, items: [...items, item] };
      if (contentHeight(candidate, w, font, size) > max && items.length) {
        chunks.push({
          ...b,
          items,
          ...(b.type === "numbered" ? { start } : {}),
          h: contentHeight({ ...b, items }, w, font, size),
          fragment: true,
          measured: true,
        });
        start += items.length;
        items = [];
      }
      items.push(item);
      if (contentHeight({ ...b, items }, w, font, size) > max)
        throw Error("单个列表项超出动态页，请拆成 Text 或 ProofStep");
    }
    if (items.length)
      chunks.push({
        ...b,
        items,
        ...(b.type === "numbered" ? { start } : {}),
        h: contentHeight({ ...b, items }, w, font, size),
        fragment: true,
        measured: true,
      });
    return chunks;
  }
  const vertical =
    b.type === "math" ||
    ["vstack", "rows", "panel", "glass", "component"].includes(b.type) ||
    (b.type === "layout" && b.preset === "content");
  if (vertical && (b.children?.length || b.text)) {
    const m =
        b.type === "math"
          ? mathMetrics({ ...b, continued: true }, w, font, size)
          : null,
      pad =
        m?.pad ??
        b.padding ??
        (b.type === "panel" ? 24 : b.type === "glass" ? 28 : 0),
      bodyText = b.text
        ? {
            type: "text" as const,
            text: b.text,
            sourcePath: b.sourcePath,
            fragment: true,
            measured: true,
          }
        : undefined,
      children = [...(bodyText ? [bodyText] : []), ...(b.children || [])],
      overhead = m ? m.overhead - m.body : 2 * pad + (b.title ? 54 : 0),
      gap = b.gap ?? (b.type === "math" ? 18 : 24),
      available = max - overhead,
      inner = m?.inner ?? Math.max(1, w - pad * 2);
    if (available < 32)
      throw Error("数学环境标题或字号过大，没有足够空间容纳正文");
    const units = children.flatMap((c) =>
        splitBlock(c, inner, available, font, b.size ?? size),
      ),
      pieces: (Block[] | Block)[] = [],
      groups: Block[][] = [];
    let group: Block[] = [],
      used = 0;
    const flush = () => {
      if (group.length) {
        pieces.push(group);
        groups.push(group);
        group = [];
        used = 0;
      }
    };
    for (const unit of units) {
      if (unit.type === "pageBreak" || unit.type === "columnBreak") {
        flush();
        pieces.push(unit);
        continue;
      }
      const h = unit.h ?? contentHeight(unit, inner, font, b.size ?? size),
        extra = group.length ? gap : 0;
      if (used + extra + h > available && group.length) flush();
      group.push(unit);
      used += h + (group.length > 1 ? gap : 0);
    }
    flush();
    let index = 0;
    return pieces.map((piece) => {
      if (!Array.isArray(piece)) return piece;
      const part: Block = {
        ...b,
        text: undefined,
        children: piece,
        continued: index > 0,
        fragment: true,
        ...(b.environment === "Proof" && index < groups.length - 1
          ? { qed: false }
          : {}),
      };
      index++;
      part.h = contentHeight(part, w, font, size);
      part.measured = true;
      return measureBlock(part, w, font, size);
    });
  }
  throw Error(`${b.type} 超出动态页一栏；请设置较小尺寸、拆分表格或使用单栏`);
}
function paged(
  units: Block[],
  w: number,
  h: number,
  font: string,
  size: number,
  gap: number,
  columns: number,
): Block[][][] {
  const pages: Block[][][] = [Array.from({ length: columns }, () => [])];
  let col = 0,
    used = 0;
  const advance = (page = false) => {
    if (page || col === columns - 1) {
      pages.push(Array.from({ length: columns }, () => []));
      col = 0;
    } else col++;
    used = 0;
  };
  for (const source of units) {
    if (source.type === "pageBreak") {
      if (pages.at(-1)!.some((c) => c.length)) advance(true);
      continue;
    }
    if (source.type === "columnBreak") {
      advance();
      continue;
    }
    for (const unit of splitBlock(source, w, h, font, size)) {
      if (unit.type === "pageBreak") {
        if (pages.at(-1)!.some((c) => c.length)) advance(true);
        continue;
      }
      if (unit.type === "columnBreak") {
        advance();
        continue;
      }
      const height = unit.h ?? contentHeight(unit, w, font, size),
        column = pages.at(-1)![col],
        extra = column.length ? gap : 0;
      if (used + extra + height > h && column.length) advance();
      const target = pages.at(-1)![col];
      target.push(unit);
      used += height + (target.length > 1 ? gap : 0);
    }
  }
  while (pages.length > 1 && !pages.at(-1)!.some((c) => c.length)) pages.pop();
  return pages;
}
export function paginateSlide(
  slide: Slide,
  options: PaginationOptions,
  source: Omit<
    DynamicInfo,
    "part" | "total" | "title" | "columns" | "independentColumns"
  >,
  font: string,
): Slide[] {
  const columns = options.columns ?? 1,
    gap = options.spacing ?? 20,
    size = options.fontSize ?? 22,
    limit = options.maxPages ?? 200;
  if (![1, 2].includes(columns))
    throw Error("DynamicSlide columns 支持 1 或 2");
  if (!Number.isFinite(gap) || gap < 0 || gap > 80)
    throw Error("DynamicSlide spacing 范围为 0–80");
  if (!Number.isFinite(size) || size < 16 || size > 40)
    throw Error("DynamicSlide fontSize 范围为 16–40");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw Error("DynamicSlide maxPages 范围为 1–200");
  const top = slide.subtitle ? 250 : 210,
    height = 620 - top,
    width = (1132 - gap * (columns - 1)) / columns;
  let blocks = markSource(slide.blocks),
    streams: Block[][][],
    columnSources: (Block | undefined)[] = [];
  assertFlow(blocks);
  if (
    blocks.length === 1 &&
    ((blocks[0].type === "layout" &&
      ["content", "split", "compare", "image"].includes(
        blocks[0].preset || "",
      )) ||
      blocks[0].type === "columns")
  ) {
    const root = blocks[0];
    if (
      !(root.type === "layout" && root.preset === "content") &&
      columns === 2 &&
      (root.children?.length || 0) === 2
    )
      blocks = root.children!.map((b, i) => ({
        ...root,
        type: "columnFlow",
        side: i === 0 ? "left" : "right",
        children: [b],
      }));
  }
  const explicit = blocks.some((b) => b.type === "columnFlow");
  if (explicit) {
    if (
      columns !== 2 ||
      blocks.some((b) => b.type !== "columnFlow") ||
      blocks.length > 2
    )
      throw Error("LeftColumn / RightColumn 需要双栏，且不能与其他根内容混用");
    const left = blocks.find((b) => b.side === "left"),
      right = blocks.find((b) => b.side === "right");
    if (
      blocks.filter((b) => b.side === "left").length > 1 ||
      blocks.filter((b) => b.side === "right").length > 1
    )
      throw Error("左右栏只能各定义一次");
    columnSources = [left, right];
    const inputs = columnSources,
      chunks = inputs.map((b) => {
        if (b?.children?.some((c) => c.type === "columnBreak"))
          throw Error("显式左右栏请用 PageBreak 分页");
        if (b?.w !== undefined || b?.h !== undefined)
          throw Error(
            "左右栏尺寸由动态页管理，请用 spacing 或子元素 frame 调整",
          );
        const pad = b?.padding ?? 0;
        if (height - 2 * pad - (b?.title ? 54 : 0) < 40)
          throw Error("栏标题或 padding 过大，正文空间不足");
        const pages = paged(
          b?.children || [],
          Math.max(1, width - 2 * pad),
          height - 2 * pad - (b?.title ? 54 : 0),
          font,
          b?.size ?? size,
          b?.gap ?? gap,
          1,
        ).map((p) => p[0]);
        if (b?.repeat && pages.length > 1)
          throw Error("重复显示的栏超出一页，请缩短内容或取消 repeat");
        return pages;
      }),
      total = Math.max(1, ...chunks.map((c) => c.length));
    streams = Array.from({ length: total }, (_, i) =>
      chunks.map((c, j) => c[i] || (inputs[j]?.repeat ? c[0] : [])),
    );
  } else streams = paged(blocks, width, height, font, size, gap, columns);
  if (streams.length > limit)
    throw Error(`动态续页需要 ${streams.length} 页，超过 maxPages: ${limit}`);
  return streams.map((cols, part) => ({
    ...slide,
    title: part ? `${slide.title}（续 ${part + 1}）` : slide.title,
    ...(slide.id ? { id: part ? `${slide.id}--${part + 1}` : slide.id } : {}),
    blocks: cols.map((children, i) => ({
      ...columnSources[i],
      type: "vstack",
      flowGenerated: true,
      measured: true,
      ...(columnSources[i]?.sourcePath
        ? { sourcePath: columnSources[i]!.sourcePath }
        : {}),
      children,
      gap: columnSources[i]?.gap ?? gap,
      size: columnSources[i]?.size ?? size,
      w: width,
      h: height,
      position: {
        x: 74 + i * (width + gap),
        y: -top,
        reference: "topLeft",
        anchor: "topLeft",
        relativeTo: "slide",
      },
    })),
    dynamic: {
      ...source,
      // Keep the declaration once; continuation pages can be reused after source-only edits.
      source: part === 0 ? source.source : "",
      part,
      total: streams.length,
      title: slide.title,
      columns,
      independentColumns: explicit,
    },
  }));
}
