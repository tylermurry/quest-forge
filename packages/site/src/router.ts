// Two routes don't need a router library: History API + useSyncExternalStore.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  addEventListener("popstate", fn);
  return () => {
    listeners.delete(fn);
    removeEventListener("popstate", fn);
  };
}

export function navigate(path: string) {
  if (path === location.pathname) return;
  history.pushState(null, "", path);
  scrollTo(0, 0);
  for (const fn of listeners) fn();
}

export const usePath = () => useSyncExternalStore(subscribe, () => location.pathname);
