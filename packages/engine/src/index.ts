// Runtime engine (specs 03–07). Data in, no user code (spec 03).
export { SCHEMA_VERSION } from "@questforge/schema";
export { createGame, ProjectErrors, sceneImageIds, type Game, type GameOptions, type ProjectBundle } from "./game.ts";
export { World, type Drawable, type LoadedImage, type Target, type WorldOptions } from "./world.ts";
export { Session, VERB_CYCLE, ALWAYS_READY, linkedScenes, type Ending, type SceneAssets, type SessionStart, type Verb } from "./session.ts";
export { initialState, cloneState, score, type GameState, type Position } from "./state.ts";
export { firstMatch, checkCondition, defaultResponse, ruleKey, triggerMatches, type RuleOwner } from "./rules.ts";
export { Sequence, type SequenceHost } from "./sequence.ts";
export { layoutTextBox, textDuration, wrap, type TextBox } from "./ui/textbox.ts";
export { PlayerUi, type PointerKind } from "./ui/controller.ts";
export { computeLayout, unitFor, MIN_HIT_CSS, type Layout } from "./ui/layout.ts";
export { NavMesh, sceneNav, pathLength } from "./nav.ts";
export { scaleAt, walkSpeedAt, objectBaseline, sortByBaseline } from "./depth.ts";
export { fitViewport, toScene, toDevice, FixedStep, type Viewport } from "./viewport.ts";
export type { Vec } from "./vec.ts";
