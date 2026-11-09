import { readSyntax, type Call } from "../syntax";
import { tokenize, type Token } from "../tokens";
export type SceneTarget =
  | { scope: "block"; page: number; path: number[] }
  | {
      scope: "slide";
      page: number;
      field?: "title" | "subtitle" | "eyebrow" | "notes" | "background";
    }
  | { scope: "deck"; page: number; field?: "title" | "author" }
  | { scope: "theme"; page: number };
export type SourceRecord = {
  target: SceneTarget;
  name: string;
  from: number;
  to: number;
  revealFrom: number;
  revealTo: number;
  scopeBindings: string[];
  childBindings: string[];
  synthetic?: boolean;
  bodyEnd?: number;
  assetRange?: { from: number; to: number; path: string };
};
export function targetKey(target: SceneTarget): string {
  return target.scope === "block"
    ? `p${target.page}:${target.path.join(".")}`
    : target.scope === "slide"
      ? `p${target.page}:${target.field || "slide"}`
      : `${target.scope}:${"field" in target ? target.field || "" : ""}`;
}
export function targetContains(
  parent: SceneTarget,
  child: SceneTarget,
): boolean {
  if (parent.page !== child.page) return false;
  if (parent.scope === "slide" && !parent.field)
    return child.scope === "slide" || child.scope === "block";
  if (parent.scope === "block" && child.scope === "block")
    return (
      parent.path.length <= child.path.length &&
      parent.path.every((v, i) => child.path[i] === v)
    );
  return targetKey(parent) === targetKey(child);
}
export class SourceMap {
  readonly records: SourceRecord[] = [];
  private byKey = new Map<string, SourceRecord>();
  constructor(readonly source: string) {
    const root = readSyntax(source),
      tokens = tokenize(source),
      starts = new Map(tokens.map((token, i) => [token.from, i]));
    const args = (call: Call) => {
      const start = starts.get(call.from)!;
      let endIndex = start,
        end = tokens[start].to,
        current: Token[] = [],
        depth = 0;
      const groups: Token[][] = [];
      if (tokens[start + 1]?.value !== "(") return { groups, end, endIndex };
      for (let i = start + 2; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.kind === "punct") {
          if (depth === 0 && token.value === ")") {
            if (current.length) groups.push(current);
            end = token.to;
            endIndex = i;
            break;
          }
          if (depth === 0 && token.value === ",") {
            if (current.length) groups.push(current);
            current = [];
            continue;
          }
          if (["(", "[", "{"].includes(token.value)) depth++;
          if ([")", "]", "}"].includes(token.value)) depth--;
        }
        current.push(token);
      }
      return { groups, end, endIndex };
    };
    const add = (
      call: Call,
      target: SceneTarget,
      scope: string[],
      synthetic = false,
    ) => {
      const { groups, end, endIndex } = args(call);
      const record: SourceRecord = {
        target,
        name: call.name,
        from: call.from,
        to: call.to,
        revealFrom: call.from,
        revealTo: end,
        scopeBindings: scope,
        childBindings: [...scope, ...(call.bindings || [])],
        ...(synthetic ? { synthetic: true } : {}),
      };
      if (tokens[endIndex + 1]?.value === "{") {
        let depth = 0;
        for (let i = endIndex + 1; i < tokens.length; i++) {
          if (tokens[i].kind !== "punct") continue;
          if (tokens[i].value === "{") depth++;
          if (tokens[i].value === "}" && --depth === 0) {
            record.bodyEnd = tokens[i].from;
            break;
          }
        }
      }
      if (call.name === "Image") {
        const group =
          groups.find((g) => g[0].value === "src" && g[1]?.value === ":") ||
          groups.find((g) => g[1]?.value !== ":");
        if (group)
          record.assetRange = {
            from: group[group[1]?.value === ":" ? 2 : 0].from,
            to: group.at(-1)!.to,
            path: String(call.named.src ?? call.args[0]),
          };
      }
      this.records.push(record);
      this.byKey.set(targetKey(target), record);
      if (target.scope === "slide" || target.scope === "deck") {
        const fields =
          target.scope === "slide"
            ? ["title", "subtitle", "eyebrow", "notes"]
            : ["author", "title"];
        for (const field of fields) {
          const group =
            groups.find(
              (g) =>
                g[0].kind === "id" &&
                g[0].value === field &&
                g[1]?.value === ":",
            ) ||
            (target.scope === "deck" && field === "title"
              ? groups.find((g) => g[1]?.value !== ":")
              : undefined);
          const modified =
            field === "notes"
              ? call.modifiers.filter((m) => m.name === "notes").at(-1)
              : undefined;
          if (!group && !modified) continue;
          const first = group?.[group[1]?.value === ":" ? 2 : 0],
            last = group?.at(-1);
          const child = {
            ...record,
            target: { ...target, field } as SceneTarget,
            from: modified?.from ?? group![0].from,
            to: modified?.to ?? last!.to,
            revealFrom: modified?.from ?? first!.from,
            revealTo: modified?.to ?? last!.to,
            name: field,
          };
          this.records.push(child);
          this.byKey.set(targetKey(child.target), child);
        }
        if (target.scope === "slide") {
          const bg = call.modifiers
            .filter((m) => m.name === "background")
            .at(-1);
          if (bg) {
            const child = {
              ...record,
              target: { ...target, field: "background" } as SceneTarget,
              from: bg.from,
              to: bg.to,
              revealFrom: bg.from,
              revealTo: bg.to,
              name: "background",
            };
            this.records.push(child);
            this.byKey.set(targetKey(child.target), child);
          }
        }
      }
      return record;
    };
    const globals = root.bindings || [];
    add(root, { scope: "deck", page: 0 }, globals);
    let page = 0;
    const walk = (
      call: Call,
      path: number[],
      scope: string[],
      page: number,
    ) => {
      const record = add(call, { scope: "block", page, path }, scope);
      call.children.forEach((child, i) =>
        walk(child, [...path, i], record.childBindings, page),
      );
    };
    for (const call of root.children) {
      if (call.name === "Theme")
        add(call, { scope: "theme", page: 0 }, globals);
      if (call.name !== "Slide") continue;
      const record = add(call, { scope: "slide", page }, globals);
      if (call.args.length) {
        add(call, { scope: "block", page, path: [0] }, globals, true);
        call.children.forEach((child, i) =>
          walk(child, [0, i], record.childBindings, page),
        );
      } else
        call.children.forEach((child, i) =>
          walk(child, [i], record.childBindings, page),
        );
      page++;
    }
  }
  get(target: SceneTarget) {
    return this.byKey.get(targetKey(target));
  }
  at(position: number, page: number): SourceRecord | undefined {
    const found = this.records
      .filter((r) => !r.synthetic && r.from <= position && position < r.to)
      .sort((a, b) => a.to - a.from - (b.to - b.from))[0];
    return found
      ? {
          ...found,
          target: {
            ...found.target,
            page:
              found.target.scope === "deck" || found.target.scope === "theme"
                ? page
                : found.target.page,
          },
        }
      : undefined;
  }
  parent(target: SceneTarget) {
    if (target.scope !== "block")
      return this.get({ scope: "slide", page: target.page });
    return target.path.length > 1
      ? this.get({ ...target, path: target.path.slice(0, -1) })
      : this.get({ scope: "slide", page: target.page });
  }
}
