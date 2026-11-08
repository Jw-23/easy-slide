import { parseDeck, type Deck } from "../dsl";
/** Reuse unchanged pages so unrelated edits do not rebuild every thumbnail. */
export function compileDocument(source: string, previous: Deck): Deck {
  const next = parseDeck(source),
    equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return {
    ...next,
    theme: equal(next.theme, previous.theme) ? previous.theme : next.theme,
    slides: next.slides.map((slide, index) =>
      equal(slide, previous.slides[index]) ? previous.slides[index] : slide,
    ),
  };
}
