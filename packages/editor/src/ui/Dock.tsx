import { useState } from "react";
import { formatProblem } from "@questforge/schema";
import type { Actions } from "../model/actions.ts";
import { isAssetKind } from "../model/browser.ts";
import { locate } from "../model/locate.ts";

/** Bottom dock (D89): a read-only Problems list with jump-to; Playtest arrives in M6. */
export function Dock({ actions }: { actions: Actions }) {
  const { editor, ws } = actions;
  const [tab, setTab] = useState<"problems" | "playtest">("problems");
  const problems = editor.problems;
  const errors = problems.filter((p) => p.severity === "error").length;
  return (
    <>
      <div className="docktabs" role="tablist">
        <button role="tab" aria-selected={tab === "problems"} onClick={() => setTab("problems")}>
          Problems ({problems.length})
        </button>
        <button role="tab" aria-selected={tab === "playtest"} onClick={() => setTab("playtest")}>
          Playtest
        </button>
      </div>
      <div className="dockbody" role="tabpanel">
        {tab === "playtest" && <p className="muted">Playtest arrives in M6.</p>}
        {tab === "problems" && problems.length === 0 && <p className="ok">No problems.</p>}
        {tab === "problems" && problems.length > 0 && (
          <>
            <p className="muted small">
              {errors} error{errors === 1 ? "" : "s"} block playtest and export. Click one to jump to it.
            </p>
            <ul className="problems" aria-label="Problems">
              {problems.map((pr, i) => {
                const target = locate(editor.project, pr.location);
                return (
                  <li key={i} className={pr.severity}>
                    <button
                      className="link"
                      disabled={!target}
                      onClick={() => {
                        if (!target) return;
                        if (isAssetKind(target.section)) ws.open(target);
                        else ws.select({ kind: "entry", ...target });
                        ws.reveal(target.section, "");
                      }}
                    >
                      {pr.severity === "error" ? "✖" : "⚠"} {formatProblem(pr)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
