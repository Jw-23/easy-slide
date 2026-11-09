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
      unknown: "Unknown",
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
const color = (name: string, detail = "Six-digit hexadecimal color") =>
  named(name, string, detail, { stringKind: "color", snippet: '"${#23786b}"' });
const ms = (name: string, detail: string) =>
  named(name, number, detail + ", in milliseconds");
const spacing = named("spacing", number, "Child spacing in pixels");
const enumParam = (
  name: string,
  values: readonly string[],
  detail: string,
  isNamed = true,
) =>
  p(name, string, detail, { named: isNamed, optional: isNamed, enums: values });
const tableParams = [
  named("header", boolean, "Show the header row", { snippet: "${true}" }),
  named("rowHeight", number, "Row height in pixels"),
  named("zebra", boolean, "Alternating row fill", { snippet: "${true}" }),
  enumParam(
    "borders",
    ["none", "horizontal", "all"],
    "No borders, horizontal lines, or full grid",
  ),
  color("headerFill", "Header fill"),
  color("headerColor", "Header text color"),
  color("stripeColor", "Alternating row fill"),
  color("borderColor", "Border color"),
  named("cellPadding", number, "Cell padding in pixels"),
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
  "Document settings, declared alongside Slide",
  [
    p("Name", string, "Document title"),
    named("author", string, "Author"),
    named("version", number, "Document format version, currently 1"),
  ],
  'Deck("${Name}", author: "${Author}")',
);
add(
  "Theme",
  "root",
  "Global theme with optional color, font, and material overrides",
  [
    enumParam("preset", [...themeIds], "Built-in theme preset"),
    color("accent"),
    color("background"),
    color("color"),
    named("font", string, "Font family"),
    enumParam("material", ["glass", "solid"], "Default panel material"),
  ],
  "Theme(preset: .${aurora})",
);
add(
  "Slide",
  "root",
  "Slide with layout defined by child components",
  [
    p("Layout", string, "Legacy layout; prefer dedicated layout components", {
      optional: true,
      enums: layouts,
    }),
    ...["title", "subtitle", "eyebrow", "notes", "id"].map((name) =>
      named(
        name,
        string,
        (
          {
            title: "Slide title",
            subtitle: "Subtitle",
            eyebrow: "Eyebrow",
            notes: "Speaker notes",
            id: "Slide identifier",
          } as Record<string, string>
        )[name],
        { optional: name !== "title" },
      ),
    ),
  ],
  'Slide(title: "${Title}") {\n    ${}\n}',
);
for (const [preset, name] of Object.entries(layoutComponents))
  add(
    name,
    "container",
    "Layout component: " + preset,
    [
      spacing,
      ...(name === "Cards"
        ? [named("columns", number, "Column count, 1–12")]
        : []),
    ],
    name + " {\n    ${}\n}",
  );
for (const name of ["HStack", "VStack", "ZStack", "Grid", "Glass"])
  add(
    name,
    "container",
    (
      {
        HStack: "Horizontal stack",
        VStack: "Vertical stack",
        ZStack: "Layered stack",
        Grid: "Grid layout",
        Glass: "Frosted glass panel",
      } as Record<string, string>
    )[name],
    [
      ...(name === "Grid"
        ? [named("columns", number, "Column count, 1–12")]
        : []),
      spacing,
    ],
    name + " {\n    ${}\n}",
  );
for (const [name, description, field, type, template, kind] of [
  ["Text", "Body text", "text", string, '"${Body}"', undefined],
  [
    "Bullets",
    "Bulleted list",
    "items",
    array(string),
    '["${First point}", "${Second point}"]',
    undefined,
  ],
  ["Equation", "LaTeX equation", "text", string, "`${E = mc^2}`", "latex"],
  ["Image", "Project image", "src", string, '"${assets/image.png}"', "asset"],
  ["Metric", "Key metric", "value", string, '"${99.95%}"', undefined],
  ["Quote", "Quotation", "text", string, '"${Quote}"', undefined],
  ["Code", "Monospaced code block", "text", string, '"${Code}"', undefined],
] as const)
  add(
    name,
    "view",
    description,
    [
      p(field, type, description, { stringKind: kind }),
      named(field, type, description, { stringKind: kind }),
      named("title", string, "Block title"),
      ...(name === "Metric"
        ? [
            named("label", string, "Metric label"),
            named("text", string, "Additional description"),
          ]
        : []),
    ],
    `${name}(${template}${name === "Metric" ? ', label: "${Availability}"' : ""})`,
  );
add("Spacer", "view", "Flexible space", [], "Spacer");
const cell: ValueType = union([number, string, boolean, { kind: "null" }]);
add(
  "Table",
  "view",
  "Data table supporting computed DSL values",
  [
    p("rows", array(array(cell)), "Two-dimensional cell data", {
      optional: true,
    }),
    named(
      "rows",
      array(array(cell)),
      "Two-dimensional data, including computed values",
    ),
    named("columns", array(column), "Array of Column definitions"),
    named("headers", array(string), "Header labels"),
    ...tableParams,
  ],
  'Table(columns: [Column("${Column 1}")], rows: [[${1}]])',
);
add(
  "Column",
  "calculation",
  "Column label, width weight, alignment, and number format",
  [
    p("Title", string, "Column label"),
    named("width", number, "Positive width weight"),
    enumParam(
      "align",
      ["left", "center", "right"],
      "Horizontal cell alignment",
    ),
    named("format", string, "For example, 0.000 or 0.0%", {
      stringKind: "format",
    }),
  ],
  'Column("${Title}", width: ${1}, align: .${right}, format: "${0.00}")',
  column,
);
for (const name of ["Heading", "Caption", "Badge"]) {
  add(
    name,
    "view",
    (
      { Heading: "Heading", Caption: "Caption", Badge: "Badge" } as Record<
        string,
        string
      >
    )[name],
    [
      p("text", string, "Text"),
      named("text", string, "Text"),
      ...(name === "Heading"
        ? [named("level", number, "Heading level, 1–4")]
        : []),
      ...(name === "Badge"
        ? [color("fill"), named("radius", number, "Corner radius")]
        : []),
    ],
    `${name}("\${Content}"${name === "Heading" ? ", level: 2" : ""})`,
  );
}
add(
  "Numbered",
  "view",
  "Numbered list",
  [p("items", array(string), "Items"), named("items", array(string), "Items")],
  'Numbered(["\${First step}", "\${Second step}"])',
);
for (const name of ["Rectangle", "Circle"])
  add(
    name,
    "view",
    name === "Circle" ? "Circle" : "Rectangle",
    [
      color("fill"),
      ...(name === "Rectangle"
        ? [named("radius", number, "Corner radius")]
        : []),
    ],
    `${name}(fill: "\${#23796e}").frame(width: 100, height: 100)`,
  );
add(
  "Divider",
  "view",
  "Divider",
  [
    enumParam("direction", ["horizontal", "vertical"], "Direction"),
    named("thickness", number, "Line thickness, 0–100"),
  ],
  "Divider(thickness: \${2})",
);
add(
  "Progress",
  "view",
  "Progress bar",
  [
    p("value", number, "Progress, 0–1"),
    named("value", number, "Progress, 0–1"),
    named("label", string, "Description"),
    named("showValue", boolean, "Show percentage"),
    color("fill"),
  ],
  'Progress(\${0.75}, label: "\${Completion}")',
);
for (const name of ["Columns", "Rows"])
  add(
    name,
    "container",
    "Distribute space by weight",
    [
      spacing,
      named("weights", array(number), "Positive weight for each child"),
      enumParam(
        "alignment",
        name === "Columns"
          ? ["top", "center", "bottom"]
          : ["leading", "center", "trailing"],
        "Cross-axis alignment",
      ),
    ],
    `${name}(weights: [1, 2], spacing: 24) {\n    \${}\n}`,
  );
add(
  "Panel",
  "container",
  "Solid panel",
  [color("fill"), named("radius", number, "Corner radius")],
  "Panel {\n    \${}\n}",
);
add(
  "Content",
  "container",
  "Insert all remaining supplied content",
  [],
  "Content()",
);
add(
  "Slot",
  "container",
  "Insert supplied content at the given index",
  [p("index", number, "Zero-based content index")],
  "Slot(\${0})",
);

for (const name of Object.keys(mathEnvironments))
  add(
    name,
    "container",
    name + " environment; automatically continues within a regular Slide",
    [
      p("title", string, "Environment title", { optional: true }),
      named("title", string, "Environment title"),
      named("text", string, "Body text with inline math support"),
      named("number", union([string, number]), "Custom number"),
      named("numbered", boolean, "Enable numbering"),
      named("reason", string, "Reasoning justification"),
      named("qed", boolean, "Show the QED symbol at the end of Proof"),
      named(
        "keepTogether",
        boolean,
        "Keep the entire environment in one column",
      ),
      spacing,
    ],
    name + '("${Title}") {\n    Text(`${Body}`)\n}',
  );
for (const name of ["LeftColumn", "RightColumn"])
  add(
    name,
    "container",
    "Independent content flow in a two-column slide",
    [named("repeat", boolean, "Repeat this column on continuation slides")],
    name + " {\n    ${}\n}",
  );
for (const name of ["PageBreak", "ColumnBreak"])
  add(
    name,
    "view",
    name === "PageBreak" ? "Start a new page" : "Start a new column",
    [],
    name + "()",
  );
add(
  "DynamicSlide",
  "root",
  "Automatically paginate content into one or two columns",
  [
    ...["title", "subtitle", "eyebrow", "notes", "id"].map((n) =>
      named(n, string, "Slide " + n),
    ),
    named("columns", number, "One or two columns"),
    spacing,
    named("fontSize", number, "Default body font size, 16–40"),
    named("maxPages", number, "Maximum generated pages, 1–200"),
  ],
  'DynamicSlide(title: "${Proof}", columns: 2) {\n    LeftColumn(repeat: true) { Theorem("${Conclusion}") { Text(`${Statement}`) } }\n    RightColumn { Proof { ProofStep("${First step}") { Text(`${Reasoning}`) } } }\n}',
);
signatures
  .get("Numbered")!
  .params.push(named("start", number, "Starting number, defaults to 1"));
const slideSpec = signatures.get("Slide")!;
slideSpec.params.push(
  spacing,
  named(
    "autoPages",
    boolean,
    "Math environments paginate automatically; false enables manual layout",
  ),
  named("columns", number, "Automatic flow column count, 1 or 2"),
  named("fontSize", number, "Default font size for automatic flow"),
  named("maxPages", number, "Maximum page count"),
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
  "Slide transition",
  [
    enumParam(
      "effect",
      ["fade", "slide", "zoom", "none"],
      "Transition effect",
      false,
    ),
    ms("duration", "Duration"),
    enumParam(
      "direction",
      ["left", "right", "up", "down"],
      "Movement direction",
    ),
    enumParam("easing", easings, "Easing curve"),
  ],
  "transition(.${slide}, duration: ${650}, direction: .${left}, easing: .${easeOut})",
  unknown,
  ["Deck", "Slide", "DynamicSlide"],
);
add(
  "appear",
  "modifier",
  "Entrance animation",
  [
    enumParam("effect", effects, "Entrance effect", false),
    named("step", number, "Animation step: 0 on slide entry, 1–30 on clicks"),
    named(
      "order",
      number,
      "Order within a click step; equal values run in parallel",
    ),
    ms("delay", "Start delay"),
    ms("duration", "Duration"),
    enumParam("easing", easings, "Easing curve"),
  ],
  "appear(.${rise}, step: ${1}, order: ${0}, delay: ${0}, duration: ${600}, easing: .${easeOut})",
  unknown,
  views,
);
for (const [name, type, detail, snippet] of [
  ["font", number, "Font size in pixels", "font(${24})"],
  ["foreground", string, "Text color", 'foreground("${#16766d}")'],
  ["background", string, "Background color", 'background("${#eef2ef}")'],
  ["padding", number, "Padding in pixels", "padding(${24})"],
  ["title", string, "Block title", 'title("${Title}")'],
  ["notes", string, "Slide speaker notes", 'notes("${Speaker notes}")'],
  ["step", number, "Click step, 0–30", "step(${1})"],
  [
    "stagger",
    number,
    "Child stagger interval in milliseconds",
    "stagger(${120})",
  ],
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
  "Layout size in pixels; use position for placement and scale for visual scaling",
  ["width", "height"].map((n) =>
    named(
      n,
      number,
      (
        {
          x: "X coordinate",
          y: "Y coordinate",
          width: "Width",
          height: "Height",
        } as Record<string, string>
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
  "Separate reference point and element anchor; x points right, y up; defaults to the parent bottom-left",
  [
    named("x", number, "Rightward offset; may be negative"),
    named("y", number, "Upward offset; may be negative"),
    enumParam(
      "reference",
      positionAnchors,
      "Point on the reference area; defaults to bottomLeft",
    ),
    enumParam(
      "anchor",
      positionAnchors,
      "Element anchor; defaults to reference",
    ),
    enumParam(
      "relativeTo",
      positionReferences,
      "Reference the parent content area or slide; defaults to parent",
    ),
  ],
  "position(x: ${24}, y: ${24}, reference: .${bottomLeft}, anchor: .${bottomLeft})",
  unknown,
  views,
);
add(
  "scale",
  "modifier",
  "Visual scale factor, greater than 0 and at most 10; does not change layout size",
  [p("factor", number, "Uniform scale factor")],
  "scale(${1.2})",
  unknown,
  views,
);

add(
  "glass",
  "modifier",
  "Frosted glass material",
  [
    named("blur", number, "Blur radius, 0–80"),
    named("opacity", number, "Opacity, 0–1"),
    named("radius", number, "Corner radius, 0–100"),
  ],
  "glass(blur: ${24}, opacity: ${0.68}, radius: ${28})",
  unknown,
  views,
);
add(
  "tableStyle",
  "modifier",
  "Table style",
  tableParams,
  'tableStyle(zebra: ${true}, borders: .${horizontal}, headerFill: "${#23796e}")',
  unknown,
  ["Table"],
);
const specs: Record<string, [ParameterSpec[], ValueType, string, string?]> = {
  range: [
    [
      p("start", number, "Start; a single argument specifies the end"),
      p("end", number, "Exclusive end", { optional: true }),
      p("step", number, "Nonzero step, defaults to 1", { optional: true }),
    ],
    array(number),
    "Numeric sequence, up to 2000 items",
    "range(${0}, ${6})",
  ],
  repeat: [
    [
      p("value", unknown, "Value to repeat"),
      p("count", number, "Count, 0–2000"),
    ],
    array(),
    "Create an array of repeated values",
    "repeat(${0}, ${5})",
  ],
  pow: [
    [p("x", number, "Base"), p("power", number, "Exponent")],
    number,
    "Exponentiation",
    "pow(${x}, ${2})",
  ],
  round: [
    [
      p("x", number, "Numeric value"),
      p("digits", number, "Decimal places, 0–10", { optional: true }),
    ],
    number,
    "Round to decimal places",
    "round(${x}, ${2})",
  ],
  fixed: [
    [
      p("x", number, "Numeric value"),
      p("digits", number, "Decimal places, 0–10", { optional: true }),
    ],
    string,
    "Fixed-decimal text",
    "fixed(${x}, ${3})",
  ],
  percent: [
    [
      p("x", number, "Numeric value; 1 represents 100%"),
      p("digits", number, "Decimal places, 0–10", { optional: true }),
    ],
    string,
    "Percentage text",
    "percent(${x}, ${1})",
  ],
  format: [
    [
      p("x", number, "Numeric value"),
      p("pattern", string, "Number format pattern", { stringKind: "format" }),
    ],
    string,
    "Format a number",
    'format(${x}, "${0.000}")',
  ],
  clamp: [
    [
      p("x", number, "Numeric value"),
      p("min", number, "Lower bound"),
      p("max", number, "Upper bound"),
    ],
    number,
    "Clamp a number to a range",
    "clamp(${x}, ${0}, ${1})",
  ],
  str: [
    [p("value", cell, "Scalar value to convert")],
    string,
    "Convert a scalar to text",
  ],
  len: [
    [p("value", union([array(), string]), "Array or string")],
    number,
    "Array or string length",
  ],
  concat: [
    [p("arrays", array(), "One or more arrays")],
    array(),
    "Concatenate arrays",
  ],
  zip: [
    [
      p("a", array(), "First array"),
      p("b", array(), "Second and subsequent arrays"),
    ],
    array(array()),
    "Zip arrays to the shortest length",
  ],
  transpose: [
    [p("rows", array(array()), "Two-dimensional array with equal-length rows")],
    array(array()),
    "Transpose a matrix",
  ],
  row: [[p("values", cell, "0–20 cells")], array(cell), "Create a data row"],
};
for (const name of ["sum", "mean", "min", "max"])
  specs[name] = [
    [
      p(
        "values",
        union([array(number), number]),
        "Numeric array or multiple numeric values",
      ),
    ],
    number,
    (
      { sum: "Sum", mean: "Mean", min: "Minimum", max: "Maximum" } as Record<
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
    [p("x", number, "Finite number; trigonometric functions use radians")],
    number,
    "Math function",
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
  "Map each item; optional second callback parameter is the index",
  [p("transform", { kind: "function" }, "(item, index) => newValue")],
  "map(${x} => ${x})",
  array(),
);
add(
  "filter",
  "method",
  "Filter by a boolean condition",
  [p("predicate", { kind: "function" }, "(item, index) => Bool")],
  "filter(${x} => ${x} > 0)",
  array(),
);
add(
  "reduce",
  "method",
  "Reduce to a single value",
  [
    p("combine", { kind: "function" }, "(acc, item, index) => newAccumulator"),
    p("initial", unknown, "Initial accumulator"),
  ],
  "reduce((${acc}, ${x}) => ${acc} + ${x}, ${0})",
);

export function signatureText(s: Signature) {
  return `${s.name}(${s.params.map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.enums ? p.enums.map((v) => "." + v).join(" | ") : typeLabel(p.type)}`).join(", ")})`;
}
