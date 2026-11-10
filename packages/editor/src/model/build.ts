// File ▸ Build Game: the project in memory (unsaved edits included, like
// Play) becomes one `.quest` file the engine plays. Blocked by validation errors.
import { BuildError, buildQuest, questFileName } from "@questforge/schema";
import type { Editor } from "./editor.ts";
import type { WorkspaceState } from "./workspace.ts";

export interface BuildHost {
  /** An asset file's bytes, by project path. */
  readFile(path: string): Promise<Uint8Array>;
  /** Asks where to put the built file and writes it there. Returns where it went, or null if cancelled. */
  saveBuild(fileName: string, bytes: Uint8Array): Promise<string | null>;
}

export type BuildResult = { kind: "built"; where: string } | { kind: "cancelled" } | { kind: "blocked" } | { kind: "failed"; message: string } | { kind: "busy" };

export class GameBuilder {
  private _building = false;

  constructor(
    private readonly editor: Editor,
    private readonly ws: WorkspaceState,
    private readonly host: BuildHost,
  ) {}

  get building() {
    return this._building;
  }

  /** Builds the game. Errors open Problems instead; a failure becomes an error notice. */
  async build(): Promise<BuildResult> {
    if (this._building) return { kind: "busy" };
    this.editor.validateNow();
    const errors = this.editor.problems.filter((p) => p.severity === "error");
    if (errors.length) {
      this.ws.showProblems();
      this.editor.showNotice({ kind: "error", text: `Fix ${errors.length === 1 ? "the error" : `the ${errors.length} errors`} in Problems before building the game.` });
      return { kind: "blocked" };
    }
    this._building = true;
    try {
      const project = this.editor.project;
      const bytes = await buildQuest(project, (path) => this.host.readFile(path));
      const where = await this.host.saveBuild(questFileName(project), bytes);
      return where === null ? { kind: "cancelled" } : { kind: "built", where };
    } catch (e) {
      const message = e instanceof BuildError ? e.message : `Couldn't build the game: ${e instanceof Error ? e.message : String(e)}`;
      this.editor.showNotice({ kind: "error", text: message });
      return { kind: "failed", message };
    } finally {
      this._building = false;
    }
  }
}
