// Tool gestures on the scene canvas (spec 09): Select/Move, Polygon, Rectangle,
// Spawn point, Walk-to point. DOM-free; tested in Node by feeding pointer input.
import { SceneController } from "./controller.ts";

export class SceneTools extends SceneController {
  /** A polygon is being drawn (not in history until it closes, D84). */
  get isDrawing(): boolean {
    return false;
  }

  /** One line of help for the toolbar. */
  get hint(): string {
    return "";
  }

  /** Enter / double-click: close the polygon being drawn. */
  finish() {}

  /** Backspace while drawing: remove the last point. */
  removeLastPoint() {}

  /** Files dropped from the OS onto the canvas (D98). */
  dropFiles?(files: File[], screen: [number, number]): void;
}
