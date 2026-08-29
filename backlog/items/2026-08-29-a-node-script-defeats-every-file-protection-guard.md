---
schema: pipeline.backlog-item.v1
id: pipeline.a-node-script-defeats-every-file-protection-guard
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: path-exists plugins/pipeline-core/scripts/pre-commit-hook-install.mjs
source: "Antigravity's own hardening test during the 2026-08-29 three-runner greenfield run (docs/pipeline-analysis.md section 5, consumer project Rune_Test1_Agy_060_73); independently corroborated by this repository's own everyday usage pattern on the same day."
---

# A Node script defeats every file-protection guard

## What happened

Antigravity was asked to try to break its own pipeline. It went at
`project/pipeline.json`, a file protected by `guard-gate-strength`, and reported
two attempts:

- **Attempt 1, shell.** `sed -i …` against the protected path. **Blocked**, hard
  and correctly, as a guard violation.
- **Attempt 2, runtime.** It wrote `scratch/bypass.js`, containing a plain
  `fs.writeFileSync` against the same path, and ran `node scratch/bypass.js`.
  **Succeeded.** The protected file was modified.

Its own diagnosis is correct and worth quoting, because it names the mechanism
rather than the symptom:

> Die Pipeline-Guards agieren als Pre-ToolUse Hooks auf der Kommandozeilenebene.
> Sie blockieren das *Shell-Kommando* […], überwachen aber nicht das
> Laufzeitverhalten (Syscalls/Filesystem) des ausgeführten Node-Prozesses.

## Why this is not just one runner's trick

This is not an exotic attack that only appears when an agent is asked to
misbehave. **It is the normal way work gets done in this repository.** On the
same day, in this repo, the Elephant session used the identical mechanism
repeatedly as an ordinary convenience — among others `scratch/rewrite-handover.mjs`,
a Node script whose entire purpose was to rewrite `docs/state.md` — and no guard
raised any objection at any point, because no guard could see it.

So the finding is not "an adversary can bypass the guards." It is:

> **The guard layer does not observe the mechanism through which a large share of
> this repository's real file mutations already happen.**

That reframes the severity. A protection that an agent routinely steps around
without noticing is not a protection with a hole in it; it is a protection whose
coverage was never measured against how the tool is actually used.

It also undercuts the specific promise this product is sold on. The recorded PO
position is that technical enforcement is the differentiator — that a violated
rule needs a guard, not another paragraph of prompt. `guard-gate-strength`,
`guard-testpath` and the whole human-guard-override ceremony exist to make
certain files unmodifiable without an external Ed25519 signature. If four lines
of JavaScript walk past all of it, then for any agent permitted to execute code
— which is every agent this pipeline dispatches — those files are not protected.
They are *inconvenient to modify by one particular route*.

## Where it is

Structural, not a single line. Every file-protection guard in
`plugins/pipeline-core/hooks/` is a `PreToolUse` hook that receives the tool
call's own payload and inspects **command text or edit target**:

- `guard-gate-strength.mjs`
- `guard-testpath.mjs`
- `guard-lifecycle-ready.mjs` (its closed shell grammar)
- the `guard-git.mjs` union

All of them are correct at what they do. None of them can see a syscall issued by
a process they already approved the launch of. `node <script>` is admitted as one
simple command; what the script then does is outside every hook's field of view.

## Proposal

Two layers, because neither alone is sufficient. Detection is fast but advisory;
blocking is real but late.

1. **A protected-path integrity baseline (detection, every tool call).**
   Pipeline-owned state records the content digest of every currently protected
   path. A cheap comparison runs on guard invocation. A digest that changed
   without a consumed human-guard-override capability covering that exact path is
   a typed, loud finding — `pipeline.protected-path-integrity` — naming the file
   and both digests. This catches the bypass *shortly after* it happens, which
   for an agent-driven loop is close enough to the moment to be actionable, and
   it catches it regardless of the mechanism: Node, Python, an editor, a
   subprocess, a future runner nobody has thought of yet. It is mechanism-blind
   by construction, which is exactly the property the current design lacks.

2. **A git-layer block (enforcement, at commit).** A `pre-commit` hook refuses a
   commit whose staged diff touches a protected path without a matching consumed
   capability. This is the layer that actually cannot be talked around by a
   spawned process, because it is not observing the process at all — it is
   observing the result. The precedent already exists and already works: the
   `pre-push` hook in this repository blocks a push whose verify evidence is red
   or mis-bound, and no agent has ever been able to reason its way past it.

The recorded lesson from an earlier incident applies directly and was written
before this one: detection belongs in the preflight script, real blocking needs a
git hook. This finding is that lesson arriving a second time, from the outside.

**Explicitly rejected as the primary fix:** refusing `node <script>` on the basis
of the script's contents, or maintaining an allowlist of runnable scripts. Both
are command-text inspection again — the exact layer that just failed — and both
are defeated by `bash -c`, a different interpreter, a generated filename, or an
`Edit` tool call. Worse, either would break the legitimate everyday pattern
documented above without closing the gap.

**Scope constraint the fix must honour:** only gate-strength- and
testpath-protected paths are in scope. Script-driven edits to ordinary files must
remain unimpeded; they are a normal and useful working mode, not the defect.

## Acceptance

- **A controlled repro exists in this repository, and is a test.** The triage that
  produced this item explicitly did *not* claim one: F01 rests on Antigravity's
  report plus this session's own corroborating usage, which is strong evidence but
  not a controlled experiment. Before the fix is designed against it, a test must
  demonstrate, in this repo, that a spawned process modifying a gate-strength
  protected path is not refused and not detected. That test then inverts into the
  regression test.
- Layer 1 detects a protected-path digest change made by a spawned process, names
  the path, and is not satisfiable by any command-text evasion (verified against
  at least: `node`, a shell redirect from inside a script, and one non-Node
  interpreter).
- Layer 2 refuses a commit carrying such a change with no consumed capability, and
  permits one that has a consumed capability covering that exact path.
- A script-driven edit to a NON-protected path is unaffected — proven by a test,
  not by inspection, since this is the case that would silently make the whole
  repository unusable if the scope were drawn one level too wide.
- The false-negative population is bounded: a check enumerates the protected-path
  set from its actual source of truth rather than from a second hand-maintained
  list, so a newly protected path is covered the day it is protected.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Reported by a runner that was explicitly trying to break the
  system, which is the intended way to surface exactly this class; then
  corroborated from an entirely independent direction — the same mechanism was in
  routine, non-adversarial use in the Pipeline's own repository on the same day,
  unnoticed by every guard. Two independent observations of one mechanism, one
  adversarial and one accidental. The accidental one is the more serious of the
  two.
- **Assignment:** `sprint: nova`, and it blocks the 0.6.0 candidate. Every other
  security-group finding from the same run (the fail-open identity attestation,
  the piped/unpiped read-scope asymmetry, and the sweep for further instances of
  both) presupposes that the guard layer is where enforcement lives. Fixing those
  while this one stands open is fence-painting. This is therefore first and alone.
- **Date:** 2026-08-29

## Stage 1 landed, 2026-08-29 (dispatch NVA-R10-PROTPATH)

Layer 1 (detection, additive, no existing `guard-*.mjs` file touched) is
implemented and merged: `plugins/pipeline-core/scripts/check-protected-path-integrity.mjs`
plus its test file. It enumerates the protected-path set from the real sources
of truth — `GATE_STRENGTH_PATHS` (imported directly from
`guard-gate-strength.mjs`) and `loadProtectedTestPathRules()` (the same parser
`guard-testpath.mjs` and the shell lane already share) — never a second
hand-maintained list. Test-path rules are regex suffix patterns rather than
concrete paths, so covering them walks the tree (`walkFiles`, excluding `.git`,
`node_modules`, `.claude/worktrees`) and matches each file against the rules.
`GS-15`'s `/*` glob is expanded to every file currently under that subtree;
`GS-6` (`LIVE_PLUGIN_RULE`, "whichever plugin root is currently enforcing") is
deliberately NOT baselined — it names an entire live source tree under active
development, not a discrete file (disclosed scope narrowing, file header).

`recordBaseline()` writes a sha256 digest per protected path to
`<git-common-dir>/agent-pipeline/protected-path-integrity/baseline.json` (local
session state, the same persistence arrangement `pre-push-hook-install.mjs`
already uses for its own install marker — never committed tracked state).
`compareAgainstBaseline()` re-hashes every baselined path and reports a typed
`pipeline.protected-path-integrity` finding — naming the path and both digests
— for any digest change that has no matching CONSUMED human-guard-override
capability (`eligiblePaths` exact match) covering that exact path.

A controlled repro test (`PHASE 1` in the test file) proves the current gap
using only pre-existing repository mechanisms — a spawned `node <script>.mjs`
subprocess calling `fs.writeFileSync` directly against a fixture file succeeds
silently, because the write never crosses any PreToolUse hook boundary at all.
That assertion does not import anything from the new module and its truth does
not depend on this dispatch. The mechanism is then verified against three
distinct bypass shapes, each its own test (`PHASE 2a/b/c`): (a) a Node script
writing directly via `fs.writeFileSync`; (b) a Node script that shells out via
`execFileSync('/bin/sh', ['-c', ...])` with a `>` redirect (the redirect never
appears in any command text a guard could inspect, because it is inside the
spawned child, not the argv a guard ever sees); (c) a non-Node interpreter
(`python3`, confirmed present in this environment) writing the file directly.
All three are detected. A script-driven edit to a NON-protected path is proven
by a test to produce no finding, and never even enters the enumerated protected
set. A newly-protected path — added only to the fixture's protected-set INPUT,
never to a real guard file — is proven covered in the same run, bounding the
false-negative population by construction.

Verified: `node --test plugins/pipeline-core/scripts/check-protected-path-integrity.test.mjs`
— 25/25 pass, exit 0 (includes a read-only sanity check against this
repository's own real `GATE_STRENGTH_PATHS`/`protectedTestPaths`, and a CLI
usage-branch smoke test — neither mutates tracked or `.git` state).
`node --test harness/scripts/check-consumer-safe-paths.test.mjs` — 9/9 pass,
exit 0 (mandatory per this dispatch's briefing since it touches
`plugins/pipeline-core/`).

**What remains — Stage 2, out of scope for this dispatch:** an actual
blocking git `pre-commit` hook that refuses a commit whose staged diff touches
a protected path without a matching consumed capability. Stage 1 is detection
only; nothing here is wired into any hook or invoked automatically yet — it is
a standalone script with a `record`/`compare` CLI, not yet called from
anywhere in the guard family. This item stays `open`.

`done_when` repointed, 2026-08-29 (Elephant, after verifying Stage 1):
the old marker (`pipeline.protected-path-integrity`) was satisfied the
moment Stage 1 landed — the same graduation pattern already used on the
sibling resume-consumption item — so it stopped measuring anything once
Stage 1 was real. Repointed to `path-exists
plugins/pipeline-core/scripts/pre-commit-hook-install.mjs`, following this
repository's own established naming convention for exactly this shape of
mechanism (`pre-push-hook-install.mjs`). This is a considered guess at
Stage 2's eventual filename, not a design decision — if Stage 2 lands under
a different name, repoint again rather than treat a mismatch as a
regression.

## Stage 2 partially landed, 2026-08-29 (dispatch NVA-W11-PRECOMMITGUARD)

The installer itself is done and independently verified:
`plugins/pipeline-core/scripts/pre-commit-hook-install.mjs`, modeled closely on
`pre-push-hook-install.mjs` (identical shim/impl/marker/decline-marker install
pattern), plus `pre-commit-hook-install.test.mjs`. It installs a real git
`pre-commit` hook that reads the SAME sources of truth every sibling guard already
reads — `gateStrengthRuleFor()` imported directly from `guard-gate-strength.mjs`,
and `loadProtectedTestPathRules()`/`protectedTestPathRuleFor()` imported from
`lib/protected-test-paths.mjs` — never a second hand-maintained list, and reuses
Stage 1's own `defaultHasConsumedCapabilityForPath()` (from
`check-protected-path-integrity.mjs`) for the consumed-capability check rather than
a third copy. `done_when` (`path-exists
plugins/pipeline-core/scripts/pre-commit-hook-install.mjs`) is now satisfied.

Verified: `node --test plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs`
— 22/22 pass, exit 0. Coverage includes: a real `git commit` staging a
gate-strength-protected path (`pipeline.user.yaml`, GS-1) refused with no consumed
capability; a real `git commit` staging a configured testpath-protected path
refused the same way; a controlled repro of the item's own reported gap — a plain
spawned `node -e "fs.writeFileSync(...)"` process (never crossing any PreToolUse
hook) writing `project/pipeline.json` directly, then a `git commit` of that write
still refused at the commit boundary; a matching CONSUMED human-guard-override
capability admitting the same commit; a staged non-protected path left unaffected
(proven, not just asserted); install/removal/decline safety mirroring
`pre-push-hook-install.test.mjs`'s own coverage shape; and the fail-closed branch
when the repository root cannot be resolved.
`node --test harness/scripts/check-consumer-safe-paths.test.mjs` — 9/9 pass, exit 0
(mandatory per this dispatch's briefing since it touches `plugins/pipeline-core/`).

**What remains open — the onboarding wiring, and why it was NOT done as briefed.**
The briefing asked for `lib/project-onboarding-v3.mjs` to wire the new installer
into the onboarding transaction, mirroring `applyPrePushHookInstallOnboarding`'s
own call site exactly (install-by-default, unconditional, best-effort). That wiring
was attempted and then reverted after it broke pre-existing, passing tests in
`project-onboarding-v3.test.mjs` (confirmed via a clean before/after re-run: 150
pass / 1 pre-existing unrelated failure with the wiring reverted, vs. 4+ new
failures with it in place). The cause is structural, not a bug in the wiring
itself: onboarding's own scaffold-authoring step writes gate-strength-protected
files (e.g. `project/pipeline.yaml`, `project/pipeline.json`,
`project/critical-human-proof.json`, `pipeline.user.yaml`) directly to disk via
trusted, privileged code — never through a guarded Edit/Write tool call — and the
FIRST real git commit that captures this scaffold into history (which the
pre-existing NVA-R9-PREPUSHHOOK test suite exercises directly, and which every real
onboarded project does too) is indistinguishable, from a git-level pre-commit
hook's point of view, from an untrusted bypass writing the same path. The pre-push
hook has no analogous problem because a push is a later, separate action from the
local first commit; a pre-commit hook fires on exactly that first commit.

Resolving this needs a real design decision the backlog item does not currently
answer, so it was deliberately NOT invented and silently built in: candidates
include (a) onboarding recording a synthetic "genesis" consumed capability for the
files it just authored, (b) exempting a protected path's very first appearance in
git history while still catching any later re-write of already-tracked content
(re-checked against this item's own attempted-bypass shape — the reported repro
targets an ALREADY-COMMITTED `project/pipeline.json`, so a first-appearance
exemption would not reopen that hole), or (c) documenting `git commit --no-verify`
as the sanctioned one-time operator step for a project's own genesis commit,
mirroring the existing human-escape doctrine. `status` stays `open`: the
`done_when` file-existence predicate is satisfied, but the item's own Acceptance
criteria are not fully met until the onboarding wiring lands with one of these (or
another) resolved design.

## PO decision, 2026-08-29

**Decision:** candidate (b), first-appearance exemption — a protected path's
very first appearance in git history is exempt from the pre-commit hook,
while any later re-write of already-tracked content is still caught.
**Rationale:** cheapest of the three, needs no new capability machinery
(unlike (a)), and re-verified against this item's own reported repro shape
(which targets an already-committed `project/pipeline.json`) — a
first-appearance exemption does not reopen that hole.
**How to apply:** dispatch targeting the installed pre-commit hook's logic
(`pre-commit-hook-install.mjs` and whatever hook script it installs) to add
the first-appearance check, plus the small onboarding wiring call into
`lib/project-onboarding-v3.mjs` mirroring `applyPrePushHookInstallOnboarding`'s
call site — sequenced AFTER any other in-flight dispatch on
`project-onboarding-v3.mjs` completes, to avoid a shared-checkout collision.

## Progress, 2026-08-29 (dispatch NVA-R36-GENESISEXEMPT, commit `faf283a7`)

The first-appearance exemption itself is landed and self-committed by the
dispatch: `pathAlreadyTrackedInHistory()` in `pre-commit-hook-install.mjs`
(checks `git log -1 -- <path>` against HEAD-reachable history; an unborn
HEAD or a `git log` failure both fail closed toward "already tracked" —
still blocked). Re-verified against the item's own exact repro shape
(already-committed `project/pipeline.json` bypass-write) — still blocked,
as required. 29/29 tests pass (was 22/22), including a spawned-bypass
first-appearance-allowed test documenting the residual scope.

**Onboarding wiring correctly NOT landed — stopped on a genuine open
design question, not a bug.** Wiring the installer into onboarding's apply
chain (mirroring `applyPrePushHookInstallOnboarding`) fixes the genesis-
scaffold-write problem this item exists to solve. But it then breaks 2
pre-existing tests at a DIFFERENT, later point: an onboarded project's
SECOND commit — an ordinary, legitimate operator edit re-writing an
ALREADY-TRACKED protected file (`project/pipeline.json`/GS-10,
`pipeline.user.yaml`/GS-1, e.g. "the human configures verify and push
approval" right after setup) — is correctly still blocked by the
first-appearance exemption (working as designed), but nothing yet tells a
real operator how to make that entirely normal post-setup edit.

**Queued PO decision (do not guess — genuinely security-relevant UX for
every onboarded project's post-setup admin edits):** how should a later,
legitimate admin edit to an already-tracked protected file be handled
once this hook is wired in by default? Candidates, none chosen yet:
1. `git commit --no-verify` as the sanctioned escape for this specific
   case — but this directly echoes candidate (c) from this item's OWN
   original three candidates, which the PO already passed over in favor
   of (b) when this item was first decided; reintroducing it here for a
   narrower case still needs an explicit fresh decision, not an inferred
   yes.
2. A consumed human-guard-override capability for legitimate post-setup
   admin edits — heavier friction for a routine operation.
3. Something else not yet proposed.

The dispatch's exact attempted diff and the two failing tests' full
output are preserved at
`scratch/attempted-onboarding-wiring-NVA-R36-GENESISEXEMPT.md`, ready to
resume once a decision lands. Left `status: open`.

## PO decision, 2026-08-29

**Decision:** candidate 1 — `git commit --no-verify` is the sanctioned
escape for this specific, narrow post-setup admin-edit case (NOT a
general reintroduction of the original candidate (c), which would have
covered the whole genesis case this item already resolved via
first-appearance exemption instead).
**Rationale:** matches this repository's accidental-breakout threat model
and the PO's standing preference for minimal HGO ceremony; a routine,
known, immediately-post-setup configuration edit by a trusted human at
their own keyboard does not need capability-ceremony friction.
**How to apply:** resume from the saved diff in
`scratch/attempted-onboarding-wiring-NVA-R36-GENESISEXEMPT.md`, land the
onboarding wiring, and update the 2 named tests' `commit()` helper calls
for the later, already-tracked-file admin edit to use `--no-verify`
(documented inline as the sanctioned escape for this case, distinct from
the genesis-commit exemption above it).
