import { get, set } from "idb-keyval";
import type { Project } from "../dsl";
import { validatePortableProject } from "../project-archive";
export type SavedTemplate = {
  id: string;
  name: string;
  project: Project;
  updatedAt: number;
};
type Library = { version: 1; items: SavedTemplate[] };
const key = "easy-slide-user-templates-v1";
export class TemplateStore {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private read: () => Promise<unknown> = () => get(key),
    private write: (value: Library) => Promise<void> = (value) =>
      set(key, value),
  ) {}
  async list(): Promise<SavedTemplate[]> {
    await this.pending;
    return this.load();
  }
  private async load(): Promise<SavedTemplate[]> {
    const data = await this.read();
    if (data === undefined || data === null) return [];
    const lib = data as Library;
    if (lib.version !== 1 || !Array.isArray(lib.items) || lib.items.length > 50)
      throw Error("模板库格式无效，已有内容未被覆盖");
    const ids = new Set<string>();
    for (const item of lib.items) {
      if (
        !item ||
        typeof item.id !== "string" ||
        ids.has(item.id) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 100
      )
        throw Error("模板信息无效");
      ids.add(item.id);
      validatePortableProject(item.project);
    }
    return lib.items;
  }
  private change(fn: (items: SavedTemplate[]) => SavedTemplate[]) {
    const job = this.pending.then(async () => {
      const items = fn(await this.load());
      await this.write({ version: 1, items });
      return items;
    });
    this.pending = job.catch(() => {});
    return job;
  }
  save(name: string, project: Project) {
    name = name.trim();
    validatePortableProject(project);
    if (!name || name.length > 100)
      return Promise.reject(Error("模板名称需要 1–100 个字符"));
    return this.change((items) => {
      if (items.length >= 50) throw Error("最多保存 50 个自定义模板");
      if (items.some((i) => i.name === name))
        throw Error("模板名称已存在，请使用其他名称");
      return [
        ...items,
        { id: crypto.randomUUID(), name, project, updatedAt: Date.now() },
      ];
    });
  }
  rename(id: string, name: string) {
    name = name.trim();
    if (!name || name.length > 100)
      return Promise.reject(Error("模板名称需要 1–100 个字符"));
    return this.change((items) => {
      if (!items.some((i) => i.id === id)) throw Error("模板已不存在");
      if (items.some((i) => i.name === name && i.id !== id))
        throw Error("模板名称已存在");
      return items.map((i) =>
        i.id === id ? { ...i, name, updatedAt: Date.now() } : i,
      );
    });
  }
  remove(id: string) {
    return this.change((items) => items.filter((i) => i.id !== id));
  }
}
export const templateStore = new TemplateStore();
