// What the editor needs from where it runs (D90, D91): the Tauri app, or the dev
// page in a browser. Everything else in the editor is the same code.
import type { CommandRegistry } from "../model/appCommands.ts";
import type { ProjectHost } from "../model/editor.ts";
import type { RecentProject } from "../model/recent.ts";

export interface Platform {
  kind: "tauri" | "browser";
  /** Asks for an existing project folder (native dialog). Null if cancelled. */
  openFolder(): Promise<string | null>;
  /** Asks where a new project's folder should go. Null if cancelled. */
  chooseParent(): Promise<string | null>;
  /** The path of `name` inside `parent`. */
  joinPath(parent: string, name: string): string;
  /** Creates a new, empty project folder; fails if something is already there. */
  makeProjectFolder(root: string): Promise<void>;
  exists(root: string): Promise<boolean>;
  /** File access for one project folder. */
  host(root: string): ProjectHost;
  /** URL that shows a project file (e.g. an image) in the page. */
  assetUrl(root: string, path: string): string;
  loadRecent(): Promise<RecentProject[]>;
  saveRecent(list: RecentProject[]): Promise<void>;
  /** Dev page only: the project folders it can open (in place of a native dialog). */
  listProjects?(): Promise<string[]>;
  /** A project folder to open at startup (the app's command-line argument), if any. */
  launchProject?(): Promise<string | null>;
  /**
   * Builds the native menu bar from the command registry (the app only). Its
   * accelerators then own the shortcuts, so the page doesn't handle them too.
   */
  installMenu?(registry: CommandRegistry): Promise<() => void>;
  /** How a folder path is shown to the user. */
  displayPath(root: string): string;
}
