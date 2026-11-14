import {
  studioSearch,
  openStudioSearch,
  navigateStudioSearch,
  type SearchRequest,
} from "./studio/search-panel";
import { whitespaceSelection } from "./studio/format-source";
import { dslEditingKeymap, toggleDslComment } from "./studio/editor-commands";
import type {
  EditorContext,
  RevealRequest,
} from "./studio/use-context-actions";
import { StudioClipboard } from "./studio/clipboard";
import { minimalTextChange } from "./studio/source-edits";
import { useEffect, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  Transaction,
} from "@codemirror/state";
import { basicSetup } from "codemirror";
import {
  autocompletion,
  completionKeymap,
  startCompletion,
  acceptCompletion,
} from "@codemirror/autocomplete";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { indentWithTab } from "@codemirror/commands";
import {
  syntaxHighlighting,
  HighlightStyle,
  indentUnit,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { parseDeck } from "./dsl";
import { DslError } from "./diagnostics";
import {
  completeDsl,
  slideLanguage,
  signatureHelp,
  semanticHover,
} from "./editor-language";
import {
  BookOpen,
  Code2,
  MapPin,
  MessageSquare,
  Search,
  Sparkles,
} from "lucide-react";
const externalChange = Annotation.define<boolean>();
export function DslEditor({
  value,
  onChange,
  assets,
  onFormat,
  onHelp,
  onUndo,
  onRedo,
  readOnly = false,
  session,
  reveal,
  searchRequest,
  onSearchHandled,
  onContextMenu,
  clipboard,
  onMessage,
}: {
  value: string;
  onChange: (s: string, independent?: boolean) => void;
  assets: string[];
  onFormat: () => void;
  onHelp: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  readOnly?: boolean;
  session?: { anchor: number; head: number; scrollTop: number };
  reveal?: RevealRequest | null;
  searchRequest?: SearchRequest;
  onSearchHandled?: () => void;
  onContextMenu?: (context: EditorContext) => void;
  clipboard?: StudioClipboard;
  onMessage?: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    change = useRef(onChange),
    assetRef = useRef(assets),
    undo = useRef(onUndo),
    redo = useRef(onRedo),
    format = useRef(onFormat),
    readOnlyConfig = useRef(new Compartment());
  const contextHandler = useRef(onContextMenu),
    clip = useRef(clipboard || new StudioClipboard()),
    feedback = useRef(onMessage);
  contextHandler.current = onContextMenu;
  clip.current = clipboard || clip.current;
  feedback.current = onMessage;
  undo.current = onUndo;
  redo.current = onRedo;
  format.current = onFormat;
  change.current = onChange;
  assetRef.current = assets;
  const [error, setError] = useState<DslError | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const validate = (text: string): Diagnostic[] => {
      try {
        parseDeck(text);
        setError(null);
        return [];
      } catch (e) {
        const d =
          e instanceof DslError
            ? e
            : new DslError((e as Error).message, 0, 1, 1, 1);
        setError(d);
        return [
          {
            from: Math.min(d.from, text.length),
            to: Math.min(Math.max(d.from + 1, d.to), text.length),
            severity: "error",
            message: d.detail + "\n建议：" + d.hint,
          },
        ];
      }
    };
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          studioSearch,
          basicSetup,
          EditorView.domEventHandlers({
            contextmenu(event, editor) {
              if (
                (event.shiftKey && (event.clientX || event.clientY)) ||
                !contextHandler.current
              )
                return false;
              event.preventDefault();
              const pos =
                event.clientX || event.clientY
                  ? (editor.posAtCoords({
                      x: event.clientX,
                      y: event.clientY,
                    }) ?? editor.state.selection.main.head)
                  : editor.state.selection.main.head;
              const old = editor.state.selection.main;
              if (pos < old.from || pos > old.to || old.empty)
                editor.dispatch({ selection: { anchor: pos } });
              const selection = editor.state.selection.main,
                doc = editor.state.doc,
                text = doc.sliceString(selection.from, selection.to);
              const check = () => {
                if (editor.state.doc !== doc)
                  throw Error("源码已变更，请重新打开菜单");
              };
              const copy = async () => {
                const system = await clip.current.write(text);
                if (!system)
                  feedback.current?.("已复制到应用剪贴板，系统剪贴板不可用");
              };
              const cut = async () => {
                if (editor.state.readOnly) return;
                await copy();
                check();
                editor.dispatch({
                  changes: {
                    from: selection.from,
                    to: selection.to,
                    insert: "",
                  },
                  selection: { anchor: selection.from },
                });
                editor.focus();
              };
              const paste = async () => {
                if (editor.state.readOnly) return;
                const data = await clip.current.read();
                check();
                if (data.files?.length) throw Error("图片请在画布中粘贴");
                editor.dispatch({
                  changes: {
                    from: selection.from,
                    to: selection.to,
                    insert: data.text,
                  },
                  selection: { anchor: selection.from + data.text.length },
                });
                editor.focus();
                if (data.local) feedback.current?.("已从应用剪贴板粘贴");
              };
              const coords = editor.coordsAtPos(pos);
              contextHandler.current({
                position: pos,
                x: event.clientX || coords?.left || 0,
                y: event.clientY || coords?.bottom || 0,
                text,
                hasSelection: !selection.empty,
                origin: editor.contentDOM,
                copy,
                cut,
                paste,
                toggleComment: () => {
                  check();
                  toggleDslComment(editor);
                  editor.focus();
                },
                selectAll: () => {
                  editor.dispatch({
                    selection: { anchor: 0, head: editor.state.doc.length },
                  });
                  editor.focus();
                },
              });
              return true;
            },
          }),
          readOnlyConfig.current.of(EditorState.readOnly.of(readOnly)),
          Prec.highest(
            keymap.of([
              { key: "Mod-f", run: (view) => openStudioSearch(view) },
              { key: "Mod-h", run: (view) => openStudioSearch(view, true) },
              { key: "Mod-Alt-f", run: (view) => openStudioSearch(view, true) },
              { key: "F3", run: (view) => navigateStudioSearch(view, 1) },
              {
                key: "Shift-F3",
                run: (view) => navigateStudioSearch(view, -1),
              },
              { key: "Mod-g", run: (view) => navigateStudioSearch(view, 1) },
              {
                key: "Mod-Shift-g",
                run: (view) => navigateStudioSearch(view, -1),
              },
              ...dslEditingKeymap(() => format.current()),
              {
                key: "Mod-z",
                run: () => {
                  if (!undo.current) return false;
                  undo.current();
                  return true;
                },
              },
              {
                key: "Mod-Shift-z",
                run: () => {
                  if (!redo.current) return false;
                  redo.current();
                  return true;
                },
              },
              {
                key: "Mod-y",
                run: () => {
                  if (!redo.current) return false;
                  redo.current();
                  return true;
                },
              },
            ]),
          ),
          slideLanguage,
          signatureHelp,
          semanticHover,
          indentUnit.of("    "),
          keymap.of([
            ...completionKeymap,
            { key: "Tab", run: acceptCompletion },
            indentWithTab,
          ]),
          autocompletion({
            override: [(ctx) => completeDsl(ctx, assetRef.current)],
            activateOnTyping: true,
          }),
          lintGutter(),
          linter((v) => validate(v.state.doc.toString()), { delay: 250 }),
          EditorView.contentAttributes.of({
            "aria-label": "DSL 编辑器",
            spellcheck: "false",
          }),
          syntaxHighlighting(
            HighlightStyle.define([
              { tag: tags.keyword, color: "#426999", fontWeight: "600" },
              { tag: tags.string, color: "#4a8065" },
              { tag: tags.number, color: "#9d6a39" },
              { tag: tags.atom, color: "#8870a7" },
              { tag: tags.comment, color: "#9da8a0", fontStyle: "italic" },
              { tag: tags.propertyName, color: "#667f88" },
            ]),
          ),
          EditorView.theme({
            "&": {
              height: "100%",
              fontSize: "12px",
              backgroundColor: "#fafcfb",
            },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: "SFMono-Regular, Consolas, monospace",
              lineHeight: "1.85",
            },
            ".cm-content": { padding: "15px 0" },
            ".cm-gutters": {
              backgroundColor: "#f4f7f5",
              color: "#abb9b0",
              border: "none",
              fontSize: "10px",
            },
            ".cm-activeLine": { backgroundColor: "#e8f1ec66" },
            ".cm-activeLineGutter": { backgroundColor: "#e6efe9" },
            ".cm-tooltip": {
              backgroundColor: "#fff",
              border: "1px solid #d5e3d9",
              borderRadius: "7px",
              boxShadow: "0 5px 24px #204b3320",
            },
            ".cm-tooltip-autocomplete": { maxWidth: "min(560px,90vw)" },
            ".cm-completionLabel": { fontFamily: "monospace" },
            ".cm-completionDetail": { fontSize: "10px", color: "#81958a" },
            ".cm-diagnostic": { fontSize: "12px", whiteSpace: "pre-wrap" },
          }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((t) => t.annotation(externalChange))
            )
              change.current(
                update.state.doc.toString(),
                update.transactions.some(
                  (t) =>
                    t.isUserEvent("input.comment") ||
                    t.isUserEvent("input.replace"),
                ),
              );
          }),
        ],
      }),
    });
    view.current = editor;
    if (session) {
      editor.dispatch({
        selection: {
          anchor: Math.min(session.anchor, value.length),
          head: Math.min(session.head, value.length),
        },
      });
      editor.scrollDOM.scrollTop = session.scrollTop;
    }
    validate(value);
    return () => {
      if (session) {
        session.anchor = editor.state.selection.main.anchor;
        session.head = editor.state.selection.main.head;
        session.scrollTop = editor.scrollDOM.scrollTop;
      }
      view.current = null;
      editor.destroy();
    };
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      const before = editor.state.doc.toString(),
        selection = whitespaceSelection(
          before,
          value,
          editor.state.selection.main,
        );
      editor.dispatch({
        changes: minimalTextChange(before, value),
        ...(selection
          ? {
              selection,
              effects: EditorView.scrollIntoView(selection.head, {
                y: "nearest",
              }),
            }
          : {}),
        annotations: [
          externalChange.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
    }
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({
      effects: readOnlyConfig.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || !reveal || reveal.source !== value) return;
    const from = Math.min(reveal.from, editor.state.doc.length),
      to = Math.min(reveal.to, editor.state.doc.length);
    editor.dispatch({
      selection: { anchor: to, head: from },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    editor.focus();
  }, [reveal, value]);
  useEffect(() => {
    if (view.current && searchRequest) {
      openStudioSearch(view.current, searchRequest.replace);
      onSearchHandled?.();
    }
  }, [searchRequest]);
  const jump = () => {
    const editor = view.current;
    if (!editor || !error) return;
    const pos = Math.min(error.from, editor.state.doc.length);
    editor.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    editor.focus();
  };
  return (
    <div className="dsl-panel code-editor-panel">
      <div className="dsl-heading">
        <span>slides.slide</span>
        <div>
          <button
            aria-label="全局搜索替换"
            title="全局搜索替换（Ctrl / ⌘ + F）"
            className="icon-button"
            onClick={() => {
              if (view.current) openStudioSearch(view.current);
            }}
          >
            <Search size={15} />
          </button>
          <button
            title="代码提示（Ctrl / ⌘ + Space）"
            className="icon-button"
            onClick={() => {
              view.current?.focus();
              if (view.current) startCompletion(view.current);
            }}
          >
            <Sparkles size={15} />
          </button>
          <button
            aria-label="切换行注释"
            aria-keyshortcuts="Control+/ Meta+/"
            title="切换行注释（Ctrl / ⌘ + /）"
            className="icon-button"
            disabled={readOnly}
            onClick={() => {
              if (view.current) {
                toggleDslComment(view.current);
                view.current.focus();
              }
            }}
          >
            <MessageSquare size={15} />
            <span>注释</span>
          </button>
          <button
            aria-label="格式化 DSL"
            aria-keyshortcuts="Control+Shift+F Meta+Shift+F Alt+Shift+F"
            title="格式化 DSL（Ctrl / ⌘ + Shift + F，或 Shift + Alt + F）"
            className="icon-button"
            disabled={!!error || readOnly}
            onClick={onFormat}
          >
            <Code2 size={15} />
            <span>格式化</span>
          </button>
          <button className="icon-button" title="DSL 语法指南" onClick={onHelp}>
            <BookOpen size={15} />
          </button>
        </div>
      </div>
      <div className="code-editor-host" ref={host} />
      {error ? (
        <div className="editor-diagnostic" role="alert">
          <button onClick={jump}>
            <MapPin size={13} />第 {error.line} 行 · 第 {error.column} 列 · 定位
          </button>
          <strong>{error.detail}</strong>
          <span>{error.hint}</span>
          <small>正在保留上一份有效预览</small>
        </div>
      ) : null}
      <div className={"dsl-validation " + (error ? "invalid" : "")}>
        {error
          ? "1 个错误"
          : `${value.split("\n").length} 行 · ${value.length} 字符`}
      </div>
    </div>
  );
}
