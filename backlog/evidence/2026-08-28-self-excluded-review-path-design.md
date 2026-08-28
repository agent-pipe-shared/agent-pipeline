# Design — hardening-gate admission: the reviewed self-exclusion path plus three verified holes

PO decision 2026-08-28: "Suite + benannter Reviewer". Critic round nva-vtp-4a7f3210
returned F1 (blocker), F2, F3, F4; F1/F2/F4 were re-verified independently and all
live in the same code region as the PO's decision, so they are one work package.

> Relocated 2026-08-28 from `scratch/DESIGN-self-excluded-review-path.md` to this
> tracked path — Re-Critic `vtpgate2-368458af` finding F4: shipped plugin code
> cited a gitignored file as the sole design authority for a security control.
> Sections A–F are the round-1 contract, unchanged; section G carries round 2.

## A. Measured problem the PO decided on

`ai-assisted-hardening-gate.mjs` requires one independent check per changed class.
A check whose own command file is inside the candidate diff is self-excluded.
Measured against the real CI base (`2eb4466c`, the upstream branch tip that
`github.event.before` forwards) and HEAD `d350cbd4`, 1458 changed paths:

| class | command file | outcome |
|---|---|---|
| policy, workflow, evidence | — | pass |
| scope | `harness/scripts/check-doc-contracts.mjs` | self-excluded; base revision exits 2 |
| test | `plugins/pipeline-core/lib/ai-assisted-hardening.test.mjs` | self-excluded; not root-pointable |
| guard | `plugins/pipeline-core/hooks/guard-git.test.mjs` | self-excluded; not root-pointable |

`ROOT_POINTABLE_CHECK_KINDS = ["scope", "dependency"]`, so `test` and `guard` can
never be counted once their own file is touched. Narrowing the base does not help:
with base `43089b4e` the class `test` is still missing. `routeSecurityReview` does
not substitute — it is a separate check that already reports `allowed: true` once a
reviewer id is set, while `evaluateChangeIntegrity` fails independently of it.

### The rule to implement

A self-excluded check counts when EITHER path holds — never neither:

1. **base-revision path (exists, keep unchanged):** the kind is root-pointable and
   the check's BASE revision, materialised in a detached worktree and pointed at the
   candidate root with `--root`, actually exits 0.
   Code `AIH-SELF-EXCLUDED-BASE-VERIFIED`.
2. **candidate-suite + named-review path (new):** the check's own command, run at the
   CANDIDATE revision, actually exits 0, AND a named reviewer is present and differs
   from the author — the same test `routeSecurityReview` already applies (non-blank
   after trim, `!== authorId`). Code `AIH-SELF-EXCLUDED-REVIEWED`.

Neither → `AIH-SELF-EXCLUDED-MISSING`, unchanged.

Why path 2 is not self-certification: the candidate's own suite passing is mechanical
evidence, not authority. The authority is the named human who is not the author. Both
halves are required; either alone leaves the check missing. That is the entire content
of the control — it must not be softened to "suite passes" or to "reviewer configured".

### Shape

`plugins/pipeline-core/lib/ai-assisted-hardening.mjs`

```
evaluateSelfExcludedCheck({
  kind,
  baseRevisionExitCode = null,
  candidateRevisionExitCode = null,
  reviewerId = null,
  authorId = null,
})
  -> { schema, kind, rootPointable, counted, basis, code }
```

`basis` is `"base-revision"`, `"candidate-suite-and-review"`, or `null`. The
base-revision path is evaluated first, so a caller that passes only
`baseRevisionExitCode` keeps its exact present behaviour.

`plugins/pipeline-core/scripts/ai-assisted-hardening-gate.mjs`

- `verifySelfExcludedAtBase` unchanged.
- new `verifySelfExcludedAtCandidate(repoRoot, kind, file, reviewerId, authorId)`:
  runs `node <file>` with `cwd: repoRoot` — the same spawn the non-excluded branch
  already uses — and feeds its status into `evaluateSelfExcludedCheck`.
- `runIndependentChecks(repoRoot, changedPaths, base, { reviewerId, authorId } = {})`:
  for a self-excluded kind, try the base path, then the candidate path. The fourth
  parameter is an options object with defaults so no existing caller breaks silently.

`plugins/pipeline-core/scripts/verify-topology-preflight.mjs`

- hoist the already-computed `authorId` / `reviewerId` above the `runIndependentChecks`
  call and pass them through.

## B. F1 (blocker, reproduced) — an unresolvable base silently empties the diff

`defaultGit` (`verify-topology-preflight.mjs:37-48`) returns `{status, stdout}`, but the
`changedPaths` call site reads `.stdout` and discards `.status`. Reproduced live:

```
$ git diff --name-only --diff-filter=ACMR 000...0 d350cbd4
fatal: bad object 000...0            (exit 128, stdout empty)

$ PIPELINE_CANDIDATE_BASE=000...0 node .../verify-topology-preflight.mjs
{"status":"ready","code":"VTP-READY", ... "changedPaths":[],
 "integrity":{"changed":[],"missing":[],"allowed":true},
 "review":{"required":false,"allowed":true}}          exit 0
```

GitHub sets `github.event.before` to the all-zeros SHA on the first push of a new
branch, and `.github/workflows/verify.yml:40-42` and `:70-72` forward it verbatim.
The all-zeros string is non-empty, so `resolveDeliveryBase`'s blank check passes it
through and the committed fallback is never reached. The candidate side IS validated
(`rev-parse --verify …^{commit}`); the base side is not validated at all.

**Fix (three fail-closed checks, all in `runVerifyTopologyCli`):**

- the resolved delivery base must satisfy `rev-parse --verify <base>^{commit}`
  → else `VTP-BASE-UNRESOLVABLE`;
- the `git diff` that produces `changedPaths` must exit 0
  → else `VTP-DIFF-UNRESOLVABLE`;
- an empty changed-path set is a failure, not an admission
  → `VTP-CANDIDATE-DIFF-EMPTY`.

The third is the one that actually closes the class: any future way of producing an
empty path set stops being a pass.

## C. F2 (major, code-read) — the env base outranks the committed baseline

`resolveDeliveryBase` ranks `PIPELINE_CANDIDATE_BASE` above
`inventory.sourceBaseline.commit`, so the measured window is chosen by whoever sets
an environment variable, and nothing in the result records which window was used.

**Fix, and its honest limit.** Do NOT reorder the tiers: the CI event base IS the
correct window, and demoting it would make the gate measure the wrong range on every
real run. Instead:

- require the resolved base to be a strict ancestor of the candidate —
  `merge-base --is-ancestor <base> <candidate>` exits 0 AND `base !== candidate`
  → else `VTP-BASE-NOT-ANCESTOR`;
- record the resolved base in the result as
  `deliveryBase: { commit, source: "explicit" | "ci-event" | "source-baseline" }`.

Stated plainly in the code comment: this does not make the window tamper-proof. A
caller who can set the variable can still narrow the window to a valid ancestor. What
it removes is the silent case — an invalid, unrelated, or empty window now fails, and
a narrowed one is visible in the artifact instead of invisible. Anything stronger
(signing the base, or binding it to the push event) is a separate work package.

## D. F4 (major, reproduced and wider than reported) — the deciding code is not "sensitive"

`routeSecurityReview`'s sensitive-path pattern covers the two gate SCRIPTS but not the
LIBRARY that holds every hardening decision, and not the verify gate itself. Probed:

| path | `required` |
|---|---|
| `plugins/pipeline-core/lib/ai-assisted-hardening.mjs` | **false** |
| `harness/scripts/verify.mjs` | **false** |
| `plugins/pipeline-core/scripts/ai-assisted-hardening-gate.mjs` | true |
| `plugins/pipeline-core/scripts/verify-topology-preflight.mjs` | true |
| `plugins/pipeline-core/lib/ai-assisted-hardening.test.mjs` | true |

So a change that touches only the deciding library — for example reverting the
blank-reviewer fix — needs no independent reviewer at all. The verify-gate script is
the same hole.

**Fix:** both paths become sensitive. Prefer an explicit named constant of
sensitive path prefixes over growing the inline alternation further, so the next
addition is a list entry rather than a regex edit. Each of the two paths gets its own
pinning test case.

## E. F3 — recorded, not fixable here

Commit `996f7c20` changed `harness/scripts/verify.mjs` from the orchestrator session
with `AI-Assisted: true` + `Commit-Act: orchestrator` and no `Dispatch:` trailer. The
write itself was authorised (PO-signed TP-3 human-guard override, audit evidence in
`evidence/hgo-audit-2026-08-28.json`), but the trailer form
`Dispatch: stage-0 (elephant)` was not used and history is not rewritten in this repo.
Recorded as a fact; the forward consequence is that this work package is dispatched.

## F. Definition of done

- `node --test plugins/pipeline-core/lib/ai-assisted-hardening.test.mjs` green, with
  new cases for: base path still counted; candidate suite exit 0 + named reviewer →
  counted; candidate suite exit 0 + blank/whitespace reviewer → missing; candidate
  suite exit 0 + reviewer === author → missing; candidate suite non-zero + named
  reviewer → missing; a non-root-pointable kind counted through the candidate path;
  and F4's two paths each reported sensitive.
- `node plugins/pipeline-core/scripts/verify-topology-preflight.test.mjs` green, with
  new cases for `VTP-BASE-UNRESOLVABLE`, `VTP-DIFF-UNRESOLVABLE`,
  `VTP-CANDIDATE-DIFF-EMPTY`, `VTP-BASE-NOT-ANCESTOR`.
- `node harness/scripts/verify.mjs` exit 0.
- `node harness/scripts/check-doc-contracts.mjs` exit 0.
- Measured, not asserted, and written to `evidence/`:
  - `PIPELINE_CANDIDATE_BASE=0000000000000000000000000000000000000000` now exits 2,
    not 0 (the F1 repro, inverted);
  - the gate for base `2eb4466c` / head HEAD with a named reviewer reports
    `integrity.missing: []`;
  - the same run with a blank reviewer still reports `["scope","test","guard"]`.

## G. Round 2 — the reviewer identity is settable by the party it constrains

Re-Critic `vtpgate2-368458af` returned FAIL with four major findings. F1 is a control
defect in section A's own rule: it is satisfiable by the author it exists to
constrain. `reviewerId` is an unauthenticated string, and after round 1 the SAME
string clears two controls that previously required separate evidence —
`routeSecurityReview` (pre-existing) and the new self-exclusion path (section A,
rule 2). The measured hole is one line:

`plugins/pipeline-core/scripts/ai-assisted-hardening-gate.mjs:169`

```
const reviewerId = argument("--reviewer-id", process.env.PIPELINE_SECURITY_REVIEWER_ID ?? null);
```

`argument()` gives the CLI flag precedence over the environment variable, so
`--reviewer-id someone-else` overrides the admin-controlled repository variable
outright. `verify-topology-preflight.mjs:270` reads the environment only and is
already free of this.

### PO decision 2026-08-28 — "harden the source of the reviewer ID"

The self-exclusion path accepts the reviewer identity ONLY from the GitHub
repository variable, NEVER from `--reviewer-id`. The value used and the source it
came from are recorded in the result. Locally the gate remains advisory. The
midday decision (section A) stands unchanged.

### The rule to implement

Reviewer identity is resolved once, into a value AND a source:

- `PIPELINE_SECURITY_REVIEWER_ID` non-blank after trim → source
  `"repository-variable"`;
- otherwise `--reviewer-id` non-blank after trim → source `"cli-argument"`;
- otherwise no identity → source `null`.

The environment now outranks the flag — the reverse of today's precedence — so a
flag can never mask the admin-controlled value.

**Only `"repository-variable"` counts for the self-exclusion path.** A
`"cli-argument"` identity never satisfies section A rule 2, in CI or locally. This
is deliberately stricter than "restrict it in CI": a CI-detection branch would
itself rest on a spoofable environment variable, and defending one spoofable signal
with a second spoofable signal is not a control.

`routeSecurityReview` keeps its present behaviour unchanged — it is pre-existing,
this delivery did not widen it, and the PO decision names the self-exclusion path.
What changes for it is visibility: the source is recorded alongside the id, so an
auditor can see which string cleared which control.

### The honest limit, written into the code as well

Locally, nothing distinguishes the repository variable from an author-exported
environment variable of the same name. The control is real only in CI, where the
value is injected by GitHub from `vars.*` and the workflow that injects it is itself
a `workflow`-class protected path. This is the same shape as section C's limit and
must be stated, not implied. Anything stronger — binding the identity to an
authenticated review event — is a separate work package.

The identity is a non-secret repository VARIABLE and must stay one: it names a
reviewer, it does not authenticate one. Moving it to `secrets.*` would make the
artifact unauditable without adding any authentication.

### Shape

`plugins/pipeline-core/lib/ai-assisted-hardening.mjs`

```
resolveReviewerIdentity({ environmentReviewerId = null, cliReviewerId = null })
  -> { schema, id, source }

evaluateSelfExcludedCheck({ ..., reviewerSource = null })
```

`evaluateSelfExcludedCheck` requires `reviewerSource === "repository-variable"` for
the candidate-suite path. The default is `null`, so the function fails CLOSED for
any caller not yet updated. When the suite passed and the reviewer is named and
distinct but the source is untrusted, the result carries its own code
`AIH-SELF-EXCLUDED-REVIEWER-UNTRUSTED-SOURCE` — never the generic
`AIH-SELF-EXCLUDED-MISSING`. Two different refusals that render identically are
exactly the diagnosis trap this repository has already paid for once (CLAUDE.md,
the `guard-testpath` two-cause note); do not reproduce it here.

`plugins/pipeline-core/scripts/ai-assisted-hardening-gate.mjs`

- `main()` resolves the identity once via `resolveReviewerIdentity` and threads
  `{ reviewerId, reviewerSource }` into `runIndependentChecks`;
- the emitted result gains `reviewerIdentity: { id, source }`.

`plugins/pipeline-core/scripts/verify-topology-preflight.mjs`

- the same resolution with `cliReviewerId` absent — there is no such flag here;
- `runVerifyTopologyCli` spreads `reviewerIdentity` into its result the same way it
  already spreads `deliveryBase`.

### F3 — the branch coverage both rounds owe

The Re-Critic's F3 is separate and applies to round 1 as well as round 2: no test
names `runIndependentChecks`, `verifySelfExcludedAtCandidate`, or
`runVerifyTopologyCli`, so the wiring that decides whether the new path is reached
at all is unverified. Every branch this work package introduced or changed needs a
test that FAILS when that branch is reverted. Pure functions are tested directly;
the two spawn-based functions need a real temporary git-repository fixture, and
`runVerifyTopologyCli` needs whatever minimal seam makes it reachable without one.
Choosing that seam is in scope; widening the CLI's public surface to get it is not.

### Definition of done, round 2

- `resolveReviewerIdentity`: environment outranks flag; flag-only yields
  `"cli-argument"`; blank/whitespace environment falls through to the flag; neither
  yields `{ id: null, source: null }`.
- `evaluateSelfExcludedCheck`: `"repository-variable"` + suite exit 0 + named
  distinct reviewer counts; `"cli-argument"` with everything else identical does NOT
  count and reports the untrusted-source code; omitting `reviewerSource` entirely
  does NOT count.
- `runIndependentChecks` and `verifySelfExcludedAtCandidate` covered against a real
  fixture repository, including the self-excluded branch resolving both ways.
- `runVerifyTopologyCli` covered for the reviewer-identity resolution and for its
  recording in the emitted result.
- Both citations of this document updated to this tracked path, and
  `node harness/scripts/check-consumer-safe-paths.mjs` exit 0 with NO new allowlist
  entry — measured: `SOURCE_ONLY_PREFIXES` is
  `["harness/", "specs/sprint-nova-epic/", "setup.mjs"]`, so `backlog/` cites
  cleanly from shipped plugin code and `specs/sprint-nova-epic/evidence/` would
  not. That measurement is why this path was chosen.
- `node harness/scripts/verify.mjs` exit 0.
