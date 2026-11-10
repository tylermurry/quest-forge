import { describe, expect, it } from "vitest";
import { togglePanels } from "../src/model/panels.ts";

// Ctrl+\ hides every side panel, then brings back the ones that were showing.

const all = { browser: true, inspector: true, dock: true };
const none = { browser: false, inspector: false, dock: false };

describe("hide all panels", () => {
  it("hides the showing panels and brings exactly those back", () => {
    const hidden = togglePanels({ browser: true, inspector: false, dock: true }, null);
    expect(hidden.shown).toEqual(none);
    expect(hidden.saved).toEqual(["browser", "dock"]);
    const back = togglePanels(hidden.shown, hidden.saved);
    expect(back.shown).toEqual({ browser: true, inspector: false, dock: true });
    expect(back.saved).toBeNull();
  });

  it("a panel shown by hand in between counts as showing: the next press hides again", () => {
    const hidden = togglePanels(all, null);
    const again = togglePanels({ ...hidden.shown, inspector: true }, hidden.saved);
    expect(again.shown).toEqual(none);
    expect(again.saved).toEqual(["inspector"]);
  });

  it("with nothing remembered and nothing showing, shows them all", () => {
    expect(togglePanels(none, null).shown).toEqual(all);
  });
});
