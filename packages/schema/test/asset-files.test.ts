import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRASH_DIR, loadProject, planSave, renameId, saveProject, validateProject, type Project } from "../src/index.ts";
import { fixtureCopy } from "./helpers.ts";

const setImages = (p: Project, f: (imgs: NonNullable<Project["assets"]>["data"]["images"]) => typeof imgs): Project => ({
  ...p,
  assets: { ...p.assets!, data: { ...p.assets!.data, images: f(p.assets!.data.images) } },
});
const movePath = (p: Project, id: string, path: string) => setImages(p, (imgs) => imgs.map((i) => (i.id === id ? { ...i, path } : i)));

describe("image and audio files follow assets.yaml", () => {
  it("moves the file when an image's path changes", async () => {
    const { dir, fs } = await fixtureCopy();
    let { project } = await loadProject(fs);
    const before = await readFile(join(dir, "assets/images/palm_img.png"));
    project = movePath(project, "palm_img", "assets/images/trees/palm_img.png");
    expect(planSave(project).moves).toEqual([{ from: "assets/images/palm_img.png", to: "assets/images/trees/palm_img.png" }]);
    ({ project } = await saveProject(fs, project));
    expect(await readFile(join(dir, "assets/images/trees/palm_img.png"))).toEqual(before);
    expect(project.files).toContain("assets/images/trees/palm_img.png");
    expect(project.files).not.toContain("assets/images/palm_img.png");
    expect(planSave(project).moves).toEqual([]);
    expect(validateProject(project)).toEqual([]);
  });

  it("finds a renamed-and-moved image by its file name", async () => {
    const { fs } = await fixtureCopy();
    const { project } = await loadProject(fs);
    const next = movePath(renameId(project, "image", "palm_img", "palm"), "palm", "assets/images/trees/palm_img.png");
    expect(planSave(next).moves).toEqual([{ from: "assets/images/palm_img.png", to: "assets/images/trees/palm_img.png" }]);
  });

  it("sends a deleted image to the trash, and undo brings it back", async () => {
    const { dir, fs } = await fixtureCopy();
    const { project: loaded } = await loadProject(fs);
    const deleted = setImages(loaded, (imgs) => imgs.filter((i) => i.id !== "palm_img"));
    let { project } = await saveProject(fs, deleted);
    expect(project.trash).toEqual(["assets/images/palm_img.png"]);
    expect(await readFile(join(dir, TRASH_DIR, "assets/images/palm_img.png"))).toBeTruthy();

    // Undo: the old content comes back with the current disk state.
    const undone = { ...project, assets: loaded.assets };
    expect(planSave(undone).moves).toEqual([{ from: `${TRASH_DIR}/assets/images/palm_img.png`, to: "assets/images/palm_img.png" }]);
    ({ project } = await saveProject(fs, undone));
    expect(project.trash).toEqual([]);
    expect(project.files).toContain("assets/images/palm_img.png");
    expect(validateProject(project)).toEqual([]);
  });

  it("writes an import on save only while assets.yaml still uses it", async () => {
    const { dir, fs } = await fixtureCopy();
    const { project: loaded } = await loadProject(fs);
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const imported: Project = {
      ...setImages(loaded, (imgs) => [...imgs, { id: "shell", path: "assets/images/shell.png" }]),
      pendingFiles: { "assets/images/shell.png": bytes },
    };
    expect(validateProject(imported)).toEqual([]); // counts as present before it's written
    expect(planSave(imported).binaryWrites).toEqual([{ path: "assets/images/shell.png", bytes }]);
    expect(planSave({ ...loaded, pendingFiles: imported.pendingFiles }).binaryWrites).toEqual([]);

    const { project } = await saveProject(fs, imported);
    expect(new Uint8Array(await readFile(join(dir, "assets/images/shell.png")))).toEqual(bytes);
    expect(project.pendingFiles).toEqual({});
    expect(project.files).toContain("assets/images/shell.png");

    // Undoing the import after the save trashes the written file.
    expect(planSave({ ...project, assets: loaded.assets }).moves).toEqual([
      { from: "assets/images/shell.png", to: `${TRASH_DIR}/assets/images/shell.png` },
    ]);
  });

  it("moves audio files the same way", async () => {
    const { fs } = await fixtureCopy();
    const { project } = await loadProject(fs);
    const next: Project = {
      ...project,
      assets: { ...project.assets!, data: { ...project.assets!.data, audio: project.assets!.data.audio.map((a) => (a.id === "coin_clink" ? { ...a, path: "assets/audio/sfx/coin_clink.wav" } : a)) } },
    };
    expect(planSave(next).moves).toEqual([{ from: "assets/audio/coin_clink.wav", to: "assets/audio/sfx/coin_clink.wav" }]);
  });
});
