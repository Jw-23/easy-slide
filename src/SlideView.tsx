import { useEffect, useRef, useState } from "react";
import type { Deck, Slide } from "./dsl";
import { scene } from "./scene";
import { mathSvg } from "./math";
export function SlideView({
  deck,
  slide,
  index,
  assets,
  step = Infinity,
  animate = false,
}: {
  deck: Deck;
  slide: Slide;
  index: number;
  assets: Record<string, string>;
  step?: number;
  animate?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) =>
      setScale(entries[0].contentRect.width / 1280),
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const transition = slide.transition || deck.transition || "fade";
  return (
    <div ref={ref} className="slide-frame">
      <div
        key={index}
        className={`slide-canvas ${animate ? "animate " + transition : ""}`}
        style={
          {
            transform: `scale(${scale})`,
            background: slide.background || deck.theme?.background || "#fafbf9",
            fontFamily: deck.theme?.font || "Arial, sans-serif",
            "--duration": `${slide.duration ?? deck.duration ?? 600}ms`,
          } as React.CSSProperties
        }
      >
        {scene(deck, slide, index).map((e, i) => {
          const style: React.CSSProperties = {
            position: "absolute",
            left: e.x,
            top: e.y,
            width: e.w,
            height: e.h,
            opacity: e.step <= step ? 1 : 0,
            transition: "opacity 450ms, transform 450ms",
            transform: e.step <= step ? "none" : "translateY(15px)",
          };
          if (e.kind === "rect")
            return (
              <div
                key={i}
                style={{ ...style, background: e.fill, borderRadius: e.radius }}
              />
            );
          if (e.kind === "text")
            return (
              <div
                key={i}
                style={{
                  ...style,
                  fontSize: e.size,
                  color: e.color,
                  fontWeight: e.bold ? 650 : 400,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.42,
                  fontFamily: e.mono ? "monospace" : undefined,
                  overflow: "hidden",
                  overflowWrap: "anywhere",
                }}
              >
                {e.text}
              </div>
            );
          const src =
            e.kind === "equation"
              ? mathSvg(e.text || "", e.color || "#192c2a")
              : assets[e.src || ""];
          return src ? (
            <img
              key={i}
              src={src}
              alt={e.kind === "equation" ? e.text : e.src}
              style={{ ...style, objectFit: "contain" }}
            />
          ) : (
            <div key={i} className="missing-image" style={style}>
              未找到图片 · {e.src || "公式错误"}
            </div>
          );
        })}
      </div>
    </div>
  );
}
