import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, Maximize } from "lucide-react";
import { SlideView } from "../SlideView";
import { scene } from "../scene";
import {
  nextPosition,
  previousPosition,
  wheelNavigator,
} from "../studio/presentation";
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
  const [controls, setControls] = useState(false);
  const active = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const current = stages[position.page],
    last =
      position.page === s.deck.slides.length - 1 &&
      position.step >= current.at(-1)!;
  const lastPosition = useRef(last);
  lastPosition.current = last;
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
    dialog.focus({ preventScroll: true });
    active.current = true;
    const root = document.documentElement,
      previousFullscreen = document.fullscreenElement;
    if (!previousFullscreen)
      void root
        .requestFullscreen?.()
        .then(() => {
          if (active.current) dialog.focus({ preventScroll: true });
          if (!active.current && document.fullscreenElement === root)
            void document.exitFullscreen().catch(() => {});
        })
        .catch(() => {});
    let owned = !!previousFullscreen;
    const fullscreen = () => {
      if (!previousFullscreen && document.fullscreenElement === root)
        owned = true;
      else if (owned) callbacks.current.close();
    };
    document.addEventListener("fullscreenchange", fullscreen);
    const navigate = wheelNavigator();
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
        return;
      const direction = navigate(
        event.deltaY,
        event.timeStamp,
        event.deltaMode,
      );
      if (direction === 1) {
        if (!lastPosition.current) callbacks.current.next();
      } else if (direction === -1) callbacks.current.previous();
    };
    dialog.addEventListener("wheel", wheel, { passive: false });
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
      dialog.removeEventListener("wheel", wheel);
      document.removeEventListener("fullscreenchange", fullscreen);
      clearTimeout(hideTimer.current);
      active.current = false;
      if (!previousFullscreen && document.fullscreenElement === root)
        void document.exitFullscreen().catch(() => {});
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
      tabIndex={-1}
      onPointerMove={(event) => {
        const r = event.currentTarget.getBoundingClientRect(),
          x = (event.clientX - r.left) / r.width,
          y = (event.clientY - r.top) / r.height;
        if (x > 0.2 && x < 0.8 && y > 0.76) {
          clearTimeout(hideTimer.current);
          setControls(true);
        } else {
          setControls(false);
        }
      }}
      onPointerLeave={() => setControls(false)}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") return;
        clearTimeout(hideTimer.current);
        setControls(true);
        hideTimer.current = setTimeout(() => setControls(false), 2500);
      }}
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
      <div
        className={`presentation-controls ${controls ? "visible" : ""}`}
        aria-label="放映控制"
        onPointerLeave={(event) => {
          if (
            event.pointerType === "mouse" &&
            document.activeElement?.closest(".presentation-controls")
          )
            ref.current?.focus({ preventScroll: true });
        }}
      >
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
        <button
          aria-label="进入全屏"
          title="进入全屏"
          onClick={() =>
            void document.documentElement.requestFullscreen?.().catch(() => {})
          }
        >
          <Maximize size={18} />
        </button>
        <button aria-label="退出演示" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
    </dialog>
  );
}
