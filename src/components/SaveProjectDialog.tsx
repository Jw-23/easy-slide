import { useState } from "react";
import { Dialog } from "./Dialog";
import type { Studio } from "../studio/use-studio";
export function SaveProjectDialog({ studio: s }: { studio: Studio }) {
  const request = s.saveRequest!;
  const [name, setName] = useState(request.name),
    [chooseOther, setChooseOther] = useState(false);
  return (
    <Dialog
      title={request.asNew ? "工程另存为" : "保存项目文件"}
      onClose={s.cancelSave}
      busy={s.busy}
    >
      <form
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            if (!s.busy && name.trim()) void s.confirmSave(name, chooseOther);
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();
          void s.confirmSave(name, chooseOther);
        }}
      >
        <label>
          文件名
          <input
            aria-label="项目文件名"
            autoFocus
            maxLength={180}
            value={name}
            disabled={s.busy}
            onChange={(e) => setName(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 8 }}
          />
        </label>
        <p className="muted">
          后缀为 .easy-slide，内部为完整 ZIP，包含 DSL、图片及可编辑图层。
        </p>
        {request.folder ? (
          <label>
            <input
              type="checkbox"
              checked={chooseOther}
              disabled={s.busy}
              onChange={(e) => setChooseOther(e.target.checked)}
            />
            另选文件夹（当前：{request.folder.name}）
          </label>
        ) : (
          <p>点击保存后选择目标文件夹。</p>
        )}
        <p className="muted">同名项目文件将被覆盖。</p>
        {s.notice?.kind === "error" && (
          <p role="alert" className="inline-error">
            {s.notice.message}
          </p>
        )}
        <div className="confirm-actions">
          <button type="button" disabled={s.busy} onClick={s.cancelSave}>
            取消
          </button>
          <button
            className="primary"
            type="submit"
            disabled={s.busy || !name.trim()}
          >
            保存
          </button>
        </div>
      </form>
    </Dialog>
  );
}
