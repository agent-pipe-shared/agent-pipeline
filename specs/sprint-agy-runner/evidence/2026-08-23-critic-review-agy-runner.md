# Critic review — `sprint-agy-runner`, range `92037494..51dd7fc6` (2026-08-23)

Independent read-only Critic review of the 35 unreviewed commits following the
last recorded PASS. Dispatched from `templates/prompts/critic-review.md`,
paths/refs only.

- **Review object:** 35 enumerated commits, `70fd1bc7` … `51dd7fc6`
  (range `92037494..51dd7fc6` confirmed to cover exactly those SHAs).
- **Spec:** `specs/sprint-agy-runner/spec.md`, `specs/sprint-agy-runner/prd_agy-runner.md`
- **Requested route:** `claude-opus-5` at `max` (MP-07: guardrail/security diff).
- **Effective identity:** `claude-opus-5` (1M variant), observed from direct
  same-dispatch route evidence. No route contradiction.
- **T1 assurance:** `functional-equivalent-read-only; OS isolation not asserted`.
- **Critic's own notes:** `scratch/critic-agyrunner-fb78580dd44d/critic-notes.md`
  (gitignored; this file is the durable record).

## Verdict: **FAIL**

Trajectory check: **inconsistent** (see F2, F6, F10). Briefing violations: none.

## Findings

### Blockers

**F1 — Debug instrumentation shipped in the production Antigravity PreToolUse guard.**
`plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs` ends with a second
`node:fs` import and an unconditional `appendFileSync("/tmp/hook-debug2.log", …)`.
The statement sits at module top level, *outside* the
`if (isDirectInvocation(import.meta.url))` block, so it runs on every guard
invocation and on every import of the module. The path is fixed and predictable
in a shared world-writable directory (symlink-redirect surface, before every
tool call) and is not tri-platform portable.
*Spec-ref:* PRD §2 invariant 1; spec §9 checklist row 6 (claimed MET);
CLAUDE.md machine-specific-absolute-path rule; ADR-0051.
*Corroborating:* `.gitignore` gained `stdin_dump.json` / `tmp-inbounds.txt`
(commit `0427f31c`) — debug residue ignored rather than removed.

**F2 — 34 of 35 commits carry no `Dispatch:` trailer.**
Only `51dd7fc6` is bound. `evidence/` holds one dispatch record for this range
(`AGY-VERIFYFIX-1`), whose `report.changedFiles` covers a single test file. The
other records (`NVA-BL-24/25/28/32`) are dated Aug 20 and cover none of these
commits. Unbound commits include those that *remove* security controls
(`8088c1fd`), install a git hook (`2887e774`), add push blocks (`8eee0018`) and
add gates (`4977a9d2`, `01867a57`).
*Spec-ref:* `templates/prompts/agent-obligations.md` §6;
`docs/operating-model.md` §3.3; EL-01/EL-16.

**F3 — A validation command silently installs `.git/hooks/pre-push`.**
`plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs` writes the hook as a
side effect of `main()` whenever `result.status === "ready"`. Five distinct
defects in one block:
1. `writeFileSync(hookPath, …)` is unconditional — destroys an existing
   consumer `pre-push` hook with no check and no backup.
2. The whole block is `try { … } catch { /* ignore */ }` — silent failure of a
   control whose own comment calls it a push-evasion preventer.
3. The guard body runs only when `CLAUDE_PROJECT_DIR` / `ANTIGRAVITY_SESSION_ID`
   / `CODEX_SESSION_ID` is set. The agent controls its own child-process
   environment, so `env -u CLAUDE_PROJECT_DIR git push` skips it entirely —
   the control does not constrain the party it exists to constrain.
4. The synthesized payload is `git push $1`, where `$1` in a `pre-push` hook is
   only the *remote name*. Refspec and all flags — including `--force` — are
   dropped, and the ref list on the hook's stdin is never read.
5. It invokes `guard-push.mjs` by repo-relative path, which does not exist in a
   consumer project installing from the marketplace — there every push is
   blocked.
*Spec-ref:* spec §7.2; PRD §5 non-goal; `guardrails/git.md`; ADR-0056.

### Majors

- **F4** — `decision()`, the shared test oracle in
  `antigravity-pretool-guard.test.mjs`, now returns `allow` on empty or
  unparseable guard output; previously it threw. Every allow-asserting test in
  the file passes vacuously if the guard crashes. Both new tests alternate on
  `|BLOCKED`, which `deny()` prefixes to every denial from any guard.
  *Spec-ref:* PRD §2 invariant 1; QG-04.
- **F5** — Commit `8088c1fd` removes the Antigravity hardening layer with no
  replacement: the `define_subagent` `enable_write_tools: false` check for
  critic subagents, the critic-dispatch contamination check, and Layer-1
  inline-code-execution containment (`node -e`, `python -c`, …). An
  Antigravity-hosted Critic can now be defined *with* write tools.
  The "to match Codex" rationale does not cover `define_subagent`, which has no
  Codex analogue. *Spec-ref:* PRD §2 invariant 1; ADR-0014; spec §8.3.
- **F6** — `evidence/verify-latest.json` is bound to `dc84c177` / tree
  `24052176`, finished 19:13:03Z; the review tip `51dd7fc6` was committed
  19:45:44Z — 32 minutes later, uncovered. Additionally, at `dc84c177` the
  artifact records `exitCode: 0` for every step, while
  `evidence/dispatch-record-AGY-VERIFYFIX-1.json` (same `rulesetSha`) records
  the PUSHSEED-2 case failing, and `harness/scripts/verify.mjs:251` shows that
  suite is part of the gate. Both artifacts cannot be true at that commit.
  *Spec-ref:* PRD §6 risk 2; spec §5 Wave 6; CLAUDE.md "never report done while
  a check is open".
- **F7** — Both installer copies compute
  `enableAuto = autoAnswer.trim().toLowerCase() !== "n"`, so Enter *and* any
  answer other than the single letter `n` (`no`, `nein`) enable
  `toolExecutionPolicy: "always-proceed"` and `artifactReviewMode:
  "always-proceed"` — an unsafe default that also treats an explicit refusal as
  consent. *Spec-ref:* `guardrails/security.md`; PRD §2 invariant 1.
- **F8** — The silent fail-open of the hard-enforcement layer (background
  daemons not sourcing the shell profile, so hooks never run) is documented in
  `GEMINI.md` and the installer banner, mitigated only by a manual
  `sudo ln -s`, with no owner, no expiry and no runtime detection.
  `antigravity-start-hint.mjs:29-31` additionally wraps its body in a
  fail-open catch and emits `{}`, silently removing the bootstrap gate the
  pretool guard depends on. *Spec-ref:* QG-06; spec §9 checklist row 2.
- **F9** — Spec §8.2 claims the execution host *enforces* `--sandbox`. The
  implementation only warns, gated on `!process.env.BWRAP_ACTIVE` (not a
  variable bubblewrap sets, so it fires unconditionally and never blocks), and
  the message is double-escaped in an ordinary double-quoted JS string, so it
  prints literal `\n\x1b[33m…` text. *Spec-ref:* spec §8.2, §9 row 2.
- **F10** — Protected test paths `guard-push.test.mjs` (TP-5) and
  `critical-human-proof-policy.test.mjs` (TP-9) were modified with no override
  or ceremony record anywhere in `evidence/`.
  *Spec-ref:* `project/guard-config.json`; QG-04.
  *Note recorded by the Critic:* `plugins/pipeline-core/scripts/pipeline-state.test.mjs`
  was also modified but is **not** protected — TP-5's alternation names
  `harness/scripts/pipeline-state.test.mjs`, a path that does not exist. That
  mis-targeting is pre-existing and outside this diff.
- **F11** — `guard-push.mjs` gains a new hard failure ("Uncommitted changes
  detected in specs/, docs/, or backlog/") with no test asserting it fires or
  stays quiet. The only test-side change is a fixture adapted so pre-existing
  tests keep passing under the new block.
  *Spec-ref:* spec §5; QG-04.
- **F12** — `.agents/plugins.json` had two entries; the diff removes the
  portable relative one and leaves a machine-specific absolute path as the sole
  entry. *Spec-ref:* CLAUDE.md hard rule; `guardrails/global.md`.

### Minors

- **F13** — `guard-gate-strength.mjs` adds `pipeline.json` both as `GS-10`
  protected path and to the `governed` marker list, activating gate-strength in
  any project that happens to have a root `pipeline.json`.
- **F14** — Non-Conventional and non-English commit subjects (`2887e774`
  German, `ef967102` no type, `70fd1bc7` empty token); `dc84c177` bundles three
  concerns.
- **F15** — German phrase in the agent-facing `plugins/pipeline-core/rules/AGENTS.md`.
- **F16** — QG-14 and the AGENTS behaviour section are guardrail-class changes
  outside PRD §4 scope.
- **F17** — `plugins/pipeline-core/install-agy.mjs` is a byte-identical copy of
  the root installer with no generator or equality test; both new files carry
  `SPDX-License-Identifier: SUL-1.0` while spec §9 row 3 asserts MIT, status MET.
- **F18** — Spec §3 mandates `.agents/hooks.json`; commit `ffa55f78` deletes it
  and the spec was not updated.
- **F19** — `governance/examples/policies/semgrep/dependency-direction.yml`
  include glob changed under a `fix(security)` label, untested and unexercised
  by the submission's evidence.

## Deliberately not flagged (examined and cleared)

`deny()` exit `0` → `2` (spec §3 conformant); the broadened PO-gate regexes;
`CRITICAL-PROOF-MODE-CONFLICT` ratchet (covered by the new CHP32 test);
gate-strength prefix matching (GS-13); the semgrep `--timeout 60` raise;
dependency reality check (no new package/action/image/plugin in the diff;
`cap.sca: not-applicable`); gate-strength added to the codex and apply-patch
guard lists; the bootstrap-lock location under `.git/agent-pipeline/run/`.

Dropped candidates recorded rather than filed: the `approve-push` PO challenge
as security theatre (the code is printed to the stream the caller reads, so an
agent can self-serve the second call — dropped because ADR-0056 already calls
chat mode "an attribution record rather than proof"); the `PreInvocation` hook
shape inconsistency (no vendor schema to adjudicate); `.gitignore` anchoring of
the two new filename patterns; the root installer's placement under ADR-0063;
the `sudo ln -s` recommendation as a PRD §5 non-goal breach.

## Live-state confirmations (Elephant, post-review)

Independently verified after the review, on this host:

- `plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs:690-693` — F1 block
  present, at module top level, after the `isDirectInvocation` guard.
- `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs:392-416` — F3 block
  present, including the `git push $1` payload and the unconditional write.
- `git log --format=… 92037494..51dd7fc6` — F2 confirmed: one `Dispatch:`
  trailer across 35 commits.
- `.agents/plugins.json` — F12 confirmed: single absolute-path entry.
- **F1 and F3 are live on this machine, not theoretical:** the repository's
  `.git/hooks/pre-push` exists (written 2026-08-23), and the debug log target
  exists and has been appended to.

## Amendment to F5 — the control did not merely get removed; it never fired

Recorded 2026-08-23 during the correction wave, surfaced by the
`AGY-FIX-HARDENING` dispatch and independently re-verified against the object
database before being written here.

F5 states that commit `8088c1fd` removed the `define_subagent` check requiring
`enable_write_tools: false` for critic subagents. That is accurate but
understates the defect. In the pre-removal revision (`8088c1fd^`,
`plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs`):

| Line | Content |
|---|---|
| 226 | `define_subagent` listed in the `readOnlyTools` set |
| 234 | `isReadOnly: readOnlyTools.has(name)` — so the tool resolves to `isReadOnly: true` |
| 293 | `if (normalized.isReadOnly) {` — short-circuits to `allow()` |
| 339 | the `define_subagent` critic check — 46 lines BELOW the short-circuit |

The check was therefore unreachable. From the moment it was written until
`8088c1fd` deleted it, every `define_subagent` call was allowed before the
control was ever consulted.

**Consequence for ADR-0014.** The read-only Critic contract had no machine
enforcement in the Antigravity lane at any point in that period — only the
appearance of one. An Antigravity-hosted Critic could have been defined with
write tools throughout. A reviewer reading only F5 and the correction commit
would conclude the control was restored to a previously working state; it was
not, and this record exists so that conclusion is not drawn.

**Current state.** Commit `f41f9959` places the check at line 300, ahead of
the `isReadOnly` short-circuit at line 308, and adds fire / neighbour-non-fire
test pairs for it. Verified in the working tree: `readOnlyTools` still contains
`define_subagent` (unchanged, by design — it IS a read-only tool in every other
respect), and the check now precedes the short-circuit rather than following
it. This is the first revision in which the control actually executes.

## Disclosed, not corrected — F2, F14, and the historical half of F10

Recorded 2026-08-23 as part of the correction wave. Three findings of this
review have no code remedy, and this section exists so that "all findings
addressed" is not read as "all findings fixed".

**Why no remedy exists.** All 34 commits F2 names are published: `origin/sprint_agy`
stands at `70fd1bc7`, inside the reviewed range. Correcting a commit message or
adding a trailer after the fact requires rewriting history, which CLAUDE.md's
hard rules forbid without qualification ("never force-push, never rewrite
history"). The only honest treatment is disclosure.

**F2 — authorship.** Of the 35 commits in `92037494..51dd7fc6`, exactly one
(`51dd7fc6`) carries a `Dispatch:` trailer. The other 34 carry none, and
`evidence/` holds no dispatch record covering them. Those commits are
permanently authorship-unverifiable. This includes the commits that removed
security controls (`8088c1fd`), installed a git hook (`2887e774`), added push
blocks (`8eee0018`) and added PO gates (`4977a9d2`, `01867a57`). Every
correction commit made after `51dd7fc6` does carry the trailer and a dispatch
record; the gap is bounded to the original range and does not extend forward.

**F14 — commit-message contract.** `2887e774` ("Pipeline Härtungen für Sandbox
und Push-Hook integriert") is German and carries no Conventional type;
`ef967102` carries no type; `70fd1bc7`'s subject contains an empty token and a
double space; `dc84c177` bundles three distinct concerns in one commit. All
four are published and stay as they are.

**F10 — protected test paths, past edits.** `guard-push.test.mjs` (TP-5) and
`critical-human-proof-policy.test.mjs` (TP-9) were modified inside the reviewed
range with no override or ceremony record in `evidence/`. The mechanism by which
those writes reached protected paths was NOT established — the Antigravity guard
does wire both the write lane (`guard-testpath.mjs` for `Edit`/`Write`) and the
shell lane (`guard-lifecycle-ready.mjs` for `Bash`), so the obvious explanation
does not hold. It is left as an open question rather than an assumed cause.
The forward-looking half of F10 is closed by construction: no dispatch in the
correction wave was permitted to write a protected path, and none did.

**F11 remains open and is not dispatchable.** The missing test for the new
push-guard blocking condition would have to live in `guard-push.test.mjs`
(TP-5). Per `templates/prompts/agent-obligations.md` §2, the human-guard
override does not help for Pipeline plugin source in a source checkout —
`recordHumanGuardDenial()` takes the `eligible.authorCandidate` branch and
returns `status: "author-repair-required"` rather than `"planned"` — and the
same section states that needing such a path is a stop condition. No agent tier
can perform this edit; it requires a human-decided route.

## PO disposition, 2026-08-23

The PO reviewed the three findings above that have no code remedy and accepted
them as **closed**: F2 (authorship trailers on the 34 published commits), F14
(commit-message contract on four published commits), and the historical half of
F10 (protected-test-path writes inside the reviewed range).

Closed here means the residual defect is accepted and carried, not repaired.
The commits stay as they are, and the facts recorded above stay on the record as
the permanent description of what is wrong with them. Nothing in this section
makes the underlying range authorship-verifiable.

The forward-looking obligations are unchanged and are not covered by this
acceptance: every commit after `51dd7fc6` carries a `Dispatch:` trailer and a
dispatch record, and F10's open mechanism question below stays open — an
accepted historical gap is not an explanation of how those writes happened.

**F11 — closed by human application.** The paragraph above recorded F11 as
open and not dispatchable, which was accurate at the time: the test belongs in
`guard-push.test.mjs` (TP-5), and per `templates/prompts/agent-obligations.md`
§2 no agent tier can write a protected test path in a source checkout. The PO
resolved it on the only available route by applying the test body by hand
(commit `ea1432e9`), adding `PG12u1` — the block fires for each of `specs/`,
`docs/` and `backlog/` — and `PG12u2`, which pins the scope so an uncommitted
file elsewhere does not become a push refusal. `guard-push.mjs:1659` is the
only working-tree status check in the file, so the scope assertion is exact
rather than assumed.

## Why the removed `pre-push` hook existed (PO statement, 2026-08-23)

Recorded so that the removal in `a8f861cc` is not later read as tidying up.

The PO confirmed that the hook was a deliberate workaround for an **observed**
failure, not a speculative hardening: under the Antigravity runner, pushes were
actually proceeding outside the Pipeline path, and the guard did not stop them.
The hook was the attempt to force every push through the guard.

The correction wave established that BOTH the original defect and the
workaround were real problems:

- The escape route was genuine and is now closed. `antigravity-pretool-guard.mjs`
  captures Antigravity's own `Cwd` argument into `toolInput.cwd`, but no guard
  consumed it — guards were spawned pinned to the session root and `guard-push.mjs`
  bound everything to `process.cwd()`. A command executing in a directory other
  than the session root had its approval and evidence evaluated against the wrong
  repository. Neither the Claude Code nor the Codex tool surface carries an
  equivalent field, so this was Antigravity-specific. Closed in `a8f861cc`.
- The workaround never functioned. Reproduced during the correction wave against
  `guard-push.mjs` directly: the hook's synthesized `git push $1` payload is
  rejected by the guard's own command parser, because `$1` in a `pre-push` hook is
  the remote name and the refs arrive on stdin. The hook therefore never evaluated
  a push. Removing it forfeited no working protection.
- A residual route remains open: a push issued by a process the guarded command
  merely spawns is invisible to any command-line classifier. This is the class
  `plugins/pipeline-core/lib/protected-test-paths.mjs` documents in its own
  "NOT COVERED, stated rather than hidden" section. It is tracked as its own
  backlog item with owner and expiry.

**Operator follow-up.** A `.git/hooks/pre-push` file installed by the old code
may still exist in working checkouts. The installer is gone, so it will not be
recreated — but an existing one still runs, and since its payload is rejected by
the guard's parser it exits non-zero, which blocks every push from that checkout.

In THIS checkout it was inspected (byte-identical to the generated template, no
hand modifications) and deleted on PO instruction, 2026-08-23. Its content stays
recoverable from `a8f861cc^`'s copy of the installer. Any OTHER checkout that ran
the old bootstrap still has to be cleaned by hand — `.git/` is outside every
dispatch's scope and outside what a correction commit can reach.
