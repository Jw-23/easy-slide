import { pageGeometry } from "./page-layout";
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
  source: Omit<DynamicInfo, "part" | "total" | "title" | "columns">,
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
  if (!Number.isFinite(size) || size < 8 || size > 64)
    throw Error("DynamicSlide fontSize 范围为 8–64");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw Error("DynamicSlide maxPages 范围为 1–200");
  const geometry = pageGeometry(slide, true),
    { x, y: top, w, h: height } = geometry.body;
  const columnGap = slide.columnGap ?? gap;
  const width = (w - columnGap * (columns - 1)) / columns;
  let blocks = markSource(slide.blocks),
    streams: Block[][][];
  assertFlow(blocks);
  // Legacy side wrappers are ordinary sequential containers; repeat no longer pins a column.
  const sequential = (nodes: Block[]): Block[] =>
    nodes.map((b) => ({
      ...b,
      ...(b.type === "columnFlow"
        ? { type: "vstack" as const, repeat: undefined, side: undefined }
        : {}),
      ...(b.children ? { children: sequential(b.children) } : {}),
    }));
  blocks = sequential(blocks);
  if (
    blocks.length === 1 &&
    ((blocks[0].type === "layout" &&
      ["split", "compare", "image"].includes(blocks[0].preset || "")) ||
      blocks[0].type === "columns")
  )
    blocks = [{ ...blocks[0], type: "vstack", preset: undefined }];
  streams = paged(blocks, width, height, font, size, gap, columns);
  if (streams.length > limit)
    throw Error(`动态续页需要 ${streams.length} 页，超过 maxPages: ${limit}`);
  return streams.map((cols, part) => ({
    ...slide,
    title: part ? `${slide.title}（续 ${part + 1}）` : slide.title,
    ...(slide.id ? { id: part ? `${slide.id}--${part + 1}` : slide.id } : {}),
    blocks: cols.map((children, i) => ({
      type: "vstack",
      flowGenerated: true,
      measured: true,
      children,
      gap,
      size,
      w: width,
      h: height,
      position: {
        x: x + i * (width + columnGap),
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
    },
  }));
}
