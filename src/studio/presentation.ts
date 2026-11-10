export type Position = { page: number; step: number };
export function nextPosition(
  position: Position,
  stages: number[],
  count: number,
): Position {
  const next = [...stages].sort((a, b) => a - b).find((s) => s > position.step);
  return next !== undefined
    ? { ...position, step: next }
    : position.page + 1 < count
      ? { page: position.page + 1, step: 0 }
      : position;
}
export function previousPosition(
  position: Position,
  stages: number[],
  previousStages: number[],
): Position {
  const previous = [...stages]
    .sort((a, b) => b - a)
    .find((s) => s < position.step);
  return previous !== undefined
    ? { ...position, step: previous }
    : position.page > 0
      ? { page: position.page - 1, step: Math.max(0, ...previousStages) }
      : position;
}

/** One action per wheel gesture; inertial tails extend the quiet period. */
export function wheelNavigator() {
  let last = -Infinity,
    total = 0,
    lastFire = -Infinity,
    fired = false;
  return (delta: number, time: number, mode = 0): -1 | 0 | 1 => {
    if (!Number.isFinite(delta) || delta === 0) return 0;
    if (time - last > 180) {
      total = 0;
      fired = false;
    }
    last = time;
    if (fired) return 0;
    total += delta * (mode === 1 ? 16 : mode === 2 ? 720 : 1);
    if (Math.abs(total) < 45 || time - lastFire < 350) return 0;
    const direction = total > 0 ? 1 : -1;
    total = 0;
    lastFire = time;
    fired = true;
    return direction;
  };
}
