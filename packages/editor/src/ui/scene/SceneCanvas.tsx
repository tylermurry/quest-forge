import { useEffect, useRef, useSyncExternalStore } from "react";
import type { SceneController } from "../../model/scene/controller.ts";
import { isMac } from "../hooks.ts";
import { drawFrame } from "./draw.ts";

/**
 * The scene canvas. It only forwards input to the DOM-free controller
 * and draws its frames; all decisions live in `model/scene`.
 */
export function SceneCanvas({
  controller,
  redraw,
  onDropFiles,
  dropRef,
  highlight,
  children,
}: {
  controller: SceneController;
  /** Subscribes to other things that change the picture (decoded images). */
  redraw?: (listener: () => void) => () => void;
  onDropFiles?(files: File[], screen: [number, number]): void;
  dropRef?: (el: HTMLElement | null) => void;
  /** Something droppable is over the canvas. */
  highlight?: boolean;
  /** Overlays drawn above the canvas (prompts). */
  children?: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const c = controller;
  useSyncExternalStore(c.subscribe, () => c.version);

  // Keep the canvas sized to its box in device pixels.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const resize = () => {
      const r = el.getBoundingClientRect();
      c.setSize({ w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [c]);

  // Redraw on any change: the controller's own, the editor's, the scene UI's.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const draw = () => {
      raf = 0;
      const el = canvas.current;
      c.clock = (performance.now() - start) / 1000;
      const f = c.frame();
      if (!el || !f) return;
      const dpr = window.devicePixelRatio || 1;
      const { w, h } = c.canvasSize;
      if (el.width !== w * dpr || el.height !== h * dpr) {
        el.width = w * dpr;
        el.height = h * dpr;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
      }
      const ctx = el.getContext("2d");
      if (ctx) drawFrame(ctx, f, dpr, { w, h });
      // Object loops and idle animations play live; a still scene doesn't redraw.
      if (c.animating) request();
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    request();
    const offs = [
      c.subscribe(request),
      c.editor.subscribe(request),
      c.host.ws.subscribe(request),
      c.host.ws.sceneUi.subscribe(request),
      ...(redraw ? [redraw(request)] : []),
    ];
    return () => {
      if (raf) cancelAnimationFrame(raf);
      offs.forEach((off) => {
        off();
      });
    };
  }, [c, redraw]);

  // Space-drag pans. Space is held state, not a command, so it isn't in the registry.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || !!t.closest?.("[data-playtest-game]"));
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e)) {
        e.preventDefault();
        c.setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") c.setSpace(false);
    };
    const blur = () => c.setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [c]);

  // Wheel must be non-passive to stop the page from scrolling or zooming.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const k = e.deltaMode === 1 ? 16 : 1;
      c.wheel({ screen: [e.clientX - r.left, e.clientY - r.top], dx: e.deltaX * k, dy: e.deltaY * k, zoom: e.ctrlKey || e.metaKey });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [c]);

  // Pointer events don't carry a reliable click count, so count presses here.
  const lastDown = useRef<{ t: number; x: number; y: number; n: number } | null>(null);
  const input = (e: React.PointerEvent, down = false) => {
    const r = canvas.current!.getBoundingClientRect();
    const screen: [number, number] = [e.clientX - r.left, e.clientY - r.top];
    let clicks = lastDown.current?.n ?? 1;
    if (down) {
      const l = lastDown.current;
      clicks = l && e.timeStamp - l.t < 400 && Math.hypot(screen[0] - l.x, screen[1] - l.y) < 4 ? l.n + 1 : 1;
      lastDown.current = { t: e.timeStamp, x: screen[0], y: screen[1], n: clicks };
    }
    return { screen, button: e.button, alt: e.altKey, shift: e.shiftKey, mod: isMac() ? e.metaKey : e.ctrlKey, clicks };
  };

  return (
    <div
      ref={(el) => {
        wrap.current = el;
        dropRef?.(el);
      }}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length || !onDropFiles) return;
        e.preventDefault();
        const r = canvas.current!.getBoundingClientRect();
        onDropFiles([...e.dataTransfer.files], [e.clientX - r.left, e.clientY - r.top]);
      }}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label="Scene canvas"
        tabIndex={0}
        className="absolute inset-0 block touch-none outline-none"
        style={{ cursor: c.panning ? "grab" : c.cursor }}
        onPointerDown={(e) => {
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          c.pointerDown(input(e, true));
        }}
        onPointerMove={(e) => c.pointerMove(input(e))}
        onPointerUp={(e) => c.pointerUp(input(e))}
        onPointerCancel={(e) => c.pointerUp(input(e))}
        onPointerLeave={() => c.pointerLeave()}
        onContextMenu={(e) => e.preventDefault()}
        onAuxClick={(e) => e.preventDefault()}
      />
      {highlight && <div className="ring-primary pointer-events-none absolute inset-0 ring-2 ring-inset" />}
      {children}
    </div>
  );
}
