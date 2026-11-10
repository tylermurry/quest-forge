import type { AudioBackend } from "./audio.ts";

// Web Audio backend (spec 07): music loops through one gain, sound effects through
// another. Browsers (iOS Safari above all) keep audio silent until a user gesture,
// so the context is created and resumed from `unlock()`, which the game calls on
// every pointerdown and pointerup (pointerup is the touch gesture iOS accepts).
// Files are fetched as soon as they're asked for and decoded once the context exists.

const FADE = 0.3;

export class WebAudio implements AudioBackend {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private gains = { music: 1, sfx: 1 };
  private readonly bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly decoded = new Map<string, Promise<AudioBuffer | null>>();
  private wantMusic: string | null = null;
  private current: { id: string; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private readonly paths: Map<string, string>;
  private hidden = false;
  private closed = false;

  constructor(
    audio: readonly { id: string; path: string }[],
    private readonly assetUrl: (path: string) => string,
    private readonly view: Window & typeof globalThis,
    private readonly onError: (message: string) => void = () => {},
  ) {
    this.paths = new Map(audio.map((a) => [a.id, a.path]));
  }

  /** Called from user gestures: make the context and let it play (spec 07 iOS requirement). */
  unlock = () => {
    if (this.closed) return;
    if (!this.ctx) {
      // Older Safari only has the prefixed name, which TypeScript's DOM types don't declare.
      const Ctor = this.view.AudioContext ?? (this.view as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.musicGain = ctx.createGain();
      this.sfxGain = ctx.createGain();
      this.musicGain.connect(ctx.destination);
      this.sfxGain.connect(ctx.destination);
      this.applyGains();
      // A silent blip inside the gesture is what finally unmutes older iOS.
      const blip = ctx.createBufferSource();
      blip.buffer = ctx.createBuffer(1, 1, 22050);
      blip.connect(ctx.destination);
      blip.start(0);
      this.startMusic();
    }
    // A refused resume is retried by the next pointer event, which is why this runs on every one.
    if (this.ctx.state !== "running" && !this.hidden) void this.ctx.resume().catch(() => {});
  };

  /** The page was hidden or shown again: pause audio while it's in the background. */
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    if (!this.ctx || this.closed) return;
    // Suspend/resume can be refused by the browser (no gesture yet). Audio is not essential here,
    // and the next pointer event resumes it.
    void (hidden ? this.ctx.suspend() : this.ctx.resume()).catch(() => {});
  }

  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  /** The track actually sounding now (decoded and started), for debugging. */
  get playing(): string | null {
    return this.current?.id ?? null;
  }

  prefetch(ids: readonly string[]) {
    for (const id of ids) void this.fetchBytes(id);
  }

  private fetchBytes(id: string): Promise<ArrayBuffer | null> {
    let p = this.bytes.get(id);
    if (!p) {
      const path = this.paths.get(id);
      p = path
        ? fetch(this.assetUrl(path))
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .catch((e: unknown) => {
              this.onError(`Sound ${id} couldn't be loaded: ${e instanceof Error ? e.message : String(e)}`);
              return null;
            })
        : Promise.resolve(null);
      this.bytes.set(id, p);
    }
    return p;
  }

  private buffer(id: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    let p = this.decoded.get(id);
    if (!p) {
      p = this.fetchBytes(id).then((bytes) =>
        // decodeAudioData detaches its input, so hand it a copy and keep the bytes.
        bytes
          ? ctx.decodeAudioData(bytes.slice(0)).catch(() => {
              this.onError(`Sound ${id} isn't an audio file the browser can play.`);
              return null;
            })
          : null,
      );
      this.decoded.set(id, p);
    }
    return p;
  }

  music(id: string | null) {
    this.wantMusic = id;
    if (id) void this.fetchBytes(id);
    this.startMusic();
  }

  /** Brings the playing track in line with `wantMusic`: fade the old one out, start the new one when decoded. */
  private startMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const want = this.wantMusic;
    if (this.current?.id === want) return;
    if (this.current) {
      const { source, gain } = this.current;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + FADE);
      source.stop(t + FADE);
      this.current = null;
    }
    if (!want) return;
    void this.buffer(want).then((buf) => {
      if (!buf || this.closed || this.wantMusic !== want || this.current) return;
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.loop = true;
      const gain = ctx.createGain();
      source.connect(gain).connect(this.musicGain!);
      source.start();
      this.current = { id: want, source, gain };
    });
  }

  sound(id: string) {
    const ctx = this.ctx;
    // Before the first gesture there is no sound to make; it isn't queued for later.
    if (!ctx || ctx.state !== "running") {
      void this.fetchBytes(id);
      return;
    }
    void this.buffer(id).then((buf) => {
      if (!buf || this.closed) return;
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(this.sfxGain!);
      source.start();
    });
  }

  volumes(music: number, sfx: number) {
    this.gains = { music, sfx };
    this.applyGains();
  }

  private applyGains() {
    if (this.musicGain) this.musicGain.gain.value = this.gains.music;
    if (this.sfxGain) this.sfxGain.gain.value = this.gains.sfx;
  }

  close() {
    this.closed = true;
    try {
      this.current?.source.stop();
    } catch {
      // Already stopped.
    }
    this.current = null;
    // Closing an already-closed context rejects. The game is being torn down, so there is nothing to tell.
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
