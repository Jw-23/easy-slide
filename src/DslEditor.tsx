import { useEffect, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
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
import { completeDsl, slideLanguage } from "./editor-language";
import { BookOpen, Code2, MapPin, Sparkles } from "lucide-react";
export function DslEditor({
  value,
  onChange,
  assets,
  onFormat,
  onHelp,
}: {
  value: string;
  onChange: (s: string) => void;
  assets: string[];
  onFormat: () => void;
  onHelp: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    change = useRef(onChange),
    assetRef = useRef(assets);
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
          slideLanguage,
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
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    validate(value);
    return () => {
      view.current = null;
      editor.destroy();
    };
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
      });
  }, [value]);
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
            disabled={!!error}
            onClick={onFormat}
          >
            <Code2 size={15} />
          </button>
          <button className="icon-button" title="DSL 语法指南" onClick={onHelp}>
            <BookOpen size={15} />
          </button>
        </div>
      </div>
      <p>Deck 与 Slide 并列书写 · Ctrl / ⌘ + Space 补全</p>
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
        <span className="status-dot" />
        {error ? "修复上方错误后自动同步" : "语法正确 · 实时同步"}
      </div>
    </div>
  );
}
