import { tokenize } from "../tokens";
import {
  parseDeck,
  serializeBlock,
  type Block,
  type Deck,
  type Project,
} from "../dsl";
import { validatePortableProject } from "../project-archive";
import {
  SourceMap,
  targetContains,
  type SceneTarget,
  type SourceRecord,
} from "./source-map";
export type ComponentClip = {
  text: string;
  block: Block;
  bindings: string[];
  assets: Record<string, string>;
  images: { from: number; to: number; path: string }[];
  snapshotOnly: boolean;
  snapshotForAssets?: boolean;
};
export function blockAt(deck: Deck, target: SceneTarget): Block | undefined {
  if (target.scope !== "block") return;
  let blocks: Block[] | undefined = deck.slides[target.page]?.blocks,
    block: Block | undefined;
  for (const i of target.path) {
    block = blocks?.[i];
    blocks = block?.children;
  }
  return block;
}
function snapshot(block: Block, paths: Record<string, string> = {}): Block {
  const { expressionSource, bindings, children, ...rest } = block;
  void expressionSource;
  void bindings;
  if (rest.measured) delete rest.h;
  if (rest.flowGenerated) {
    delete rest.position;
    delete rest.w;
    delete rest.h;
  }
  return {
    ...rest,
    ...(rest.src ? { src: paths[rest.src] || rest.src } : {}),
    ...(children ? { children: children.map((b) => snapshot(b, paths)) } : {}),
  };
}
export function copyComponent(
  project: Project,
  deck: Deck,
  map: SourceMap,
  target: SceneTarget,
): ComponentClip {
  const block = blockAt(deck, target),
    record = map.get(target);
  if (!block || !record) throw Error("请选择内容组件");
  const assets: Record<string, string> = {};
  let hasCustom = false;
  const collect = (b: Block) => {
    if (b.type === "component") hasCustom = true;
    if (b.src) {
      if (!project.assets[b.src]) throw Error(`找不到图片：${b.src}`);
      assets[b.src] = project.assets[b.src];
    }
    b.children?.forEach(collect);
  };
  collect(block);
  const portable = snapshot(block),
    snapshotOnly = !!record.synthetic;
  return {
    text: snapshotOnly
      ? serializeBlock(portable)
      : project.source.slice(record.from, record.to),
    block: portable,
    assets,
    bindings: record.scopeBindings,
    snapshotOnly,
    snapshotForAssets: hasCustom,
    images: snapshotOnly
      ? []
      : map.records
          .filter(
            (r) =>
              r.target.scope === "block" &&
              targetContains(target, r.target) &&
              r.assetRange,
          )
          .map((r) => ({
            ...r.assetRange!,
            from: r.assetRange!.from - record.from,
            to: r.assetRange!.to - record.from,
          })),
  };
}
const containers = new Set([
  "layout",
  "glass",
  "hstack",
  "vstack",
  "zstack",
  "grid",
  "component",
  "panel",
  "columns",
  "rows",
  "math",
  "columnFlow",
]);
export function insertionPoint(
  deck: Deck,
  map: SourceMap,
  target: SceneTarget,
  after = false,
): { record: SourceRecord; inside: boolean } | undefined {
  const selected = blockAt(deck, target),
    record = map.get(target);
  if (selected && record) {
    if (
      record.synthetic &&
      !record.generated &&
      deck.slides[target.page]?.dynamic
    ) {
      const owner = map.get({ scope: "slide", page: target.page });
      if (owner) return { record: owner, inside: true };
    }
    if (record.generated) {
      const owner = map.records.find(
        (r) =>
          !r.synthetic &&
          r.target.scope === "block" &&
          r.from === record.from &&
          r.to === record.to,
      );
      if (owner) return { record: owner, inside: false };
    }
    if (!after && containers.has(selected.type))
      return { record, inside: true };
    return { record, inside: false };
  }
  const slide = deck.slides[target.page];
  if (!slide) return;
  if (slide.dynamic?.independentColumns) {
    const column =
      map.records.find(
        (r) =>
          r.target.scope === "block" &&
          r.target.page === target.page &&
          r.name === "RightColumn",
      ) ||
      map.records.find(
        (r) =>
          r.target.scope === "block" &&
          r.target.page === target.page &&
          r.name === "LeftColumn",
      );
    if (column) return { record: column, inside: true };
    const side = slide.blocks[1]?.children?.length ? 1 : 0;
    if (slide.blocks[side]?.children?.length)
      return insertionPoint(
        deck,
        map,
        { scope: "block", page: target.page, path: [side, 0] },
        after,
      );
  }
  const owner =
    slide.blocks.length === 1 && slide.blocks[0].type === "layout"
      ? map.get({ scope: "block", page: target.page, path: [0] })
      : map.get({ scope: "slide", page: target.page });
  return owner ? { record: owner, inside: true } : undefined;
}
export function insertDeclarations(
  source: string,
  record: SourceRecord,
  declarations: string,
  inside: boolean,
): string {
  let position = record.to,
    text = `\n${declarations}\n`;
  if (inside) {
    if (record.bodyEnd !== undefined) position = record.bodyEnd;
    else {
      position = record.revealTo;
      text = ` {\n${declarations}\n}`;
    }
  } else {
    const newline = source.indexOf("\n", position),
      end = newline === -1 ? source.length : newline;
    if (/^\s*\/\//.test(source.slice(position, end))) position = end;
  }
  return source.slice(0, position) + text + source.slice(position);
}
export function pasteComponent(
  project: Project,
  deck: Deck,
  map: SourceMap,
  target: SceneTarget,
  clip: ComponentClip,
  nonce: string,
  after = false,
) {
  const point = insertionPoint(deck, map, target, after);
  if (!point) throw Error("找不到粘贴位置");
  const parent = point.inside ? point.record : map.parent(point.record.target);
  const bindings = point.inside
    ? point.record.childBindings
    : parent?.childBindings || [];
  const signature = (values: string[]) =>
    JSON.stringify(tokenize(values.join("\n")).map((t) => [t.kind, t.value]));
  let materialized =
    clip.snapshotOnly || signature(bindings) !== signature(clip.bindings);
  const paths: Record<string, string> = {},
    assets = { ...project.assets };
  for (const [path, data] of Object.entries(clip.assets)) {
    let destination = path;
    if (assets[path] && assets[path] !== data) {
      const name = path.split("/").at(-1)!.slice(-100);
      destination = `assets/paste-${nonce}-${name}`;
      let i = 1;
      while (assets[destination] && assets[destination] !== data)
        destination = `assets/paste-${nonce}-${i++}-${name}`;
    }
    paths[path] = destination;
    assets[destination] = data;
  }
  if (clip.snapshotForAssets && Object.entries(paths).some(([a, b]) => a !== b))
    materialized = true;
  let text = materialized
    ? serializeBlock(snapshot(clip.block, paths))
    : clip.text;
  if (!materialized)
    for (const image of [...clip.images].sort((a, b) => b.from - a.from)) {
      if (paths[image.path] && paths[image.path] !== image.path)
        text =
          text.slice(0, image.from) +
          JSON.stringify(paths[image.path]) +
          text.slice(image.to);
    }
  const result = {
    ...project,
    source: insertDeclarations(
      project.source,
      point.record,
      text,
      point.inside,
    ),
    assets: Object.keys(clip.assets).length ? assets : project.assets,
  };
  try {
    validatePortableProject(result);
  } catch (problem) {
    if (
      materialized ||
      !(problem instanceof Error) ||
      !problem.message.includes("未定义变量或函数")
    )
      throw problem;
    materialized = true;
    result.source = insertDeclarations(
      project.source,
      point.record,
      serializeBlock(snapshot(clip.block, paths)),
      point.inside,
    );
    validatePortableProject(result);
  }
  return { project: result, materialized };
}
export function deleteComponent(
  source: string,
  map: SourceMap,
  target: SceneTarget,
): string {
  const record = map.get(target);
  if (target.scope !== "block" || !record || record.synthetic)
    throw Error("此处请使用页面操作");
  const next = source.slice(0, record.from) + source.slice(record.to);
  parseDeck(next);
  return next;
}
export function pasteCanvasText(
  project: Project,
  deck: Deck,
  map: SourceMap,
  target: SceneTarget,
  text: string,
) {
  if (!text.trim()) throw Error("剪贴板没有可粘贴的内容");
  if (text.length > 2_000_000) throw Error("粘贴的内容超过 2 MB");
  const point = insertionPoint(deck, map, target);
  if (!point) throw Error("找不到粘贴位置");
  const component =
    /^(Text|Bullets|Equation|Image|Metric|Quote|Code|Table|HStack|VStack|ZStack|Grid|Spacer|Glass|Cover|Section|Flow|Split|Cards|Compare|Timeline|ImageText)\b/.test(
      text.trim(),
    );
  const source = insertDeclarations(
    project.source,
    point.record,
    component ? text : `Text(${JSON.stringify(text)})`,
    point.inside,
  );
  const result = { ...project, source };
  validatePortableProject(result);
  return result;
}
