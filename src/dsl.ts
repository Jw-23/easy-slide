import { readSyntax, type Call } from "./syntax";
export const layouts = [
  "cover",
  "section",
  "content",
  "split",
  "grid",
  "compare",
  "timeline",
  "image",
] as const;
export type Layout = (typeof layouts)[number];
export const layoutLabels: Record<Layout, string> = {
  cover: "封面",
  section: "章节",
  content: "正文",
  split: "双栏",
  grid: "卡片",
  compare: "对比",
  timeline: "时间线",
  image: "图文",
};
export type Block = {
  type:
    | "text"
    | "bullets"
    | "equation"
    | "image"
    | "metric"
    | "code"
    | "quote"
    | "table"
    | "hstack"
    | "vstack"
    | "zstack"
    | "grid"
    | "spacer";
  text?: string;
  title?: string;
  items?: string[];
  src?: string;
  value?: string;
  label?: string;
  rows?: string[][];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  size?: number;
  color?: string;
  step?: number;
  background?: string;
  children?: Block[];
  gap?: number;
  padding?: number;
  columns?: number;
};
export type Slide = {
  id?: string;
  layout: Layout;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  background?: string;
  color?: string;
  transition?: "fade" | "slide" | "zoom" | "none";
  duration?: number;
  notes?: string;
  blocks: Block[];
};
export type Deck = {
  version: 1;
  title: string;
  author?: string;
  theme?: {
    accent?: string;
    background?: string;
    color?: string;
    font?: string;
  };
  transition?: "fade" | "slide" | "zoom" | "none";
  duration?: number;
  slides: Slide[];
};
export type Project = {
  format: "easy-slide";
  version: 1;
  source: string;
  assets: Record<string, string>;
};
const color = /^(#[0-9a-f]{6})$/i;
function fail(message: string): never {
  throw new Error(message);
}
export function validateDeck(input: unknown): Deck {
  const d = input as any;
  if (!d || d.version !== 1) fail("version 必须为 1");
  if (d.author !== undefined && typeof d.author !== "string")
    fail("author 必须是文本");
  if (typeof d.title !== "string" || !d.title.trim()) fail("请填写工程 title");
  if (!Array.isArray(d.slides) || !d.slides.length || d.slides.length > 200)
    fail("slides 需要包含 1–200 页");
  for (const [i, s] of d.slides.entries()) {
    const p = `第 ${i + 1} 页`;
    if (!s || !layouts.includes(s.layout)) fail(`${p}：未知 layout`);
    if (typeof s.title !== "string") fail(`${p}：title 必须是文本`);
    if (s.blocks === undefined) s.blocks = [];
    if (!Array.isArray(s.blocks) || s.blocks.length > 30)
      fail(`${p}：blocks 必须是数组，最多 30 项`);
    const all: Block[] = [];
    const collect = (blocks: Block[], depth = 0) => {
      if (depth > 30) fail(`${p}：布局嵌套过深`);
      for (const b of blocks) {
        all.push(b);
        if (b.children) {
          if (!Array.isArray(b.children)) fail(`${p}：children 需要数组`);
          collect(b.children, depth + 1);
        }
      }
    };
    collect(s.blocks);
    if (all.length > 300) fail(`${p}：内容块过多`);
    for (const b of all) {
      if (
        !b ||
        ![
          "text",
          "bullets",
          "equation",
          "image",
          "metric",
          "code",
          "quote",
          "table",
          "hstack",
          "vstack",
          "zstack",
          "grid",
          "spacer",
        ].includes(b.type)
      )
        fail(`${p}：未知内容 type`);
      for (const key of ["text", "title", "src", "value", "label"])
        if (
          (b as any)[key] !== undefined &&
          typeof (b as any)[key] !== "string"
        )
          fail(`${p}：${key} 必须是文本（数字请加引号）`);
      if (
        b.items !== undefined &&
        (!Array.isArray(b.items) ||
          b.items.some((x: unknown) => typeof x !== "string"))
      )
        fail(`${p}：items 必须是文本数组`);
      if (
        b.rows !== undefined &&
        (!Array.isArray(b.rows) ||
          b.rows.some(
            (r: unknown) =>
              !Array.isArray(r) || r.some((c) => typeof c !== "string"),
          ))
      )
        fail(`${p}：rows 必须是二维文本数组`);
      for (const k of [
        "x",
        "y",
        "w",
        "h",
        "size",
        "step",
        "gap",
        "padding",
        "columns",
      ])
        if (
          (b as any)[k] !== undefined &&
          (!Number.isFinite((b as any)[k]) || (b as any)[k] < 0)
        )
          fail(`${p}：${k} 必须是非负数字`);
      if (
        b.columns !== undefined &&
        (!Number.isInteger(b.columns) || b.columns < 1 || b.columns > 12)
      )
        fail(`${p}：columns 必须是 1–12`);
      if (b.step !== undefined && (!Number.isInteger(b.step) || b.step > 30))
        fail(`${p}：step 必须是 0–30 的整数`);
      if (
        b.src &&
        (/^(https?:|\/\/|javascript:|file:)/i.test(b.src) ||
          b.src.includes(".."))
      )
        fail(`${p}：图片请使用 assets/ 相对路径`);
      if (b.background && !color.test(b.background))
        fail(`${p}：背景颜色使用 #RRGGBB`);
      if (b.color && !color.test(b.color)) fail(`${p}：颜色使用 #RRGGBB`);
    }
    for (const k of ["transition"])
      if (
        s[k] !== undefined &&
        !["fade", "slide", "zoom", "none"].includes(s[k])
      )
        fail(`${p}：未知 transition`);
    if (
      s.duration !== undefined &&
      (!Number.isFinite(s.duration) || s.duration < 0 || s.duration > 3000)
    )
      fail(`${p}：duration 范围 0–3000 毫秒`);
    for (const k of ["background", "color"])
      if (s[k] && !color.test(s[k])) fail(`${p}：${k} 使用 #RRGGBB`);
    for (const k of ["subtitle", "eyebrow", "notes"])
      if (s[k] !== undefined && typeof s[k] !== "string")
        fail(`${p}：${k} 必须是文本`);
  }
  if (d.theme) {
    if (typeof d.theme !== "object" || Array.isArray(d.theme))
      fail("theme 必须为对象");
    for (const k of ["accent", "background", "color"])
      if (d.theme[k] && !color.test(d.theme[k]))
        fail(`theme.${k} 使用 #RRGGBB`);
    if (d.theme.font !== undefined && typeof d.theme.font !== "string")
      fail("theme.font 必须是文本");
  }
  if (d.transition && !["fade", "slide", "zoom", "none"].includes(d.transition))
    fail("未知全局 transition");
  if (
    d.duration !== undefined &&
    (!Number.isFinite(d.duration) || d.duration < 0 || d.duration > 3000)
  )
    fail("duration 范围 0–3000 毫秒");
  return d as Deck;
}

export function validateProject(p: unknown): Project {
  const v = p as Project;
  if (
    !v ||
    v.format !== "easy-slide" ||
    v.version !== 1 ||
    typeof v.source !== "string" ||
    !v.assets ||
    typeof v.assets !== "object" ||
    Array.isArray(v.assets)
  )
    fail("不是有效的 Easy Slide 工程");
  parseDeck(v.source);
  for (const [k, data] of Object.entries(v.assets))
    if (
      !k.startsWith("assets/") ||
      typeof data !== "string" ||
      !/^data:image\/(png|jpeg|webp|gif);base64,/.test(data)
    )
      fail("工程内包含不支持的图片");
  return v;
}
const blockNames: Record<string, Block["type"]> = {
  Text: "text",
  Bullets: "bullets",
  Equation: "equation",
  Image: "image",
  Metric: "metric",
  Code: "code",
  Quote: "quote",
  Table: "table",
  HStack: "hstack",
  VStack: "vstack",
  ZStack: "zstack",
  Grid: "grid",
  Spacer: "spacer",
};
const names = Object.fromEntries(
  Object.entries(blockNames).map(([k, v]) => [v, k]),
);
const plain = (c: Call, allowed: string[]) => {
  for (const k of Object.keys(c.named))
    if (!allowed.includes(k)) fail(`${c.name}：未知参数 ${k}`);
};
const apply = (
  target: Record<string, unknown>,
  mods: Call[],
  kind: "deck" | "slide" | "block",
) => {
  for (const m of mods) {
    if (m.name === "transition" && kind !== "block") {
      plain(m, ["duration"]);
      target.transition = m.args[0];
      if (m.named.duration !== undefined) target.duration = m.named.duration;
    } else if (m.name === "background" && kind !== "deck") {
      plain(m, []);
      target.background = m.args[0];
    } else if (m.name === "foreground" && kind !== "deck") {
      plain(m, []);
      target.color = m.args[0];
    } else if (m.name === "notes" && kind === "slide") {
      plain(m, []);
      target.notes = m.args[0];
    } else if (kind === "block" && m.name === "font") {
      plain(m, []);
      target.size = m.args[0];
    } else if (kind === "block" && m.name === "title") {
      plain(m, []);
      target.title = m.args[0];
    } else if (kind === "block" && m.name === "step") {
      plain(m, []);
      target.step = m.args[0];
    } else if (kind === "block" && m.name === "padding") {
      plain(m, []);
      target.padding = m.args[0];
    } else if (kind === "block" && m.name === "frame") {
      plain(m, ["x", "y", "width", "height"]);
      for (const [k, v] of Object.entries(m.named))
        target[k === "width" ? "w" : k === "height" ? "h" : k] = v;
    } else fail(`${kind} 不支持修饰符 .${m.name}`);
  }
};
function compileBlock(c: Call): Block {
  const type = blockNames[c.name];
  if (!type) fail(`未知内容声明 ${c.name}`);
  plain(c, [
    "title",
    "text",
    "items",
    "src",
    "value",
    "label",
    "rows",
    "spacing",
    "columns",
  ]);
  const b: Record<string, unknown> = { type, ...c.named };
  if (c.named.spacing !== undefined) {
    b.gap = c.named.spacing;
    delete b.spacing;
  }
  if (c.args.length > 1) fail(`${c.name} 只接受一个未命名参数`);
  const field =
    type === "image"
      ? "src"
      : type === "metric"
        ? "value"
        : type === "bullets"
          ? "items"
          : type === "table"
            ? "rows"
            : "text";
  if (c.args.length) b[field] = c.args[0];
  if (["hstack", "vstack", "zstack", "grid"].includes(type))
    b.children = c.children.map(compileBlock);
  else if (c.children.length) fail(`${c.name} 不能嵌套内容`);
  apply(b, c.modifiers, "block");
  return b as Block;
}
export function parseDeck(source: string): Deck {
  const root = readSyntax(source);
  if (root.name !== "Deck") fail('工程必须以 Deck("工程名称") { ... } 开始');
  plain(root, ["author", "version"]);
  if (root.args.length !== 1) fail("Deck 需要一个工程名称");
  const d: Record<string, unknown> = {
    version: root.named.version ?? 1,
    title: root.args[0],
    ...(root.named.author !== undefined ? { author: root.named.author } : {}),
    slides: [],
  };
  for (const c of root.children) {
    if (c.name === "Theme") {
      plain(c, ["accent", "background", "color", "font"]);
      if (c.args.length || c.children.length || c.modifiers.length)
        fail("Theme 只接受命名参数");
      if (d.theme) fail("Theme 不可重复");
      d.theme = c.named;
    } else if (c.name === "Slide") {
      plain(c, ["title", "eyebrow", "subtitle", "notes", "id"]);
      if (c.args.length !== 1) fail("Slide 需要一个 .布局");
      const s: Record<string, unknown> = {
        layout: c.args[0],
        ...c.named,
        blocks: c.children.map(compileBlock),
      };
      apply(s, c.modifiers, "slide");
      (d.slides as unknown[]).push(s);
    } else fail(`Deck 内不支持 ${c.name}`);
  }
  apply(d, root.modifiers, "deck");
  return validateDeck(d);
}
const str = (v: unknown) => JSON.stringify(v);
function modifiers(b: Block): string {
  let out = "";
  if (b.size !== undefined) out += `.font(${b.size})`;
  if (b.color) out += `.foreground(${str(b.color)})`;
  if (b.step !== undefined) out += `.step(${b.step})`;
  const frame = [
    ["x", b.x],
    ["y", b.y],
    ["width", b.w],
    ["height", b.h],
  ].filter(([, v]) => v !== undefined);
  if (frame.length)
    out += `.frame(${frame.map(([k, v]) => `${k}: ${v}`).join(", ")})`;
  if (b.background) out += `.background(${str(b.background)})`;
  if (b.padding !== undefined) out += `.padding(${b.padding})`;
  return out;
}
function writeBlock(b: Block, indent: string): string {
  const field =
    b.type === "image"
      ? "src"
      : b.type === "metric"
        ? "value"
        : b.type === "bullets"
          ? "items"
          : b.type === "table"
            ? "rows"
            : "text";
  const args: string[] = [];
  if (b[field as keyof Block] !== undefined)
    args.push(str(b[field as keyof Block]));
  for (const k of ["title", "text", "label"] as const)
    if (k !== field && b[k] !== undefined) args.push(`${k}: ${str(b[k])}`);
  if (b.gap !== undefined) args.push(`spacing: ${b.gap}`);
  if (b.columns !== undefined) args.push(`columns: ${b.columns}`);
  let result =
    indent + names[b.type] + (args.length ? "(" + args.join(", ") + ")" : "");
  if (b.children)
    result +=
      " {\n" +
      b.children.map((x) => writeBlock(x, indent + "    ")).join("\n") +
      "\n" +
      indent +
      "}";
  return result + modifiers(b);
}
export function serialize(d: Deck): string {
  const head = `Deck(${str(d.title)}${d.author ? `, author: ${str(d.author)}` : ""}) {`;
  const body: string[] = [];
  if (d.theme)
    body.push(
      "    Theme(" +
        Object.entries(d.theme)
          .map(([k, v]) => `${k}: ${str(v)}`)
          .join(", ") +
        ")",
    );
  for (const s of d.slides) {
    const args = [`.${s.layout}`, `title: ${str(s.title)}`];
    for (const k of ["eyebrow", "subtitle", "id"] as const)
      if (s[k] !== undefined) args.push(`${k}: ${str(s[k])}`);
    let t =
      "    Slide(" +
      args.join(", ") +
      ") {\n" +
      s.blocks.map((b) => writeBlock(b, "        ")).join("\n") +
      "\n    }";
    if (s.background) t += `.background(${str(s.background)})`;
    if (s.color) t += `.foreground(${str(s.color)})`;
    if (s.transition || s.duration !== undefined)
      t += `.transition(.${s.transition || d.transition || "fade"}${s.duration !== undefined ? `, duration: ${s.duration}` : ""})`;
    if (s.notes !== undefined) t += `.notes(${str(s.notes)})`;
    body.push(t);
  }
  return (
    head +
    "\n" +
    body.join("\n\n") +
    "\n}" +
    (d.transition || d.duration !== undefined
      ? `.transition(.${d.transition || "fade"}${d.duration !== undefined ? `, duration: ${d.duration}` : ""})`
      : "") +
    "\n"
  );
}
