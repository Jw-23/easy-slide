import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Deck, Slide } from "./dsl";
import { scene, TEXT_LINE_HEIGHT, type Element } from "./scene";
import { mathSvg } from "./math";
import { timeline, easingCss, entranceFrames } from "./motion";
function SceneElement({
  e,
  assets,
  step,
  animate,
  delay,
}: {
  e: Element;
  assets: Record<string, string>;
  step: number;
  animate: boolean;
  delay: number;
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
    style.borderRadius = e.radius;
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
    content = e.text;
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
    <div ref={ref} style={style} data-motion={e.motionKey} data-step={e.step}>
      {content}
    </div>
  );
}
export function SlideView({
  deck,
  slide,
  index,
  assets,
  step = Infinity,
  animate = false,
  epoch = 0,
}: {
  deck: Deck;
  slide: Slide;
  index: number;
  assets: Record<string, string>;
  step?: number;
  animate?: boolean;
  epoch?: number;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [scale, setScale] = useState(1);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) =>
      setScale(entries[0].contentRect.width / 1280),
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const elements = scene(deck, slide, index),
    cues = timeline(elements),
    starts = new Map(
      cues.flatMap((c) => c.elements.map((i) => [i, c.start] as const)),
    );
  const transition = slide.transition || deck.transition || "fade";
  const direction = slide.direction || deck.direction || "left";
  const offset = { left: "4% 0", right: "-4% 0", up: "0 4%", down: "0 -4%" }[
    direction
  ];
  return (
    <div ref={ref} className="slide-frame">
      <div
        key={`${index}-${epoch}`}
        className={`slide-canvas ${animate ? "animate " + transition : ""}`}
        style={
          {
            transform: `scale(${scale})`,
            background: slide.background || deck.theme?.background || "#fafbf9",
            fontFamily: deck.theme?.font || "Arial, sans-serif",
            "--duration": `${slide.duration ?? deck.duration ?? 600}ms`,
            "--easing": easingCss[slide.easing || deck.easing || "easeOut"],
            "--slide-offset": offset,
          } as React.CSSProperties
        }
      >
        {elements.map((e, i) => (
          <SceneElement
            key={i}
            e={e}
            assets={assets}
            step={step}
            animate={animate}
            delay={starts.get(i) || 0}
          />
        ))}
      </div>
    </div>
  );
}
