import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { SlideView } from "../SlideView";
import { scene } from "../scene";
import { nextPosition, previousPosition } from "../studio/presentation";
import type { Studio } from "../studio/use-studio";
export function PresentationView({
  studio: s,
  onClose,
}: {
  studio: Studio;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [position, setPosition] = useState({ page: s.active, step: 0 });
  const stages = useMemo(
    () =>
      s.deck.slides.map((slide, i) =>
        [...new Set([0, ...scene(s.deck, slide, i).map((e) => e.step)])].sort(
          (a, b) => a - b,
        ),
      ),
    [s.deck],
  );
  const current = stages[position.page],
    last =
      position.page === s.deck.slides.length - 1 &&
      position.step >= current.at(-1)!;
  const callbacks = useRef({
    next: () => {},
    previous: () => {},
    close: onClose,
  });
  callbacks.current = {
    next: () => {
      if (last) onClose();
      else
        setPosition((p) =>
          nextPosition(p, stages[p.page], s.deck.slides.length),
        );
    },
    previous: () =>
      setPosition((p) =>
        previousPosition(p, stages[p.page], stages[p.page - 1] || []),
      ),
    close: onClose,
  };
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const key = (event: KeyboardEvent) => {
      if (
        ["ArrowRight", " ", "PageDown", "Enter"].includes(event.key) &&
        !(event.target instanceof HTMLButtonElement && event.key === "Enter")
      ) {
        event.preventDefault();
        callbacks.current.next();
      }
      if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        callbacks.current.previous();
      }
    };
    dialog.addEventListener("keydown", key);
    return () => {
      dialog.removeEventListener("keydown", key);
      if (dialog.open) dialog.close();
    };
  }, []);
  useEffect(() => {
    s.go(position.page);
  }, [position.page]);
  return (
    <dialog
      className="presentation"
      ref={ref}
      aria-label="幻灯片放映"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className="presentation-slide"
        onClick={() => callbacks.current.next()}
      >
        <SlideView
          deck={s.deck}
          slide={s.deck.slides[position.page]}
          index={position.page}
          assets={s.project.assets}
          step={position.step}
          animate
        />
      </div>
      <div className="presentation-controls">
        <button
          aria-label="上一步"
          onClick={() => callbacks.current.previous()}
          disabled={position.page === 0 && position.step === 0}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {position.page + 1} / {s.deck.slides.length}
        </span>
        <button
          aria-label={last ? "结束演示" : "下一步"}
          onClick={() => callbacks.current.next()}
        >
          {last ? <X size={18} /> : <ChevronRight size={18} />}
        </button>
        <span className="presentation-hint">方向键 / 空格继续 · Esc 退出</span>
        <button aria-label="退出演示" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
    </dialog>
  );
}
