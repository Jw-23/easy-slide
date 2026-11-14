import { CharCategory, type EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";

export const MAX_SEARCH_MATCHES = 10_000;
export type SearchMatch = {
  from: number;
  to: number;
  precise: boolean;
  match?: RegExpExecArray;
};
export function searchProblem(query: SearchQuery): string | null {
  if (!query.search || !query.regexp) return null;
  try {
    new RegExp(query.search, "gmu");
    return null;
  } catch (error) {
    return (
      "正则表达式无效：" +
      (error instanceof Error ? error.message : String(error))
    );
  }
}
const before = (text: string, at: number) => {
  const code = text.charCodeAt(at - 1);
  return text.slice(at - (code >= 0xdc00 && code <= 0xdfff ? 2 : 1), at);
};
export function searchMatches(state: EditorState, query: SearchQuery) {
  const matches: SearchMatch[] = [];
  if (!query.valid) return { matches, truncated: false };
  const text = state.doc.toString();
  const categorize = state.charCategorizer(state.selection.main.head);
  const regex = query.regexp
    ? new RegExp(query.search, "gmu" + (query.caseSensitive ? "" : "i"))
    : null;
  const cursor = regex ? null : query.getCursor(state);
  while (true) {
    let value: SearchMatch;
    if (regex) {
      const match = regex.exec(text);
      if (!match) break;
      value = {
        from: match.index,
        to: match.index + match[0].length,
        match,
        precise: true,
      };
      if (!match[0].length)
        regex.lastIndex +=
          (text.codePointAt(regex.lastIndex) ?? 0) > 0xffff ? 2 : 1;
      if (query.wholeWord) {
        const first = String.fromCodePoint(match[0].codePointAt(0) ?? 32);
        const last = before(match[0], match[0].length);
        const after = String.fromCodePoint(text.codePointAt(value.to) ?? 32);
        if (
          (categorize(first) === CharCategory.Word &&
            categorize(before(text, value.from)) === CharCategory.Word) ||
          (categorize(last) === CharCategory.Word &&
            categorize(after) === CharCategory.Word)
        )
          continue;
      }
    } else {
      const next = cursor!.next();
      if (next.done) break;
      value = next.value as SearchMatch;
    }
    if (matches.length === MAX_SEARCH_MATCHES)
      return { matches, truncated: true };
    matches.push(value);
  }
  return { matches, truncated: false };
}
/** JavaScript capture substitutions, preserving LaTeX backslashes literally. */
export function captureReplacement(
  template: string,
  match: RegExpExecArray,
): string {
  return template.replace(
    /\$(\$|&|<[^>]*>|[0-9]{1,2})/g,
    (marker, key: string) => {
      if (key === "$") return "$";
      if (key === "&") return match[0];
      if (key.startsWith("<"))
        return match.groups ? (match.groups[key.slice(1, -1)] ?? "") : marker;
      const n = Number(key);
      if (n > 0 && n < match.length) return match[n] ?? "";
      if (
        key.length === 2 &&
        Number(key[0]) > 0 &&
        Number(key[0]) < match.length
      )
        return (match[Number(key[0])] ?? "") + key[1];
      return marker;
    },
  );
}
export function replacementText(query: SearchQuery, match: SearchMatch) {
  return query.regexp && match.match
    ? captureReplacement(query.replace, match.match)
    : query.replace;
}
export function replacementChanges(
  state: EditorState,
  query: SearchQuery,
  matches: SearchMatch[],
) {
  let length = state.doc.length;
  const changes = matches
    .filter((match) => match.precise)
    .map((match) => {
      const insert = replacementText(query, match);
      length += insert.length - (match.to - match.from);
      if (length > 2_000_000)
        throw Error("替换后源码超过 2 MB，请缩小替换范围");
      return { from: match.from, to: match.to, insert };
    });
  return changes;
}
