import { Component, type ReactNode } from "react";
import { download } from "../download";
import type { Project } from "../dsl";
export class StudioBoundary extends Component<
  { project: Project; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="recovery-panel" role="alert">
        <h1>编辑器未能继续运行</h1>
        <p>可先下载包含当前源码与图片的备份，再重新打开。</p>
        <button
          onClick={() =>
            download(
              new Blob([JSON.stringify(this.props.project)], {
                type: "application/json",
              }),
              "recovery.easy-slide.json",
            )
          }
        >
          下载工程备份
        </button>
        <button onClick={() => window.location.reload()}>重新打开</button>
      </main>
    );
  }
}
