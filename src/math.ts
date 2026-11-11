import { closest } from "./diagnostics";
import { latexCommands } from "./latex-commands";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document("", {
  InputJax: new TeX({
    packages: AllPackages.filter(
      (p) =>
        !["require", "autoload", "html", "noerrors", "noundefined"].includes(p),
    ),
  }),
  OutputJax: new SVG({ fontCache: "none" }),
});
export type MathAsset = {
  data: string;
  widthEm: number;
  heightEm: number;
  depthEm: number;
};
const cache = new Map<string, MathAsset>();
const errors = new Map<string, string | null>();
export function mathError(tex: string): string | null {
  if (!errors.has(tex)) mathSvg(tex, "#192c2a");
  return errors.get(tex) || null;
}
function explainMath(message: string): string {
  const command = message.match(
    /Undefined control sequence\s*\\([A-Za-z]+)/,
  )?.[1];
  const suggestion = command
    ? closest(
        command,
        latexCommands.map((x) => x[0]),
      )
    : undefined;
  return (
    "LaTeX：" + message + (suggestion ? `；是否想写 \\${suggestion}？` : "")
  );
}
export function mathSvg(tex: string, color: string): string {
  return mathAsset(tex, color, true)?.data || "";
}
export function mathAsset(
  tex: string,
  color: string,
  display = false,
): MathAsset | null {
  const key = JSON.stringify([tex, color, display]);
  if (cache.has(key)) return cache.get(key)!;
  if (cache.size > 512) cache.clear();
  if (errors.size > 512) errors.clear();
  try {
    const node = doc.convert(tex, { display });
    let svg = adaptor.innerHTML(node);
    if (
      svg.includes('data-mml-node="merror"') ||
      svg.includes("data-mjx-error=")
    ) {
      const msg =
        svg.match(/data-mjx-error="([^"]+)"/)?.[1] ||
        "公式包含无效命令或不匹配的括号";
      errors.set(tex, explainMath(msg));
      return null;
    }
    errors.set(tex, null);
    const match = svg.match(/viewBox="([^"]+)"/);
    const dims = match?.[1].split(" ").map(Number);
    if (!dims) throw Error("公式无法渲染");
    svg = svg
      .replace(/width="[^"]*"/, `width="${dims[2] / 30}"`)
      .replace(/height="[^"]*"/, `height="${dims[3] / 30}"`)
      .replace(/currentColor/g, color)
      .replace("<svg ", '<svg color="' + color + '" ');
    const result =
      "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    const asset = {
      data: result,
      widthEm: dims[2] / 1000,
      heightEm: dims[3] / 1000,
      depthEm: Math.max(0, (dims[1] + dims[3]) / 1000),
    };
    cache.set(key, asset);
    return asset;
  } catch (e) {
    errors.set(tex, explainMath((e as Error).message));
    return null;
  }
}

/** Natural em dimensions at the text font size; fit down without ever enlarging. */
export function fitMath(
  tex: string,
  color: string,
  size: number,
  box: { x: number; y: number; w: number; h: number },
) {
  const asset = mathAsset(tex, color, true);
  if (!asset) return box;
  const naturalW = asset.widthEm * size,
    naturalH = asset.heightEm * size;
  const scale = Math.min(
    1,
    box.w / Math.max(1, naturalW),
    box.h / Math.max(1, naturalH),
  );
  const w = naturalW * scale,
    h = naturalH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
