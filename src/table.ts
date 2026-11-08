import { formatCell, validFormat, type Cell } from "./number-format";
export type ColumnSpec = {
  label: string;
  width?: number;
  align?: "left" | "center" | "right";
  format?: string;
};
export type TableOptions = {
  columns?: ColumnSpec[];
  headers?: string[];
  header?: boolean;
  rowHeight?: number;
  zebra?: boolean;
  borders?: "none" | "horizontal" | "all";
  headerFill?: string;
  headerColor?: string;
  stripeColor?: string;
  borderColor?: string;
  cellPadding?: number;
};
export const tableKeys = [
  "columns",
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
];
export function validateTable(rows: unknown, opts: TableOptions = {}): void {
  if (
    !Array.isArray(rows) ||
    rows.length > 100 ||
    rows.some(
      (r) =>
        !Array.isArray(r) ||
        r.length > 20 ||
        r.some(
          (v) =>
            (v !== null &&
              !["string", "number", "boolean"].includes(typeof v)) ||
            (typeof v === "number" && !Number.isFinite(v)),
        ),
    )
  )
    throw Error("Table rows 需要二维标量数组，每张表最多 100 行、20 列");
  if (opts.columns !== undefined) {
    if (!Array.isArray(opts.columns) || opts.columns.length > 20)
      throw Error("Table columns 需要 Column 数组，最多 20 列");
    for (const c of opts.columns) {
      if (!c || typeof c.label !== "string")
        throw Error('每列使用 Column("标题", ...) 定义');
      if (c.width !== undefined && (!Number.isFinite(c.width) || c.width <= 0))
        throw Error("列宽权重必须大于 0");
      if (
        c.align !== undefined &&
        !["left", "center", "right"].includes(c.align)
      )
        throw Error("列对齐使用 .left / .center / .right");
      if (c.format !== undefined && !validFormat(c.format))
        throw Error("列格式支持 0、0.000、0.0% 或 .2f");
    }
  }
  if (
    opts.headers !== undefined &&
    (!Array.isArray(opts.headers) ||
      opts.headers.length > 20 ||
      opts.headers.some((v) => typeof v !== "string"))
  )
    throw Error("headers 必须是最多 20 项的文字数组");
  for (const key of ["header", "zebra"] as const)
    if (opts[key] !== undefined && typeof opts[key] !== "boolean")
      throw Error(`${key} 需要 true 或 false`);
  if (
    opts.rowHeight !== undefined &&
    (!Number.isFinite(opts.rowHeight) ||
      opts.rowHeight < 24 ||
      opts.rowHeight > 120)
  )
    throw Error("rowHeight 范围 24–120 像素");
  if (
    opts.cellPadding !== undefined &&
    (!Number.isFinite(opts.cellPadding) ||
      opts.cellPadding < 0 ||
      opts.cellPadding > 40)
  )
    throw Error("cellPadding 范围 0–40 像素");
  if (
    opts.borders !== undefined &&
    !["none", "horizontal", "all"].includes(opts.borders)
  )
    throw Error("borders 使用 .none / .horizontal / .all");
  for (const k of [
    "headerFill",
    "headerColor",
    "stripeColor",
    "borderColor",
  ] as const)
    if (opts[k] !== undefined && !/^#[0-9a-f]{6}$/i.test(opts[k]!))
      throw Error(`${k} 颜色使用 #RRGGBB`);
}
export function tableModel(rows: Cell[][], options: TableOptions = {}) {
  let data = rows,
    headers: string[] | undefined;
  if (options.header !== false) {
    if (options.columns) headers = options.columns.map((c) => c.label);
    else if (options.headers) headers = options.headers;
    else if (rows.length) {
      headers = rows[0].map((v) => formatCell(v));
      data = rows.slice(1);
    }
  }
  const count = Math.max(
    headers?.length || 0,
    options.columns?.length || 0,
    ...data.map((r) => r.length),
    1,
  );
  const columns = Array.from(
    { length: count },
    (_, i) =>
      options.columns?.[i] || {
        label: headers?.[i] || "",
        width: 1,
        align: "left" as const,
      },
  );
  const weight = columns.reduce((sum, c) => sum + (c.width ?? 1), 0);
  return {
    columns,
    widths: columns.map((c) => (c.width ?? 1) / weight),
    rows: [
      ...(headers
        ? [
            {
              header: true,
              cells: Array.from({ length: count }, (_, i) => headers![i] || ""),
            },
          ]
        : []),
      ...data.map((r) => ({
        header: false,
        cells: Array.from({ length: count }, (_, i) =>
          formatCell(r[i] ?? null, columns[i].format),
        ),
      })),
    ],
  };
}
