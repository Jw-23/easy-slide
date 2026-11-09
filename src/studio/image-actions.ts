import { parseDeck, type Project } from "../dsl";
import { parseEditorAst, type AstNode } from "../editor-ast";
import { SourceMap, type SceneTarget } from "./source-map";
import { readSyntax, type Call } from "../syntax";
import { blockAt } from "./component-clipboard";
import { validatePortableProject } from "../project-archive";

export function renameImage(
  project: Project,
  path: string,
  name: string,
): Project {
  if (!Object.hasOwn(project.assets, path)) throw Error("图片已不存在");
  name = name.trim();
  if (!name || /[\\/\x00-\x1f:]/.test(name) || name === "." || name === "..")
    throw Error("请输入不含路径分隔符的图片名称");
  const next = path.slice(0, path.lastIndexOf("/") + 1) + name;
  if (next === path) return project;
  if (Object.hasOwn(project.assets, next))
    throw Error("已有同名图片，请使用其他名称");
  const edits = new Map<number, { from: number; to: number; value: string }>();
  const add = (from: number, to: number) =>
    edits.set(from, { from, to, value: JSON.stringify(next) });
  const map = new SourceMap(project.source);
  for (const r of map.records)
    if (r.assetRange?.path === path) add(r.assetRange.from, r.assetRange.to);
  const visit = (node: AstNode) => {
    // Literal image arguments in function definitions and path constants retain their abstraction.
    if (node.kind === "literal" && node.value === path) {
      let p = node.parent;
      while (p && !["binding", "call"].includes(p.kind)) p = p.parent;
      if (p?.kind === "binding" || (p?.kind === "call" && p.name === "Image"))
        add(node.from, node.to);
    }
    node.children.forEach(visit);
  };
  visit(parseEditorAst(project.source).root);
  // Prefer complete Image arguments when they contain a literal edited above.
  const ranges = [...edits.values()].filter(
    (e) =>
      ![...edits.values()].some(
        (other) =>
          other !== e &&
          other.from <= e.from &&
          other.to >= e.to &&
          (other.from < e.from || other.to > e.to),
      ),
  );
  let source = project.source;
  for (const e of ranges.sort((a, b) => b.from - a.from))
    source = source.slice(0, e.from) + e.value + source.slice(e.to);
  const assets = { ...project.assets, [next]: project.assets[path] };
  delete assets[path];
  try {
    return validatePortableProject({ ...project, source, assets });
  } catch {
    throw Error(
      "存在无法自动更新的计算图片引用；请先将对应 Image 路径改为直接字符串，再重命名。工程未修改。",
    );
  }
}
export function moveImage(
  project: Project,
  target: SceneTarget,
  x: number,
  y: number,
  w: number,
  h: number,
): { project: Project } {
  if (
    target.scope !== "block" ||
    ![x, y, w, h].every(Number.isFinite) ||
    w <= 0 ||
    h <= 0
  )
    throw Error("无效的图片位置");
  const deck = parseDeck(project.source),
    image = blockAt(deck, target);
  if (image?.type !== "image") throw Error("请选择图片");
  const slide = deck.slides[target.page];
  const record = new SourceMap(project.source, deck).get(target);
  if (!record || record.synthetic)
    throw Error("此图片由布局函数生成，请先在 DSL 中将它展开为独立 Image");
  let blocks = slide.blocks,
    scale = 1;
  for (const i of target.path) {
    const b = blocks[i];
    scale *= b.scale ?? 1;
    blocks = b.children || [];
  }
  const a = Math.max(0, Math.min(1280 - w, x)),
    b = Math.max(0, Math.min(720 - h, y));
  const frame = `.frame(width: ${w / scale}, height: ${h / scale})`,
    position = `.position(x: ${Math.round(a * 100) / 100}, y: ${-Math.round(b * 100) / 100}, reference: .topLeft, anchor: .topLeft, relativeTo: .slide)`;
  const find = (nodes: Call[]): Call | undefined => {
    for (const n of nodes) {
      if (n.from === record.from && n.to === record.to && n.name === "Image")
        return n;
      const child = find(n.children);
      if (child) return child;
    }
  };
  const call = find(readSyntax(project.source).children);
  if (!call) throw Error("无法定位图片声明");
  const edits: { from: number; to: number; value: string }[] = [];
  let suffix = "";
  for (const [key, value] of [
    ["frame", frame],
    ["position", position],
  ]) {
    const modifier = call.modifiers.filter((m) => m.name === key).at(-1);
    if (modifier)
      edits.push({
        from: modifier.from,
        to: modifier.to,
        value: value.slice(1),
      });
    else suffix += value;
  }
  edits.push({ from: record.to, to: record.to, value: suffix });
  let source = project.source;
  for (const edit of edits.sort((a, b) => b.from - a.from))
    source = source.slice(0, edit.from) + edit.value + source.slice(edit.to);
  return {
    project: validatePortableProject({ ...project, source }),
  };
}
