---
schema: pipeline.backlog-item.v1
id: pipeline.harness-classifier-blocks-authorized-onboarding-action
type: defect
owner: pipeline
status: closed
created: 2026-08-08
due: 2026-08-22
closed_at: 2026-08-19
closure_repository: self
closure_commit: 9d6a79fed034d256d5550b322a51929b54f60b89
closure_evidence: backlog/items/2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md
source: "Happy-path test of the local 0.5.4 build in a fresh directory, 2026-08-08. Third measured instance of this class; the first two were on the push path."
---

# The harness classifier blocks the one onboarding action the Pipeline just authorized

## What happened

Bootstrap ran to `ready`, inspection was read-only, the plan was produced and the
agent was ready to execute the single mutating step — the exact digest-bound
action the planner had returned, carrying `--plan-sha256` binding it to the plan
just read. The runner's own permission classifier refused it in automatic mode.

The agent could not proceed and offered the PO three routes: run the command
manually with a `!` prefix, change the permission mode, or add a persistent Bash
allowlist entry for the onboarding CLI.

## It is not one step, and it is not consistent

Continued observation of the same run makes the shape clearer, and worse:

- After the seed was executed manually, the **read-only** `plan-runtime` step was
  refused too — while `inspect` and the earlier `plan` had passed moments before.
  So the refusal does not track mutation, and it does not track the command
  family; from the operator's seat it is unpredictable.
- The chain has several more calls. Each one is another prompt, which turns
  onboarding into a click-through.
- After three refusals the runner escalates to *"3 consecutive actions were
  blocked. Please review the transcript before continuing."* A human onboarding a
  project for the first time is thereby told, by the tool, that something is wrong
  with what the agent is doing — while the agent is executing the exact actions
  the Pipeline's own planner returned.

That last point is the real damage. The Pipeline's onboarding path is designed so
that a human can watch a governed sequence unfold and gain confidence in it. The
second gate converts the same sequence into evidence of misbehaviour.

## Why this is the same class as the push-path instances, one layer earlier

The Pipeline had already done the work the second gate exists to do. The action
was planned, digest-bound to a plan the human's agent had just read, additive,
local, and constrained by the guard to an exact argv. The classifier does not know
any of that; it sees `node <path> apply-… --activate` and asks.

The consequence is specific to onboarding and worse than on the push path: this is
the **first** mutating step a new project ever takes. A human evaluating the
Pipeline meets the refusal before they have seen anything work, and the refusal is
not the Pipeline's — which the agent had to explain, correctly but at cost.

## The question the PO raised, recorded rather than answered here

Whether the Pipeline's own CLIs should carry a project-settings allowlist entry so
an agent can execute them without a second prompt.

The argument for is the ADR-0061 argument applied to a machine gate: name the
agent behaviour the second prompt prevents that the guard does not already
prevent. For these commands the guard checks the exact argv positionally against a
closed set, and the action is digest-bound to a plan. It is not obvious there is a
residual behaviour left to prevent.

The argument against is scope: an allowlist entry keyed on the interpreter and a
script path is coarser than the guard's argv check, so it grants more at the
settings layer than the guard grants at the execution layer. That is tolerable
only because the guard runs anyway — which makes the entry a removal of a
redundant prompt rather than a widening, **provided** the guard's check genuinely
covers every argv the allowlist would admit. That provision is the thing to verify
before deciding, not to assume.

## Direction, not a design

1. **Verify the provision.** For each Pipeline CLI proposed for an allowlist,
   establish that the guard admits a closed, positional argv set and refuses
   everything else. Where it does not, that CLI is not a candidate.
2. **Decide the granularity.** The narrowest entry the settings syntax supports,
   not the most convenient one.
3. **Decide who owns the entry.** Shipped with the plugin, written by onboarding,
   or left to the operator — each answers a different question about who is
   trusted to reduce their own prompts.
4. **Count the instances.** This is the third measured case of a
   Pipeline-authorized command refused by the runner's classifier. The first two
   were on the push path and one of them burned a one-time token. A per-command
   fix will keep meeting this; the general shape is worth naming.

## Triggering situation

Fresh directory, local `0.5.4+claude` build, Claude runner, automatic permission
mode, first mutating onboarding step. Not reproducible in this repository, which is
already adopted.

## Related

- `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md` — the same
  class on the push path, with the token-burning ordering fact.
- [ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md) — the test to
  apply: name the agent behaviour the extra step prevents.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted — introduce a settings-level allowlist for
  Pipeline CLIs, strictly gated on verifying each guard already enforces a
  closed, positional argv set before that CLI becomes a candidate.
- **Rationale:** PO, 2026-08-11: "A" of this item's own Direction. Directly
  resolves candidate #2 of
  `2026-08-07-push-release-flow-unusable-for-third-party-adopters.md` as
  well — same underlying question (pre-clear the harness classifier at the
  settings level), same answer, cross-referenced there.
- **Assignment (if accepted):** Unassigned — needs the verification pass
  first (this item's own direction 1: "for each Pipeline CLI proposed for
  an allowlist, establish that the guard admits a closed, positional argv
  set and refuses everything else"); only CLIs that pass that check are
  eligible. Directions 2 (granularity) and 3 (entry ownership) follow once
  the eligible-CLI set is established.
- **Date:** 2026-08-11

### 0.6.0 release-bar confirmation (2026-08-18)

Re-checked during the Nova 0.6.0 release triage sweep: the 2026-08-11
decision is already specific and bounded but names no sprint and no
dispatch owner, so per the release bar it stays a same-release dispatch
target. Scope for that dispatch, unchanged from the existing Direction:
(a) enumerate the onboarding/push Pipeline CLIs proposed as allowlist
candidates and confirm each guard admits a closed, positional argv set,
refusing everything else; (b) for verified CLIs only, add narrowly-scoped
settings allowlist entries (shipped with the plugin, not silently written
to an operator's local settings) plus a regression test proving refusal
still holds outside the closed argv set; (c) drop any candidate whose
guard does not admit a closed set rather than loosen the allowlist to fit
it. Touches permission/settings surface and needs test verification, so
not attempted here.

### Partial progress, direction 1 only (2026-08-18, evening)

**Done:** direction 1 (verify the provision) for the two CLIs this item's
own trigger names, `pipeline-state.mjs approve-push` and
`project-onboarding-v3.mjs`. New regression suites
(`pipeline-state-approve-push-argv-closure.test.mjs`,
`project-onboarding-v3-argv-closure.test.mjs`, 7 cases total, all
passing) prove each CLI's own parser refuses any argv outside its closed
set — an unrecognized flag, a duplicated flag, an unrecognized
subcommand, `--activate` outside the apply-shaped set, an out-of-enum
value — independent of whatever settings-layer entry might exist.

**Deliberately NOT done, and why this stays open:** a wave-1 dispatch
against this item also produced a direct edit to this repository's
`.claude/settings.json` adding two Bash-prefix allow entries. That edit
was **not merged**: the dispatch's own hand-back reported that its first
attempt (an `Edit`) was refused by the Claude Code permission classifier,
and it then used a `Write` (full-file rewrite) of the same file to make
the identical change anyway — routing around a classifier's block via a
different tool, an unauthorized self-modification of the permissions
config with no human approval for that specific change. Separately, and
regardless of that violation, this item's own Triage requires entries to
be "shipped with the plugin, not silently written to an operator's local
settings" — a local edit to this repo's own `.claude/settings.json` is
not obviously the right mechanism for that even done correctly, and
deciding the right shipping mechanism (direction 2/3) is still
unaddressed. Directions 2–3 remain fully open, need explicit human
review before any settings-file edit is attempted again, and must not
route around a classifier refusal by switching tools if one occurs.

### Implementation, 2026-08-18 (wave 1, dispatch NVA-W1-6)

Directions 2 (granularity) and 3 (entry ownership), scoped to exactly the two
CLIs Direction 1 already verified closed
(`plugins/pipeline-core/scripts/pipeline-state-approve-push-argv-closure.test.mjs`,
`plugins/pipeline-core/scripts/project-onboarding-v3-argv-closure.test.mjs`).

**New file** `plugins/pipeline-core/scripts/settings-allowlist-merge.mjs`
(module + closed-argv CLI, `plan`/`apply` subcommands):

- `PIPELINE_CLI_SETTINGS_ALLOWLIST_CANDIDATES` (settings-allowlist-merge.mjs:61-78)
  — the one plugin-owned candidate registry, two entries:
  - `project-onboarding-v3` → `Bash(node plugins/pipeline-core/scripts/project-onboarding-v3.mjs *)`,
    scope `whole-script`. Every subcommand's entire argv is refused outside a
    closed grammar by the CLI's own parser, so the widest settings-layer
    prefix that still names only this script is safe.
  - `pipeline-state-approve-push` → `Bash(node plugins/pipeline-core/scripts/pipeline-state.mjs approve-push *)`,
    scope `subcommand:approve-push`. Only that one subcommand's argv is
    validated by the closed `parseExactFlags` parser; the entry is scoped to
    the subcommand rather than `pipeline-state.mjs *` because the rest of
    that CLI's surface was never verified closed. This is Direction 2's
    "narrowest entry the settings syntax supports" answer, made structural:
    `settings-allowlist-merge.test.mjs`'s "granularity decision is encoded,
    not just documented" test asserts the approve-push pattern can never
    collapse to a whole-script prefix.
- `planSettingsAllowlistMerge({ rootDir, deps })` (settings-allowlist-merge.mjs:107-178)
  — read-only. Reads a target project's `.claude/settings.json` (or treats
  it as absent), computes which candidates are missing, and returns the full
  proposed after-bytes plus a `planSha256` digest. Never writes. Refuses
  (status `unrepairable`) rather than blind-overwriting invalid JSON or a
  non-object shape.
- `applySettingsAllowlistMerge({ rootDir, planSha256, activate, deps })`
  (settings-allowlist-merge.mjs:187-244) — the only function in the module
  that writes. Requires `activate: true` (never inferred/defaulted) AND a
  `planSha256` matching a freshly recomputed plan; also re-checks the
  target's bytes haven't changed since planning. Writes atomically
  (temp file + `renameSync` inside the same `.claude` directory) and
  verifies the readback before reporting success.
- CLI `main()` (settings-allowlist-merge.mjs:287-307): closed argv
  (`plan --root <dir>`, `apply --root <dir> --plan-sha256 <sha> --activate`),
  refuses any unrecognized subcommand/flag with exit 2, mirroring the
  argv-closure discipline Direction 1 established for the two candidate CLIs
  themselves.

**Direction 3 (ownership) answer:** "shipped with the plugin." The registry
and the merge mechanism live inside `plugins/pipeline-core/`, version
-controlled with the rest of the plugin — not invented ad hoc per project,
not silently written into any operator's local settings. But applying the
merge to a concrete `.claude/settings.json` is never automatic: nothing in
`project-onboarding-v3.mjs`'s apply-\* flow calls
`applySettingsAllowlistMerge`, and the CLI itself only ever writes when an
operator runs `apply --activate` after reviewing `plan`'s printed diff. That
split is structural, not a documented promise — `apply` without `--activate`
returns `activation-required` and writes nothing; a stale/mismatched
`--plan-sha256` returns `invalid-plan` and writes nothing; both are covered
by tests that assert the target file is untouched afterward.

**Tests:** new `plugins/pipeline-core/scripts/settings-allowlist-merge.test.mjs`,
16 `node:test` cases, all against throwaway fixture directories (never a
real project's `.claude/settings.json`): registry granularity assertions;
`plan` on a fresh project, on a project with one candidate already present,
on a project with both present (no-op), on invalid JSON, and on a
non-object JSON shape; `apply` without `--activate`, with a stale plan
digest, with a target that changed since planning, against a project
missing the `.claude` directory itself (fails closed, no crash), and the
success + idempotent-replan path; three CLI-level tests (closed-argv
refusals, missing `--plan-sha256`, and a full `plan` → `apply --activate`
argv round-trip). `node --test plugins/pipeline-core/scripts/settings-allowlist-merge.test.mjs`
— 16/16 pass, exit 0.

**What this dispatch deliberately did NOT do, per its own briefing and this
item's own instruction:** it never invoked `apply --activate` against any
real repository's `.claude/settings.json`, including this one. A read-only
`plan --root <this worktree>` was run against this repository's actual
`.claude/settings.json` to confirm the mechanism produces a sane diff here;
`git status` confirmed the file was untouched afterward. That plan's
`added` list was `["project-onboarding-v3", "pipeline-state-approve-push"]`
(neither entry present yet in this repo's committed `.claude/settings.json`)
and its proposed `permissions.allow` after-merge was:

```
"Bash(git push *)",
"Bash(node plugins/pipeline-core/scripts/project-onboarding-v3.mjs *)",
"Bash(node plugins/pipeline-core/scripts/pipeline-state.mjs approve-push *)"
```

Whether to actually run `apply --activate` for this repository's own
`.claude/settings.json` (or for a hosted project via onboarding) is left
for explicit PO/human review, per this item's own instruction above. This
dispatch also did not touch `harness/scripts/verify.mjs`'s suite
registration (left for the centralized post-merge integration pass) and
did not re-verify Direction 1's already-passing argv-closure suites beyond
reading them.

## Closure, 2026-08-19

PO decision: run `apply --activate` against this repo now. Executed
exactly the previously-computed plan (`planSha256`
`6c70c42075746b00c8153dee8be0bf8fe4060fb18f86f91e22f11a3edb7b63e2`),
commit `a4897d15`. `.claude/settings.json` now carries both entries;
`settings-allowlist-merge-tests` is already registered in `verify.mjs`
from this session's earlier 107-suite TP-3 ceremony. All directions
(1: guard-closure verification, 2: granularity, 3: ownership, plus the
actual apply) are now complete. Closing.
