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

1. Capture the failing case. Verify keeps per-suite stdout in owner-private
   bounded logs and surfaces only `exitCode` in the evidence artifact; the
   journal's `diagnosticDigest` did not identify a case either. Something has
   to name WHICH of LWSC01–LWSC09 failed before this can be fixed.
2. Then remove the timing dependency in that case rather than widening a
   timeout, so the suite proves the same property deterministically.
3. Until then, treat a lone `local-worker-supervisor-cli-tests` failure as
   unconfirmed: re-run once, and if it goes green, record BOTH runs rather than
   only the green one.
