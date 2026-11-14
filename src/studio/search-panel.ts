import { EditorSelection, Transaction } from "@codemirror/state";
import { EditorView, type Panel, type ViewUpdate } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  search,
  setSearchQuery,
} from "@codemirror/search";
import {
  MAX_SEARCH_MATCHES,
  replacementChanges,
  replacementText,
  searchMatches,
  searchProblem,
  type SearchMatch,
} from "./search-replace";

const panels = new WeakMap<EditorView, StudioSearchPanel>();
const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
) => {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
function field(label: string, name: string) {
  const node = element("textarea", "dsl-search-field");
  node.rows = 1;
  node.name = name;
  node.placeholder = label;
  node.setAttribute("aria-label", label);
  node.spellcheck = false;
  node.setAttribute("data-local-undo", "true");
  return node;
}
class StudioSearchPanel implements Panel {
  dom = element("div", "dsl-search-panel");
  top = true;
  searchField = field("搜索整个工程", "search");
  replaceField = field("替换为", "replace");
  count = element("span", "dsl-search-count");
  error = element("div", "dsl-search-error");
  preview = element("div", "dsl-search-preview");
  help = element(
    "div",
    "dsl-search-help",
    "正则替换：$1、$2、$<名称>；$& 为完整匹配，$$ 为美元符号。反斜线原样保留，替换框内 Shift+Enter 输入换行。",
  );
  result = element("div", "dsl-search-result");
  query: SearchQuery;
  matches: SearchMatch[] = [];
  truncated = false;
  flags: {
    button: HTMLButtonElement;
    key: "caseSensitive" | "wholeWord" | "regexp";
  }[] = [];
  replaceButtons: HTMLButtonElement[] = [];
  navigation: HTMLButtonElement[] = [];
  constructor(readonly view: EditorView) {
    this.query = getSearchQuery(view.state);
    this.dom.setAttribute("role", "search");
    this.dom.setAttribute("aria-label", "全局搜索替换");
    this.searchField.setAttribute("main-field", "true");
    this.error.setAttribute("role", "alert");
    this.count.setAttribute("role", "status");
    this.result.setAttribute("role", "status");
    const first = element("div", "dsl-search-row"),
      second = element("div", "dsl-search-row");
    const button = (
      text: string,
      label: string,
      action: () => void,
      icon = false,
    ) => {
      const node = element(
        "button",
        icon ? "icon-button dsl-search-option" : "dsl-search-action",
        text,
      );
      node.type = "button";
      node.title = label;
      node.setAttribute("aria-label", label);
      node.onclick = action;
      return node;
    };
    first.append(this.searchField);
    for (const [text, label, key] of [
      ["Aa", "区分大小写", "caseSensitive"],
      ["词", "全词匹配", "wholeWord"],
      [".*", "使用正则表达式", "regexp"],
    ] as const) {
      const node = button(
        text,
        label,
        () => this.commit({ [key]: !this.query[key] }),
        true,
      );
      this.flags.push({ button: node, key });
      first.append(node);
    }
    this.navigation = [
      button("↑", "上一个匹配（Shift+Enter）", () => this.navigate(-1), true),
      button("↓", "下一个匹配（Enter）", () => this.navigate(1), true),
    ];
    first.append(
      ...this.navigation,
      this.count,
      button("×", "关闭搜索替换（Esc）", () => closeSearchPanel(view), true),
    );
    this.replaceButtons = [
      button("替换", "替换当前匹配", () => this.replace(false)),
      button("全部替换", "替换整个工程中的全部匹配", () => this.replace(true)),
    ];
    second.append(this.replaceField, ...this.replaceButtons);
    this.dom.append(
      first,
      second,
      this.error,
      this.preview,
      this.help,
      this.result,
    );
    this.searchField.oninput = this.replaceField.oninput = () => this.commit();
    this.dom.onkeydown = (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearchPanel(view);
      } else if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        ["f", "h"].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        (event.key.toLowerCase() === "h" || event.altKey
          ? this.replaceField
          : this.searchField
        ).focus();
      } else if (
        event.key === "Enter" &&
        !event.shiftKey &&
        event.target === this.replaceField
      ) {
        event.preventDefault();
        this.replace(false);
      } else if (
        event.key === "Enter" &&
        event.target === this.searchField &&
        !(event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        this.navigate(event.shiftKey ? -1 : 1);
      } else if (
        event.key === "F3" ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g")
      ) {
        event.preventDefault();
        this.navigate(event.shiftKey ? -1 : 1);
      }
    };
    panels.set(view, this);
    this.refresh(true);
  }
  commit(patch: Partial<SearchQuery> = {}) {
    const next = new SearchQuery({
      ...this.query,
      literal: true,
      search: this.searchField.value,
      replace: this.replaceField.value,
      ...patch,
    });
    this.result.textContent = "";
    if (!next.eq(this.query))
      this.view.dispatch({ effects: setSearchQuery.of(next) });
  }
  update(update: ViewUpdate) {
    const query = getSearchQuery(update.state),
      changed = !query.eq(this.query);
    this.query = query;
    if (changed || update.docChanged) this.result.textContent = "";
    this.refresh(changed || update.docChanged);
  }
  refresh(recount: boolean) {
    if (recount)
      Object.assign(this, searchMatches(this.view.state, this.query));
    if (this.searchField.value !== this.query.search)
      this.searchField.value = this.query.search;
    if (this.replaceField.value !== this.query.replace)
      this.replaceField.value = this.query.replace;
    for (const flag of this.flags)
      flag.button.setAttribute("aria-pressed", String(this.query[flag.key]));
    const error = searchProblem(this.query),
      selection = this.view.state.selection.main;
    const index = this.matches.findIndex(
      (match) => match.from === selection.from && match.to === selection.to,
    );
    this.count.textContent = this.query.search
      ? `${index < 0 ? "—" : index + 1} / ${this.matches.length}${this.truncated ? "+" : ""}`
      : "整个工程";
    this.count.title = this.truncated
      ? `匹配超过 ${MAX_SEARCH_MATCHES} 处，请缩小搜索条件后全部替换`
      : `${this.matches.length} 处匹配`;
    this.error.textContent =
      error ||
      (this.truncated
        ? `仅显示前 ${MAX_SEARCH_MATCHES} 处匹配，请缩小条件后全部替换`
        : "");
    this.error.hidden = !error && !this.truncated;
    this.searchField.setAttribute("aria-invalid", String(!!error));
    this.help.hidden = !this.query.regexp;
    const current =
      this.matches[index] ||
      this.matches.find((match) => match.from >= selection.to) ||
      this.matches[0];
    this.preview.hidden = !this.query.regexp || !current;
    if (current) {
      const original =
        this.view.state.sliceDoc(current.from, current.to) || "（空位置）";
      this.preview.textContent = `替换预览：${original.slice(0, 80)} → ${(replacementText(this.query, current) || "（删除）").slice(0, 120)}`;
    }
    for (const button of this.navigation)
      button.disabled = !this.matches.length;
    this.replaceButtons[0].disabled =
      this.view.state.readOnly || !current || !current.precise;
    this.replaceButtons[1].disabled =
      this.view.state.readOnly || !this.matches.length || this.truncated;
  }
  navigate(direction: number) {
    if (!this.matches.length) return;
    const selection = this.view.state.selection.main;
    const current = this.matches.findIndex(
      (match) => match.from === selection.from && match.to === selection.to,
    );
    let index =
      current >= 0
        ? (current + direction + this.matches.length) % this.matches.length
        : direction > 0
          ? this.matches.findIndex((match) => match.from >= selection.to)
          : this.matches.findLastIndex((match) => match.to <= selection.from);
    if (index < 0) index = direction > 0 ? 0 : this.matches.length - 1;
    this.select(this.matches[index]);
  }
  select(match: SearchMatch) {
    this.view.dispatch({
      selection: EditorSelection.single(match.from, match.to),
      effects: EditorView.scrollIntoView(match.from, { y: "nearest" }),
    });
  }
  replace(all: boolean) {
    if (
      this.view.state.readOnly ||
      !this.matches.length ||
      (all && this.truncated)
    )
      return;
    const selection = this.view.state.selection.main;
    const current =
      this.matches.find(
        (match) => match.from === selection.from && match.to === selection.to,
      ) ||
      this.matches.find((match) => match.from >= selection.to) ||
      this.matches[0];
    try {
      const changes = replacementChanges(
        this.view.state,
        this.query,
        all ? this.matches : [current],
      );
      if (!changes.length) return;
      const changeSet = this.view.state.changes(changes);
      const index = this.matches.indexOf(current);
      const next =
        this.matches.length > 1
          ? this.matches[(index + 1) % this.matches.length]
          : null;
      this.view.dispatch({
        changes: changeSet,
        ...(!all
          ? {
              selection: next
                ? EditorSelection.single(
                    changeSet.mapPos(next.from, 1),
                    changeSet.mapPos(next.to, 1),
                  )
                : EditorSelection.cursor(changeSet.mapPos(current.to, 1)),
            }
          : {}),
        userEvent: all ? "input.replace.all" : "input.replace",
        annotations: Transaction.addToHistory.of(true),
      });
      this.result.textContent = `已替换 ${changes.length} 处`;
    } catch (error) {
      this.error.hidden = false;
      this.error.textContent =
        error instanceof Error ? error.message : String(error);
    }
  }
  mount() {
    this.searchField.focus();
    this.searchField.select();
  }
  destroy() {
    panels.delete(this.view);
  }
}
export type SearchRequest = { id: number; replace: boolean };
export const studioSearch = search({
  top: true,
  literal: true,
  createPanel: (view) => new StudioSearchPanel(view),
});
export function openStudioSearch(view: EditorView, replace = false) {
  const old = getSearchQuery(view.state);
  openSearchPanel(view);
  const seeded = getSearchQuery(view.state);
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({ ...seeded, literal: true, replace: old.replace }),
    ),
  });
  const panel = panels.get(view);
  const field = replace ? panel?.replaceField : panel?.searchField;
  field?.focus();
  field?.select();
  return true;
}
export function navigateStudioSearch(view: EditorView, direction: number) {
  if (!panels.has(view)) openStudioSearch(view);
  panels.get(view)?.navigate(direction);
  return true;
}
