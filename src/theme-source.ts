import { readSyntax } from "./syntax";
import type { ThemeOptions } from "./themes";
/** Change only the Theme call. Keep all expressions, whitespace and comments elsewhere verbatim. */
export function replaceTheme(source: string, theme: ThemeOptions): string {
  const root = readSyntax(source);
  const declaration =
    "Theme(" +
    Object.entries(theme)
      .filter(([, value]) => value !== undefined)
      .map(
        ([key, value]) =>
          `${key}: ${key === "preset" || key === "material" ? "." + value : JSON.stringify(value)}`,
      )
      .join(", ") +
    ")";
  const current = root.children.find((c) => c.name === "Theme");
  if (current)
    return (
      source.slice(0, current.from) + declaration + source.slice(current.to)
    );
  const first = root.children[0];
  if (!first) throw Error("工程中至少需要一页幻灯片");
  const indent =
    source
      .slice(source.lastIndexOf("\n", first.from - 1) + 1, first.from)
      .match(/^\s*/)?.[0] || "";
  return (
    source.slice(0, first.from) +
    declaration +
    "\n" +
    indent +
    source.slice(first.from)
  );
}
