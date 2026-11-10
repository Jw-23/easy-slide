import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
export function PwaControls({
  beforeUpdate,
  canUpdate,
}: {
  beforeUpdate: () => Promise<void>;
  canUpdate: boolean;
}) {
  const [needRefresh, setNeedRefresh] = useState(false),
    [postponed, setPostponed] = useState(false),
    [updating, setUpdating] = useState(false),
    [problem, setProblem] = useState("");
  const registration = useRef<ServiceWorkerRegistration | null>(null),
    reloadRequested = useRef(false),
    before = useRef(beforeUpdate);
  before.current = beforeUpdate;
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let disposed = false,
      hadController = !!navigator.serviceWorker.controller;
    const notifyUpdate = () => {
      if (!disposed) {
        setNeedRefresh(true);
        setPostponed(false);
      }
    };
    const controllerChange = () => {
      if (reloadRequested.current) {
        window.location.reload();
        return;
      }
      if (hadController) notifyUpdate();
      else {
        hadController = true;
      }
    };
    const check = () => {
      if (navigator.onLine && document.visibilityState === "visible")
        void registration.current?.update().catch(() => {});
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      controllerChange,
    );
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (disposed) return;
        registration.current = reg;
        if (reg.waiting) notifyUpdate();
        const watch = () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (disposed) return;
            if (worker.state === "installed") {
              if (navigator.serviceWorker.controller) notifyUpdate();
            }
            if (worker.state === "redundant" && !reg.active)
              setProblem("离线缓存未完成，请联网后重试。");
          });
        };
        watch();
        reg.addEventListener("updatefound", watch);
      })
      .catch(() => {
        if (!disposed) setProblem("离线组件未能启动，请联网后重试。");
      });
    window.addEventListener("online", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 60 * 60 * 1000);
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controllerChange,
      );
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, []);
  async function applyUpdate() {
    setUpdating(true);
    setProblem("");
    try {
      await before.current();
      reloadRequested.current = true;
      const waiting = registration.current?.waiting;
      if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
      else window.location.reload();
    } catch {
      reloadRequested.current = false;
      setUpdating(false);
      setProblem("草稿保存失败，请先导出工程，再尝试更新。");
    }
  }
  return (
    <>
      {needRefresh && !postponed && (
        <section className="pwa-update" role="status">
          <div>
            <RefreshCw size={16} />
            <strong>有新版本</strong>
            <button
              className="icon-button"
              title="稍后更新"
              onClick={() => setPostponed(true)}
            >
              <X size={14} />
            </button>
          </div>
          <p>保存当前草稿后，重新打开应用。</p>
          {problem && (
            <p className="pwa-problem" role="alert">
              {problem}
            </p>
          )}
          <button
            className="primary"
            disabled={!canUpdate || updating}
            onClick={applyUpdate}
          >
            {updating ? "正在更新…" : "保存并更新"}
          </button>
        </section>
      )}
    </>
  );
}
