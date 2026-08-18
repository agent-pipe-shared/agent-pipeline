---
schema: pipeline.backlog-item.v1
id: pipeline.push-gate-reads-evidence-from-a-location-the-prescribed-verify-run-never-writes-to
type: defect
owner: pipeline
status: closed
created: 2026-08-09
source: "First end-to-end signed push of this repository (8dcb1cc..3387065, sprint_phoenix), confirmed at source in harness/scripts/verify.mjs and plugins/pipeline-core/hooks/guard-push.mjs under dispatch PHX-BL4 (2026-08-09)."
due: 2026-09-08
---

# The push gate reads evidence from a location the prescribed run never writes to

## Description

`harness/scripts/verify.mjs` cannot run from the main checkout of this
repository — three tracked operator files are permanently modified, so the
candidate preflight refuses before any suite starts. The prescribed route is
therefore the detached worktree at `.git/phx-verify`. A run made there
writes its evidence artifacts INTO that worktree, because `verify.mjs`
resolves its own repo root from its own file location
(`import.meta.url`-derived `scriptDir`), not from the invoking shell's cwd.
`guard-push.mjs`, however, resolves the evidence-reading directory by asking
git which WORKTREE has the pushed branch attached — and the detached
worktree is, by construction, on no branch, so that resolution lands back on
the main checkout, which the branch is actually attached to. The gate never
looks in the one place the prescribed run wrote to.

Today this produced four stale-evidence findings (`verify-latest.json` plus
the three `security-latest*` files) and an `exitCode=1` left over from an
aborted preflight attempt on the main checkout, while a genuinely green run
for the exact pushed commit and tree sat unread in the worktree. It was
resolved by copying the four files from the worktree to the project root —
same commit, same tree, content unchanged, and `evidence/` is git-ignored
run output per QG-03, so the copy did not touch a tracked file. That copy is
a workaround, not a fix.

## Triggering situation

Verified at source, quoted directly.

`verify.mjs` derives its repo root and evidence path from its own module
location, not from cwd (`harness/scripts/verify.mjs:61-92`):

```
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
...
const evidenceDir = join(repoRoot, "evidence");
const evidencePath = join(evidenceDir, "verify-latest.json");
```

Run from `.git/phx-verify` (the prescribed worktree), `import.meta.url`
resolves inside that worktree's own checked-out copy of the file, so
`repoRoot` is the worktree root and evidence lands at
`<worktree>/evidence/verify-latest.json` — never at the project root's
`evidence/`.

`guard-push.mjs` resolves the evidence-reading directory by attached-branch
worktree lookup (`plugins/pipeline-core/hooks/guard-push.mjs:1422-1465`,
`resolveEvidenceProject`): it asks `git worktree list --porcelain` for the
worktree whose `branch` line matches the pushed source ref, and falls back
to the command-invocation project otherwise. The detached verify worktree
carries no `branch` line — `.git/phx-verify` is intentionally checked out
detached, per project convention — so this lookup finds only the primary
worktree (the main checkout), which is where the pushed branch actually
lives, and reads

```
evidence/verify-latest.json
evidence/security-latest.json
evidence/security-latest.v2.json
evidence/security-latest.v2.verdict.json
```

(`guard-push.mjs:1578, 1546, 1591-1593`) relative to that resolved
`evidenceProjectDir` — i.e. the project root, not the detached worktree.

## Affected artifact

`harness/scripts/verify.mjs` (evidence write location, derived from module
path); `plugins/pipeline-core/hooks/guard-push.mjs` — `resolveEvidenceProject`
(evidence read location, derived from attached-branch worktree lookup).

## Proposal

Two directions, deliberately not chosen between here:

1. **Narrower — make the gate resolve evidence from the worktree actually
   used for the run.** The gate would need some signal of which worktree
   produced the evidence for a given commit (e.g. trust the evidence
   payload's own recorded location, or extend the detached-worktree
   discovery `resolveEvidenceProject` already does for attached branches to
   also recognize the canonical detached verify worktree by path
   convention).
2. **Wider — make the runner write to the project root regardless of where
   it executes from.** `verify.mjs` would resolve `repoRoot` from the actual
   git common-dir / primary worktree root (as `gitCommonDirectory()` in the
   same file already does for a related purpose) rather than from its own
   module path, so a run from any worktree lands its evidence where the gate
   already looks.

Of the two, (2) looks narrower: it changes one function in one file
(`verify.mjs`'s root resolution) and requires no new discovery logic in the
gate, whereas (1) requires the gate to either trust an unverified
self-reported location or hard-code the specific worktree-path convention
this repository happens to use today. This item does not choose for the
maintainer — the tradeoff (a shared write location vs. gate-side discovery)
is worth a deliberate call, not a default.

## Triage — reviewed 2026-08-18

- **Decision:** Still open; confirmed live exactly as described, unresolved in both Phoenix and Nova.
- **Rationale:** `verify.mjs` still writes evidence relative to its own module path rather than the git common directory; `guard-push.mjs`'s `resolveEvidenceProject` still resolves the evidence-reading directory via attached-branch worktree lookup, which never matches the detached `.git/phx-verify` convention. The item's own Proposal explicitly declines to choose between the two named directions (gate-side discovery of the detached worktree vs. making the runner always write to the project root) and frames the tradeoff as "worth a deliberate call, not a default" — this remains a PO design decision, not a mechanical fix to dispatch blind.
- **Assignment (if accepted):** Unassigned — needs the PO's choice of direction (1) or (2) before dispatch.
- **Date:** 2026-08-18

### PO Decision — 2026-08-18

- **Decision:** Direction 2 — make `verify.mjs` resolve `repoRoot` from the git common-dir / primary worktree root (as `gitCommonDirectory()` already does elsewhere in the same file), not from its own module path. No new discovery logic in `guard-push.mjs`.
- **Rationale:** Elephant recommendation, adopted: this is the narrower change (one function, one file) versus teaching the gate to trust a self-reported location or hard-code the `.git/phx-verify` path convention.
- **Assignment:** Dispatch-ready — brief a Goldfish to change `verify.mjs`'s root resolution and add a regression test proving a run from the detached worktree still writes evidence to the project root.
- **Date:** 2026-08-18

### Triage — 2026-08-18 (sharper finding, still open)

- **Decision:** still open — the PO's Direction 2 decision above needs refinement before dispatch, not reversal.
- **Rationale:** A goldfish-deep dispatch (PHX-WP-EVIDENCE-ROOT-FIX) attempted this and stopped cleanly before implementing: `verify.mjs`'s `candidateIdentity()` (lines 71-83) uses the SAME `repoRoot` variable, via `cwd: repoRoot`, for its dirty-check that feeds the candidate-preflight gate. If `repoRoot` is redirected wholesale to the primary worktree root as briefed, `candidateIdentity()`'s dirty-check would then always inspect the PRIMARY worktree's status regardless of which worktree invoked `verify.mjs` — and the primary worktree carries permanently-uncommitted tracked operator/state files by this repo's own convention. Every future run from the prescribed clean route (`.git/phx-verify`) would then immediately hit `VERIFY-CANDIDATE-PREFLIGHT` and never again produce a genuine passing evidence result — permanently destroying the exact reason the detached worktree exists, a materially worse outcome than the bug being fixed. The PO's stated success criterion for Direction 2 would technically still hold in this broken state, so it would not have caught the regression.
- **Refined options:** (a) confirm the full-`repoRoot` redirect is intended and separately re-architect `candidateIdentity()`'s dirty-check to tolerate the primary's permanent-dirty state when invoked from a worktree other than the one whose status is being checked; or (b) narrow the fix so only `evidenceDir`/`evidencePath` and `gitCommonDirectory()`'s bootstrap move to the primary root, while `candidateIdentity()` and any other `repoRoot` consumer stay on the invoking worktree.
- **Assignment:** needs a PO choice between (a) and (b) before re-dispatch.
- **Date:** 2026-08-18

### PO Decision — 2026-08-18

- **Decision:** Of the two refined options in the sharper finding above: Option B — narrow the fix so only `evidenceDir`/`evidencePath` and `gitCommonDirectory()`'s bootstrap move to the primary worktree root; `candidateIdentity()` and every other `repoRoot` consumer stay on the invoking worktree.
- **Rationale:** PO's direct choice, matching the Elephant's recommendation — closes the original evidence-location bug without breaking the `.git/phx-verify` clean-candidate route.
- **Assignment:** Dispatch-ready.
- **Date:** 2026-08-18

## Triage — closed 2026-08-19

- **Decision:** closed — resolved.
- **Rationale:** `harness/scripts/verify.mjs` (commit `0136b29f`) redirects `evidenceDir`/`evidencePath` via a new `primaryRoot = dirname(gitCommonDirectory())`, matching PO Decision Option B's narrow scope exactly — `repoRoot`/`candidateIdentity()`/other consumers untouched. Regression-tested (`verify-evidence-root.test.mjs`, later hardened by commit `355aca58` to also resolve correctly when invoked from a non-primary worktree).
- **Date:** 2026-08-19
