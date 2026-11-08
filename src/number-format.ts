export type Cell = string | number | boolean | null;
export function validFormat(pattern: string): boolean {
  return (
    /^(?:0(?:\.[0]{1,10})?%?|\.[0-9]{1,2}[f%])$/.test(pattern) &&
    (!pattern.startsWith(".") || Number(pattern.slice(1, -1)) <= 10)
  );
}
export function formatCell(value: Cell, pattern?: string): string {
  if (value === null) return "—";
  if (typeof value !== "number" || !pattern) return String(value);
  if (!validFormat(pattern))
    throw Error(`未知数字格式 ${pattern}；可用 0、0.000、0.0% 或 .2f`);
  const percent = pattern.endsWith("%"),
    digits = pattern.startsWith(".")
      ? Number(pattern.slice(1, -1))
      : (pattern.match(/\.(0+)/)?.[1].length ?? 0);
  return (value * (percent ? 100 : 1)).toFixed(digits) + (percent ? "%" : "");
}
