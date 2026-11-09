import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { SourceMap, type SceneTarget, type SourceRecord } from "./source-map";
import {
  copyComponent,
  deleteComponent,
  pasteComponent,
  pasteCanvasText,
} from "./component-clipboard";
import { StudioClipboard, type ClipboardContent } from "./clipboard";
import {
  addSlideSource,
  duplicateSlideSource,
  deleteSlideSource,
  moveSlideSource,
} from "./source-edits";
import type { Studio } from "./use-studio";
import type { MenuItem, MenuState } from "../components/ContextMenu";
import type { Element } from "../scene";
export type RevealRequest = {
  source: string;
  from: number;
  to: number;
  id: number;
};
export type FocusRequest = {
  focusCanvas?: boolean;
  source: string;
  target: SceneTarget;
  id: number;
};
export type EditorContext = {
  x: number;
  y: number;
  position: number;
  text: string;
  hasSelection: boolean;
  origin: HTMLElement;
  copy: () => Promise<void>;
  cut: () => Promise<void>;
  paste: () => Promise<void>;
  selectAll: () => void;
};
export function useContextActions(
  s: Studio,
  openCode: () => void,
  openCanvas: () => void,
  pickImages: () => void,
) {
  const map = useMemo(() => {
    if (s.error) return null;
    try {
      return new SourceMap(s.project.source);
    } catch {
      return null;
    }
  }, [s.project.source, s.error]);
  const [menu, setMenu] = useState<MenuState | null>(null),
    [reveal, setReveal] = useState<RevealRequest | null>(null),
    [focus, setFocus] = useState<FocusRequest | null>(null);
  const clipboard = useRef(new StudioClipboard()),
    serial = useRef(0),
    latest = useRef(s);
  latest.current = s;
  const close = useCallback(() => setMenu(null), []);
  useEffect(() => {
    setMenu(null);
    setReveal(null);
    setFocus(null);
  }, [s.project.source]);
  function report(problem: unknown) {
    s.notify(
      problem instanceof Error ? problem.message : String(problem),
      "error",
    );
  }
  const safe = (action: () => void | Promise<void>) => async () => {
    try {
      await action();
    } catch (problem) {
      report(problem);
    }
  };
  function record(target: SceneTarget): SourceRecord | undefined {
    return map?.get(target) || map?.get({ scope: "slide", page: target.page });
  }
  function code(target: SceneTarget) {
    const found = record(target);
    if (!found) return;
    s.go(target.page);
    setReveal({
      source: s.project.source,
      from: found.revealFrom,
      to: found.revealTo,
      id: ++serial.current,
    });
    openCode();
  }
  function canvas(target: SceneTarget) {
    s.go(target.page);
    setFocus({
      source: s.project.source,
      target,
      id: ++serial.current,
      focusCanvas: true,
    });
    openCanvas();
  }
  async function textCopy(text: string) {
    const system = await clipboard.current.write(text);
    s.notify(system ? "已复制文本" : "已复制到应用剪贴板，系统剪贴板不可用");
  }
  function requireCurrent() {
    const current = latest.current;
    if (!current.editable)
      throw Error("请先完成当前操作并修复 DSL，再粘贴内容");
    if (
      current.project.source !== s.project.source ||
      current.project.assets !== s.project.assets
    )
      throw Error("工程已变更，请重新打开菜单后粘贴");
    return current;
  }
  async function componentCopy(target: SceneTarget, cut = false) {
    if (!map) return;
    const clip = copyComponent(s.project, s.deck, map, target);
    const system = await clipboard.current.write(clip.text, clip);
    if (cut) {
      const current = requireCurrent();
      if (
        !current.contextCommit(
          s.project,
          {
            ...s.project,
            source: deleteComponent(s.project.source, map, target),
          },
          target.page,
        )
      )
        return;
    }
    s.notify(
      cut
        ? "组件已剪切"
        : system
          ? Object.keys(clip.assets).length
            ? `组件及 ${Object.keys(clip.assets).length} 张图片已复制`
            : "组件已复制"
          : "组件已复制到应用剪贴板",
    );
  }
  async function applyPaste(target: SceneTarget, content: ClipboardContent) {
    if (!map) return;
    const current = requireCurrent();
    if (content.files?.length) {
      await current.addImages(content.files, true, target);
      return;
    }
    const result = content.component
      ? pasteComponent(
          s.project,
          s.deck,
          map,
          target,
          content.component,
          crypto.randomUUID().slice(0, 8),
        )
      : {
          project: pasteCanvasText(
            s.project,
            s.deck,
            map,
            target,
            content.text,
          ),
          materialized: false,
        };
    if (current.contextCommit(s.project, result.project, target.page))
      s.notify(
        result.materialized
          ? "组件已粘贴，局部计算已保留为当前值"
          : content.local
            ? "已从应用剪贴板粘贴"
            : "已粘贴",
        "success",
        true,
      );
  }
  async function paste(target: SceneTarget) {
    await applyPaste(target, await clipboard.current.read());
  }
  function pasteEvent(event: React.ClipboardEvent) {
    const files = Array.from(event.clipboardData.files).filter((file) =>
        file.type.startsWith("image/"),
      ),
      text = event.clipboardData.getData("text/plain");
    if (!files.length && !text) return;
    event.preventDefault();
    event.stopPropagation();
    const target =
      focus?.source === s.project.source && focus.target.page === s.active
        ? focus.target
        : { scope: "slide" as const, page: s.active };
    void safe(() =>
      applyPaste(
        target,
        files.length ? { text: "", files } : clipboard.current.fromText(text),
      ),
    )();
  }
  function duplicate(target: SceneTarget) {
    if (!map) return;
    const clip = copyComponent(s.project, s.deck, map, target),
      result = pasteComponent(
        s.project,
        s.deck,
        map,
        target,
        clip,
        crypto.randomUUID().slice(0, 8),
        true,
      );
    s.contextCommit(s.project, result.project, target.page);
  }
  function pageChange(
    target: SceneTarget,
    change: (source: string, page: number) => string,
    page = target.page,
  ) {
    s.contextCommit(
      s.project,
      { ...s.project, source: change(s.project.source, target.page) },
      page,
    );
  }
  const history = (): MenuItem[] => [
    {
      label: "撤销",
      separator: true,
      disabled: !s.canUndo || s.busy,
      action: s.undo,
    },
    { label: "重做", disabled: !s.canRedo || s.busy, action: s.redo },
  ];
  function componentItems(target: SceneTarget): MenuItem[] {
    const found = map?.get(target);
    if (target.scope !== "block" || !found) return [];
    return [
      { label: "复制组件", action: safe(() => componentCopy(target)) },
      {
        label: "剪切组件",
        disabled: !s.editable || found.synthetic,
        action: safe(() => componentCopy(target, true)),
      },
      {
        label: "创建组件副本",
        disabled: !s.editable || found.synthetic,
        action: safe(() => duplicate(target)),
      },
      {
        label: "删除组件",
        danger: true,
        disabled: !s.editable || found.synthetic,
        action: safe(() => {
          s.contextCommit(
            s.project,
            {
              ...s.project,
              source: deleteComponent(s.project.source, map!, target),
            },
            target.page,
          );
        }),
      },
    ];
  }
  function openAt(
    event: MouseEvent,
    target: SceneTarget,
    element?: Element,
    thumbnail = false,
  ) {
    if (event.shiftKey && (event.clientX || event.clientY)) return;
    event.preventDefault();
    event.stopPropagation();
    const found = record(target),
      component = target.scope === "block" && map?.get(target);
    if (found && !thumbnail)
      setFocus({ source: s.project.source, target, id: ++serial.current });
    const pageTarget: SceneTarget = { scope: "slide", page: target.page };
    const items: MenuItem[] = [
      { label: "定位到 DSL", disabled: !found, action: () => code(target) },
    ];
    if (element?.text)
      items.push({
        label: "复制文本",
        action: safe(() => textCopy(element.text!)),
      });
    items.push(...componentItems(target));
    if (!thumbnail) {
      items.push({
        label: "粘贴",
        separator: true,
        disabled: !s.editable,
        action: safe(() => paste(target)),
      });
      if (!component)
        items.push(
          {
            label: "添加文本",
            disabled: !s.editable,
            action: safe(() => {
              if (map)
                s.contextCommit(
                  s.project,
                  pasteCanvasText(s.project, s.deck, map, pageTarget, "正文"),
                  target.page,
                );
            }),
          },
          { label: "添加图片…", disabled: !s.editable, action: pickImages },
        );
    }
    if (!component) {
      items.push(
        {
          label: "添加幻灯片",
          separator: true,
          disabled: !s.editable || s.deck.slides.length >= 200,
          action: safe(() =>
            pageChange(pageTarget, addSlideSource, target.page + 1),
          ),
        },
        {
          label: "复制此页",
          disabled: !s.editable || s.deck.slides.length >= 200,
          action: safe(() =>
            pageChange(pageTarget, duplicateSlideSource, target.page + 1),
          ),
        },
      );
      if (thumbnail)
        items.push(
          {
            label: "上移此页",
            disabled: !s.editable || target.page === 0,
            action: safe(() =>
              pageChange(
                pageTarget,
                (source, page) => moveSlideSource(source, page, -1),
                target.page - 1,
              ),
            ),
          },
          {
            label: "下移此页",
            disabled: !s.editable || target.page === s.deck.slides.length - 1,
            action: safe(() =>
              pageChange(
                pageTarget,
                (source, page) => moveSlideSource(source, page, 1),
                target.page + 1,
              ),
            ),
          },
        );
      items.push({
        label: "删除此页",
        danger: true,
        disabled: !s.editable || s.deck.slides.length <= 1,
        action: safe(() =>
          pageChange(
            pageTarget,
            deleteSlideSource,
            Math.max(0, target.page - 1),
          ),
        ),
      });
    }
    items.push(...history());
    const box = event.currentTarget.getBoundingClientRect();
    setMenu({
      x: event.clientX || box.left + 20,
      y: event.clientY || box.top + 20,
      title: component
        ? `${component.name} · 第 ${target.page + 1} 页`
        : `第 ${target.page + 1} 页`,
      items,
      origin: event.currentTarget as HTMLElement,
    });
  }
  function editor(context: EditorContext) {
    const found = map?.at(context.position, s.active),
      items: MenuItem[] = [
        {
          label: "定位到画布",
          disabled: !found,
          action: () => {
            if (found) canvas(found.target);
          },
        },
        {
          label: "复制",
          separator: true,
          disabled: !context.hasSelection,
          action: safe(context.copy),
        },
        {
          label: "剪切",
          disabled: !context.hasSelection || !s.ready || s.busy,
          action: safe(context.cut),
        },
        {
          label: "粘贴",
          disabled: !s.ready || s.busy,
          action: safe(context.paste),
        },
        { label: "全选", action: context.selectAll },
      ];
    if (found?.target.scope === "block")
      items.push(
        ...componentItems(found.target).map((item, i) => ({
          ...item,
          separator: i === 0,
        })),
      );
    items.push({
      label: "格式化文档",
      separator: true,
      disabled: !s.editable,
      action: s.format,
    });
    items.push(...history());
    setMenu({
      x: context.x,
      y: context.y,
      title: found?.name || "DSL",
      items,
      origin: context.origin,
    });
  }
  return {
    menu,
    close,
    reveal,
    focus,
    clipboard: clipboard.current,
    canvas: openAt,
    thumbnail: (event: MouseEvent, page: number) =>
      openAt(event, { scope: "slide", page }, undefined, true),
    editor,
    pasteEvent,
    clearFocus: () => setFocus(null),
  };
}
