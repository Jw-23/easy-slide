import { themeIds, type ThemeOptions } from "./themes";
import { validateTable, tableKeys, type TableOptions } from "./table";
import type { Cell } from "./number-format";
import { parseRichText, richRuns } from "./rich-text";
import { mathError } from "./math";
import { DslError, closest } from "./diagnostics";
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
  "center",
  "sidebar",
  "headerBody",
  "threeColumns",
  "focus",
] as const;
export type Layout = (typeof layouts)[number];
export const positionAnchors = [
  "topLeft",
  "top",
  "topRight",
  "left",
  "center",
  "right",
  "bottomLeft",
  "bottom",
  "bottomRight",
] as const;
export const positionReferences = ["parent", "slide"] as const;
export const layoutLabels: Record<Layout, string> = {
  cover: "封面",
  section: "章节",
  content: "正文",
  split: "双栏",
  grid: "卡片",
  compare: "对比",
  timeline: "时间线",
  image: "图文",
  center: "居中",
  sidebar: "侧栏",
  headerBody: "上下",
  threeColumns: "三栏",
  focus: "主次",
};
export const effects = [
  "fade",
  "rise",
  "slideLeft",
  "slideRight",
  "zoom",
  "none",
] as const;
export const easings = ["linear", "easeOut", "easeInOut", "spring"] as const;
export type Motion = {
  effect: (typeof effects)[number];
  order?: number;
  delay?: number;
  duration?: number;
  easing?: (typeof easings)[number];
};
export type GlassStyle = { blur?: number; opacity?: number; radius?: number };
export const layoutComponents: Record<Layout, string> = {
  cover: "Cover",
  section: "Section",
  content: "Flow",
  split: "Split",
  grid: "Cards",
  compare: "Compare",
  timeline: "Timeline",
  image: "ImageText",
  center: "Center",
  sidebar: "Sidebar",
  headerBody: "HeaderBody",
  threeColumns: "ThreeColumns",
  focus: "Focus",
};
export type Block = {
  expressionSource?: string;
  componentName?: string;
  bindings?: string[];
  table?: TableOptions;
  preset?: Layout;
  glass?: GlassStyle;
  appear?: Motion;
  stagger?: number;
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
    | "spacer"
    | "layout"
    | "glass"
    | "component"
    | "panel"
    | "columns"
    | "rows"
    | "heading"
    | "caption"
    | "numbered"
    | "divider"
    | "rectangle"
    | "circle"
    | "badge"
    | "progress";
  text?: string;
  title?: string;
  items?: string[];
  src?: string;
  value?: string;
  label?: string;
  rows?: Cell[][];
  w?: number;
  h?: number;
  position?: {
    x?: number;
    y?: number;
    reference?: (typeof positionAnchors)[number];
    anchor?: (typeof positionAnchors)[number];
    relativeTo?: (typeof positionReferences)[number];
  };
  scale?: number;
  size?: number;
  color?: string;
  step?: number;
  background?: string;
  children?: Block[];
  gap?: number;
  padding?: number;
  columns?: number;
  weights?: number[];
  alignment?: "leading" | "center" | "trailing" | "top" | "bottom";
  radius?: number;
  fill?: string;
  thickness?: number;
  orientation?: "horizontal" | "vertical";
  level?: number;
  progress?: number;
  showValue?: boolean;
};
export type Slide = {
  bindings?: string[];
  id?: string;
  /** Legacy input only; canonical DSL uses dedicated layout components. */
  layout?: Layout;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  background?: string;
  color?: string;
  transition?: "fade" | "slide" | "zoom" | "none";
  duration?: number;
  easing?: (typeof easings)[number];
  direction?: "left" | "right" | "up" | "down";
  notes?: string;
  blocks: Block[];
};
export type Deck = {
  functions?: string[];
  bindings?: string[];
  version: 1;
  title: string;
  author?: string;
  theme?: ThemeOptions;
  transition?: "fade" | "slide" | "zoom" | "none";
  duration?: number;
  easing?: (typeof easings)[number];
  direction?: "left" | "right" | "up" | "down";
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
function validateRich(value: unknown, label: string) {
  if (typeof value !== "string") return;
  const document = parseRichText(value);
  for (const run of richRuns(document))
    if (run.kind === "math") {
      const issue = mathError(run.text);
      if (issue) fail(`${label}，文本第 ${run.node.from + 1} 个字符：${issue}`);
    }
}
export function validateDeck(input: unknown): Deck {
  const d = input as any;
  if (!d || d.version !== 1) fail("version 必须为 1");
  if (d.author !== undefined && typeof d.author !== "string")
    fail("author 必须是文本");
  if (typeof d.title !== "string" || !d.title.trim()) fail("请填写工程 title");
  if (!Array.isArray(d.slides) || !d.slides.length || d.slides.length > 200)
    fail("slides 需要包含 1–200 页");
  for (const key of ["title", "author"]) validateRich(d[key], key);
  for (const [i, s] of d.slides.entries()) {
    const p = `第 ${i + 1} 页`;
    if (!s || (s.layout !== undefined && !layouts.includes(s.layout)))
      fail(`${p}：未知 layout`);
    if (typeof s.title !== "string") fail(`${p}：title 必须是文本`);
    for (const key of ["title", "subtitle", "eyebrow"])
      validateRich(s[key], `${p}：${key}`);
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
          "layout",
          "glass",
          "component",
          "panel",
          "columns",
          "rows",
          "heading",
          "caption",
          "numbered",
          "divider",
          "rectangle",
          "circle",
          "badge",
          "progress",
        ].includes(b.type)
      )
        fail(`${p}：未知内容 type`);
      for (const key of ["text", "title", "src", "value", "label"])
        if (
          (b as any)[key] !== undefined &&
          typeof (b as any)[key] !== "string"
        )
          fail(`${p}：${key} 必须是文本（数字请加引号）`);
      for (const key of ["text", "title", "label", "value"] as const)
        if (!(key === "text" && ["code", "equation"].includes(b.type)))
          validateRich(b[key], `${p}：${key}`);
      for (const item of Array.isArray(b.items) ? b.items : [])
        validateRich(item, `${p}：列表项`);
      if (b.type === "table") {
        for (const row of Array.isArray(b.rows) ? b.rows : [])
          if (Array.isArray(row))
            for (const cell of row) validateRich(cell, `${p}：表格单元格`);
        for (const col of Array.isArray(b.table?.columns)
          ? b.table.columns
          : [])
          validateRich(col?.label, `${p}：表头`);
        for (const cell of Array.isArray(b.table?.headers)
          ? b.table.headers
          : [])
          validateRich(cell, `${p}：表头`);
      }
      if (b.type === "equation" && typeof b.text === "string") {
        const issue = mathError(b.text);
        if (issue) fail(issue);
      }
      if (
        b.items !== undefined &&
        (!Array.isArray(b.items) ||
          b.items.some((x: unknown) => typeof x !== "string"))
      )
        fail(`${p}：items 必须是文本数组`);
      if (b.weights && b.children && b.weights.length !== b.children.length)
        fail(`${p}：weights 数量需与内容数量一致`);
      if (
        b.weights !== undefined &&
        (!Array.isArray(b.weights) ||
          b.weights.length > 30 ||
          b.weights.some(
            (n: unknown) =>
              typeof n !== "number" || !Number.isFinite(n) || n <= 0,
          ))
      )
        fail(`${p}：weights 需要至多 30 个正数`);
      if (
        b.alignment !== undefined &&
        !["leading", "center", "trailing", "top", "bottom"].includes(
          b.alignment,
        )
      )
        fail(`${p}：未知 alignment`);
      if (
        b.level !== undefined &&
        (!Number.isInteger(b.level) || b.level < 1 || b.level > 4)
      )
        fail(`${p}：level 支持 1–4`);
      if (
        b.progress !== undefined &&
        (!Number.isFinite(b.progress) || b.progress < 0 || b.progress > 1)
      )
        fail(`${p}：Progress 的 value 范围为 0–1`);
      if (
        b.orientation !== undefined &&
        !["horizontal", "vertical"].includes(b.orientation)
      )
        fail(`${p}：direction 支持 .horizontal / .vertical`);
      if (b.showValue !== undefined && typeof b.showValue !== "boolean")
        fail(`${p}：showValue 必须是 true / false`);
      if (b.fill !== undefined && !color.test(b.fill))
        fail(`${p}：fill 使用 #RRGGBB`);
      for (const key of ["radius", "thickness"] as const)
        if (
          b[key] !== undefined &&
          (!Number.isFinite(b[key]) || b[key] < 0 || b[key] > 100)
        )
          fail(`${p}：${key} 范围 0–100`);
      if (b.type === "table") validateTable(b.rows || [], b.table);
      if (b.position !== undefined) {
        const pos = b.position;
        if (!pos || typeof pos !== "object" || Array.isArray(pos))
          fail(`${p}：position 需要命名参数`);
        for (const key of Object.keys(pos))
          if (!["x", "y", "reference", "anchor", "relativeTo"].includes(key))
            fail(`${p}：未知 position 参数 ${key}`);
        for (const key of ["x", "y"] as const)
          if (pos[key] !== undefined && !Number.isFinite(pos[key]))
            fail(`${p}：position ${key} 必须是有限数字`);
        for (const key of ["reference", "anchor"] as const)
          if (pos[key] !== undefined && !positionAnchors.includes(pos[key]!))
            fail(`${p}：position ${key} 支持 ${positionAnchors.join(" / ")}`);
        if (
          pos.relativeTo !== undefined &&
          !positionReferences.includes(pos.relativeTo)
        )
          fail(`${p}：position relativeTo 支持 .parent / .slide`);
      }
      if (
        b.scale !== undefined &&
        (!Number.isFinite(b.scale) || b.scale <= 0 || b.scale > 10)
      )
        fail(`${p}：scale 必须大于 0 且不超过 10`);
      if ("x" in b || "y" in b || "origin" in b || "relativeTo" in b)
        fail(
          `${p}：位置请改用 .position(x:, y:, reference:, anchor:, relativeTo:)，frame 只设置尺寸`,
        );
      for (const k of ["w", "h", "size", "step", "gap", "padding", "columns"])
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
      if (b.type === "layout" && (!b.preset || !layouts.includes(b.preset)))
        fail(`${p}：未知布局组件`);
      if (b.glass) {
        for (const k of ["blur", "opacity", "radius"] as const) {
          const v = b.glass[k],
            max = k === "opacity" ? 1 : k === "blur" ? 80 : 100;
          if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > max))
            fail(`${p}：glass.${k} 范围 0–${max}`);
        }
      }
      if (b.stagger !== undefined) {
        if (!Number.isFinite(b.stagger) || b.stagger < 0 || b.stagger > 10000)
          fail(`${p}：stagger 范围 0–10000 毫秒`);
        if (
          ![
            "bullets",
            "table",
            "hstack",
            "vstack",
            "zstack",
            "grid",
            "layout",
            "glass",
            "component",
            "panel",
            "columns",
            "rows",
            "numbered",
          ].includes(b.type)
        )
          fail(`${p}：stagger 仅支持列表、表格和布局容器`);
      }
      if (b.appear) {
        if (!effects.includes(b.appear.effect))
          fail(`${p}：appear 效果支持 ${effects.join(" / ")}`);
        if (b.appear.easing !== undefined && !easings.includes(b.appear.easing))
          fail(`${p}：easing 支持 ${easings.join(" / ")}`);
        for (const k of ["duration", "delay", "order"] as const) {
          const v = b.appear[k];
          if (
            v !== undefined &&
            (!Number.isFinite(v) || v < 0 || v > (k === "order" ? 100 : 10000))
          )
            fail(`${p}：appear.${k} 范围 0–${k === "order" ? 100 : 10000}`);
        }
        if (b.appear.order !== undefined && !Number.isInteger(b.appear.order))
          fail(`${p}：order 必须为整数`);
      }
      if (b.background && !color.test(b.background))
        fail(`${p}：背景颜色使用 #RRGGBB`);
      if (b.color && !color.test(b.color)) fail(`${p}：颜色使用 #RRGGBB`);
    }
    validateTransition(s, p);
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
  if (
    d.theme?.material !== undefined &&
    !["glass", "solid"].includes(d.theme.material)
  )
    fail("theme.material 支持 .glass / .solid");
  if (d.theme) {
    if (typeof d.theme !== "object" || Array.isArray(d.theme))
      fail("theme 必须为对象");
    if (d.theme.preset !== undefined && !themeIds.includes(d.theme.preset))
      fail(
        `未知主题 ${d.theme.preset}，支持 ${themeIds.map((id) => "." + id).join(" / ")}`,
      );
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
  validateTransition(d, "Deck");
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

function validateTransition(t: Deck | Slide, p: string) {
  if (t.easing !== undefined && !easings.includes(t.easing))
    fail(`${p}：easing 支持 ${easings.join(" / ")}`);
  if (
    t.direction !== undefined &&
    !["left", "right", "up", "down"].includes(t.direction)
  )
    fail(`${p}：direction 支持 left / right / up / down`);
}
function at<T>(c: Call, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof DslError) throw e;
    const detail = (e as Error).message.replace(/^第 1 页：/, "");
    throw new DslError(
      detail,
      c.from,
      c.to,
      c.line,
      c.col,
      (c.definitionLine
        ? `此元素由第 ${c.definitionLine} 行定义的布局函数生成；检查函数定义与此调用参数。 `
        : "") +
        (detail.includes("LaTeX")
          ? '检查命令拼写与花括号；建议使用反引号或 #"..."# 原始字符串。在公式中输入反斜杠呼出 LaTeX 补全。'
          : detail.includes("未知")
            ? "检查拼写；按 Ctrl / ⌘ + Space 查看可用声明与参数。"
            : "请根据提示修改此声明。尺寸、时长和顺序均使用非负数字。"),
    );
  }
}
const sampleSlide: Slide = {
  layout: "content",
  title: "validation",
  blocks: [],
};

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
  Glass: "glass",
  Columns: "columns",
  Rows: "rows",
  Panel: "panel",
  Heading: "heading",
  Caption: "caption",
  Numbered: "numbered",
  Divider: "divider",
  Rectangle: "rectangle",
  Circle: "circle",
  Badge: "badge",
  Progress: "progress",
  ...Object.fromEntries(
    Object.values(layoutComponents).map((n) => [n, "layout" as const]),
  ),
};
const names = Object.fromEntries(
  Object.entries(blockNames).map(([k, v]) => [v, k]),
);
const plain = (c: Call, allowed: string[]) => {
  for (const k of Object.keys(c.named))
    if (!allowed.includes(k))
      fail(
        `${c.name}：未知参数 ${k}${closest(k, allowed) ? `，是否想写 ${closest(k, allowed)}？` : ""}。可用参数：${allowed.join(", ") || "无"}`,
      );
};
const apply = (
  target: Record<string, unknown>,
  mods: Call[],
  kind: "deck" | "slide" | "block",
) => {
  for (const m of mods) {
    at(m, () => {
      if (m.name === "transition" && kind !== "block") {
        plain(m, ["duration", "easing", "direction"]);
        for (const k of ["easing", "direction"])
          if (m.named[k] !== undefined) target[k] = m.named[k];
        target.transition = m.args[0];
        if (m.named.duration !== undefined) target.duration = m.named.duration;
      } else if (m.name === "appear" && kind === "block") {
        plain(m, ["step", "order", "delay", "duration", "easing"]);
        const { step, ...motion } = m.named;
        target.appear = { effect: m.args[0], ...motion };
        if (step !== undefined) target.step = step;
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
      } else if (kind === "block" && m.name === "stagger") {
        plain(m, []);
        target.stagger = m.args[0];
      } else if (kind === "block" && m.name === "padding") {
        plain(m, []);
        target.padding = m.args[0];
      } else if (kind === "block" && m.name === "glass") {
        plain(m, ["blur", "opacity", "radius"]);
        target.glass = { ...m.named };
      } else if (kind === "block" && m.name === "tableStyle") {
        if (target.type !== "table") fail(".tableStyle 仅用于 Table");
        plain(
          m,
          tableKeys.filter((k) => !["columns", "headers"].includes(k)),
        );
        target.table = {
          ...((target.table as TableOptions) || {}),
          ...m.named,
        };
      } else if (kind === "block" && m.name === "frame") {
        if (
          Object.keys(m.named).some((k) =>
            ["x", "y", "origin", "relativeTo"].includes(k),
          )
        )
          fail(
            "frame 只设置 width / height；位置请改用 .position(x:, y:, reference:, anchor:, relativeTo:)，x 向右、y 向上",
          );
        plain(m, ["width", "height"]);
        for (const [k, v] of Object.entries(m.named))
          target[k === "width" ? "w" : k === "height" ? "h" : k] = v;
      } else if (kind === "block" && m.name === "position") {
        plain(m, ["x", "y", "reference", "anchor", "relativeTo"]);
        target.position = {
          ...((target.position as Block["position"]) || {}),
          ...m.named,
        };
      } else if (kind === "block" && m.name === "scale") {
        plain(m, []);
        target.scale = m.args[0];
      } else
        fail(
          `${kind} 不支持修饰符 .${m.name}${closest(m.name, ["transition", "appear", "background", "foreground", "font", "frame", "position", "scale", "padding", "step", "title", "notes"]) ? `，是否想写 .${closest(m.name, ["transition", "appear", "background", "foreground", "font", "frame", "position", "scale", "padding", "step", "title", "notes"])}？` : ""}`,
        );
      if (
        m.args.length !==
        (["frame", "position", "glass", "tableStyle"].includes(m.name) ? 0 : 1)
      )
        fail(
          `.${m.name} ${["frame", "position", "glass", "tableStyle"].includes(m.name) ? "仅接受命名参数" : "需要一个未命名参数"}`,
        );
      if (kind === "block")
        validateDeck({
          version: 1,
          title: "validation",
          slides: [{ ...sampleSlide, blocks: [target] }],
        });
      else if (kind === "slide")
        validateDeck({ version: 1, title: "validation", slides: [target] });
      else validateDeck({ ...target, slides: [sampleSlide] });
    });
  }
};
function compileBlock(c: Call): Block {
  return at(c, () => {
    const type = c.custom ? "component" : blockNames[c.name];
    if (!type)
      fail(
        `未知内容声明 ${c.name}${closest(c.name, Object.keys(blockNames)) ? `，是否想写 ${closest(c.name, Object.keys(blockNames))}？` : ""}`,
      );
    if (!c.custom)
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
        "weights",
        "alignment",
        "radius",
        "fill",
        "thickness",
        "direction",
        "level",
        "showValue",
        ...(type === "table" ? tableKeys : []),
      ]);
    const b: Record<string, unknown> = c.custom
      ? { type, componentName: c.name }
      : { type, ...c.named };
    if (type === "divider" && c.named.direction !== undefined) {
      b.orientation = c.named.direction;
      delete b.direction;
    }
    if (type === "table") {
      const opts: Record<string, unknown> = {};
      for (const key of tableKeys) {
        if (c.named[key] !== undefined) {
          opts[key] = c.named[key];
          delete b[key];
        }
      }
      if (Object.keys(opts).length) b.table = opts;
    }
    if (c.bindings) b.bindings = c.bindings;
    if (c.expressionSource) b.expressionSource = c.expressionSource;
    if (type === "layout")
      b.preset = Object.entries(layoutComponents).find(
        ([, name]) => name === c.name,
      )![0];
    if (type === "glass") b.glass = {};
    if (!c.custom && c.named.spacing !== undefined) {
      b.gap = c.named.spacing;
      delete b.spacing;
    }
    if (!c.custom && c.args.length > 1) fail(`${c.name} 只接受一个未命名参数`);
    const field =
      type === "image"
        ? "src"
        : type === "metric"
          ? "value"
          : ["bullets", "numbered"].includes(type)
            ? "items"
            : type === "table"
              ? "rows"
              : type === "progress"
                ? "progress"
                : "text";
    if (!c.custom && c.args.length) b[field] = c.args[0];
    if (type === "progress" && c.named.value !== undefined) {
      b.progress = c.named.value;
      delete b.value;
    }
    if (
      [
        "hstack",
        "vstack",
        "zstack",
        "grid",
        "layout",
        "glass",
        "component",
        "panel",
        "columns",
        "rows",
      ].includes(type)
    )
      b.children = c.children.map(compileBlock);
    else if (c.children.length) fail(`${c.name} 不能嵌套内容`);
    apply(b, c.modifiers, "block");
    validateDeck({
      version: 1,
      title: "validation",
      slides: [{ ...sampleSlide, blocks: [b] }],
    });
    return b as Block;
  });
}
export function parseDeck(source: string): Deck {
  const root = readSyntax(source);
  return at(root, () => {
    if (root.name !== "Deck")
      fail('工程必须以 Deck("工程名称") 开始，Slide 与 Deck 并列书写');
    plain(root, ["author", "version"]);
    if (root.args.length !== 1) fail("Deck 需要一个工程名称");
    const d: Record<string, unknown> = {
      version: root.named.version ?? 1,
      title: root.args[0],
      ...(root.named.author !== undefined ? { author: root.named.author } : {}),
      slides: [],
      ...(root.functions ? { functions: root.functions } : {}),
      ...(root.bindings ? { bindings: root.bindings } : {}),
    };
    for (const c of root.children) {
      at(c, () => {
        if (c.name === "Theme") {
          plain(c, [
            "preset",
            "accent",
            "background",
            "color",
            "font",
            "material",
          ]);
          if (c.args.length || c.children.length || c.modifiers.length)
            fail("Theme 只接受命名参数");
          if (d.theme) fail("Theme 不可重复");
          d.theme = c.named;
        } else if (c.name === "Slide") {
          plain(c, ["title", "eyebrow", "subtitle", "notes", "id"]);
          if (c.args.length > 1)
            fail("Slide 只接受命名参数，布局请使用 Split / Cards 等组件");
          const s: Record<string, unknown> = {
            ...c.named,
            ...(c.bindings ? { bindings: c.bindings } : {}),
            blocks: c.children.map(compileBlock),
          };
          if (c.args.length) {
            if (!layouts.includes(c.args[0] as Layout)) fail("未知 layout");
            s.blocks = [
              { type: "layout", preset: c.args[0], children: s.blocks },
            ];
          }
          apply(s, c.modifiers, "slide");
          (d.slides as unknown[]).push(s);
        } else fail(`顶层不支持 ${c.name}，请使用 Theme 或 Slide`);
        validateDeck({
          ...d,
          slides: (d.slides as unknown[]).length ? d.slides : [sampleSlide],
        });
      });
    }
    apply(d, root.modifiers, "deck");
    return validateDeck(d);
  });
}
function str(v: unknown): string {
  if (typeof v === "string" && v.includes("\\")) {
    if (!v.includes("`")) return "`" + v + "`";
    if (!v.includes("```") && !v.endsWith("`")) return "```" + v + "```";
  }
  if (Array.isArray(v)) return "[" + v.map(str).join(", ") + "]";
  return JSON.stringify(v);
}
function modifiers(b: Block): string {
  let out = "";
  if (b.glass && b.type !== "glass")
    out += `.glass(${Object.entries(b.glass)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")})`;
  if (b.type === "glass" && b.glass && Object.keys(b.glass).length)
    out += `.glass(${Object.entries(b.glass)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")})`;
  if (b.table) {
    const styles = Object.entries(b.table).filter(
      ([k]) => !["columns", "headers"].includes(k),
    );
    if (styles.length)
      out += `.tableStyle(${styles.map(([k, v]) => `${k}: ${k === "borders" ? "." + v : str(v)}`).join(", ")})`;
  }
  if (b.stagger !== undefined) out += `.stagger(${b.stagger})`;
  if (b.size !== undefined) out += `.font(${b.size})`;
  if (b.color) out += `.foreground(${str(b.color)})`;
  if (b.appear)
    out += `.appear(.${b.appear.effect}${b.step !== undefined ? `, step: ${b.step}` : ""}${Object.entries(
      b.appear,
    )
      .filter(([k]) => k !== "effect")
      .map(([k, v]) => `, ${k}: ${typeof v === "string" ? "." + v : v}`)
      .join("")})`;
  else if (b.step !== undefined) out += `.step(${b.step})`;
  const frame = [
    ["width", b.w],
    ["height", b.h],
  ].filter(([, v]) => v !== undefined);
  if (frame.length)
    out += `.frame(${frame.map(([k, v]) => `${k}: ${v}`).join(", ")})`;
  if (b.position)
    out += `.position(${Object.entries(b.position)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? "." : ""}${v}`)
      .join(", ")})`;
  if (b.scale !== undefined) out += `.scale(${b.scale})`;
  if (b.background) out += `.background(${str(b.background)})`;
  if (b.padding !== undefined) out += `.padding(${b.padding})`;
  return out;
}
function writeBlock(b: Block, indent: string): string {
  if (b.expressionSource)
    return indent + b.expressionSource.split("\n").join("\n" + indent);
  const field =
    b.type === "image"
      ? "src"
      : b.type === "metric"
        ? "value"
        : ["bullets", "numbered"].includes(b.type)
          ? "items"
          : b.type === "table"
            ? "rows"
            : "text";
  const args: string[] = [];
  if (b[field as keyof Block] !== undefined)
    args.push(str(b[field as keyof Block]));
  for (const k of ["title", "text", "label"] as const)
    if (k !== field && b[k] !== undefined) args.push(`${k}: ${str(b[k])}`);
  if (b.type === "table") {
    if (b.table?.headers) args.push(`headers: ${str(b.table.headers)}`);
    if (b.table?.columns)
      args.push(
        "columns: [" +
          b.table.columns
            .map(
              (c) =>
                "Column(" +
                str(c.label) +
                Object.entries(c)
                  .filter(([k]) => k !== "label")
                  .map(
                    ([k, v]) => `, ${k}: ${k === "align" ? "." + v : str(v)}`,
                  )
                  .join("") +
                ")",
            )
            .join(", ") +
          "]",
      );
  }
  if (b.progress !== undefined) args.unshift(str(b.progress));
  for (const key of [
    "weights",
    "radius",
    "fill",
    "thickness",
    "level",
    "showValue",
  ] as const)
    if (b[key] !== undefined) args.push(`${key}: ${str(b[key])}`);
  if (b.alignment) args.push(`alignment: .${b.alignment}`);
  if (b.orientation) args.push(`direction: .${b.orientation}`);
  if (b.gap !== undefined) args.push(`spacing: ${b.gap}`);
  if (b.columns !== undefined) args.push(`columns: ${b.columns}`);
  let result =
    indent +
    (b.type === "layout"
      ? layoutComponents[b.preset!]
      : b.type === "component"
        ? "VStack"
        : names[b.type]) +
    (args.length ? "(" + args.join(", ") + ")" : "");
  if (b.children)
    result +=
      " {\n" +
      [
        ...(b.bindings || []).map(
          (v) => indent + "    " + v.split("\n").join("\n" + indent + "    "),
        ),
        ...b.children.map((x) => writeBlock(x, indent + "    ")),
      ].join("\n") +
      "\n" +
      indent +
      "}";
  return result + modifiers(b);
}
function transitionText(s: Deck | Slide, fallback = "fade"): string {
  if (
    s.transition === undefined &&
    s.duration === undefined &&
    s.easing === undefined &&
    s.direction === undefined
  )
    return "";
  return `.transition(.${s.transition || fallback}${s.duration !== undefined ? `, duration: ${s.duration}` : ""}${s.easing ? `, easing: .${s.easing}` : ""}${s.direction ? `, direction: .${s.direction}` : ""})`;
}
export function serialize(d: Deck): string {
  const parts = [
    ...(d.functions || []),
    ...(d.bindings || []),
    `Deck(${str(d.title)}${d.author ? `, author: ${str(d.author)}` : ""})` +
      transitionText(d),
  ];
  if (d.theme)
    parts.push(
      "Theme(" +
        Object.entries(d.theme)
          .map(
            ([k, v]) =>
              `${k}: ${k === "material" || k === "preset" ? "." + v : str(v)}`,
          )
          .join(", ") +
        ")",
    );
  for (const s of d.slides) {
    const args = [`title: ${str(s.title)}`];
    for (const k of ["eyebrow", "subtitle", "id"] as const)
      if (s[k] !== undefined) args.push(`${k}: ${str(s[k])}`);
    let t =
      "Slide(" +
      args.join(", ") +
      ") {\n" +
      [
        ...(s.bindings || []).map((v) => "    " + v.split("\n").join("\n    ")),
        ...(s.layout
          ? [{ type: "layout", preset: s.layout, children: s.blocks } as Block]
          : s.blocks
        ).map((b) => writeBlock(b, "    ")),
      ].join("\n") +
      "\n}";
    if (s.background) t += `.background(${str(s.background)})`;
    if (s.color) t += `.foreground(${str(s.color)})`;
    t += transitionText(s, d.transition);
    if (s.notes !== undefined) t += `.notes(${str(s.notes)})`;
    parts.push(t);
  }
  return parts.join("\n\n") + "\n";
}

export function pageLayout(s: Slide): Layout {
  let root = s.blocks[0];
  while (root?.type === "component" && root.children?.length === 1)
    root = root.children[0];
  return root?.type === "layout"
    ? root.preset || "content"
    : s.layout || "content";
}

export function pageContent(s: Slide): Block[] {
  return s.blocks.length === 1 && s.blocks[0].type === "layout"
    ? s.blocks[0].children || []
    : s.blocks;
}
export function withLayout(s: Slide, preset: Layout): Slide {
  const { layout, ...rest } = s;
  void layout;
  return {
    ...rest,
    blocks: [
      {
        ...(s.blocks.length === 1 && s.blocks[0].type === "layout"
          ? s.blocks[0]
          : {}),
        type: "layout",
        preset,
        expressionSource: undefined,
        children: pageContent(s),
      },
    ],
  };
}
export function addPageBlock(s: Slide, b: Block): Block[] {
  if (s.blocks.length === 1 && s.blocks[0].type === "layout")
    return [{ ...s.blocks[0], children: [...(s.blocks[0].children || []), b] }];
  return [...s.blocks, b];
}

/** Serialize an individual content component for portable clipboard operations. */
export function serializeBlock(block: Block): string {
  return writeBlock(block, "");
}
