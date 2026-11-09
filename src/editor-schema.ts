import { mathEnvironments } from "./math-environments";
import { themeIds } from "./themes";
import {
  effects,
  easings,
  layouts,
  layoutComponents,
  positionAnchors,
  positionReferences,
} from "./dsl";

export type ValueType = {
  kind:
    | "unknown"
    | "number"
    | "string"
    | "boolean"
    | "null"
    | "column"
    | "array"
    | "function"
    | "component"
    | "union";
  element?: ValueType;
  tuple?: ValueType[];
  params?: ValueType[];
  result?: ValueType;
  name?: string;
  variants?: ValueType[];
};
export const unknown: ValueType = { kind: "unknown" },
  number: ValueType = { kind: "number" },
  string: ValueType = { kind: "string" },
  boolean: ValueType = { kind: "boolean" },
  column: ValueType = { kind: "column" };
export const array = (
  element: ValueType = unknown,
  tuple?: ValueType[],
): ValueType => ({ kind: "array", element, ...(tuple ? { tuple } : {}) });
export function typeLabel(t: ValueType): string {
  if (t.kind === "array") return `[${typeLabel(t.element ?? unknown)}]`;
  if (t.kind === "union") return t.variants!.map(typeLabel).join(" | ");
  if (t.kind === "function")
    return `(${t.params?.map(typeLabel).join(", ") ?? ""}) → ${typeLabel(t.result ?? unknown)}`;
  return (
    {
      number: "Number",
      string: "String",
      boolean: "Bool",
      null: "Null",
      unknown: "未知",
      column: "Column",
      component: t.name ?? "View",
    } as Record<string, string>
  )[t.kind];
}
export function union(types: ValueType[]): ValueType {
  const unique = [
    ...new Map(
      types
        .flatMap((t) => (t.kind === "union" ? t.variants! : [t]))
        .filter((t) => t.kind !== "unknown")
        .map((t) => [typeLabel(t), t]),
    ).values(),
  ];
  if (unique.length > 1 && unique.every((t) => t.kind === "array"))
    return array(union(unique.map((t) => t.element ?? unknown)));
  return !unique.length
    ? unknown
    : unique.length === 1
      ? unique[0]
      : { kind: "union", variants: unique };
}
export function compatible(actual: ValueType, expected: ValueType): boolean {
  if (expected.kind === "unknown" || actual.kind === "unknown") return true;
  if (actual.kind === "union")
    return actual.variants!.every((t) => compatible(t, expected));
  if (expected.kind === "union")
    return expected.variants!.some((t) => compatible(actual, t));
  return (
    actual.kind === expected.kind &&
    (actual.kind !== "array" ||
      compatible(actual.element ?? unknown, expected.element ?? unknown))
  );
}
export type ParameterSpec = {
  name: string;
  type: ValueType;
  named?: boolean;
  optional?: boolean;
  detail: string;
  enums?: readonly string[];
  snippet?: string;
  stringKind?: "asset" | "latex" | "format" | "color";
};
export type Signature = {
  name: string;
  detail: string;
  params: ParameterSpec[];
  snippet: string;
  category:
    "root" | "view" | "container" | "calculation" | "modifier" | "method";
  receivers?: string[];
  result: ValueType;
};
const p = (
  name: string,
  type: ValueType,
  detail: string,
  extra: Partial<ParameterSpec> = {},
): ParameterSpec => ({ name, type, detail, ...extra });
const named = (
  name: string,
  type: ValueType,
  detail: string,
  extra: Partial<ParameterSpec> = {},
) => p(name, type, detail, { named: true, optional: true, ...extra });
const color = (name: string, detail = "六位十六进制颜色") =>
  named(name, string, detail, { stringKind: "color", snippet: '"${#23786b}"' });
const ms = (name: string, detail: string) =>
  named(name, number, detail + "，单位毫秒");
const spacing = named("spacing", number, "子项间距，像素");
const enumParam = (
  name: string,
  values: readonly string[],
  detail: string,
  isNamed = true,
) =>
  p(name, string, detail, { named: isNamed, optional: isNamed, enums: values });
const tableParams = [
  named("header", boolean, "是否显示表头", { snippet: "${true}" }),
  named("rowHeight", number, "行高，像素"),
  named("zebra", boolean, "交替行底色", { snippet: "${true}" }),
  enumParam("borders", ["none", "horizontal", "all"], "无边框、横线或完整网格"),
  color("headerFill", "表头底色"),
  color("headerColor", "表头文字色"),
  color("stripeColor", "交替行底色"),
  color("borderColor", "边框颜色"),
  named("cellPadding", number, "单元格内边距，像素"),
];
export const signatures = new Map<string, Signature>();
function add(
  name: string,
  category: Signature["category"],
  detail: string,
  params: ParameterSpec[],
  snippet: string,
  result: ValueType = unknown,
  receivers?: string[],
) {
  signatures.set(name, {
    name,
    category,
    detail,
    params,
    snippet,
    result,
    receivers,
  });
}
add(
  "Deck",
  "root",
  "工程配置，与 Slide 并列书写",
  [
    p("名称", string, "工程名称"),
    named("author", string, "作者"),
    named("version", number, "工程格式版本，目前为 1"),
  ],
  'Deck("${名称}", author: "${作者}")',
);
add(
  "Theme",
  "root",
  "全局主题，预设可叠加自定义颜色、字体与材质",
  [
    enumParam("preset", [...themeIds], "内置主题"),
    color("accent"),
    color("background"),
    color("color"),
    named("font", string, "字体名称"),
    enumParam("material", ["glass", "solid"], "默认面板材质"),
  ],
  "Theme(preset: .${aurora})",
);
add(
  "Slide",
  "root",
  "页面，布局由子组件定义",
  [
    p("布局", string, "兼容旧版布局；推荐省略并添加布局组件", {
      optional: true,
      enums: layouts,
    }),
    ...["title", "subtitle", "eyebrow", "notes", "id"].map((name) =>
      named(
        name,
        string,
        (
          {
            title: "页标题",
            subtitle: "副标题",
            eyebrow: "引题",
            notes: "演讲备注",
            id: "页面标识",
          } as Record<string, string>
        )[name],
        { optional: name !== "title" },
      ),
    ),
  ],
  'Slide(title: "${标题}") {\n    ${}\n}',
);
for (const [preset, name] of Object.entries(layoutComponents))
  add(
    name,
    "container",
    "独立布局 · " + preset,
    [
      spacing,
      ...(name === "Cards" ? [named("columns", number, "列数，1–12")] : []),
    ],
    name + " {\n    ${}\n}",
  );
for (const name of ["HStack", "VStack", "ZStack", "Grid", "Glass"])
  add(
    name,
    "container",
    (
      {
        HStack: "水平布局",
        VStack: "垂直布局",
        ZStack: "叠层布局",
        Grid: "网格布局",
        Glass: "毛玻璃内容面板",
      } as Record<string, string>
    )[name],
    [
      ...(name === "Grid" ? [named("columns", number, "列数，1–12")] : []),
      spacing,
    ],
    name + " {\n    ${}\n}",
  );
for (const [name, description, field, type, template, kind] of [
  ["Text", "正文文字", "text", string, '"${正文}"', undefined],
  [
    "Bullets",
    "项目列表",
    "items",
    array(string),
    '["${要点一}", "${要点二}"]',
    undefined,
  ],
  ["Equation", "LaTeX 公式", "text", string, "`${E = mc^2}`", "latex"],
  ["Image", "工程内图片", "src", string, '"${assets/image.png}"', "asset"],
  ["Metric", "醒目指标", "value", string, '"${99.95%}"', undefined],
  ["Quote", "引用文字", "text", string, '"${引用}"', undefined],
  ["Code", "等宽代码块", "text", string, '"${代码}"', undefined],
] as const)
  add(
    name,
    "view",
    description,
    [
      p(field, type, description, { stringKind: kind }),
      named(field, type, description, { stringKind: kind }),
      named("title", string, "块标题"),
      ...(name === "Metric"
        ? [
            named("label", string, "指标说明"),
            named("text", string, "补充说明"),
          ]
        : []),
    ],
    `${name}(${template}${name === "Metric" ? ', label: "${可用性}"' : ""})`,
  );
add("Spacer", "view", "留白", [], "Spacer");
const cell: ValueType = union([number, string, boolean, { kind: "null" }]);
add(
  "Table",
  "view",
  "数据表格，支持 DSL 计算结果",
  [
    p("rows", array(array(cell)), "二维单元格数据", { optional: true }),
    named("rows", array(array(cell)), "二维数据，可使用计算结果"),
    named("columns", array(column), "Column 列定义数组"),
    named("headers", array(string), "表头文字数组"),
    ...tableParams,
  ],
  'Table(columns: [Column("${列一}")], rows: [[${1}]])',
);
add(
  "Column",
  "calculation",
  "列标题、宽度权重、对齐和数字格式",
  [
    p("标题", string, "列标题"),
    named("width", number, "正数宽度权重"),
    enumParam("align", ["left", "center", "right"], "单元格水平对齐"),
    named("format", string, "如 0.000 或 0.0%", { stringKind: "format" }),
  ],
  'Column("${标题}", width: ${1}, align: .${right}, format: "${0.00}")',
  column,
);
for (const name of ["Heading", "Caption", "Badge"]) {
  add(
    name,
    "view",
    (
      { Heading: "分级标题", Caption: "说明文字", Badge: "徽标" } as Record<
        string,
        string
      >
    )[name],
    [
      p("text", string, "文字"),
      named("text", string, "文字"),
      ...(name === "Heading" ? [named("level", number, "标题层级 1–4")] : []),
      ...(name === "Badge"
        ? [color("fill"), named("radius", number, "圆角")]
        : []),
    ],
    `${name}("\${内容}"${name === "Heading" ? ", level: 2" : ""})`,
  );
}
add(
  "Numbered",
  "view",
  "编号列表",
  [p("items", array(string), "条目"), named("items", array(string), "条目")],
  'Numbered(["\${第一步}", "\${第二步}"])',
);
for (const name of ["Rectangle", "Circle"])
  add(
    name,
    "view",
    name === "Circle" ? "圆形" : "矩形",
    [
      color("fill"),
      ...(name === "Rectangle" ? [named("radius", number, "圆角")] : []),
    ],
    `${name}(fill: "\${#23796e}").frame(width: 100, height: 100)`,
  );
add(
  "Divider",
  "view",
  "分隔线",
  [
    enumParam("direction", ["horizontal", "vertical"], "方向"),
    named("thickness", number, "线宽 0–100"),
  ],
  "Divider(thickness: \${2})",
);
add(
  "Progress",
  "view",
  "进度条",
  [
    p("value", number, "进度 0–1"),
    named("value", number, "进度 0–1"),
    named("label", string, "说明"),
    named("showValue", boolean, "显示百分比"),
    color("fill"),
  ],
  'Progress(\${0.75}, label: "\${完成度}")',
);
for (const name of ["Columns", "Rows"])
  add(
    name,
    "container",
    "按权重分配空间",
    [
      spacing,
      named("weights", array(number), "每个内容的正数权重"),
      enumParam(
        "alignment",
        name === "Columns"
          ? ["top", "center", "bottom"]
          : ["leading", "center", "trailing"],
        "交叉轴对齐",
      ),
    ],
    `${name}(weights: [1, 2], spacing: 24) {\n    \${}\n}`,
  );
add(
  "Panel",
  "container",
  "实色面板",
  [color("fill"), named("radius", number, "圆角")],
  "Panel {\n    \${}\n}",
);
add("Content", "container", "函数中放置所有剩余传入内容", [], "Content()");
add(
  "Slot",
  "container",
  "函数中放置指定序号内容",
  [p("index", number, "从 0 开始的内容序号")],
  "Slot(\${0})",
);

for (const [name, label] of Object.entries(mathEnvironments))
  add(
    name,
    "container",
    label + "环境；普通 Slide 内自动续页",
    [
      p("title", string, "环境标题", { optional: true }),
      named("title", string, "环境标题"),
      named("text", string, "正文，支持行内公式"),
      named("number", union([string, number]), "自定义编号"),
      named("numbered", boolean, "是否编号"),
      named("reason", string, "推理依据"),
      named("qed", boolean, "Proof 结束时显示证毕符号"),
      named("keepTogether", boolean, "保持整个环境在同一栏"),
      spacing,
    ],
    name + '("${标题}") {\n    Text(`${正文}`)\n}',
  );
for (const name of ["LeftColumn", "RightColumn"])
  add(
    name,
    "container",
    "自动双栏的独立内容流",
    [named("repeat", boolean, "在续页重复此栏")],
    name + " {\n    ${}\n}",
  );
for (const name of ["PageBreak", "ColumnBreak"])
  add(
    name,
    "view",
    name === "PageBreak" ? "手动开始下一页" : "手动开始下一栏",
    [],
    name + "()",
  );
add(
  "DynamicSlide",
  "root",
  "按内容高度自动续页，支持单栏和双栏",
  [
    ...["title", "subtitle", "eyebrow", "notes", "id"].map((n) =>
      named(n, string, "页面" + n),
    ),
    named("columns", number, "1 或 2 栏"),
    spacing,
    named("fontSize", number, "正文默认字号，16–40"),
    named("maxPages", number, "最多生成页数，1–200"),
  ],
  'DynamicSlide(title: "${证明}", columns: 2) {\n    LeftColumn(repeat: true) { Theorem("${结论}") { Text(`${命题}`) } }\n    RightColumn { Proof { ProofStep("${第一步}") { Text(`${推理}`) } } }\n}',
);
signatures
  .get("Numbered")!
  .params.push(named("start", number, "起始编号，默认 1"));
const slideSpec = signatures.get("Slide")!;
slideSpec.params.push(
  spacing,
  named("autoPages", boolean, "数学环境默认自动续页，false 使用手动排版"),
  named("columns", number, "自动续页栏数，1 或 2"),
  named("fontSize", number, "自动续页默认字号"),
  named("maxPages", number, "最大续页数"),
);
const views = [...signatures.values()]
  .filter(
    (s) =>
      ["view", "container"].includes(s.category) &&
      !["Content", "Slot"].includes(s.name),
  )
  .map((s) => s.name);
add(
  "transition",
  "modifier",
  "页面过渡",
  [
    enumParam("effect", ["fade", "slide", "zoom", "none"], "过渡效果", false),
    ms("duration", "持续时间"),
    enumParam("direction", ["left", "right", "up", "down"], "移动方向"),
    enumParam("easing", easings, "缓动曲线"),
  ],
  "transition(.${slide}, duration: ${650}, direction: .${left}, easing: .${easeOut})",
  unknown,
  ["Deck", "Slide", "DynamicSlide"],
);
add(
  "appear",
  "modifier",
  "入场编排",
  [
    enumParam("effect", effects, "入场效果", false),
    named("step", number, "点击阶段，0 为进入页面时，1–30 为点击阶段"),
    named("order", number, "同一点击阶段内的顺序，相同值并行"),
    ms("delay", "启动延迟"),
    ms("duration", "持续时间"),
    enumParam("easing", easings, "缓动曲线"),
  ],
  "appear(.${rise}, step: ${1}, order: ${0}, delay: ${0}, duration: ${600}, easing: .${easeOut})",
  unknown,
  views,
);
for (const [name, type, detail, snippet] of [
  ["font", number, "文字大小，像素", "font(${24})"],
  ["foreground", string, "文字颜色", 'foreground("${#16766d}")'],
  ["background", string, "背景颜色", 'background("${#eef2ef}")'],
  ["padding", number, "内边距，像素", "padding(${24})"],
  ["title", string, "块标题", 'title("${标题}")'],
  ["notes", string, "页面演讲备注", 'notes("${演讲思路}")'],
  ["step", number, "点击阶段，0–30", "step(${1})"],
  ["stagger", number, "子项交错间隔，毫秒", "stagger(${120})"],
] as const)
  add(
    name,
    "modifier",
    detail,
    [
      p("value", type, detail, {
        stringKind: ["foreground", "background"].includes(name)
          ? "color"
          : undefined,
      }),
    ],
    snippet,
    unknown,
    name === "notes"
      ? ["Slide", "DynamicSlide"]
      : name === "stagger"
        ? [
            "Bullets",
            "Table",
            ...views.filter((v) => signatures.get(v)?.category === "container"),
          ]
        : ["foreground", "background"].includes(name)
          ? ["Slide", "DynamicSlide", ...views]
          : views,
  );
add(
  "frame",
  "modifier",
  "布局尺寸，像素；位置使用 position，缩放使用 scale",
  ["width", "height"].map((n) =>
    named(
      n,
      number,
      (
        { x: "横坐标", y: "纵坐标", width: "宽度", height: "高度" } as Record<
          string,
          string
        >
      )[n],
    ),
  ),
  "frame(width: ${480}, height: ${320})",
  unknown,
  views,
);
add(
  "position",
  "modifier",
  "参考点与自身锚点分开；x 向右，y 向上，默认父内容区左下角",
  [
    named("x", number, "向右偏移，可为负数"),
    named("y", number, "向上偏移，可为负数"),
    enumParam("reference", positionAnchors, "参考区域上的点，默认 bottomLeft"),
    enumParam(
      "anchor",
      positionAnchors,
      "元素自身的锚点，默认与 reference 一致",
    ),
    enumParam(
      "relativeTo",
      positionReferences,
      "参考父内容区或整个画布，默认 parent",
    ),
  ],
  "position(x: ${24}, y: ${24}, reference: .${bottomLeft}, anchor: .${bottomLeft})",
  unknown,
  views,
);
add(
  "scale",
  "modifier",
  "呈现缩放系数，大于 0 且不超过 10；不改变布局占位",
  [p("factor", number, "统一缩放系数")],
  "scale(${1.2})",
  unknown,
  views,
);

add(
  "glass",
  "modifier",
  "毛玻璃材质",
  [
    named("blur", number, "模糊半径，0–80"),
    named("opacity", number, "透明度，0–1"),
    named("radius", number, "圆角，0–100"),
  ],
  "glass(blur: ${24}, opacity: ${0.68}, radius: ${28})",
  unknown,
  views,
);
add(
  "tableStyle",
  "modifier",
  "表格样式",
  tableParams,
  'tableStyle(zebra: ${true}, borders: .${horizontal}, headerFill: "${#23796e}")',
  unknown,
  ["Table"],
);
const specs: Record<string, [ParameterSpec[], ValueType, string, string?]> = {
  range: [
    [
      p("start", number, "起点；只给一个参数时它表示终点"),
      p("end", number, "终点，不包含", { optional: true }),
      p("step", number, "非零步长，默认 1", { optional: true }),
    ],
    array(number),
    "数列，最多 2000 项",
    "range(${0}, ${6})",
  ],
  repeat: [
    [p("value", unknown, "重复的值"), p("count", number, "次数，0–2000")],
    array(),
    "重复生成数组",
    "repeat(${0}, ${5})",
  ],
  pow: [
    [p("x", number, "底数"), p("power", number, "指数")],
    number,
    "乘方",
    "pow(${x}, ${2})",
  ],
  round: [
    [
      p("x", number, "数值"),
      p("digits", number, "小数位数，0–10", { optional: true }),
    ],
    number,
    "四舍五入",
    "round(${x}, ${2})",
  ],
  fixed: [
    [
      p("x", number, "数值"),
      p("digits", number, "小数位数，0–10", { optional: true }),
    ],
    string,
    "固定小数位文本",
    "fixed(${x}, ${3})",
  ],
  percent: [
    [
      p("x", number, "数值，1 表示 100%"),
      p("digits", number, "小数位数，0–10", { optional: true }),
    ],
    string,
    "百分比文本",
    "percent(${x}, ${1})",
  ],
  format: [
    [
      p("x", number, "数值"),
      p("pattern", string, "数字显示格式", { stringKind: "format" }),
    ],
    string,
    "格式化数值",
    'format(${x}, "${0.000}")',
  ],
  clamp: [
    [
      p("x", number, "数值"),
      p("min", number, "下限"),
      p("max", number, "上限"),
    ],
    number,
    "限制数值范围",
    "clamp(${x}, ${0}, ${1})",
  ],
  str: [[p("value", cell, "需要转换的标量")], string, "标量转换为文本"],
  len: [
    [p("value", union([array(), string]), "数组或文本")],
    number,
    "数组或文本长度",
  ],
  concat: [[p("arrays", array(), "一个或多个数组")], array(), "合并数组"],
  zip: [
    [p("a", array(), "第一个数组"), p("b", array(), "第二个及后续数组")],
    array(array()),
    "按最短长度组合各数组",
  ],
  transpose: [
    [p("rows", array(array()), "等长的二维数组")],
    array(array()),
    "转置矩阵",
  ],
  row: [[p("values", cell, "0–20 个单元格")], array(cell), "创建一行数据"],
};
for (const name of ["sum", "mean", "min", "max"])
  specs[name] = [
    [p("values", union([array(number), number]), "数值数组或多个数值")],
    number,
    (
      { sum: "求和", mean: "平均值", min: "最小值", max: "最大值" } as Record<
        string,
        string
      >
    )[name],
  ];
for (const name of [
  "sqrt",
  "sin",
  "cos",
  "tan",
  "exp",
  "log",
  "log10",
  "abs",
  "floor",
  "ceil",
])
  specs[name] = [
    [p("x", number, "有限数值；三角函数使用弧度")],
    number,
    "数学函数",
  ];
for (const [name, [params, result, detail, snippet]] of Object.entries(specs))
  add(
    name,
    "calculation",
    detail,
    params,
    snippet ?? `${name}(\u0024{value})`,
    result,
  );
add(
  "map",
  "method",
  "逐项映射，可选第二个回调参数为下标",
  [p("transform", { kind: "function" }, "(item, index) => 新值")],
  "map(${x} => ${x})",
  array(),
);
add(
  "filter",
  "method",
  "按布尔条件筛选",
  [p("predicate", { kind: "function" }, "(item, index) => Bool")],
  "filter(${x} => ${x} > 0)",
  array(),
);
add(
  "reduce",
  "method",
  "归约为一个值",
  [
    p("combine", { kind: "function" }, "(acc, item, index) => 新累计值"),
    p("initial", unknown, "初始累计值"),
  ],
  "reduce((${acc}, ${x}) => ${acc} + ${x}, ${0})",
);

export function signatureText(s: Signature) {
  return `${s.name}(${s.params.map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.enums ? p.enums.map((v) => "." + v).join(" | ") : typeLabel(p.type)}`).join(", ")})`;
}
