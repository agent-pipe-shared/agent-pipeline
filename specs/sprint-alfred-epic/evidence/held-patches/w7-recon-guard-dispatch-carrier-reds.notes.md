# Recon: guard-dispatch.test.mjs reds at candidate cb063f9c3 (notes only, no patch)

Scratch clone (git clone --shared, detached at the candidate), `node plugins/pipeline-core/hooks/guard-dispatch.test.mjs` run once, log written by the driver. Model output: re-verify before slicing. Tool budget ended at call 32 of 40: some items are NOT REACHED.

## 0. Counts

Reporter summary: tests 75, pass 53, fail 22. The failing set is exactly 22 names (the "24" of the earlier note was a miscount; the "22" of the composed verify note is right):
GD12, GD13, GD14, GD22, GD23, GD27, GD33, GD34, GD36, GD38, GD39, GD41, GD42, GD43, GD58, GD59, GD60, GD61, GD62, GD63, GD64, GD65.
IMPORTANT: the `GDnn` prefix in the reporter is POSITIONAL (register order, test file lines 87-90); the label inside the check name (for example "GD2i", "GD15a") differs. Below, runtime id first, test label in brackets.

## 1. Group A: DISPATCH-WRITE-CARRIER-REQUIRED where the test expects allow (exit 2, expected 0)

Runtime ids: GD12 [GD2i Plan], GD13 [GD2i general-purpose], GD14 [GD2j Workflow batch of two Explore], GD23 [GD5], GD33 [GD15 Antigravity general-purpose], GD41 [GD15h Codex worker], GD42 [GD15i Codex, agent_type omitted].

| Item | Finding |
|---|---|
| Class | FIXTURE, stale against a deliberate production policy (not PRODUCTION, not ENVIRONMENT) |
| Production site | `hooks/guard-dispatch.mjs` line 242-250 `writeCapableCarrierAdmission`, called at line 849-862. Admits only: shipped pipeline-core consult-advisor/critic/plan-verifier/readiness-reviewer (line 245), Codex `explorer` (246), direct-transport `Explore` (247), the three pipeline-core goldfish roles (248). Everything else returns the code (line 249). The comment at 239-241 states the intent: "general workers can write". |
| Differing values | Plan, general-purpose, Antigravity TypeName general-purpose, Codex `worker` or omitted type: refused. `Explore` through a direct Agent call: admitted (probe: exit 0). Explore inside a Workflow `agent()` script: transport `workflow`, line 247 requires `direct`, so refused (probe GD14wf exit 2). |
| Counter-evidence that this is intended | Passing cases GD72/GD73 (positional ids; labels W7 B-i/B-ii, test line ~1081 `planPayload`) PIN that a Plan dispatch is refused and the message names the Explore route (line 858). The old allow cases contradict them. |
| Smallest fix | Test-only, in `hooks/guard-dispatch.test.mjs`: GD2i Plan/general-purpose (loop at lines 232-238) change expectation to BLOCK with `DISPATCH-WRITE-CARRIER-REQUIRED` (keep Explore as ALLOW); GD2j (239-246) change the Workflow batch to BLOCK, or keep ALLOW only via a direct Explore call; GD5 (357-360), GD15 (439-442), GD15h/GD15i (479-486): change to BLOCK with the carrier code, or swap the fixture to a carrier-admitted type (for example `pipeline-core:consult-advisor`). Each is an existing-case update that needs a written justification tied to the policy (not a weakening). |
| Protected? | NOT in TP-1..TP-13 (agent-obligations section 2). The briefed write scope names a different file, so this is outside this dispatch; a later slice must add the file to its scope. |
| Confidence | High on cause; medium on the intended semantics for Codex worker/default (confirm with the policy owner) |

## 2. Group B: typed pre-launch codes pre-empted by the carrier check (ORDER or FIXTURE)

Runtime ids: GD34 [GD15a, expects DISPATCH-ROLE-REQUIRED], GD36 [GD15c, DISPATCH-ROLE-UNKNOWN], GD38 [GD15e, DISPATCH-ROLE-REQUIRED], GD39 [GD15f, DISPATCH-ROLE-REQUIRED], GD43 [GD15j, DISPATCH-PROMPT-REQUIRED].

| Item | Finding |
|---|---|
| Observed (probe in the clone, same payloads) | all five exit 2 with `DISPATCH-WRITE-CARRIER-REQUIRED` instead of the expected code |
| Cause | `guard-dispatch.mjs` runs the carrier check (line 849-862) before the `dispatchFindings` blocks (line 863) that carry the ROLE-REQUIRED / ROLE-UNKNOWN / PROMPT-REQUIRED codes. An empty, unknown or Codex-`worker` type is not carrier-admitted, so the carrier code wins. GD35 [GD15b] passes because consult-advisor is carrier-admitted. |
| Class | ORDER (production ordering) with a FIXTURE reading: either the tests are stale or the order should put the typed packet findings first. Undecided; the typed codes carry `"modelCalls":0` evidence the tests want. |
| Smallest fix | Option 1 (test-only): expect the carrier code for these packets. Option 2 (PRODUCTION, custody file): move the packet-shape findings ahead of line 849. Prefer deciding with the owner; hooks/guard-dispatch.mjs is custody/protected for the Critic. |
| Confidence | High on observed order; the choice of fix is a judgment call (NOT resolved) |

## 3. Group C: DBG-GENERATED-BRIEFING-REQUIRED / incomplete-briefing check pre-empted

Runtime ids: GD22 [GD4, expects DISPATCH-INCOMPLETE-BRIEFING], GD27 [GD9 filled goldfish-task.md template expected exit 0, got DBG-GENERATED-BRIEFING-REQUIRED: "a governed Goldfish item briefing must come from the briefing generator"], GD58 and GD60 (same DBG code instead of NGHS-CANDIDATE-MISMATCH).

| Item | Finding |
|---|---|
| Class | FIXTURE (hand-filled Goldfish briefings now require the generator); GD22 probe shows only the template-shape WARNING in the first 260 chars of stderr, the blocking code itself was NOT read (probably the same DBG code) |
| Production site | The DBG code string was NOT located in `hooks/guard-dispatch.mjs` (rg found none); it is raised elsewhere in the lib. NOT REACHED. The generator script path is line 131 (`BRIEFING_GENERATOR_SCRIPT`). |
| Smallest fix | NOT REACHED. Likely test-only: build the fixture through `scripts/dispatch-briefing.mjs` (as the DBG message instructs) or change expectations; verify in the clone. |
| Confidence | Low-medium |

## 4. Group D: missing module in the guard copy fixture

Runtime ids: GD59, GD61, GD62, GD63, GD64, GD65 (and GD58/GD60 partly). Error: `Cannot find module '<repo>/scratch/guard-dispatch-copy-XXXX/scripts/dispatch-record-liveness.mjs'` (log lines 398, 436, 463, 482, 509, 528).

| Item | Finding |
|---|---|
| Class | FIXTURE |
| Cause | `guardCopyWithHooks` (test lines 906-920) builds a throwaway plugin dir holding only `hooks/guard-dispatch.mjs` (copy), a symlinked `guard-dispatch-budget.mjs` and a symlinked `lib`. The guard resolves siblings relative to its own location: line 131 names `../scripts/slice-queue.mjs`, `../scripts/dispatch-record-liveness.mjs`, `../scripts/dispatch-briefing.mjs`. The copy has no `scripts/`. |
| Smallest fix | Test-only, 1 line in `guardCopyWithHooks`: `symlinkSync(join(dirname(GUARD), "..", "scripts"), join(dir, "scripts"));` next to the existing `lib` symlink (line 915). Expected to move GD59 and GD61-GD65; GD58/GD60 may still need group C. Not applied or run. |
| Confidence | High on cause, medium on completeness |

## 5. ENVIRONMENT check

Driver mode `runenv` reruns the same file with HOME and TMPDIR set to a fresh empty directory inside the clone scratch (env passed through spawn, never printed). Result: pass 53, fail 22 again (22 failing names listed, same count as the base run; the two name lists were compared by count only, not diffed line by line). So the red set does not change under a private HOME/TMPDIR: not ENVIRONMENT. `scripts/run-parallel.mjs` header NOT read. The failures above are all explained by code and fixtures in the clone itself, and the guard under test is spawned from the clone (`GUARD` in the test), so an installed-plugin dependency is not indicated; the same 22 failures also appear for clearly clone-local reasons (missing `scripts/` symlink, carrier policy).

## 6. Patch

None delivered. Fixes need `plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, which is outside this dispatch's write scope, and none was verified green in the clone. No clone2 apply check. Clone and scratch driver left in place under scratch/agent-out/w7gd (cleanup not reached; removing the directory is safe).

## 7. Not reached

Location of the DBG code and GD22's real blocking code; scripts/run-parallel.mjs header; any fix application, GREEN run, patch, clone2 check.

## 8. Recommended slice order

1. Group D one-line scripts symlink (test-only, safest, highest yield: 6 names).
2. Group A: update the allow expectations to the pinned policy (test-only, 7 names), with written justification.
3. Group C: re-read the DBG site, then regenerate the briefing fixtures or adjust expectations (4 names).
4. Group B: decide ORDER versus fixture with the guard owner before any production edit (5 names).
