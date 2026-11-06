// Runtime engine (specs 03–07). Data in, no user code (spec 03).
export { SCHEMA_VERSION } from "@questforge/schema";
export { createGame, ProjectErrors, sceneImageIds, type Game, type GameOptions, type ProjectBundle } from "./game.ts";
export { World, type Drawable, type LoadedImage, type Target, type Verb } from "./world.ts";
export { NavMesh, sceneNav, pathLength } from "./nav.ts";
export { scaleAt, walkSpeedAt, objectBaseline, sortByBaseline } from "./depth.ts";
export { fitViewport, toScene, toDevice, FixedStep, type Viewport } from "./viewport.ts";
export { lookText } from "./look.ts";
export type { Vec } from "./vec.ts";
