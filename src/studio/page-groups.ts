import { parseDeck, type Deck } from "../dsl";
import { isMathEnvironment } from "../math-environments";
import { readSyntax, type Call } from "../syntax";
export function isSlideCall(name: string) {
  return name === "Slide" || name === "DynamicSlide";
}
export function automaticCall(call: Call): boolean {
  if (call.name === "DynamicSlide") return true;
  if (call.named.autoPages === false) return false;
  const scan = (c: Call): boolean =>
    isMathEnvironment(c.name) ||
    ["PageBreak", "ColumnBreak", "LeftColumn", "RightColumn"].includes(
      c.name,
    ) ||
    c.children.some(scan);
  return (
    call.named.autoPages === true ||
    call.named.columns !== undefined ||
    call.children.some(scan)
  );
}
export function sourcePages(source: string) {
  const calls = readSyntax(source).children.filter((c) => isSlideCall(c.name));
  if (!calls.some(automaticCall)) return { calls, pages: calls };
  const deck = parseDeck(source),
    pages: Call[] = [];
  let ordinal = 0;
  for (const slide of deck.slides) {
    const dynamic = slide.dynamic,
      index = dynamic?.sourceIndex ?? ordinal,
      call = calls[index];
    if (!call) throw Error("页面声明映射失败，请检查动态页结构");
    pages.push(call);
    if (dynamic) {
      if (dynamic.part === dynamic.total - 1) ordinal = dynamic.sourceIndex + 1;
    } else ordinal++;
  }
  return { calls, pages };
}
export function pageGroup(deck: Deck, index: number) {
  const dynamic = deck.slides[index]?.dynamic;
  return dynamic
    ? {
        first: index - dynamic.part,
        last: index - dynamic.part + dynamic.total - 1,
        count: dynamic.total,
      }
    : { first: index, last: index, count: 1 };
}
export function groupMoveTarget(deck: Deck, index: number, direction: -1 | 1) {
  const g = pageGroup(deck, index);
  return direction < 0
    ? g.first > 0
      ? pageGroup(deck, g.first - 1).first
      : g.first
    : g.last < deck.slides.length - 1
      ? g.first + pageGroup(deck, g.last + 1).count
      : g.first;
}
