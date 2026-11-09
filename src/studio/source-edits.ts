import { layoutComponents, parseDeck, type Layout, type Slide } from "../dsl";
import { sourcePages } from "./page-groups";
import { readSyntax, type Call } from "../syntax";
import { tokenize, type Token } from "../tokens";
export type SlideEdit = Partial<
  Pick<
    Slide,
    | "title"
    | "subtitle"
    | "notes"
    | "transition"
    | "duration"
    | "direction"
    | "easing"
  >
>;
function splice(source: string, from: number, to: number, value: string) {
  return source.slice(0, from) + value + source.slice(to);
}
function slides(source: string) {
  return sourcePages(source).pages;
}
function selected(source: string, index: number) {
  const call = slides(source)[index];
  if (!call) throw Error("当前页面不存在");
  return call;
}
function header(source: string, call: Call) {
  const tokens = tokenize(source).filter(
    (t) => t.from >= call.from && t.to <= call.to && t.kind !== "eof",
  );
  const open = tokens[1];
  if (open?.value !== "(") return { args: [] as Token[][], close: tokens[0] };
  const args: Token[][] = [];
  let arg: Token[] = [],
    depth = 0;
  for (const t of tokens.slice(2)) {
    if (depth === 0 && t.kind === "punct" && t.value === ")") {
      if (arg.length) args.push(arg);
      return { args, close: t };
    }
    if (depth === 0 && t.kind === "punct" && t.value === ",") {
      if (arg.length) args.push(arg);
      arg = [];
      continue;
    }
    if (["(", "[", "{"].includes(t.value) && t.kind === "punct") depth++;
    if ([")", "]", "}"].includes(t.value) && t.kind === "punct") depth--;
    arg.push(t);
  }
  throw Error("页面参数括号未闭合");
}
function named(source: string, call: Call, key: string, value: string): string {
  const { args, close } = header(source, call),
    found = args.find((a) => a[0].value === key && a[1]?.value === ":");
  if (found) return splice(source, found[2].from, found.at(-1)!.to, value);
  const last = args.at(-1)?.at(-1);
  // Insert before trailing comments; do not accidentally comment out the new value.
  const at = last?.to ?? close.from;
  return splice(source, at, at, `${last ? ", " : ""}${key}: ${value}`);
}
function modifier(source: string, call: Call, name: string, value: string) {
  const found = call.modifiers.filter((m) => m.name === name).at(-1);
  return found
    ? splice(source, found.from, found.to, `${name}(${value})`)
    : splice(source, call.to, call.to, `.${name}(${value})`);
}
/** Update the smallest declaration that owns the edited field; never serialize the whole project. */
export function editSlide(
  source: string,
  index: number,
  patch: SlideEdit,
): string {
  for (const key of ["title", "subtitle", "notes"] as const) {
    if (patch[key] === undefined) continue;
    const call = selected(source, index),
      value = JSON.stringify(patch[key]);
    source =
      key === "notes" &&
      (!Object.hasOwn(call.named, key) ||
        call.modifiers.some((m) => m.name === "notes"))
        ? modifier(source, call, key, value)
        : named(source, call, key, value);
  }
  if (
    ["transition", "duration", "direction", "easing"].some((key) =>
      Object.hasOwn(patch, key),
    )
  ) {
    const deck = parseDeck(source),
      slide = { ...deck.slides[index], ...patch };
    const value =
      `.${slide.transition || deck.transition || "fade"}` +
      (slide.duration !== undefined ? `, duration: ${slide.duration}` : "") +
      (slide.direction ? `, direction: .${slide.direction}` : "") +
      (slide.easing ? `, easing: .${slide.easing}` : "");
    source = modifier(source, selected(source, index), "transition", value);
  }
  return source;
}
function body(source: string, call: Call) {
  const { close } = header(source, call);
  const tokens = tokenize(source).filter(
    (t) => t.from >= close.to && t.to <= call.to && t.kind !== "eof",
  );
  if (tokens[0]?.value !== "{") return null;
  let depth = 0;
  for (const t of tokens) {
    if (t.kind !== "punct") continue;
    if (t.value === "{") depth++;
    if (t.value === "}" && --depth === 0) return { open: tokens[0], close: t };
  }
  return null;
}
export function setSlideLayout(source: string, index: number, layout: Layout) {
  const slide = selected(source, index);
  const dynamic = parseDeck(source).slides[index].dynamic;
  if (dynamic) {
    if (!["content", "split"].includes(layout))
      throw Error("自动续页支持单栏或双栏；其他布局请在 DSL 中编辑");
    if (layout === "content" && dynamic.independentColumns)
      throw Error("独立左右栏需在 DSL 中调整结构");
    return named(source, slide, "columns", layout === "split" ? "2" : "1");
  }
  if (slide.args.length) {
    const first = header(source, slide).args.find((a) => a[1]?.value !== ":")!;
    return splice(source, first[0].from, first.at(-1)!.to, `.${layout}`);
  }
  const container = slide.children[0];
  if (
    slide.children.length === 1 &&
    Object.values(layoutComponents).includes(container.name)
  )
    return splice(
      source,
      container.from,
      container.from + container.name.length,
      layoutComponents[layout],
    );
  const bounds = body(source, slide),
    name = layoutComponents[layout];
  if (!bounds) {
    const at = header(source, slide).close.to;
    return splice(source, at, at, ` {\n  ${name} {}\n}`);
  }
  const original = source.slice(bounds.open.to, bounds.close.from);
  return splice(
    source,
    bounds.open.to,
    bounds.close.from,
    `\n  ${name} {${original}\n  }\n`,
  );
}
export function appendSlideBlocks(
  source: string,
  index: number,
  declarations: string[],
) {
  const slide = selected(source, index);
  const container =
    slide.children.find((c) => c.name === "RightColumn") ||
    slide.children.find((c) => c.name === "LeftColumn") ||
    (slide.children.length === 1 &&
    Object.values(layoutComponents).includes(slide.children[0].name)
      ? slide.children[0]
      : slide);
  const bounds = body(source, container),
    inserted = declarations.map((s) => "    " + s).join("\n");
  if (!bounds) {
    const at = header(source, container).close.to;
    return splice(source, at, at, ` {\n${inserted}\n}`);
  }
  return splice(
    source,
    bounds.close.from,
    bounds.close.from,
    `\n${inserted}\n`,
  );
}
function endOf(source: string, call: Call) {
  const newline = source.indexOf("\n", call.to),
    end = newline === -1 ? source.length : newline;
  return /^\s*\/\//.test(source.slice(call.to, end)) ? end : call.to;
}
export function addSlideSource(source: string, index: number) {
  const pages = slides(source);
  if (pages.length >= 200) throw Error("工程最多包含 200 页");
  const at = endOf(source, pages[index]);
  return splice(
    source,
    at,
    at,
    '\n\nSlide(title: "新页面") {\n  Flow {\n    Text("正文")\n  }\n}\n',
  );
}
export function duplicateSlideSource(
  source: string,
  index: number,
  suffix = crypto.randomUUID().slice(0, 8),
) {
  const pages = slides(source);
  if (pages.length >= 200) throw Error("工程最多包含 200 页");
  const call = pages[index];
  let copy = source.slice(call.from, call.to);
  if (call.named.id !== undefined) {
    const arg = header(source, call).args.find(
      (tokens) => tokens[0].value === "id" && tokens[1]?.value === ":",
    )!;
    copy = splice(
      copy,
      arg[2].from - call.from,
      arg.at(-1)!.to - call.from,
      JSON.stringify(String(call.named.id) + "-" + suffix),
    );
  }
  const at = endOf(source, call);
  return splice(source, at, at, "\n\n" + copy + "\n");
}
export function deleteSlideSource(source: string, index: number) {
  const pages = slides(source);
  if (new Set(pages.map((c) => c.from)).size <= 1)
    throw Error("工程至少保留一页或一组动态页");
  return splice(source, pages[index].from, endOf(source, pages[index]), "");
}
export function moveSlideSource(
  source: string,
  index: number,
  direction: -1 | 1,
) {
  const pages = slides(source),
    start = pages[index];
  let target = index + direction;
  while (
    target >= 0 &&
    target < pages.length &&
    pages[target].from === start.from
  )
    target += direction;
  if (target < 0 || target >= pages.length) return source;
  const a = pages[Math.min(index, target)],
    b = pages[Math.max(index, target)],
    ae = endOf(source, a),
    be = endOf(source, b);
  return (
    source.slice(0, a.from) +
    source.slice(b.from, be) +
    source.slice(ae, b.from) +
    source.slice(a.from, ae) +
    source.slice(be)
  );
}
/** A minimal edit lets CodeMirror map selection, folds and diagnostic positions correctly. */
export function minimalTextChange(before: string, after: string) {
  let from = 0,
    oldEnd = before.length,
    newEnd = after.length;
  while (from < oldEnd && from < newEnd && before[from] === after[from]) from++;
  while (
    oldEnd > from &&
    newEnd > from &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  return { from, to: oldEnd, insert: after.slice(from, newEnd) };
}

export function renameDeck(source: string, title: string) {
  const root = readSyntax(source),
    first = header(source, root).args.find((a) => a[1]?.value !== ":");
  if (!first) throw Error("Deck 缺少工程名称");
  return splice(source, first[0].from, first.at(-1)!.to, JSON.stringify(title));
}
