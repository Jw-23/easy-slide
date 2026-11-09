import type { ComponentClip } from "./component-clipboard";
export type ClipboardContent = {
  text: string;
  component?: ComponentClip;
  files?: File[];
  local?: boolean;
};
/** Keep one application-local clipboard when a browser denies system clipboard access. */
export class StudioClipboard {
  private value: ClipboardContent | null = null;
  async write(text: string, component?: ComponentClip): Promise<boolean> {
    this.value = { text, component };
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const previous = document.activeElement as HTMLElement | null,
        area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;left:-10000px;top:0";
      document.body.append(area);
      area.select();
      try {
        return document.execCommand("copy");
      } catch {
        return false;
      } finally {
        area.remove();
        previous?.focus({ preventScroll: true });
      }
    }
  }
  fromText(text: string): ClipboardContent {
    return {
      text,
      ...(this.value?.text === text ? { component: this.value.component } : {}),
    };
  }
  async read(): Promise<ClipboardContent> {
    try {
      const items = await navigator.clipboard.read(),
        files: File[] = [];
      let text: string | undefined;
      for (const item of items) {
        const image = item.types.find((type) =>
          /^image\/(png|jpeg|webp|gif)$/.test(type),
        );
        if (image) {
          const data = await item.getType(image);
          files.push(
            new File([data], `clipboard.${image.split("/")[1]}`, {
              type: image,
            }),
          );
        }
        if (item.types.includes("text/plain"))
          text = await (await item.getType("text/plain")).text();
      }
      if (files.length) return { text: "", files };
      if (text !== undefined) return this.fromText(text);
    } catch {
      /* Fall back to the narrower readText permission. */
    }
    try {
      return this.fromText(await navigator.clipboard.readText());
    } catch {
      if (this.value) return { ...this.value, local: true };
      throw Error(
        "浏览器不允许读取剪贴板，请使用 Ctrl / ⌘ + V，或先在本应用中复制",
      );
    }
  }
}
