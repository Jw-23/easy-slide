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
