import type { Action, AnyRule, SceneFile } from "@questforge/schema";
import type { PlayerSettings } from "./saves.ts";
import { VOLUME_STEPS } from "./saves.ts";

// Audio logic: which track should play and which sounds are due,
// decided from the session; the host's backend (Web Audio in the browser) makes
// the noise. Pure, so it is tested in Node.

/** Makes sound. `music(null)` stops the music; the same ID again is a no-op for the backend's caller. */
export interface AudioBackend {
  /** Start loading these audio IDs in the background. */
  prefetch(ids: readonly string[]): void;
  music(id: string | null): void;
  sound(id: string): void;
  /** Gains 0–1. */
  volumes(music: number, sfx: number): void;
}

/** What the audio needs from a session: the track in the game state and the queued sounds. */
export interface AudioSource {
  readonly state: { music: string | null };
  readonly sounds: string[];
}

/** Volume step (0–10) → gain, on a curve so the low steps aren't all loud. */
export const gainFor = (step: number) => Math.pow(Math.max(0, Math.min(VOLUME_STEPS, step)) / VOLUME_STEPS, 2);

/** Follows a session each frame: switches music only when the track changes, plays queued sounds once. */
export class AudioSync {
  private playing: string | null = null;

  constructor(private readonly backend: AudioBackend) {}

  update(source: AudioSource) {
    const want = source.state.music;
    if (want !== this.playing) {
      this.playing = want;
      this.backend.music(want);
    }
    if (source.sounds.length) for (const id of source.sounds.splice(0)) this.backend.sound(id);
  }

  setVolumes(s: PlayerSettings) {
    this.backend.volumes(gainFor(s.music), gainFor(s.sfx));
  }
}

function ruleAudio(rules: readonly AnyRule[], out: Set<string>) {
  for (const r of rules) for (const a of r.do as readonly Action[]) {
    if (a.type === "play_sound") out.add(a.sound);
    if (a.type === "play_music") out.add(a.music);
  }
}

/** Audio a scene may need soon: its music and every sound or track its rules play (prefetched on entry). */
export function sceneAudioIds(scene: SceneFile): string[] {
  const out = new Set<string>();
  if (scene.music !== undefined) out.add(scene.music);
  ruleAudio(scene.rules, out);
  for (const t of [...scene.hotspots, ...scene.objects, ...scene.characters, ...scene.regions]) ruleAudio(t.rules, out);
  return [...out];
}
