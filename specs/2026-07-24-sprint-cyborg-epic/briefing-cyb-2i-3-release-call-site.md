# Briefing — CYB-2I-3: wire the shared completeness gate into the Release call site (Wave 6)

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-3 (Sprint Cyborg epic, Wave 6, `cyb-2i-1h-body-slicing.md`
  §1 row 4). Depends on CYB-2I-0 (shared `checkSecurityCompleteness` gate,
  CLOSED — `6f37153`, Critic-reviewed zero findings).
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (confirm via `git log
  -1 --format=%H` at dispatch time). Working tree must be clean before you
  start; keep it clean; end with exactly one atomic commit.
- **Model / effort:** `goldfish-deep` / xhigh — **REAL, unresolved design
  latitude**, explicitly flagged by the Wave 6 plan (`cyb-2i-1h-body-slicing.md`
  §3 item 2): unlike CYB-2I-1 (PR)/CYB-2I-2 (Close), there is no existing
  hook-list or extension point to register into for Release. You must decide
  the concrete insertion point yourself — the Elephant has identified one
  hard architectural constraint below (purity) that rules out the most
  naive option, but the actual solution is your own design call.
- **Profile:** epic, execution phase.
- **Why this exists:** AC8 ("Push/PR/Close/Release consume the same
  completeness evaluator") — the Release call site. Confirmed
  (`cyb-2-body-slicing.md` §3 item 1): there is no single `release-gate.*`
  file; the closest concrete piece is
  `plugins/pipeline-core/scripts/release-version-plan.mjs`'s
  `createReleaseVersionPlan()` (the pre-mutation release-version decision/
  plan-sealing logic — this file's own header comment: "HAW-E's pre-mutation
  release-version decision only. It has no git, remote, tag, publication, or
  plan-sealing operation: callers supply already-fetched channel observations
  plus annotated-tag/ancestry proof.").

## Field 1 — The constraint that rules out the naive approach (read before designing)

`createReleaseVersionPlan(input, { nowMs })` is currently a **pure function**:
every fact it needs (`input.decision`, `input.privateProductCandidate`,
`input.neutralPublicProductCandidate`, `input.versionSurfaces`, etc.) is
supplied by the caller as already-fetched data; the function itself performs
**zero fs/git/network access** (confirmed by reading the full file: the only
fs-touching functions in this module are the separate storage-layer
functions `storeReleaseVersionDecision`/`storeReleaseVersionPlan`/
`recoverReleaseVersionPlan`, never `createReleaseVersionPlan` itself). Its own
test file (`release-version-plan.test.mjs`) constructs every input fully
in-memory — no real filesystem, no real git repo — and this purity is
plainly load-bearing (it's what makes the whole decision/plan-sealing logic
deterministically testable without I/O).

`checkSecurityCompleteness` (`plugins/pipeline-core/lib/
security-completeness-gate.mjs`) reads two evidence files from disk relative
to a `projectDir`. **Inserting a call to it directly inside
`createReleaseVersionPlan()` would break that function's purity** — this is
the naive approach the Elephant is explicitly ruling out, not leaving for you
to rediscover the hard way. Your task is to find the RIGHT seam: most likely
a NEW, separate function (your own name/shape) that runs the completeness
check against the plan's own bound candidate (`plan.privateProductCandidate.
commit`/`.tree` — almost certainly the PRIVATE channel only, since a
neutral-public/mirror repository has no reason to carry its own local
`evidence/security-latest.v2.json`; state your own reasoning on this
explicitly rather than silently assuming it), called by whatever ORCHESTRATES
`createReleaseVersionPlan()` + `storeReleaseVersionPlan()` together, at a
point AFTER the plan is sealed (so it can bind the completeness check to the
plan's own already-validated candidate) but BEFORE `storeReleaseVersionPlan()`
durably persists it (true "pre-mutation" gating — no release proceeds past
this point without a passing check). **Note there is currently no such
orchestrating caller/CLI in this repo at all** — `createReleaseVersionPlan`
and `storeReleaseVersionPlan` are each called only from their own test file
today. Do not invent a full release-orchestration CLI as part of this task
(far beyond AC8's scope) — instead, add the new completeness-check function
alongside `createReleaseVersionPlan` in the same module (or a clearly-named
sibling), fully unit-tested on its own, documented as "the function a future
release-orchestration caller MUST invoke between plan-sealing and
plan-storage" — this makes AC8's requirement satisfiable and testable now,
without fabricating the orchestration layer that doesn't exist yet.

## Field 2 — Context files (read first)

- `plugins/pipeline-core/scripts/release-version-plan.mjs` — full file,
  especially the header comment, `createReleaseVersionPlan` (~line 434-466),
  `validateReleaseVersionPlan` (~line 411-431), and the storage functions
  (~line 261+, 600-618) to understand exactly where "sealed but not yet
  stored" sits in the existing lifecycle.
- `plugins/pipeline-core/scripts/release-version-plan.test.mjs` — existing
  test conventions (fully in-memory fixture construction — mirror this style
  for your own new tests, do not introduce real git/fs fixtures where the
  existing file doesn't need them).
- `plugins/pipeline-core/lib/security-completeness-gate.mjs` — READ ONLY. The
  shared gate's exact signature and its own test fixtures.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2i-1h-body-slicing.md` §1 row
  CYB-2I-3 and §3 item 2 (the open design-latitude flag this briefing
  responds to); `cyb-2-body-slicing.md` §3 item 1 (Release's "no single
  release-gate.* file" finding); `cyb-2-feature-spec.md` AC8.

## Field 3 — Definition of Done (checks)

1. A new, clearly-named function exists (your naming; state and justify it)
   that invokes `checkSecurityCompleteness` against the release plan's own
   bound private-channel candidate commit/tree, with `projectDir` supplied by
   ITS caller (keep it as parameterized/pure as `checkSecurityCompleteness`
   itself — no hidden `process.cwd()` default inside this new function; the
   eventual real orchestrator decides `projectDir`).
2. `createReleaseVersionPlan()` itself is UNCHANGED and remains pure (zero
   fs/git access) — verify this explicitly (e.g. `grep` for
   `readFileSync|existsSync|spawnSync` within your diff's touched function
   bodies and confirm none appear inside `createReleaseVersionPlan` itself).
3. New unit tests for your new function, in-memory-fixture style matching
   `release-version-plan.test.mjs`'s existing conventions, covering: fresh
   bound non-blocking pass; blocking failure surfaces the shared gate's own
   failure lines; missing evidence fails closed; candidate commit/tree
   mismatch is caught (mirror `security-completeness-gate.test.mjs`'s own
   case shapes, applied through your new function).
4. All pre-existing `release-version-plan.test.mjs` cases pass unmodified —
   report the exact before/after count (this file has no known baseline gap;
   any change here is a regression on your diff).
5. `node --check` on every file you touch or add.
6. Report includes: your chosen function name/signature and the reasoning
   for the private-vs-neutral-public candidate choice, explicit confirmation
   `createReleaseVersionPlan()` stayed pure, before/after test counts, and an
   explicit note (for the Elephant's tracking, not yours to resolve) that a
   real release-orchestration CLI wiring this new function between plan-seal
   and plan-store does not exist yet in this repo.

## Field 4 — Prohibitions

- MUST NOT add any fs/git/network access inside `createReleaseVersionPlan()`
  itself (Field 1's hard constraint).
- MUST NOT build a new release-orchestration CLI/script beyond the one new
  testable function (out of scope, see Field 1's closing paragraph).
- MUST NOT edit `plugins/pipeline-core/lib/security-completeness-gate.mjs`
  or its test file (import only).
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One
  atomic commit.
- Do not weaken, skip, or platform-gate away a genuine test failure to make
  things green.

## Field 5 — Stop conditions

- You conclude the private-vs-neutral-public candidate choice in Field 1 is
  wrong for a concrete reason (e.g. you find evidence the neutral-public
  channel DOES need its own independent completeness proof) → STOP and
  report your reasoning rather than silently picking one side.
- You find `createReleaseVersionPlan()`'s purity is not actually load-bearing
  the way Field 1 claims (e.g. some caller already expects it to have
  side effects) → STOP and report the discrepancy.
- No clean insertion point can be designed without either breaking purity or
  fabricating a disproportionate amount of new orchestration scaffolding →
  STOP and report the specific tension rather than forcing a compromise
  design silently.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-6.
