import { mathAsset } from "./math";
import { flowRuns, type RichDocument, type RichRun } from "./rich-text";
export const escapeXml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function mathRunAsset(run: RichRun, color: string) {
  return mathAsset(
    run.bold ? `\\boldsymbol{${run.text}}` : run.text,
    color,
    run.node.display,
  );
}
export function runStyle(run: RichRun): string {
  return (
    (run.bold ? "font-weight:650;" : "") +
    (run.italic ? "font-style:italic;" : "") +
    (run.strike ? "text-decoration:line-through;" : "") +
    (run.mono ? "font-family:monospace;" : "")
  );
}
/** Only AST-generated tags and locally rendered SVG data URLs are emitted. User HTML stays escaped. */
export function richHtml(document: RichDocument, color = "#192c2a"): string {
  return flowRuns(document)
    .map((run, index) => {
      if (run.kind === "break") return "\n";
      const style = runStyle(run),
        id = `data-rich-run="${index}"`;
      if (run.kind === "math") {
        const asset = mathRunAsset(run, color);
        if (!asset) return escapeXml(run.text);
        return `<img ${id} data-inline-math="true" alt="${escapeXml(run.text)}" src="${asset.data}" style="${style}${run.strike ? `background:linear-gradient(${color},${color}) 0 50% / 100% 1px no-repeat;` : ""}display:${run.node.display ? "block" : "inline-block"};width:${asset.widthEm}em;height:${asset.heightEm}em;vertical-align:${-asset.depthEm}em;max-width:100%;object-fit:contain;${run.node.display ? "margin:0.35em auto;" : ""}"/>`;
      }
      return `<span ${id}${style ? ` style="${style}"` : ""}>${escapeXml(run.text)}</span>`;
    })
    .join("");
}
