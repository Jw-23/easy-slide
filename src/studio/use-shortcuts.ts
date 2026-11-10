import { useEffect, useRef } from "react";
import type { Studio } from "./use-studio";
export function useShortcuts(studio: Studio, present: () => void) {
  const current = useRef({ studio, present });
  current.current = { studio, present };
  useEffect(() => {
    const frames = new Set<number>();
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
      if (document.querySelector("dialog[open]")) {
        if (event.key.toLowerCase() === "s") event.preventDefault();
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const local = target?.closest<HTMLInputElement>("[data-local-undo]");
      // Commit the locally edited project name before taking a save/presentation
      // snapshot; React finishes the blur update before the next frame.
      const afterCommit = (action: () => void) => {
        if (!local) {
          action();
          return;
        }
        local.blur();
        const frame = requestAnimationFrame(() => {
          frames.delete(frame);
          action();
        });
        frames.add(frame);
      };
      const name = event.key.toLowerCase();
      if (name === "s") {
        event.preventDefault();
        afterCommit(() => {
          void (event.shiftKey
            ? current.current.studio.saveAs()
            : current.current.studio.save());
        });
      }
      if (name === "z" && !local) {
        event.preventDefault();
        if (event.shiftKey) current.current.studio.redo();
        else current.current.studio.undo();
      }
      if (name === "y" && !local) {
        event.preventDefault();
        current.current.studio.redo();
      }
      if (event.key === "Enter" && current.current.studio.editable) {
        event.preventDefault();
        afterCommit(() => current.current.present());
      }
    };
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || document.querySelector("dialog[open]"))
        return;
      const images = Array.from(event.clipboardData?.files || []).filter(
        (file) => file.type.startsWith("image/"),
      );
      if (images.length) {
        event.preventDefault();
        void current.current.studio.addImages(images);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("paste", paste);
      frames.forEach(cancelAnimationFrame);
    };
  }, []);
}
