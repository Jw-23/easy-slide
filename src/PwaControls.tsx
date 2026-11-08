import { useEffect, useRef, useState } from "react";
import {
  Download,
  RefreshCw,
  X,
  Check,
  WifiOff,
  ExternalLink,
} from "lucide-react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export function PwaControls({
  beforeUpdate,
  canUpdate,
}: {
  beforeUpdate: () => Promise<void>;
  canUpdate: boolean;
}) {
  const [installed, setInstalled] = useState(false),
    [guide, setGuide] = useState(false),
    [promptAvailable, setPromptAvailable] = useState(false),
    [offlineReady, setOfflineReady] = useState(false),
    [needRefresh, setNeedRefresh] = useState(false),
    [postponed, setPostponed] = useState(false),
    [updating, setUpdating] = useState(false),
    [problem, setProblem] = useState("");
  const install = useRef<InstallEvent | null>(null),
    registration = useRef<ServiceWorkerRegistration | null>(null),
    reloadRequested = useRef(false),
    before = useRef(beforeUpdate);
  before.current = beforeUpdate;
  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const syncMode = () =>
      setInstalled(
        mode.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      );
    syncMode();
    mode.addEventListener("change", syncMode);
    const onInstall = (event: Event) => {
      event.preventDefault();
      install.current = event as InstallEvent;
      setPromptAvailable(true);
    };
    const onInstalled = () => {
      install.current = null;
      setPromptAvailable(false);
      setInstalled(true);
      setGuide(false);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      mode.removeEventListener("change", syncMode);
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let disposed = false,
      hadController = !!navigator.serviceWorker.controller;
    if (hadController) setOfflineReady(true);
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
        setOfflineReady(true);
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
        if (reg.active) setOfflineReady(true);
        if (reg.waiting) notifyUpdate();
        const watch = () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (disposed) return;
            if (worker.state === "installed") {
              if (navigator.serviceWorker.controller) notifyUpdate();
              else setOfflineReady(true);
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
  async function requestInstall() {
    const pending = install.current;
    if (!pending) {
      setGuide(true);
      return;
    }
    install.current = null;
    setPromptAvailable(false);
    setProblem("");
    try {
      await pending.prompt();
      const choice = await pending.userChoice;
      if (choice.outcome === "accepted") setGuide(false);
    } catch {
      setGuide(true);
      setProblem("浏览器未能打开安装窗口，请使用浏览器菜单安装。");
    }
  }
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
      {!installed && (
        <button
          className="install-app-button"
          onClick={requestInstall}
          title="安装为独立应用"
        >
          <Download size={15} />
          安装应用
        </button>
      )}
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
      {guide && (
        <div className="modal-backdrop" onClick={() => setGuide(false)}>
          <section
            className="modal pwa-install-modal"
            role="dialog"
            aria-modal="true"
            aria-label="安装 Easy Slide"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭安装说明"
              onClick={() => setGuide(false)}
            >
              <X size={20} />
            </button>
            <h2>安装 Easy Slide</h2>
            <p>安装后可从桌面或主屏幕打开独立窗口。</p>
            <ul>
              <li>
                <strong>Chrome / Edge</strong>
                <span>使用地址栏的安装图标，或浏览器菜单中的“安装应用”。</span>
              </li>
              <li>
                <strong>iPhone / iPad Safari</strong>
                <span>打开分享菜单，选择“添加到主屏幕”，然后添加。</span>
              </li>
              <li>
                <strong>macOS Safari</strong>
                <span>使用“文件 → 添加到程序坞”。</span>
              </li>
            </ul>
            {window.top !== window.self && (
              <a
                className="pwa-external-link"
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                在独立标签页中打开后安装
              </a>
            )}
            <div className="pwa-cache-state">
              {offlineReady ? (
                <>
                  <Check size={15} />
                  离线资源已就绪
                </>
              ) : (
                <>
                  <WifiOff size={15} />
                  {!import.meta.env.PROD
                    ? "开发模式不启用离线缓存"
                    : problem || "首次加载完成后，应用资源将可离线使用"}
                </>
              )}
            </div>
            <p className="muted">
              工程仍保存在当前浏览器中；安装应用不会上传文件。更新前会保存草稿，重要工程可导出备份。
            </p>
            {promptAvailable && (
              <button className="primary" onClick={requestInstall}>
                打开安装窗口
              </button>
            )}
          </section>
        </div>
      )}
    </>
  );
}
