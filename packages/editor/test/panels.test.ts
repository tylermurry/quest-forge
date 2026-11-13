import { describe, expect, it } from "vitest";
import { inspectorOnLeavingGame, togglePanels } from "../src/model/panels.ts";

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

describe("the Inspector when leaving the Game Settings tab", () => {
  it("comes back only if the tab hid it", () => {
    expect(inspectorOnLeavingGame(true, false, false)).toBe("expand");
    expect(inspectorOnLeavingGame(false, false, false)).toBe("leave");
  });

  it("stays hidden after a hide-all during the tab", () => {
    expect(inspectorOnLeavingGame(true, true, false)).toBe("stay hidden");
  });

  it("waits for the play to stop when leaving during play", () => {
    expect(inspectorOnLeavingGame(true, false, true)).toBe("expand after play");
  });
});
