import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `usePath` is a thin wrapper over React's useSyncExternalStore; capture the arguments it passes so
// the subscription can be tested without a DOM.
const store = vi.hoisted(() => ({ subscribe: null as null | ((fn: () => void) => () => void), snapshot: null as null | (() => string) }));
vi.mock("react", () => ({
  useSyncExternalStore: (subscribe: (fn: () => void) => () => void, snapshot: () => string) => {
    store.subscribe = subscribe;
    store.snapshot = snapshot;
    return snapshot();
  },
}));

import { navigate, usePath } from "../src/router.ts";

/** A just-enough browser: a location, a history that moves it, scrolling and window events. */
function fakeBrowser(start: string) {
  const location = { pathname: start };
  const handlers = new Map<string, Set<() => void>>();
  const pushState = vi.fn((_state: unknown, _title: string, path: string) => void (location.pathname = path));
  const scrollTo = vi.fn();
  vi.stubGlobal("location", location);
  vi.stubGlobal("history", { pushState });
  vi.stubGlobal("scrollTo", scrollTo);
  vi.stubGlobal("addEventListener", (type: string, fn: () => void) => {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(fn);
  });
  vi.stubGlobal("removeEventListener", (type: string, fn: () => void) => void handlers.get(type)?.delete(fn));
  return { location, handlers, pushState, scrollTo };
}

let browser: ReturnType<typeof fakeBrowser>;
beforeEach(() => {
  browser = fakeBrowser("/");
});
afterEach(() => vi.unstubAllGlobals());

describe("usePath", () => {
  it("reads the current path", () => {
    browser.location.pathname = "/play";
    expect(usePath()).toBe("/play");
  });

  it("tells subscribers when the path changes, until they unsubscribe", () => {
    usePath();
    const seen = vi.fn();
    const unsubscribe = store.subscribe!(seen);

    navigate("/play");
    expect(seen).toHaveBeenCalledTimes(1);

    unsubscribe();
    navigate("/");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("also tells subscribers about back and forward (popstate)", () => {
    usePath();
    const seen = vi.fn();
    store.subscribe!(seen);
    for (const fn of browser.handlers.get("popstate") ?? []) fn();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("stops listening to popstate on unsubscribe", () => {
    usePath();
    const unsubscribe = store.subscribe!(() => {});
    expect(browser.handlers.get("popstate")?.size).toBe(1);
    unsubscribe();
    expect(browser.handlers.get("popstate")?.size).toBe(0);
  });
});

describe("navigate", () => {
  it("pushes the path to the history and scrolls to the top", () => {
    navigate("/play");
    expect(browser.pushState).toHaveBeenCalledWith(null, "", "/play");
    expect(browser.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(browser.location.pathname).toBe("/play");
  });

  it("does nothing when already on that path", () => {
    usePath();
    const seen = vi.fn();
    const unsubscribe = store.subscribe!(seen);
    navigate("/");
    expect(browser.pushState).not.toHaveBeenCalled();
    expect(browser.scrollTo).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
    unsubscribe();
  });
});
