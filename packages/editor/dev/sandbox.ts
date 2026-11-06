// Dev-page file access (D91): a Vite middleware that exposes project folders
// inside packages/editor/.sandbox/ over HTTP, backed by the real NodeFs, plus
// change events. Lets the editor UI run in a plain browser against real files.
// Never used by the Tauri app or exported builds.
import { watch } from "node:fs";
import { cp, mkdir, readFile, readdir, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, relative, resolve, sep } from "node:path";
import { NodeFs } from "@questforge/schema/node";
import type { Plugin } from "vite";

export const SANDBOX = resolve(import.meta.dirname, "../.sandbox");
const M1_FIXTURE = resolve(import.meta.dirname, "../../engine/fixtures/m1");
/** The sandbox copy of the engine fixture used as "an existing project" (never the fixture itself). */
export const SEED_NAME = "garden-m1";

/** Resolves a project folder name to a path inside the sandbox, or throws. */
export function sandboxPath(root: string): string {
  const abs = resolve(SANDBOX, root);
  if (abs !== SANDBOX && !abs.startsWith(SANDBOX + sep)) throw new Error(`Outside the sandbox: ${root}`);
  if (abs === SANDBOX) throw new Error("Pick a project folder inside the sandbox");
  return abs;
}

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const send = (res: ServerResponse, status: number, data: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(data));
};

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav" };

/** Copies the m1 fixture into the sandbox once, so the dev page has a project to open. */
export async function seedSandbox() {
  await mkdir(SANDBOX, { recursive: true });
  const target = join(SANDBOX, SEED_NAME);
  if (!(await stat(target).catch(() => null))) await cp(M1_FIXTURE, target, { recursive: true });
}

type Op = { root: string; path?: string; to?: string; content?: string };

async function runOp(op: string, a: Op): Promise<unknown> {
  if (op === "projects") {
    await seedSandbox();
    const entries = await readdir(SANDBOX, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
  }
  if (op === "exists") return !!(await stat(sandboxPath(a.root)).catch(() => null));
  const fs = new NodeFs(sandboxPath(a.root));
  const path = a.path ?? "";
  switch (op) {
    case "makeRoot":
      await mkdir(sandboxPath(a.root), { recursive: true });
      return null;
    case "list":
      return fs.list();
    case "listFolders":
      return fs.listFolders();
    case "readText":
      return fs.readText(path);
    case "writeText":
      return fs.writeText(path, a.content ?? "");
    case "move":
      return fs.move(path, a.to!);
    case "remove":
      return fs.remove(path);
    case "makeFolder":
      return fs.makeFolder(path);
    case "removeFolder":
      return fs.removeFolder(path);
    case "removeTree":
      return fs.removeTree(path);
    default:
      throw new Error(`Unknown operation ${op}`);
  }
}

export function sandboxPlugin(): Plugin {
  return {
    name: "questforge-sandbox",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://dev");
        if (!url.pathname.startsWith("/__fs/")) return next();
        const op = url.pathname.slice("/__fs/".length);
        try {
          if (op === "watch") {
            const dir = sandboxPath(url.searchParams.get("root") ?? "");
            res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
            res.write(": watching\n\n");
            const w = watch(dir, { recursive: true }, (_event, name) => {
              if (name) res.write(`data: ${JSON.stringify(relative(dir, join(dir, name.toString())).split(sep).join("/"))}\n\n`);
            });
            req.on("close", () => w.close());
            return;
          }
          if (op === "file") {
            const root = sandboxPath(url.searchParams.get("root") ?? "");
            const path = url.searchParams.get("path") ?? "";
            if (path.split("/").includes("..")) throw new Error("Bad path");
            const bytes = await readFile(join(root, ...path.split("/")));
            res.setHeader("content-type", MIME[path.split(".").pop()!.toLowerCase()] ?? "application/octet-stream");
            res.setHeader("cache-control", "no-store");
            return res.end(bytes);
          }
          if (op === "writeBytes") {
            const fs = new NodeFs(sandboxPath(url.searchParams.get("root") ?? ""));
            await fs.writeBytes(url.searchParams.get("path") ?? "", new Uint8Array(await body(req)));
            return send(res, 200, { ok: true, value: null });
          }
          const args = JSON.parse((await body(req)).toString("utf8") || "{}") as Op;
          send(res, 200, { ok: true, value: (await runOp(op, args)) ?? null });
        } catch (e) {
          const err = e as NodeJS.ErrnoException;
          send(res, 200, { ok: false, message: err.message, code: err.code ?? null });
        }
      });
    },
  };
}
