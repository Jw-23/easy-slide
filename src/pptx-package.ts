import type { Deck, Slide } from "./dsl";
import type JSZip from "jszip";

/** Deduplicate identical embedded bytes without changing shape IDs or animation targets. */
export async function deduplicateMedia(zip: JSZip) {
  const hashes = new Map<string, string>(),
    replacements = new Map<string, string>();
  for (const file of Object.values(zip.files).filter(
    (f) => !f.dir && f.name.startsWith("ppt/media/"),
  )) {
    const bytes = await file.async("arraybuffer"),
      digest = await crypto.subtle.digest("SHA-256", bytes);
    const key =
      file.name.split(".").at(-1) +
      ":" +
      [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const canonical = hashes.get(key);
    if (canonical) {
      replacements.set(file.name, canonical);
      zip.remove(file.name);
    } else hashes.set(key, file.name);
  }
  if (!replacements.size) return;
  for (const file of Object.values(zip.files).filter(
    (f) => !f.dir && f.name.endsWith(".rels"),
  )) {
    const xml = await file.async("string");
    const rewritten = xml.replace(
      /Target="\.\.\/media\/([^"]+)"/g,
      (original, name) => {
        const canonical = replacements.get("ppt/media/" + name);
        return canonical
          ? `Target="../media/${canonical.slice("ppt/media/".length)}"`
          : original;
      },
    );
    if (rewritten !== xml) zip.file(file.name, rewritten);
  }
}

/** Keep SVG formulas vector-based with a deliberate high-resolution PNG fallback. */
export function attachSvg(
  xml: string,
  relationships: string,
  elementIndex: number,
  svgTarget: string,
) {
  const ids = [...relationships.matchAll(/\bId="rId(\d+)"/g)].map((m) =>
    Number(m[1]),
  );
  const rid = `rId${Math.max(0, ...ids) + 1}`;
  let found = false;
  const extension = `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${rid}"/></a:ext></a:extLst>`;
  xml = xml.replace(/<p:pic\b[\s\S]*?<\/p:pic>/g, (pic) => {
    if (!pic.includes(`name="easy-slide-element-${elementIndex}"`)) return pic;
    return pic.replace(
      /<a:blip\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:blip>)/,
      (full, attrs, children) => {
        found = true;
        return `<a:blip${attrs}>${children ?? ""}${extension}</a:blip>`;
      },
    );
  });
  if (!found) throw Error("无法定位公式的 PPTX 图形");
  relationships = relationships.replace(
    "</Relationships>",
    `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${svgTarget}"/></Relationships>`,
  );
  return { xml, relationships };
}
export function patchSlideMotion(
  xml: string,
  deck: Deck,
  slide: Slide,
  timing: string,
) {
  const type = slide.transition || deck.transition || "fade",
    duration = Math.round(slide.duration ?? deck.duration ?? 600);
  let transition = "";
  if (type !== "none") {
    const direction = { left: "l", right: "r", up: "u", down: "d" }[
      slide.direction || deck.direction || "left"
    ];
    const effect =
      type === "slide"
        ? `<p:push dir="${direction}"/>`
        : type === "zoom"
          ? '<p:zoom dir="in"/>'
          : "<p:fade/>";
    transition = `<p:transition advClick="1" p14:dur="${duration}" spd="${duration > 700 ? "slow" : duration < 400 ? "fast" : "med"}">${effect}</p:transition>`;
    xml = xml.replace(/<p:sld\b[^>]*>/, (root) => {
      if (!root.includes("xmlns:p14="))
        root = root.replace(
          />$/,
          ' xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">',
        );
      if (!root.includes("xmlns:mc="))
        root = root.replace(
          />$/,
          ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">',
        );
      if (root.includes("mc:Ignorable="))
        root = root.replace(
          /mc:Ignorable="([^"]*)"/,
          (_, names) =>
            `mc:Ignorable="${[...new Set([...names.split(/\s+/), "p14"])].join(" ")}"`,
        );
      else root = root.replace(/>$/, ' mc:Ignorable="p14">');
      return root;
    });
  }
  xml = xml
    .replace(/<p:transition\b[^>]*(?:\/>|>[\s\S]*?<\/p:transition>)/g, "")
    .replace(/<p:timing\b[\s\S]*?<\/p:timing>/g, "");
  const anchor = /<\/p:clrMapOvr>|<p:clrMapOvr\b[^>]*\/>/.test(xml)
    ? /<\/p:clrMapOvr>|<p:clrMapOvr\b[^>]*\/>/
    : /<\/p:cSld>/;
  if (!anchor.test(xml)) throw Error("PPTX 页面结构无效");
  return xml.replace(anchor, (match) => match + transition + timing);
}
