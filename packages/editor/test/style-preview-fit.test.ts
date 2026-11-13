import { describe, expect, it } from "vitest";
import { fitCanvas } from "../src/ui/game/StylePreview.tsx";

describe("the Styling preview's canvas size", () => {
  it("fills the pane's height and keeps the game's 16:10 shape", () => {
    expect(fitCanvas({ w: 2000, h: 400 })).toEqual({ w: 640, h: 400 });
    expect(fitCanvas({ w: 2000, h: 600 })).toEqual({ w: 960, h: 600 });
    expect(fitCanvas({ w: 2000, h: 200 })).toEqual({ w: 320, h: 200 });
  });

  it("is held to the width when the pane is wide but short of room across", () => {
    expect(fitCanvas({ w: 480, h: 900 })).toEqual({ w: 480, h: 300 });
    expect(fitCanvas({ w: -10, h: 300 })).toEqual({ w: 0, h: 0 });
  });
});
