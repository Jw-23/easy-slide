import { tokenize } from "./tokens";
import { calculationNames } from "./expressions";
import { completeLatex } from "./latex";
import { StreamLanguage } from "@codemirror/language";
import {
  snippetCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { effects, easings, layouts, layoutComponents } from "./dsl";
export const slideLanguage = StreamLanguage.define({
  startState: () => ({ end: "" }),
  token(stream, state) {
    if (state.end) {
      while (!stream.eol()) {
        if (stream.match(state.end)) {
          state.end = "";
          break;
        }
        if (stream.next() === "\\" && state.end === '"') stream.next();
      }
      return "string";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    for (const [open, end] of [
      ['#"""', '"""#'],
      ['"""', '"""'],
      ['#"', '"#'],
      ['"', '"'],
    ])
      if (stream.match(open)) {
        state.end = end;
        return "string";
      }
    if (stream.match(/^-?\d+(\.\d+)?/)) return "number";
    if (stream.match(/^\.[A-Za-z_]\w*/)) return "atom";
    if (stream.match(/^(?:let|true|false|null)\b/)) return "keyword";
    if (stream.match(/^[A-Za-z_]\w*/))
      return /^[A-Z]/.test(stream.current()) ? "keyword" : "propertyName";
    stream.next();
    return "punctuation";
  },
});
const declarations = [
  ["let", "let ${name} = ${value}", "定义局部或全局常量"],
  [
    "Column",
    'Column("${标题}", width: ${1}, align: .${right}, format: "${0.00}")',
    "表格列：标题、宽度权重、对齐、数字格式",
  ],
  ["Deck", 'Deck("${名称}", author: "${作者}")', "工程配置，与 Slide 并列书写"],
  ["Theme", 'Theme(accent: "${#16766d}", background: "#fafbf9")', "全局主题"],
  [
    "Slide",
    'Slide(title: "${标题}") {\n    ${}\n}',
    "添加一页，默认内容区自动布局",
  ],
  ...Object.entries(layoutComponents).map(([preset, name]) => [
    name,
    name + " {\n    ${}\n}",
    "独立布局组件 · " + preset,
  ]),
  ["Glass", "Glass {\n    ${}\n}", "毛玻璃内容面板"],
  ["Text", 'Text("${正文}")', "正文文字"],
  ["Bullets", 'Bullets(["${要点一}", "${要点二}"])', "项目列表"],
  ["Equation", 'Equation(#"${E = mc^2}"#)', "LaTeX 原始字符串，反斜杠无需转义"],
  ["Image", 'Image("${assets/image.png}")', "工程内图片相对路径"],
  ["Metric", 'Metric("${99.95%}", label: "${可用性}")', "醒目指标"],
  ["Quote", 'Quote("${引用}")', "引用文字"],
  ["Code", 'Code("${代码}")', "等宽代码块"],
  [
    "Table",
    'Table([["${列一}", "${列二}"], ["${内容}", "${内容}"]])',
    "二维文本表格",
  ],
  ["HStack", "HStack(spacing: ${24}) {\n    ${}\n}", "水平布局"],
  ["VStack", "VStack(spacing: ${24}) {\n    ${}\n}", "垂直布局"],
  ["ZStack", "ZStack {\n    ${}\n}", "叠层布局"],
  ["Grid", "Grid(columns: ${2}, spacing: 24) {\n    ${}\n}", "网格布局"],
  ["Spacer", "Spacer", "留白"],
];
const modifiers = [
  [
    "tableStyle",
    'tableStyle(zebra: ${true}, borders: .${horizontal}, headerFill: "${#23796e}")',
    "表头、斑马纹、边框与行高",
  ],
  [
    "glass",
    "glass(blur: ${24}, opacity: ${0.68}, radius: ${28})",
    "毛玻璃材质",
  ],
  ["stagger", "stagger(${120})", "列表/表格逐项或容器子项交错入场，单位毫秒"],
  ["font", "font(${24})", "文字大小（像素）"],
  ["foreground", 'foreground("${#16766d}")', "文字颜色"],
  ["background", 'background("${#eef2ef}")', "背景颜色"],
  [
    "frame",
    "frame(width: ${480}, height: ${320})",
    "固定尺寸；还支持画布绝对 x/y",
  ],
  ["padding", "padding(${24})", "内边距"],
  ["title", 'title("${标题}")', "块标题"],
  ["notes", 'notes("${演讲思路}")', "页面演讲备注"],
  ["step", "step(${1})", "第几次点击触发，0 表示进入页面时"],
  [
    "appear",
    "appear(.${rise}, step: ${1}, order: ${0}, delay: ${0}, duration: ${600}, easing: .${easeOut})",
    "入场编排：点击阶段、组内顺序、延迟、时长、缓动",
  ],
  [
    "transition",
    "transition(.${slide}, duration: ${650}, direction: .${left}, easing: .${easeOut})",
    "页面过渡：效果、方向、时长、缓动",
  ],
];
const parameters: Record<string, string[]> = {
  Deck: ["author", "version"],
  Theme: ["accent", "background", "color", "font", "material"],
  glass: ["blur", "opacity", "radius"],
  Split: ["spacing"],
  Cards: ["columns", "spacing"],
  Compare: ["spacing"],
  Slide: ["title", "subtitle", "eyebrow", "notes", "id"],
  appear: ["step", "order", "delay", "duration", "easing"],
  transition: ["duration", "direction", "easing"],
  frame: ["x", "y", "width", "height"],
  Grid: ["columns", "spacing"],
  HStack: ["spacing"],
  VStack: ["spacing"],
  Text: ["title"],
  Bullets: ["title"],
  Metric: ["title", "label", "text"],
  Image: ["title"],
  Table: [
    "columns",
    "rows",
    "headers",
    "header",
    "rowHeight",
    "zebra",
    "borders",
    "headerFill",
    "headerColor",
    "stripeColor",
    "borderColor",
    "cellPadding",
  ],
  Column: ["width", "align", "format"],
  tableStyle: [
    "header",
    "rowHeight",
    "zebra",
    "borders",
    "headerFill",
    "headerColor",
    "stripeColor",
    "borderColor",
    "cellPadding",
  ],
};
export function completeDsl(
  context: CompletionContext,
  assets: string[] = [],
): CompletionResult | null {
  const latex = completeLatex(context);
  if (latex) return latex;
  const word = context.matchBefore(/[A-Za-z_]\w*/);
  if (
    !word &&
    !context.explicit &&
    context.state.sliceDoc(context.pos - 1, context.pos) !== "."
  )
    return null;
  const from = word?.from ?? context.pos,
    prefix = context.state.sliceDoc(0, from),
    near = prefix.slice(-180);
  let enums: readonly string[] | undefined;
  if (/align:\s*\.$/.test(near)) enums = ["left", "center", "right"];
  else if (/borders:\s*\.$/.test(near)) enums = ["none", "horizontal", "all"];
  else if (/material:\s*\.$/.test(near)) enums = ["glass", "solid"];
  else if (/easing:\s*\.$/.test(near)) enums = easings;
  else if (/direction:\s*\.$/.test(near))
    enums = ["left", "right", "up", "down"];
  else if (/\.appear\(\s*\.$/.test(near)) enums = effects;
  else if (/\.transition\(\s*\.$/.test(near))
    enums = ["fade", "slide", "zoom", "none"];
  else if (/Slide\(\s*\.$/.test(near)) enums = layouts;
  if (enums)
    return {
      from,
      options: enums.map((label) => ({
        label,
        type: "enum",
        info: "可用枚举值",
      })),
    };
  const arrayCall = () => {
    try {
      const tokens = tokenize(prefix.slice(0, -1)).slice(0, -1);
      let balance = 0;
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i].value === ")") balance++;
        else if (tokens[i].value === "(" && --balance === 0)
          return [
            "range",
            "repeat",
            "concat",
            "zip",
            "transpose",
            "map",
            "filter",
          ].includes(tokens[i - 1]?.value);
      }
    } catch {}
    return false;
  };
  if (
    prefix.endsWith(".") &&
    (/\b[a-z_]\w*\.$/.test(prefix) ||
      /let [^\n]*\)\.$/.test(prefix) ||
      arrayCall())
  )
    return {
      from,
      options: [
        snippetCompletion("map(${x} => ${x})", {
          label: "map",
          type: "method",
          info: "将每项映射为新数据",
        }),
        snippetCompletion("filter(${x} => ${x} > 0)", {
          label: "filter",
          type: "method",
          info: "按条件筛选",
        }),
        snippetCompletion("reduce((${acc}, ${x}) => ${acc} + ${x}, ${0})", {
          label: "reduce",
          type: "method",
          info: "归约为一个值",
        }),
        { label: "length", type: "property", info: "数组或文字长度" },
      ],
    };
  if (prefix.endsWith("."))
    return {
      from,
      options: modifiers.map(([label, template, info]) =>
        snippetCompletion(template, {
          label,
          type: "method",
          detail: "修饰符",
          info,
        }),
      ),
    };
  const image = context.state
    .sliceDoc(Math.max(0, from - 50), context.pos)
    .match(/Image\("([^"\n]*)$/);
  if (image && assets.length)
    return {
      from: context.pos - image[1].length,
      options: assets.map((label) => ({
        label,
        type: "text",
        info: "本地工程素材",
      })),
    };
  const call = prefix.match(/([A-Za-z_]\w*)\([^()]*$/)?.[1];
  const options = declarations.map(([label, template, info]) =>
    snippetCompletion(template, {
      label,
      type: "function",
      detail: info,
      info,
    }),
  );
  const specs: Record<string, string> = {
    range: "range(${0}, ${6})",
    repeat: "repeat(${0}, ${5})",
    pow: "pow(${x}, ${2})",
    round: "round(${x}, ${2})",
    fixed: "fixed(${x}, ${3})",
    percent: "percent(${x}, ${1})",
    format: 'format(${x}, "${0.000}")',
    clamp: "clamp(${x}, ${0}, ${1})",
    Column:
      'Column("${标题}", width: ${1}, align: .${right}, format: "${0.00}")',
  };
  options.push(
    ...calculationNames
      .filter((n) => n !== "Column")
      .map((label) =>
        snippetCompletion(specs[label] || label + "(${value})", {
          label,
          type: "function",
          detail: "计算函数",
          info: "本地解释计算；数组下标从 0 开始，range 不包含终点",
        }),
      ),
  );
  const variables = [
    ...new Set(
      [
        ...context.state
          .sliceDoc(0, context.pos)
          .matchAll(/\blet\s+([A-Za-z_]\w*)\s*=/g),
      ].map((m) => m[1]),
    ),
  ];
  options.push(
    ...variables.map((label) => ({
      label,
      type: "variable",
      detail: "已声明常量",
    })),
  );
  options.push(
    ...["true", "false", "null"].map((label) => ({
      label,
      type: "keyword",
      detail: "标量值",
    })),
  );
  if (call && parameters[call])
    options.unshift(
      ...parameters[call].map((label) => ({
        label: label + ":",
        apply: label + ": ",
        type: "property",
        detail: `${call} 参数`,
        info: "点击查看或补全参数；时间单位均为毫秒",
      })),
    );
  return { from, options, validFor: /^[A-Za-z_]\w*$/ };
}
