import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `useLatestRelease` is a hook and there is no DOM here, so React is replaced by a minimal runner:
// useState keeps one value, useEffect is captured and run by the test, and the cleanup is kept.
const react = vi.hoisted(() => ({
  value: null as unknown,
  effect: null as null | (() => (() => void) | undefined),
  setValue: (v: unknown) => {
    react.value = v;
  },
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => [react.value ?? initial, react.setValue],
  useEffect: (fn: () => (() => void) | undefined) => {
    react.effect = fn;
  },
}));

import { REPO } from "../src/download.ts";
import { useLatestRelease } from "../src/releases.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Renders the hook, runs its effect, and lets the fetch settle. */
async function run(response: () => Promise<Response>) {
  const fetchMock = vi.fn(response);
  vi.stubGlobal("fetch", fetchMock);
  // biome-ignore lint/correctness/useHookAtTopLevel: the test calls the hook directly with React mocked (useState/useEffect are captured by the test), so there is no component to render it in
  const initial = useLatestRelease();
  const cleanup = react.effect!() as () => void;
  await flush();
  // biome-ignore lint/correctness/useHookAtTopLevel: the test calls the hook directly with React mocked (useState/useEffect are captured by the test), so there is no component to render it in
  const after = useLatestRelease();
  return { initial, after, fetchMock, cleanup };
}

const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

beforeEach(() => {
  react.value = null;
  react.effect = null;
});
afterEach(() => vi.unstubAllGlobals());

describe("useLatestRelease", () => {
  it("starts with no release", async () => {
    const { initial } = await run(() => json(null, false));
    expect(initial).toBeNull();
  });

  it("asks GitHub for the latest release of the repository", async () => {
    const { fetchMock } = await run(() => json({}));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/repos/${REPO}/releases/latest`);
    expect(init.headers).toEqual({ Accept: "application/vnd.github+json" });
  });

  it("reports the version without the leading v, and the publish date", async () => {
    const { after } = await run(() => json({ tag_name: "v1.2.3", published_at: "2026-11-01T12:00:00Z" }));
    expect(after).toEqual({ version: "1.2.3", date: new Date("2026-11-01T12:00:00Z") });
  });

  it("keeps a tag that has no v", async () => {
    const { after } = await run(() => json({ tag_name: "0.0.1", published_at: "2026-11-01T12:00:00Z" }));
    expect(after?.version).toBe("0.0.1");
  });

  it("shows nothing when the answer is incomplete", async () => {
    expect((await run(() => json({ tag_name: "v1.0.0" }))).after).toBeNull();
    expect((await run(() => json({ published_at: "2026-11-01T12:00:00Z" }))).after).toBeNull();
  });

  it("shows nothing when GitHub answers with an error", async () => {
    expect((await run(() => json({ tag_name: "v1.0.0", published_at: "2026-11-01T12:00:00Z" }, false))).after).toBeNull();
  });

  it("shows nothing, and does not throw, when the request fails", async () => {
    expect((await run(() => Promise.reject(new Error("offline")))).after).toBeNull();
  });

  it("cancels the request when the page lets go of the hook", async () => {
    const { fetchMock, cleanup } = await run(() => json({}));
    const signal = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
    expect(signal.aborted).toBe(false);
    cleanup();
    expect(signal.aborted).toBe(true);
  });
});
