export class DslError extends Error {
  constructor(
    public detail: string,
    public from: number,
    public to: number,
    public line: number,
    public column: number,
    public hint = "检查此处的参数、引号和括号。",
  ) {
    super(`第 ${line} 行，第 ${column} 列：${detail}`);
    this.name = "DslError";
  }
}
export function closest(word: string, options: string[]): string | undefined {
  const distance = (a: string, b: string) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const old = row[j];
        row[j] = Math.min(
          row[j] + 1,
          row[j - 1] + 1,
          prev + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
        prev = old;
      }
    }
    return row[b.length];
  };
  return options
    .map((value) => ({
      value,
      d: distance(word.toLowerCase(), value.toLowerCase()),
    }))
    .sort((a, b) => a.d - b.d)
    .find((x) => x.d <= Math.max(2, Math.floor(word.length / 3)))?.value;
}
