import type { LoadedImage } from "@questforge/engine";
import type { ImageAsset, Project } from "@questforge/schema";
import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

// Decoded images for the scene canvas. A file imported this session that isn't on
// disk yet is shown from its bytes in memory (`pendingFiles`), so a dropped
// background appears at once. DOM code: the model only sees `ImageLookup`.

interface Entry {
  source: string;
  image: LoadedImage | null;
}

export class CanvasImages {
  private entries = new Map<string, Entry>();
  private blobs = new Map<string, string>();
  private listeners = new Set<() => void>();
  private _version = 0;

  constructor(private readonly assetUrl: (path: string) => string | undefined) {}

  get version() {
    return this._version;
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private changed() {
    this._version++;
    for (const l of this.listeners) l();
  }

  /** Starts loading every image the project lists (projects are small), dropping stale ones. */
  sync(p: Project) {
    const images = p.assets?.data.images ?? [];
    for (const asset of images) {
      const source = this.sourceFor(p, asset);
      if (!source) continue;
      const known = this.entries.get(asset.id);
      if (known?.source === source) {
        // Sheet/origin edits don't need a reload.
        if (known.image && known.image.asset !== asset) known.image = { ...known.image, asset };
        continue;
      }
      const entry: Entry = { source, image: null };
      this.entries.set(asset.id, entry);
      const el = new Image();
      el.onload = () => {
        if (this.entries.get(asset.id) !== entry) return;
        entry.image = { asset, size: { w: el.naturalWidth, h: el.naturalHeight }, el };
        this.changed();
      };
      el.src = source;
    }
    const ids = new Set(images.map((i) => i.id));
    for (const id of [...this.entries.keys()]) if (!ids.has(id)) this.entries.delete(id);
  }

  private sourceFor(p: Project, asset: ImageAsset): string | undefined {
    const bytes = p.pendingFiles[asset.path];
    if (bytes) {
      let url = this.blobs.get(asset.path);
      if (!url) {
        url = URL.createObjectURL(new Blob([bytes as BlobPart]));
        this.blobs.set(asset.path, url);
      }
      return url;
    }
    // Once saved, keep showing the in-memory copy: same pixels, no flicker.
    const blob = this.blobs.get(asset.path);
    if (blob) return blob;
    if (!p.files.includes(asset.path)) return undefined;
    return this.assetUrl(asset.path);
  }

  /** A URL for a project file, the in-memory copy when it was imported this session (playtest, D128). */
  urlFor(p: Project, path: string): string {
    return this.sourceFor(p, { id: "", path }) ?? this.assetUrl(path) ?? path;
  }

  lookup = (id: string): LoadedImage | undefined => this.entries.get(id)?.image ?? undefined;

  dispose() {
    for (const url of this.blobs.values()) URL.revokeObjectURL(url);
    this.blobs.clear();
  }
}

/** One image store per open project (Workspace), shared by scene canvases and the Inspector. */
export const CanvasImagesContext = createContext<CanvasImages | null>(null);

/** The workspace's decoded images, kept in step with the project; re-renders as they load. */
export function useCanvasImages(project: Project): CanvasImages {
  const images = useContext(CanvasImagesContext);
  if (!images) throw new Error("No image store");
  useEffect(() => images.sync(project), [images, project]);
  useSyncExternalStore(images.subscribe, () => images.version);
  return images;
}
