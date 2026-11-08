export type SaveState = "pending" | "saving" | "saved" | "error";
/** Serialize writes and collapse pending revisions. An older write cannot win a race. */
export class DraftQueue<T> {
  private pending: { value: T; version: number } | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private version = 0;
  constructor(
    private write: (value: T) => Promise<void>,
    private status: (state: SaveState, error?: unknown) => void,
  ) {}
  schedule(value: T, delay = 600) {
    clearTimeout(this.timer);
    this.pending = { value, version: ++this.version };
    this.status("pending");
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, delay);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    this.running = this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async drain() {
    let failure: unknown;
    while (this.pending) {
      clearTimeout(this.timer);
      const job = this.pending;
      this.pending = null;
      this.status("saving");
      try {
        await this.write(job.value);
        failure = undefined;
        if (job.version === this.version) this.status("saved");
      } catch (error) {
        failure = error;
        if (job.version === this.version) this.status("error", error);
      }
    }
    if (failure) throw failure;
  }
  dispose() {
    clearTimeout(this.timer);
    this.pending = null;
  }
}
