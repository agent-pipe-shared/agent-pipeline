#!/usr/bin/env node
// What would evicting the audit's 12 "eligible on the caller-scoping criterion"
// suites actually save? The lane is 100% of wall clock, so lane seconds removed
// are wall-clock seconds saved -- but only if the remaining lane still fits.
//
// Usage: node scratch/eligible-12-cost.mjs <verify-progress-stream.jsonl>

import { readFileSync } from "node:fs";

const ELIGIBLE = new Set([
  "session-cleanup-recovery-tests", "lifecycle-ready-enforcement-tests",
  "session-cleanup-owner-nonce-tests", "session-cleanup-binding-tests",
  "session-cleanup-power-tests", "codex-sandbox-runtime-tests",
  "worktree-lifecycle-tests", "guard-maintenance-window-tests",
  "project-authority-tests", "project-authority-migration-cli-tests",
  "session-power-cli-tests", "nova-verify-journal-tests",
]);

// The audit itself names four of these as NOT clean on a second signal.
const CAVEATED = new Set([
  "nova-verify-journal-tests",          // verify-journal.mjs writes .git/agent-pipeline/**
  "project-authority-tests",            // project-authority.mjs has cwd() defaults
  "project-authority-migration-cli-tests",
  "session-cleanup-recovery-tests",     // own process.cwd() reference
]);

const durations = new Map();
for (const line of readFileSync(process.argv[2], "utf8").split("\n")) {
  if (!line.trim().startsWith("{")) continue;
  let row;
  try { row = JSON.parse(line); } catch { continue; }
  if (row?.schema !== "pipeline.verify-progress.v1") continue;
  if (row.state !== "completed" || !row.startedAt || !row.completedAt) continue;
  durations.set(row.suite, (Date.parse(row.completedAt) - Date.parse(row.startedAt)) / 1000);
}

const sum = (names) => [...names].reduce((n, s) => n + (durations.get(s) ?? 0), 0);
const clean = [...ELIGIBLE].filter((s) => !CAVEATED.has(s));

console.log(`eligible (12):            ${sum(ELIGIBLE).toFixed(1)}s`);
console.log(`  of which caveated (4):  ${sum(CAVEATED).toFixed(1)}s  -- need signal (a)/(b)/(c) clearing first`);
console.log(`  clean on this audit (8):${sum(clean).toFixed(1)}s`);
console.log("");
console.log("per-suite, clean subset:");
for (const s of clean.sort((a, b) => (durations.get(b) ?? 0) - (durations.get(a) ?? 0))) {
  console.log(`  ${(durations.get(s) ?? 0).toFixed(1).padStart(6)}s  ${s}`);
}
