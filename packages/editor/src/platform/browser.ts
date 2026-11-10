// The dev page's platform: project folders in packages/editor/.sandbox,
// reached through the Vite middleware in dev/sandbox.ts.
import type { ProjectFs } from "@questforge/schema";
import type { ProjectHost } from "../model/editor.ts";
import { parseRecent, type RecentProject } from "../model/recent.ts";
import type { Platform } from "./platform.ts";

type Reply = { ok: true; value: unknown } | { ok: false; message: string; code: string | null };

async function call<T>(op: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/__fs/${op}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) });
  const reply = (await res.json()) as Reply;
  if (!reply.ok) throw Object.assign(new Error(reply.message), reply.code ? { code: reply.code } : {});
  return reply.value as T;
}

/** ProjectFs over HTTP to the dev server's sandbox. */
class HttpFs implements ProjectFs {
  constructor(readonly root: string) {}
  private op<T>(op: string, args: Record<string, unknown> = {}) {
    return call<T>(op, { root: this.root, ...args });
  }
  list = () => this.op<string[]>("list");
  listFolders = () => this.op<string[]>("listFolders");
  readText = (path: string) => this.op<string>("readText", { path });
  writeText = (path: string, content: string) => this.op<void>("writeText", { path, content });
  move = (path: string, to: string) => this.op<void>("move", { path, to });
  remove = (path: string) => this.op<void>("remove", { path });
  makeFolder = (path: string) => this.op<void>("makeFolder", { path });
  removeFolder = (path: string) => this.op<void>("removeFolder", { path });
  removeTree = (path: string) => this.op<void>("removeTree", { path });
  async writeBytes(path: string, bytes: Uint8Array) {
    const q = new URLSearchParams({ root: this.root, path });
    const res = await fetch(`/__fs/writeBytes?${q}`, { method: "POST", body: bytes as BufferSource });
    const reply = (await res.json()) as Reply;
    if (!reply.ok) throw Object.assign(new Error(reply.message), reply.code ? { code: reply.code } : {});
  }
}

const RECENT_KEY = "questforge.recent";

export const browserPlatform: Platform = {
  kind: "browser",
  async openFolder() {
    return null; // the start screen lists sandbox projects instead
  },
  async chooseParent() {
    return "";
  },
  joinPath: (parent, name) => (parent ? `${parent}/${name}` : name),
  async makeProjectFolder(root) {
    if (await call<boolean>("exists", { root })) throw new Error(`A folder called ${root} already exists.`);
    await call("makeRoot", { root });
  },
  exists: (root) => call<boolean>("exists", { root }),
  host(root): ProjectHost {
    return {
      fs: new HttpFs(root),
      watch(onChange) {
        const source = new EventSource(`/__fs/watch?${new URLSearchParams({ root })}`);
        source.onmessage = (e) => onChange([JSON.parse(e.data as string) as string]);
        return () => source.close();
      },
    };
  },
  assetUrl: (root, path) => `/__fs/file?${new URLSearchParams({ root, path })}`,
  // The dev page has no save dialog: the browser downloads the file.
  async saveBuild(fileName, bytes) {
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return `Downloads/${fileName}`;
  },
  async loadRecent() {
    try {
      return parseRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"));
    } catch {
      // Blocked storage or a corrupt list: show the Start screen with no recent projects rather than fail to start.
      return [];
    }
  },
  async saveRecent(list: RecentProject[]) {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
      // Private mode or blocked storage: recent projects just aren't remembered.
    }
  },
  listProjects: () => call<string[]>("projects", {}),
  displayPath: (root) => `.sandbox/${root}`,
};
