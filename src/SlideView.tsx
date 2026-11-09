import { targetContains, type SceneTarget } from "./studio/source-map";
import { resolveTheme } from "./themes";
import { memo, useMemo, useLayoutEffect, useRef, useState } from "react";
import type { Deck, Slide } from "./dsl";
import { scene, TEXT_LINE_HEIGHT, type Element } from "./scene";
import { richHtml } from "./rich-text-render";
import { mathSvg } from "./math";
import { timeline, easingCss, entranceFrames } from "./motion";
function SceneElement({
  e,
  assets,
  step,
  animate,
  delay,
  elementIndex,
}: {
  e: Element;
  assets: Record<string, string>;
  step: number;
  animate: boolean;
  delay: number;
  elementIndex: number;
}) {
  const ref = useRef<HTMLDivElement>(null),
    visible = e.step <= step;
  useLayoutEffect(() => {
    const node = ref.current;
    if (
      !node ||
      !visible ||
      !animate ||
      step !== e.step ||
      !e.motionKey ||
      !Number.isFinite(step) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const effect = e.appear?.effect || "rise";
    const animation = node.animate(entranceFrames(effect), {
      duration: effect === "none" ? 1 : (e.appear?.duration ?? 600),
      delay,
      easing: easingCss[e.appear?.easing || "easeOut"],
      fill: "both",
    });
    return () => animation.cancel();
  }, [
    visible,
    animate,
    step,
    e.motionKey,
    delay,
    e.appear?.effect,
    e.appear?.duration,
    e.appear?.easing,
  ]);
  const style: React.CSSProperties = {
    position: "absolute",
    left: e.x,
    top: e.y,
    width: e.w,
    height: e.h,
    opacity: visible ? 1 : 0,
    visibility: visible ? "visible" : "hidden",
  };
  let content: React.ReactNode;
  if (e.kind === "rect") {
    style.background = e.fill;
    if (e.glass) {
      const opacity = e.glass.opacity ?? 0.68;
      const hex = e.fill || "#ffffff";
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      Object.assign(style, {
        background: `rgba(${rgb.join(",")},${opacity})`,
        backdropFilter: `blur(${e.glass.blur ?? 24}px) saturate(130%)`,
        WebkitBackdropFilter: `blur(${e.glass.blur ?? 24}px) saturate(130%)`,
        border: "1.5px solid rgba(255,255,255,.65)",
        boxShadow:
          "0 14px 40px rgba(35,60,53,.08), inset 0 1px 0 rgba(255,255,255,.6)",
        borderRadius: e.glass.radius ?? 28,
      });
    }
    style.borderRadius = e.shape === "ellipse" ? "50%" : e.radius;
  } else if (e.kind === "text") {
    Object.assign(style, {
      fontSize: e.size,
      color: e.color,
      fontWeight: e.bold ? 650 : 400,
      textAlign: e.align || "left",
      whiteSpace: "pre-wrap",
      lineHeight: TEXT_LINE_HEIGHT,
      fontFamily: e.mono ? "monospace" : undefined,
      overflow: "hidden",
      overflowWrap: "anywhere",
    });
    content = e.rich ? (
      <span dangerouslySetInnerHTML={{ __html: richHtml(e.rich, e.color) }} />
    ) : (
      e.text
    );
  } else {
    const src =
      e.data ||
      (e.kind === "equation"
        ? mathSvg(e.text || "", e.color || "#192c2a")
        : assets[e.src || ""]);
    content = src ? (
      <img
        src={src}
        alt={e.kind === "equation" ? e.text : e.src || ""}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    ) : (
      <div className="missing-image" style={{ width: "100%", height: "100%" }}>
        未找到图片 · {e.src || "公式错误"}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      style={style}
      data-scene-element={elementIndex}
      data-motion={e.motionKey}
      data-step={e.step}
    >
      {content}
    </div>
  );
}
function SlideViewContent({
  deck,
  slide,
  index,
  assets,
  step = Infinity,
  animate = false,
  epoch = 0,
  onContextMenu,
  highlight,
}: {
  deck: Deck;
  slide: Slide;
  index: number;
  assets: Record<string, string>;
  step?: number;
  animate?: boolean;
  epoch?: number;
  onContextMenu?: (
    event: React.MouseEvent,
    target: SceneTarget,
    element?: Element,
  ) => void;
  highlight?: SceneTarget;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setScale(ref.current.clientWidth / 1280);
    const ro = new ResizeObserver((entries) =>
      setScale(entries[0].contentRect.width / 1280),
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const elements = useMemo(
    () => scene(deck, slide, index),
    [deck.theme, deck.title, deck.author, slide, index],
  );
  const starts = useMemo(
    () =>
      new Map(
        timeline(elements).flatMap((c) =>
          c.elements.map((i) => [i, c.start] as const),
        ),
      ),
    [elements],
  );
  const selected =
    highlight?.page === index
      ? elements.filter(
          (e) =>
            e.source &&
            targetContains(highlight, e.source) &&
            e.w > 0 &&
            e.h > 0,
        )
      : [];
  const bounds = selected.length
    ? {
        x: Math.max(0, Math.min(...selected.map((e) => e.x))),
        y: Math.max(0, Math.min(...selected.map((e) => e.y))),
        right: Math.min(1280, Math.max(...selected.map((e) => e.x + e.w))),
        bottom: Math.min(720, Math.max(...selected.map((e) => e.y + e.h))),
      }
    : highlight?.page === index
      ? { x: 4, y: 4, right: 1276, bottom: 716 }
      : null;
  const transition = slide.transition || deck.transition || "fade";
  const direction = slide.direction || deck.direction || "left";
  const offset = { left: "4% 0", right: "-4% 0", up: "0 4%", down: "0 -4%" }[
    direction
  ];
  return (
    <div
      ref={ref}
      className="slide-frame"
      tabIndex={onContextMenu ? 0 : undefined}
      aria-label={onContextMenu ? "幻灯片画布" : undefined}
      onContextMenu={
        onContextMenu
          ? (event) => {
              const node = (event.target as HTMLElement).closest<HTMLElement>(
                "[data-scene-element]",
              );
              const element = node
                ? elements[Number(node.dataset.sceneElement)]
                : undefined;
              onContextMenu(
                event,
                element?.source || { scope: "slide", page: index },
                element,
              );
            }
          : undefined
      }
    >
      <div
        key={`${index}-${epoch}`}
        className={`slide-canvas ${animate ? "animate " + transition : ""}`}
        style={
          {
            transform: `scale(${scale})`,
            background: resolveTheme(deck.theme, slide.background).background,
            fontFamily: resolveTheme(deck.theme).font,
            "--duration": `${slide.duration ?? deck.duration ?? 600}ms`,
            "--easing": easingCss[slide.easing || deck.easing || "easeOut"],
            "--slide-offset": offset,
          } as React.CSSProperties
        }
      >
        {elements.map((e, i) => (
          <SceneElement
            key={i}
            elementIndex={i}
            e={e}
            assets={assets}
            step={step}
            animate={animate}
            delay={starts.get(i) || 0}
          />
        ))}
        {bounds && (
          <div
            className="source-highlight"
            aria-hidden="true"
            style={{
              left: bounds.x,
              top: bounds.y,
              width: Math.max(0, bounds.right - bounds.x),
              height: Math.max(0, bounds.bottom - bounds.y),
            }}
          />
        )}
      </div>
    </div>
  );
}

export const SlideView = memo(
  SlideViewContent,
  (a, b) =>
    a.highlight === b.highlight &&
    a.onContextMenu === b.onContextMenu &&
    a.slide === b.slide &&
    a.index === b.index &&
    a.assets === b.assets &&
    a.step === b.step &&
    a.epoch === b.epoch &&
    a.animate === b.animate &&
    a.deck.theme === b.deck.theme &&
    a.deck.title === b.deck.title &&
    a.deck.author === b.deck.author &&
    a.deck.transition === b.deck.transition &&
    a.deck.duration === b.deck.duration &&
    a.deck.easing === b.deck.easing &&
    a.deck.direction === b.deck.direction,
);
