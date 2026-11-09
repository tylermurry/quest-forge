// Hands the `.quest` picked on the home page to /play without putting it in the URL.
import { navigate } from "./router.ts";

let pending: File | null = null;
const listeners = new Set<() => void>();

/** Starts playing a file: remembers it and goes to /play (or tells /play if it's already open). */
export function playQuestFile(file: File) {
  pending = file;
  navigate("/play");
  for (const fn of listeners) fn();
}

/** The file waiting to be played, once. */
export function takePendingQuest(): File | null {
  const file = pending;
  pending = null;
  return file;
}

/** Called when a file is picked while /play is already showing. */
export function onPendingQuest(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export const isQuestFile = (file: File) => file.name.toLowerCase().endsWith(".quest");
