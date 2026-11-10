import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("../src/router.ts", () => nav);

import { isQuestFile, onPendingQuest, playQuestFile, takePendingQuest } from "../src/questFile.ts";

const file = (name: string) => new File(["x"], name);

beforeEach(() => {
  nav.navigate.mockClear();
  takePendingQuest(); // the module keeps one pending file; start each test empty
});
afterEach(() => vi.restoreAllMocks());

describe("isQuestFile", () => {
  it("accepts .quest files whatever the letter case", () => {
    expect(isQuestFile(file("the-lantern.quest"))).toBe(true);
    expect(isQuestFile(file("THE-LANTERN.QUEST"))).toBe(true);
  });

  it("rejects other files, including ones that only mention quest", () => {
    expect(isQuestFile(file("notes.txt"))).toBe(false);
    expect(isQuestFile(file("quest"))).toBe(false);
    expect(isQuestFile(file("game.quest.zip"))).toBe(false);
  });
});

describe("playQuestFile and takePendingQuest", () => {
  it("goes to /play and hands the file over exactly once", () => {
    const f = file("a.quest");
    playQuestFile(f);
    expect(nav.navigate).toHaveBeenCalledWith("/play");
    expect(takePendingQuest()).toBe(f);
    expect(takePendingQuest()).toBeNull();
  });

  it("keeps only the latest file when two are picked", () => {
    playQuestFile(file("first.quest"));
    const second = file("second.quest");
    playQuestFile(second);
    expect(takePendingQuest()).toBe(second);
  });

  it("has nothing pending before any file is picked", () => {
    expect(takePendingQuest()).toBeNull();
  });
});

describe("onPendingQuest", () => {
  it("tells listeners when a file is picked, until they stop", () => {
    const seen = vi.fn();
    const stop = onPendingQuest(seen);
    playQuestFile(file("a.quest"));
    expect(seen).toHaveBeenCalledTimes(1);

    stop();
    playQuestFile(file("b.quest"));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("notifies after the file is waiting to be taken", () => {
    const f = file("a.quest");
    let taken: File | null = null;
    const stop = onPendingQuest(() => (taken = takePendingQuest()));
    playQuestFile(f);
    expect(taken).toBe(f);
    stop();
  });
});
