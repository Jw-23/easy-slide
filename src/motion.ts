import type { Motion } from "./dsl";
import type { Element } from "./scene";
export const easingCss = {
  linear: "linear",
  easeOut: "cubic-bezier(.22,1,.36,1)",
  easeInOut: "cubic-bezier(.65,0,.35,1)",
  spring: "cubic-bezier(.18,.9,.3,1.16)",
};
export type Cue = {
  key: string;
  label: string;
  step: number;
  order: number;
  start: number;
  end: number;
  motion: Motion;
  elements: number[];
};
/** Within a click stage, equal orders run together; later orders start after the previous order finishes. */
export function timeline(elements: Element[]): Cue[] {
  const groups = new Map<string, Cue>();
  elements.forEach((e, i) => {
    if (!e.motionKey) return;
    const key = e.motionKey + ":" + e.step;
    let cue = groups.get(key);
    if (!cue) {
      cue = {
        key,
        label: e.text || e.src || "内容组",
        step: e.step,
        order: e.appear?.order ?? 0,
        start: 0,
        end: 0,
        motion: e.appear || { effect: "rise" },
        elements: [],
      };
      groups.set(key, cue);
    }
    cue.elements.push(i);
    if (cue.label === "内容组" && (e.text || e.src))
      cue.label = e.text || e.src!;
  });
  const cues = [...groups.values()];
  for (const step of new Set(cues.map((c) => c.step))) {
    let cursor = 0;
    const stage = cues.filter((c) => c.step === step);
    for (const order of [...new Set(stage.map((c) => c.order))].sort(
      (a, b) => a - b,
    )) {
      let end = cursor;
      for (const c of stage.filter((c) => c.order === order)) {
        c.start = cursor + (c.motion.delay ?? 0);
        c.end =
          c.start +
          (c.motion.effect === "none" ? 0 : (c.motion.duration ?? 600));
        end = Math.max(end, c.end);
      }
      cursor = end;
    }
  }
  return cues.sort(
    (a, b) => a.step - b.step || a.start - b.start || a.order - b.order,
  );
}
export function entranceFrames(effect: Motion["effect"]): Keyframe[] {
  const transform = {
    fade: "none",
    rise: "translateY(30px)",
    slideLeft: "translateX(-60px)",
    slideRight: "translateX(60px)",
    zoom: "scale(.88)",
    none: "none",
  }[effect];
  return [
    { opacity: effect === "none" ? 1 : 0, transform },
    { opacity: 1, transform: "none" },
  ];
}
