import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { SlideView } from "../SlideView";
import { layoutLabels, pageLayout } from "../dsl";
import type { Studio } from "../studio/use-studio";
export function SlideNavigator({
  studio: s,
  onContextMenu,
}: {
  studio: Studio;
  onContextMenu?: (event: React.MouseEvent, page: number) => void;
}) {
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const pages = s.deck.slides
    .map((slide, index) => ({ slide, index }))
    .filter(({ slide, index }) =>
      `${index + 1} ${slide.title}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    );
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [s.active]);
  return (
    <aside className="sidebar" aria-label="页面导航">
      <div className="sidebar-top">
        <strong>页面</strong>
        <span className="count">{s.deck.slides.length}</span>
        <button
          className="icon-button"
          title="添加幻灯片"
          disabled={!s.editable || s.deck.slides.length >= 200}
          onClick={s.add}
        >
          <Plus size={16} />
        </button>
      </div>
      <label className="slide-search">
        <Search size={13} />
        <input
          aria-label="筛选页面"
          placeholder="筛选页面"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="icon-button"
            aria-label="清除筛选"
            onClick={() => setQuery("")}
          >
            <X size={12} />
          </button>
        )}
      </label>
      <div className="slide-list" ref={list}>
        {pages.map(({ slide, index }) => (
          <button
            key={slide.id || index}
            className={`slide-item ${index === s.active ? "selected" : ""}`}
            tabIndex={
              index ===
              (pages.some((p) => p.index === s.active)
                ? s.active
                : pages[0]?.index)
                ? 0
                : -1
            }
            aria-label={`第 ${index + 1} 页 ${slide.title.replaceAll("\n", " ")}`}
            aria-current={index === s.active ? "page" : undefined}
            onClick={() => s.go(index)}
            onContextMenu={(event) => onContextMenu?.(event, index)}
            onKeyDown={(event) => {
              const pos = pages.findIndex((p) => p.index === index);
              const next =
                event.key === "ArrowDown"
                  ? pages[pos + 1]
                  : event.key === "ArrowUp"
                    ? pages[pos - 1]
                    : event.key === "Home"
                      ? pages[0]
                      : event.key === "End"
                        ? pages.at(-1)
                        : undefined;
              if (next) {
                event.preventDefault();
                s.go(next.index);
                requestAnimationFrame(() =>
                  list.current
                    ?.querySelector<HTMLButtonElement>(
                      `[data-page="${next.index}"]`,
                    )
                    ?.focus(),
                );
              }
            }}
            data-page={index}
          >
            <span className="slide-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="thumb">
              <SlideView
                deck={s.deck}
                slide={slide}
                index={index}
                assets={s.project.assets}
              />
            </div>
            <div className="slide-label">
              {slide.title.replaceAll("\n", " ")}
              <small>{layoutLabels[pageLayout(slide)]}</small>
            </div>
          </button>
        ))}
        {!pages.length && <p className="empty-state">没有匹配的页面</p>}
      </div>
      <div className="slide-actions" aria-label="页面操作">
        <button
          className="icon-button"
          aria-label="上移此页"
          disabled={!s.editable || s.active === 0}
          onClick={() => s.move(-1)}
        >
          <ArrowUp size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="下移此页"
          disabled={!s.editable || s.active === s.deck.slides.length - 1}
          onClick={() => s.move(1)}
        >
          <ArrowDown size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="复制此页"
          disabled={!s.editable || s.deck.slides.length >= 200}
          onClick={s.duplicate}
        >
          <Copy size={15} />
        </button>
        <button
          className="icon-button danger"
          aria-label="删除此页"
          disabled={!s.editable || s.deck.slides.length <= 1}
          onClick={s.remove}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </aside>
  );
}
