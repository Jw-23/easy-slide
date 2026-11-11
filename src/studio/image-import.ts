import { parseDeck, type Project } from "../dsl";
import { validateEditableProject } from "../project-archive";
import { pasteCanvasText } from "./component-clipboard";
import { appendSlideBlocks } from "./source-edits";
import { SourceMap, type SceneTarget } from "./source-map";

/** Add image assets atomically, even while other image references are unresolved. */
export function addImageAssets(
  project: Project,
  added: Record<string, string>,
  page: number,
  insert = true,
  target?: SceneTarget,
): Project {
  const next = { ...project, assets: { ...project.assets, ...added } };
  const declarations = Object.keys(added).map(
    (path) => `Image(${JSON.stringify(path)})`,
  );
  if (insert && declarations.length) {
    next.source = target
      ? pasteCanvasText(
          next,
          parseDeck(project.source),
          new SourceMap(project.source),
          target,
          declarations.join("\n"),
        ).source
      : appendSlideBlocks(project.source, page, declarations);
  }
  return validateEditableProject(next);
}
