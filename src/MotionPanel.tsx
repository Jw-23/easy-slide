import type { Cue } from "./motion";
import { Play, RotateCcw, Code2 } from "lucide-react";
export function MotionPanel({
  cues,
  step,
  onPreview,
  onAll,
  onEdit,
}: {
  cues: Cue[];
  step: number;
  onPreview: (step: number) => void;
  onAll: () => void;
  onEdit: () => void;
}) {
  const stages = [...new Set([0, ...cues.map((c) => c.step)])].sort(
    (a, b) => a - b,
  );
  const total = Math.max(600, ...cues.map((c) => c.end));
  const names: Record<string, string> = {
    fade: "淡入",
    rise: "上浮",
    slideLeft: "从左进入",
    slideRight: "从右进入",
    zoom: "缩放",
    none: "直接显示",
  };
  return (
    <div className="motion-panel">
      <div className="motion-toolbar">
        <div>
          <strong>动画编排</strong>
        </div>
        <button onClick={() => onPreview(0)} title="重播入场">
          <RotateCcw size={12} />
          重播
        </button>
        <button onClick={onAll}>完整页面</button>
      </div>
      <div className="stage-chips">
        {stages.map((s) => (
          <button
            key={s}
            className={step === s ? "selected" : ""}
            onClick={() => onPreview(s)}
          >
            <Play size={10} />
            {s === 0 ? "进入页面" : `点击 ${s}`}
          </button>
        ))}
        <button className="edit-motion" onClick={onEdit}>
          <Code2 size={12} />
          编辑 DSL
        </button>
      </div>
      {!cues.length ? (
        <p className="empty-motion">
          为内容添加 .appear(.rise, step: 1, order: 0) 开始编排。
        </p>
      ) : (
        <div className="cue-list">
          {cues.map((c) => (
            <button
              className={"cue-row " + (step === c.step ? "playing" : "")}
              key={c.key}
              onClick={() => onPreview(c.step)}
              title={`阶段 ${c.step} / 顺序 ${c.order} / ${c.start}–${c.end} ms / ${c.motion.easing || "easeOut"}`}
            >
              <span className="cue-stage">
                {c.step === 0 ? "入场" : c.step}
              </span>
              <span className="cue-label">{c.label}</span>
              <span className="cue-effect">{names[c.motion.effect]}</span>
              <div className="cue-track">
                <i
                  style={{
                    left: `${(c.start / total) * 100}%`,
                    width: `${Math.max(1, ((c.end - c.start) / total) * 100)}%`,
                  }}
                />
              </div>
              <span className="cue-time">
                {c.start}–{c.end} ms
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
