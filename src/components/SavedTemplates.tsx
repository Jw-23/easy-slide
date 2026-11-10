import { useEffect, useRef, useState } from "react";
import { Download, Upload, Save, Trash2, Pencil, Check } from "lucide-react";
import { templateStore, type SavedTemplate } from "../studio/template-store";
import { parseDeck } from "../dsl";
import {
  exportProjectArchive,
  importProjectArchive,
  validatePortableProject,
  MAX_ARCHIVE_BYTES,
} from "../project-archive";
import { download } from "../download";
import type { Studio } from "../studio/use-studio";
export function SavedTemplates({
  studio: s,
  onClose,
}: {
  studio: Studio;
  onClose: () => void;
}) {
  const [items, setItems] = useState<SavedTemplate[]>([]),
    [name, setName] = useState(s.deck.title),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
      null,
    );
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    templateStore
      .list()
      .then((xs) => {
        if (alive) {
          setItems(xs);
          setReady(true);
        }
      })
      .catch((e) => {
        if (alive) setError(String(e.message || e));
      });
    return () => {
      alive = false;
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="saved-templates" aria-label="我的模板">
      <h3>我的模板</h3>
      <div className="template-save-row">
        <input
          aria-label="模板名称"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <button
          disabled={busy || !ready || !s.editable}
          onClick={() =>
            void run(async () => {
              setItems(await templateStore.save(name, s.project));
              s.notify("模板已保存到此浏览器", "success");
            })
          }
        >
          <Save size={15} />
          保存当前工程
        </button>
        <button
          disabled={busy || !ready}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
          导入模板
        </button>
        <input
          hidden
          ref={input}
          type="file"
          accept=".easy-slide,.zip,.json"
          aria-label="导入自定义模板"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file)
              void run(async () => {
                if (file.size > MAX_ARCHIVE_BYTES)
                  throw Error("模板文件超过 256 MB");
                const p = /\.(zip|easy-slide)$/i.test(file.name)
                  ? await importProjectArchive(await file.arrayBuffer())
                  : validatePortableProject(JSON.parse(await file.text()));
                setItems(
                  await templateStore.save(parseDeck(p.source).title, p),
                );
              });
          }}
        />
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {items.map((item) => (
        <div className="saved-template-row" key={item.id}>
          {renaming?.id === item.id ? (
            <>
              <input
                aria-label="重命名模板"
                maxLength={100}
                value={renaming.name}
                onChange={(e) =>
                  setRenaming({ ...renaming, name: e.target.value })
                }
              />
              <button
                aria-label="保存模板名称"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setItems(
                      await templateStore.rename(item.id, renaming.name),
                    );
                    setRenaming(null);
                  })
                }
              >
                <Check size={15} />
              </button>
            </>
          ) : (
            <button
              className="template-open"
              disabled={busy || !s.editable}
              onClick={() => {
                s.template(item.project);
                onClose();
              }}
            >
              {item.name}
            </button>
          )}
          <button
            aria-label={`重命名模板 ${item.name}`}
            title="重命名"
            disabled={busy}
            onClick={() => setRenaming({ id: item.id, name: item.name })}
          >
            <Pencil size={15} />
          </button>
          <button
            aria-label={`导出模板 ${item.name}`}
            title="导出完整 ZIP"
            disabled={busy}
            onClick={() =>
              void run(async () =>
                download(
                  await exportProjectArchive(item.project),
                  item.name.replace(/[\\/:*?"<>|]/g, "_") + ".easy-slide.zip",
                ),
              )
            }
          >
            <Download size={15} />
          </button>
          <button
            aria-label={`删除模板 ${item.name}`}
            title="删除模板"
            disabled={busy}
            onClick={() =>
              void run(async () =>
                setItems(await templateStore.remove(item.id)),
              )
            }
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {!items.length && ready && (
        <p className="muted">
          保存当前工程后，可从这里重复使用；图片和可编辑图层一并保留。
        </p>
      )}
    </section>
  );
}
