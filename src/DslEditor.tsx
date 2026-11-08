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
import { BookOpen, Code2, MapPin, Sparkles } from "lucide-react";
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
}: {
  value: string;
  onChange: (s: string) => void;
  assets: string[];
  onFormat: () => void;
  onHelp: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  readOnly?: boolean;
  session?: { anchor: number; head: number; scrollTop: number };
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    change = useRef(onChange),
    assetRef = useRef(assets),
    undo = useRef(onUndo),
    redo = useRef(onRedo),
    readOnlyConfig = useRef(new Compartment());
  undo.current = onUndo;
  redo.current = onRedo;
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
          basicSetup,
          readOnlyConfig.current.of(EditorState.readOnly.of(readOnly)),
          Prec.highest(
            keymap.of([
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
              change.current(update.state.doc.toString());
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
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: minimalTextChange(editor.state.doc.toString(), value),
        annotations: [
          externalChange.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({
      effects: readOnlyConfig.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);
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
            title="整理为扁平结构（会规范格式并移除注释）"
            className="icon-button"
            disabled={!!error || readOnly}
            onClick={onFormat}
          >
            <Code2 size={15} />
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
