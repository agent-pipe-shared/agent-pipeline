---
schema: pipeline.backlog-item.v1
id: pipeline.local-worker-supervisor-cli-suite-flakes-under-full-verify
type: defect
owner: pipeline
status: open
created: 2026-08-06
source: "Sprint Nova session, 2026-08-06: Full Verify on candidate 9f5bfc9 failed with local-worker-supervisor-cli-tests=1, the same suite passed 9/9 standalone immediately afterwards, and an unchanged re-run of Full Verify on the same candidate and clean tree went green."
due: 2026-09-06
---

# `local-worker-supervisor-cli-tests` is not deterministic under Full Verify

## Description

On candidate `9f5bfc92182bc672f311d21354d8ea03f7aa1c0e`, clean tree:

- Full Verify run 1 → `local-worker-supervisor-cli-tests=1`, overall exit 1.
- The suite standalone, immediately after → `9/9 checks passed`, exit 0.
- Full Verify run 2, same candidate, same tree, nothing changed → exit 0, 240
  suites.

The suite spawns real child processes and creates no-hardlink Git clones
(LWSC01 runs two overlapping real children; LWSC03 depends on a timeout firing;
LWSC07 depends on a killed supervisor's worker still being attributable). Under
Full Verify it runs at index 208 of 240 with the rest of the corpus competing
for the same machine, which is the obvious suspect for a timing-dependent
outcome — but no diagnostic was captured beyond `exitCode: 1`, so the failing
case is not yet known.

The suite's own last commit, `93bfc69 test(pipeline): stabilize clean verify
candidates`, suggests this is not the first time.

## Why it matters more than an ordinary flake

Full Verify is the delivery gate, and its output is candidate-bound evidence.
A gate that can go red without a defect trains its readers to re-run rather
than investigate — which is exactly the reflex that lets a real failure through.
It also blocks any push whose approval requires fresh green evidence, without
anything being wrong with the candidate.

## What is needed

1. ~~Capture the failing case.~~ **DONE 2026-08-06 night** — see Triage.
2. Then remove the timing dependency in that case rather than widening a
   timeout, so the suite proves the same property deterministically. **Fix
   identified, not yet applied — see Triage** (blocked by GS-6 in this
   session, needs the PO or a source-checkout review session).
3. Until then, treat a lone `local-worker-supervisor-cli-tests` failure as
   unconfirmed: re-run once, and if it goes green, record BOTH runs rather than
   only the green one.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** root cause found and reproduced; fix identified but not yet
  applied. Stays open.
- **Rationale:** reproduced deterministically 2026-08-06 night by running 6
  copies of `local-worker-supervisor.test.mjs` concurrently (simulating Full
  Verify's machine contention) — 1 of 6 failed with
  `SyntaxError: Unexpected end of JSON input` inside `waitForRecord()`
  (`local-worker-supervisor.test.mjs:297`), at LWSC04. Traced to a real race,
  but in the **test harness, not production code**:
  `local-worker-supervisor.mjs`'s `persistNewRecord()` creates
  `supervisor.json` for the first time via `createJsonExclusive()` — an
  `openSync(path, "wx")` directly on the final path, then `writeFileSync` +
  `fsyncSync` — so the file exists at 0 bytes for a real (schedule-widened)
  window between open and write completion. Every subsequent update instead
  uses `atomicWriteJson()` (temp file + `renameSync`), which has no such
  window. Every production reader is already safe against this: all real
  call sites go through `readBoundedJson()`, which wraps `JSON.parse` in
  try/catch and returns `null` on failure (treated as "no record yet"). The
  test's own `waitForRecord()` helper is the **only** unsafe reader — a bare
  `JSON.parse(readFileSync(...))` with no try/catch, so it crashes instead of
  polling again.
  **Fix (small, test-only, no production risk):** wrap the read/parse in
  `waitForRecord` (`local-worker-supervisor.test.mjs:296-298`) in try/catch,
  treating a parse failure the same as "not written yet, keep polling" —
  mirroring the `readBoundedJson` pattern already used everywhere in
  production. Drafted and verified to match the actual code during this
  investigation, but **not committed**: editing this file is refused by
  GS-6 in this session (`plugins/pipeline-core/**` is this session's live
  enforcing plugin root — self-application means the checkout and the
  installed copy coincide here — and GS-6 has deliberately no in-session
  override). Per GS-6's own stated escape hatch, this needs the PO editing
  outside an agent session, or a review in a differently-rooted session.
- **Assignment (if accepted):** diagnosis and fix design complete,
  2026-08-06. Applying the two-line try/catch in `waitForRecord` is
  unassigned, blocked on the GS-6 escape hatch above.
- **Date:** 2026-08-06
