// The built-in frame picture's bytes. `assets/frame.jpg` is a 48×48 gold-edged panel whose borders are
// `BUILT_IN_FRAME.insets` (12 px each side) in `style.ts`; Vite inlines it, so it works in tests and offline.
import FRAME_JPG from "./assets/frame.jpg?inline";

/** The picture as file bytes. */
export function builtInFrameBytes(): Uint8Array {
  const base64 = FRAME_JPG.slice(FRAME_JPG.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
