import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Play,
} from "lucide-react";
import { SlideView } from "../SlideView";
import { MotionPanel } from "../MotionPanel";
import { timeline } from "../motion";
import { scene } from "../scene";
import type { Studio } from "../studio/use-studio";
export function CanvasWorkspace({
  studio: s,
  onCode,
}: {
  studio: Studio;
  onCode: () => void;
}) {
  const [drawer, setDrawer] = useState<"notes" | "motion" | null>(null),
    [preview, setPreview] = useState({
      page: s.active,
      step: Infinity,
      epoch: 0,
    });
  useEffect(
    () => setPreview((p) => ({ ...p, page: s.active, step: Infinity })),
    [s.active],
  );
  const cues = useMemo(
    () => timeline(scene(s.deck, s.slide, s.active)),
    [s.deck, s.slide, s.active],
  );
  const step = preview.page === s.active ? preview.step : Infinity;
  return (
    <main className="main" aria-label="幻灯片预览">
      <div className="canvas-area">
        <div className="preview-wrap">
          <SlideView
            deck={s.deck}
            slide={s.slide}
            index={s.active}
            assets={s.project.assets}
            step={step}
            epoch={preview.epoch}
            animate
          />
        </div>
      </div>
      <div className="canvas-controls">
        <div className="bottom-tabs">
          <button
            className={drawer === "notes" ? "active" : ""}
            aria-expanded={drawer === "notes"}
            aria-controls="canvas-drawer"
            onClick={() => setDrawer(drawer === "notes" ? null : "notes")}
          >
            <FileText size={13} />
            备注
          </button>
          <button
            className={drawer === "motion" ? "active" : ""}
            aria-expanded={drawer === "motion"}
            aria-controls="canvas-drawer"
            onClick={() => setDrawer(drawer === "motion" ? null : "motion")}
          >
            <Play size={12} />
            动画编排<span>{cues.length}</span>
          </button>
        </div>
        <div className="page-controls">
          <button
            className="icon-button"
            aria-label="上一页"
            disabled={s.active === 0}
            onClick={() => s.go(s.active - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {s.active + 1} / {s.deck.slides.length}
          </span>
          <button
            className="icon-button"
            aria-label="下一页"
            disabled={s.active === s.deck.slides.length - 1}
            onClick={() => s.go(s.active + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      {drawer && (
        <section
          className="canvas-drawer"
          id="canvas-drawer"
          aria-label={drawer === "notes" ? "演讲者备注" : "动画编排"}
        >
          <button
            className="drawer-close icon-button"
            aria-label="收起底部面板"
            onClick={() => setDrawer(null)}
          >
            <ChevronDown size={14} />
          </button>
          {drawer === "notes" ? (
            <textarea
              aria-label="演讲者备注"
              value={s.slide.notes || ""}
              disabled={!s.editable}
              placeholder="添加演讲者备注"
              onChange={(event) => s.field({ notes: event.target.value })}
            />
          ) : (
            <MotionPanel
              cues={cues}
              step={step}
              onPreview={(value) =>
                setPreview((p) => ({
                  page: s.active,
                  step: value,
                  epoch: p.epoch + 1,
                }))
              }
              onAll={() =>
                setPreview((p) => ({ ...p, page: s.active, step: Infinity }))
              }
              onEdit={onCode}
            />
          )}
        </section>
      )}
    </main>
  );
}
