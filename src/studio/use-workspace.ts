import { useEffect, useRef, useState } from "react";
export type MobileView = "pages" | "preview" | "design" | "dsl" | "assets";
type Preferences = {
  sidebar: boolean;
  inspector: boolean;
  designWidth: number;
  codeWidth: number;
};
const defaults: Preferences = {
  sidebar: true,
  inspector: true,
  designWidth: 292,
  codeWidth: 520,
};
function restore(): Preferences {
  try {
    const value = JSON.parse(
      localStorage.getItem("easy-slide:workspace") || "null",
    );
    return {
      sidebar: typeof value?.sidebar === "boolean" ? value.sidebar : true,
      inspector: typeof value?.inspector === "boolean" ? value.inspector : true,
      designWidth: Number.isFinite(value?.designWidth)
        ? Math.max(260, Math.min(520, value.designWidth))
        : defaults.designWidth,
      codeWidth: Number.isFinite(value?.codeWidth)
        ? Math.max(320, Math.min(900, value.codeWidth))
        : defaults.codeWidth,
    };
  } catch {
    return defaults;
  }
}
export function useWorkspace() {
  const [preferences, setPreferences] = useState(restore),
    [mobile, setMobile] = useState<MobileView>("preview");
  const previous = useRef(
      preferences.sidebar || preferences.inspector
        ? preferences
        : { ...preferences, sidebar: true, inspector: true },
    ),
    focused = !preferences.sidebar && !preferences.inspector;
  useEffect(() => {
    try {
      localStorage.setItem("easy-slide:workspace", JSON.stringify(preferences));
    } catch {
      /* Layout preferences are optional when browser storage is disabled. */
    }
  }, [preferences]);
  return {
    ...preferences,
    mobile,
    focused,
    setMobile,
    toggleSidebar: () => setPreferences((p) => ({ ...p, sidebar: !p.sidebar })),
    toggleInspector: () =>
      setPreferences((p) => ({ ...p, inspector: !p.inspector })),
    showInspector: () => setPreferences((p) => ({ ...p, inspector: true })),
    toggleFocus: () =>
      setPreferences((p) => {
        if (!p.sidebar && !p.inspector) return previous.current;
        previous.current = p;
        return { ...p, sidebar: false, inspector: false };
      }),
    resize: (width: number, code: boolean) =>
      setPreferences((p) => ({
        ...p,
        [code ? "codeWidth" : "designWidth"]: Math.round(
          Math.max(code ? 320 : 260, Math.min(code ? 900 : 520, width)),
        ),
      })),
  };
}
