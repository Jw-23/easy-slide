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
      (p) => !["require", "autoload", "html"].includes(p),
    ),
  }),
  OutputJax: new SVG({ fontCache: "none" }),
});
const cache = new Map<string, string>();
export function mathSvg(tex: string, color: string): string {
  const key = tex + color;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const node = doc.convert(tex, { display: true });
    let svg = adaptor.innerHTML(node);
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
    cache.set(key, result);
    return result;
  } catch {
    return "";
  }
}
