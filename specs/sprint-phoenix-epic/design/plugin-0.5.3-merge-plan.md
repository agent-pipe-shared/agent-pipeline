# Merge plan — plugin candidate 0.5.3 into `sprint_phoenix`

**Status:** planning artifact, no merge performed. Written 2026-08-07 by the
Elephant while the merge itself is on hold per PO instruction (wait for the
push to `main` rather than syncing from the actively-edited local snapshot).

**Purpose.** Establish, before any file is touched, which files a merge may take
wholesale and which must be reconciled by hand. This is the artifact that makes
the difference between a sync and an accident: the previous snapshot merge
(`cca5ad8`) was done file-by-file for exactly this reason, and one concrete
regression is already proven to be waiting (§3).

## 1. What is being merged

- **Target:** `sprint_phoenix`, plugin tree at version `0.5.2`.
- **Candidate observed:** `0.5.3+claude.20260807181921.f667dec`, installed as a
  flat copy with no `.git`. Build commit `f667dec` does not exist in this
  repository, so provenance is the version string alone.
- **Intended real source:** the sibling work pushed to `main`. The flat copy was
  used only to establish scope; the merge itself waits for `main` so there is a
  real ancestor, real SHAs, and the ADRs the code depends on.
- **Substance of 0.5.3:** ADR-0059. `lib/guard-maintenance-window.mjs` is
  byte-identical between the trees — GMW itself did not change.

## 2. Method: union, never replace

Three-way reasoning against the merge base
`6e2c9b2868d164ff3b631ab068fa5df20939e07d` (`git merge-base sprint_phoenix
origin/main`). A file is **safe to take** only when this branch has not touched
it since that base; when both sides changed it, the merge is a manual union.

`git diff --name-only <base>..sprint_phoenix -- plugins/pipeline-core` lists
110 files this branch owns changes in. Intersecting that with the files the
candidate differs on yields the conflict set below.

## 3. The proven regression — why "take the candidate's file" is unsafe

`plugins/pipeline-core/hooks/guard-gate-strength.mjs` is in **both** sets. The
candidate's `GATE_STRENGTH_PATHS` has **no GS-8 entry**, and `rg -n
"GS-8|public-core-origin-allowlist"` over the entire candidate tree returns
nothing at all. GS-8 protects
`plugins/pipeline-core/lib/public-core-origin-allowlist.mjs`, the two reviewed
Public-Core origins the bootstrap readiness gate compares against; it is this
branch's own Part A work and the sibling tree never had it.

Taking that file wholesale would therefore delete the protection Part A exists
to provide — and **no test would fail**, because the candidate's
`guard-gate-strength.test.mjs` carries no GS-8 case either. The regression would
be silent and green.

This is not a hypothetical caution. It is one confirmed instance in a set of
sixteen files where both sides changed, and it is the reason every one of them
needs reading rather than copying.

## 4. Conflict set — both sides changed, manual union required

| File | Why this branch owns changes here |
| --- | --- |
| `hooks/guard-gate-strength.mjs` | GS-8 (Part A) — see §3; candidate adds ADR-0059 HGO routing for GS-1..GS-5/GS-7 |
| `hooks/guard-push.mjs` | WP5/PHX-2 external push-authority ledger |
| `hooks/guard-testpath.mjs` | branch-side changes; candidate adds ADR-0059 signature-mode consumption |
| `lib/feature-package-topology.mjs` (+ test) | branch-side newer version |
| `lib/po-gate-authority.mjs` (+ test) | branch-side newer version |
| `lib/public-core-observation.mjs` (+ test) | Part A origin/content attestation observers |
| `lib/runner-profiles-v3.mjs` (+ test) | branch-side newer version |
| `lib/worktree-lifecycle.mjs` (+ test) | branch-side newer version |
| `scripts/bootstrap-payload-measure.test.mjs` | branch-side newer version |
| `scripts/pipeline-start-preflight.mjs` (+ test) | Part A attestation gate and its cases |
| `scripts/pipeline-state.mjs` | WP5 ledger integration |
| `scripts/pipeline-user-v3.schema.json` | `push_external_ledger` registration (PHX-2) |
| `skills/critic-review/SKILL.md` | branch-side newer version |
| `skills/pipeline-start/SKILL.md` | branch-side newer version (payload budget) |
| `skills/pipeline-start/references/onboarding-recovery.md` | branch-side newer version |

## 5. Safe-to-take set — candidate differs, this branch never touched them

`hooks/codex-pretool-guard.mjs` (+ test), `hooks/guard-lifecycle-ready.mjs`
(+ test), `hooks/guard-testpath.test.mjs`, `hooks/guard-testpath-override.test.mjs`,
`hooks/guard-gate-strength.test.mjs`, `lib/human-guard-override.mjs` (+ test),
`lib/project-onboarding-v3.mjs` (+ test),
`lib/threat-model-approval-request.test.mjs`, `scripts/guard-human-override.mjs`,
`scripts/local-worker-supervisor.test.mjs`, `scripts/po-human-approval.mjs`,
`scripts/reconcile-backlog-ledger.mjs` (+ test),
`scripts/release-preflight-cli.mjs` (+ test).

Two files exist **only** in the candidate and are pure additions:
`scripts/guard-human-override.test.mjs`, `scripts/po-human-approval.test.mjs`.

**Caveat on `guard-gate-strength.test.mjs`:** it is safe to take in the
mechanical sense (this branch never edited it), but taking it does not restore
GS-8 coverage, which neither side has. The GS-8 test case is a gap this merge
should close rather than inherit — see §7.

## 6. Never take from the candidate

Everything under "only in this branch" in the tree comparison is Phoenix's own
governance, ledger, audit and evidence work (`governance-*`, `audit-bundle`,
`external-push-ledger`, `human-governance-*`, `organization-policy`,
`authority-revision-proof`, `phoenix-authority-*`, `public-core-origin-allowlist`,
`ruleset-source`, `agent-decision-journal`, `change-control`, `evidence-view*`,
`external-*`, the `schemas/` and `assets/` directories, and the GMW sibling test
files this branch added). Absence from the candidate is not a deletion signal.

## 7. Open items this merge must not silently inherit

1. **GS-8 has no test on either side.** The merge is the natural point to add
   one; without it the regression in §3 stays undetectable by the suite.
2. **The GMW module cites three documents absent from this checkout** —
   `docs/adr/0058-guard-maintenance-window.md`,
   `docs/guard-maintenance-window-threat-model.md`, and the sibling design
   document (`lib/guard-maintenance-window.mjs:10-13`). The previous snapshot
   merge took guard-kernel code without its governing decision records. Merging
   from `main` should bring them; if it does not, that is a finding, not an
   acceptable carry-over.
3. **ADR-0059 itself is absent here** (`rg -c "ADR-0059"` over `plugins/` and
   `docs/` returns nothing). The same rule applies: the decision record arrives
   with the code or the merge is incomplete.
4. **TP-protected suites are inside the conflict set**, so the merge will hit
   the guard that ADR-0059 exists to make liftable. Sequence matters: the
   ADR-0059 code has to be installed and its signed-override path available
   before the test-file reconciliation can be performed through a sanctioned
   route rather than a workaround.

## 8. Verification required after the merge

Full `verify` (all suites registered per `harness/scripts/verify.mjs`),
`node harness/scripts/check-doc-contracts.mjs`,
`node harness/scripts/check-observation-governance.mjs`, and an independent
Critic review of the merge diff — architecture/guardrail class, so the
higher-capability review model at max, per CLAUDE.md's self-application rule.

## 8a. MEASURED against the real source — §4/§5 are superseded (2026-08-07)

The 0.5.3 work turned out to have real git history after all: it sits on
`origin/feat/sprint-nova-codex-v046`, whose head `378cb64` carries exactly the
installed version `0.5.3+claude.20260807221336.14e7b97`, and whose build commit
`14e7b97` is in that branch's own history. That removes the provenance objection
this plan was built around — there is a real ancestor, real SHAs, and a real
three-way merge. `git merge-base sprint_phoenix origin/feat/sprint-nova-codex-v046`
is `6e2c9b2`, the same base as `origin/main`.

**The estimate in §4 was far too pessimistic, and the reason is instructive.**
It was computed against the flat copy, which is a snapshot taken at a different
moment; files where *this* branch was simply newer showed up as differences and
were counted as conflicts. Against the real branch:

- The nova side changes **29** plugin files, not the whole tree.
- Intersected with the 110 this branch owns, the candidate conflict set is
  **5** files, not 16: `hooks/guard-gate-strength.mjs`, `hooks/guard-testpath.mjs`,
  `lib/guard-maintenance-window.mjs` (+ its test), `scripts/guard-maintenance-window.mjs`.
- `git merge-tree --write-tree` resolves nearly all of it. **Real conflicts: 7
  files, and exactly ONE of them is in the plugin tree —
  `plugins/pipeline-core/hooks/guard-gate-strength.mjs`.** `guard-testpath.mjs`
  and `harness/scripts/verify.mjs` both auto-merge cleanly.

The remaining six conflicts are bookkeeping rather than code: `backlog/STATUS.md`,
`backlog/index.json`, `backlog/transitions.ndjson`, `docs/state.md`,
`governance/observation-doc-governance.json`, `project/pipeline-state.json` —
all files both sides append to independently.

**§3's warning is confirmed, not weakened.** The single code conflict is the GS-8
file, which is precisely the silent-regression case: the nova side has no GS-8
entry and no GS-8 test, so resolving that one conflict by taking either side
wholesale loses something. It is the only file in the merge that requires a
genuine union, and it is the file the plan predicted.

**What this changes for execution:** the merge is materially smaller and better
understood than §4 suggested. What it does *not* change is the sequencing
recorded in `docs/state.md` — the merge still lands before R3's B3 sweep — or the
open items in §7, in particular that ADR-0058, ADR-0059 and the GMW threat model
must arrive with the code rather than be inherited as gaps.

**Still a PO decision:** the standing instruction was to wait for the push to
`main`. `origin/main` is unchanged as of this measurement. Merging from a feature
branch that has not landed on `main` means merging content that may still change
before it does. That trade is the PO's to make, not this plan's.

## 8b. MEASURED against `origin/main` — the hold is lifted (2026-08-07)

The PO lifted the wait-for-`main` hold ("nicht dringend"; a 0.5.4 is expected
later). `origin/main` has moved from `6e2c9b2` to `2740041` and now carries tag
`v0.5.3`. The merge base is unchanged: `6e2c9b2`.

**Measured with `git merge-tree --write-tree sprint_phoenix origin/main`, and it
matches §8a exactly:**

- **7 conflicts. Exactly ONE is in the plugin tree:**
  `plugins/pipeline-core/hooks/guard-gate-strength.mjs`.
- The other six are append-only bookkeeping both sides write independently:
  `backlog/STATUS.md`, `backlog/index.json`, `backlog/transitions.ndjson`,
  `docs/state.md`, `governance/observation-doc-governance.json`,
  `project/pipeline-state.json`.
- `harness/scripts/verify.mjs`, `plugins/pipeline-core/hooks/guard-testpath.mjs`
  and `.gitleaksignore` all auto-merge cleanly.
- The plugin delta on `main` is **29 files, +4434/−176**.

**§3's warning is confirmed against the real source.** `origin/main`'s
`guard-gate-strength.mjs` carries `GS-1..GS-5, GS-7` and the `GS-6`
live-plugin rule — and **no GS-8 entry**. Taking either side of that one conflict
wholesale loses something: main's side drops GS-8, this branch's side drops the
ADR-0059 HGO routing that every other rule now depends on. It is the only file in
the merge that needs a genuine union, and it is the file this plan predicted
before the measurement existed.

**§7's open items 2 and 3 are resolved by merging from `main`, not inherited:**
`docs/adr/0058-guard-maintenance-window.md`,
`docs/adr/0059-signed-human-guard-override.md` and
`docs/guard-maintenance-window-threat-model.md` are all present on `origin/main`.
The decision records arrive with the code, which is what §7 required.

**§7 open item 1 (GS-8 has no test on either side) stands unchanged** and is now
the merge's single most important carry-forward: the conflict resolution has to
add the GS-8 case, or the union is green and silently unprotected.

**Sequencing note.** Executing the merge rewrites `docs/state.md` and touches the
guardrails and operating-model tree. It must not run while a Critic dispatch is
reading those files, or the review's own source reads drift under it.

## 8c. The one-approval question, answered from the merged source

The standing rule that one human release must carry a whole chain raised a
question this plan recorded as unverified: **can a single signed authorization
cover a multi-path chain?** Read from `origin/main`, the answer is precise and it
is not one mechanism but two, with different shapes.

**HGO (ADR-0059) cannot.** A capability is bound to one byte-exact tool input and
is single-use:
`consumeHumanGuardOverride()` requires `capability.toolName === toolName` **and**
`capability.toolInputSha256 === toolInputSha256` and identical denial digests
before it will admit anything, then rewrites the record to `status: "consumed"`.
The guard's own denial text says the same thing in words — "one exact, audited
edit". One signature therefore equals one tool call, once. A chain of three acts
is three requests, three signatures, three consumptions.

**GMW (ADR-0058) can, but only over part of the surface.**
`guard-maintenance-window.mjs prepare --scope <comma-separated rule ids>
--ttl-seconds <n>` is signed once and installed once, and then stands open as a
time-boxed window covering a **set** of rules until it expires or is closed. That
is exactly the shape the one-approval rule asks for. Its admissible scope,
however, is closed and narrow: `LIFTABLE_RULE_IDS` is `["GS-6"]` plus any rule id
beginning `TP-`, enforced at request build, at install, and again on read. Paths
in `NEVER_LIFTABLE_KERNEL_PATHS` are refused first and unconditionally, even under
an active, correctly-scoped, unexpired window that claims to cover them.

**What that means concretely for residual R1's three acts:**

| Act | Rule | Can it join one window? |
| --- | --- | --- |
| Implementation dispatch | none | yes — ordinary work |
| `harness/scripts/verify.mjs` suite registration | TP-3 | **yes** — `TP-*` is liftable |
| protected-test-path row in `project/guard-config.json` | GS-4 | **no** — GS-4 is not in GMW's scope set, and its HGO route is one exact edit |

So R1 goes from three human touches to **two**, not to one, under the mechanisms
that exist today. Whether it can reach one is a design question with a concrete
shape rather than an open unknown: either the GS-4 row is not needed in the same
release, or the chain needs a carrier that does not exist yet. That is input the
mechanism work needs, and it is a measurement, not a preference.

## 9. Honest limits of this plan

The classification in §4 and §5 was computed against the **flat local copy**,
not against `main`. The conflict *set* is expected to be close but is not
guaranteed identical: `main` may carry further sibling commits the snapshot
predates. Recompute §4/§5 against `main` before executing, using the same
merge-base intersection method — the method transfers, the specific file list
must be re-derived.
