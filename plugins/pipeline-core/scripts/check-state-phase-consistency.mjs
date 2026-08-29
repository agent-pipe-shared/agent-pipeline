#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Mirrors check-release-state-consistency.mjs's pattern: a machine-computed
// fact (here, `project/pipeline-state.json`'s `activeFeature.phase`) versus a
// fixed marker string expected verbatim in `docs/state.md`.
//
// pipeline.state-phase-projection-atomicity
// (backlog/items/2026-08-29-docs-state-human-summary-diverges-from-machine-next-action.md):
// this check is the safety net for that atomicity property. `pipeline-state.mjs`'s
// `syncNextActionDocs()` already resyncs the marker on every phase-affecting
// command (`statePhaseProjectionMarker`/`syncStatePhaseMarker`), but that write
// path is explicitly best-effort and never gates command success -- a missed
// call site, a hand-edited handover file, or a future regression can all leave
// it stale. This check is what actually catches that drift rather than trusting
// the writer alone.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readState, statePhaseProjectionMarker } from "./pipeline-state.mjs";

export const STATE_PHASE_CHECK_SCHEMA = "pipeline.state-phase-consistency.v1";
const SCRIPT_PATH = fileURLToPath(import.meta.url);

export function checkStatePhaseConsistency({ rootDir, handoverPath = "docs/state.md" }, dependencies = {}) {
  const root = resolve(rootDir);
  const observeState = dependencies.readState ?? readState;
  const readHandover = dependencies.readFileSync ?? readFileSync;
  let handover;
  try {
    handover = readHandover(resolve(root, handoverPath), "utf8");
  } catch {
    return { schema: STATE_PHASE_CHECK_SCHEMA, status: "blocked", reasons: ["documentation-unavailable"], phase: null, featureId: null };
  }
  const observed = observeState(root);
  if (observed.status !== "ok") {
    return { schema: STATE_PHASE_CHECK_SCHEMA, status: "blocked", reasons: [`state-${observed.status}`], phase: null, featureId: null };
  }
  const marker = statePhaseProjectionMarker(observed.state);
  const reasons = handover.includes(marker) ? [] : ["state-phase-projection-mismatch"];
  const feature = observed.state?.activeFeature ?? null;
  return {
    schema: STATE_PHASE_CHECK_SCHEMA,
    status: reasons.length === 0 ? "consistent" : "blocked",
    reasons,
    phase: feature?.phase ?? null,
    featureId: feature?.id ?? null,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  const rootIndex = process.argv.indexOf("--root");
  if (rootIndex < 0 || process.argv[rootIndex + 1] === undefined || process.argv.length !== 4) {
    process.stderr.write(`${JSON.stringify({ schema: STATE_PHASE_CHECK_SCHEMA, status: "rejected", reasons: ["invalid-cli"], phase: null, featureId: null })}\n`);
    process.exitCode = 2;
  } else {
    const result = checkStatePhaseConsistency({ rootDir: process.argv[rootIndex + 1] });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "consistent" ? 0 : 2;
  }
}
