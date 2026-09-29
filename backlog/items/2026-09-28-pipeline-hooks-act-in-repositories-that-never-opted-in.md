---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-hooks-act-in-repositories-that-never-opted-in
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "PO question 2026-09-28 (read-only diagnosis session): with a global (user-scope) plugin install, must every Pipeline hook stay inert in a repository that never opted in? Measured with backlog/evidence/2026-09-28-ungoverned-hook-probe.mjs (334 hook runs, Claude + Codex + Antigravity wiring, ungoverned git and non-git fixtures, isolated HOME) plus source reading."
sprint: alfred
done_when: manual
---

# Pipeline hooks act in repositories that never opted in

## Description

All three runners on the PO's machine enable `pipeline-core` at **user scope**:
- Claude: `~/.claude/settings.json` `enabledPlugins`
- Codex: `~/.codex/config.toml` `[plugins."pipeline-core@agent-pipeline-local"]`
- Antigravity: the managed plugin copy plus the global registry

So every hook runs in every directory. The PO's requirement (2026-09-28):

> In a repository where the Pipeline was not actively chosen, **nothing** from
> the Pipeline may become active. It may run silently in the background.
> **Exception, by PO decision:** the destructive-operation protection of the git
> guard applies always and everywhere.

The per-repository opt-in question (the session-start hint "Agent Pipeline is
available … ask whether to install") is intended behaviour.

The measurement shows that this requirement is **not** met today. Several hooks
block ordinary work, inject instructions that contradict the opt-in hint, or
write Pipeline state into repositories that never opted in.

## Method (reproducible)

Run `node backlog/evidence/2026-09-28-ungoverned-hook-probe.mjs <scratch-base-dir> plugins/pipeline-core`,
then summarize with `…-probe-summarize.mjs <base>/results.json`. The probe works like this:
- It reads the **real** wiring files (`hooks/hooks.json` for Claude,
  `hooks/codex-hooks.json` for Codex, and the plugin-root `hooks.json` for
  Antigravity) and applies each matcher.
- It runs every matching hook with realistic payloads against fresh
  **ungoverned** fixtures: a git repo with one commit and a plain folder.
  Neither carries a governance marker.
- HOME is an empty fixture directory, and runner env vars are stripped and
  then set per runner.
- For each run it records the exit code, stdout, stderr, and every file
  created or modified in the fixture repo and fixture HOME.

Caveats:
- The Codex and Antigravity payload shapes are approximated from the hook
  source, not captured live.
- Windows/PowerShell is not probed.
- A repository that explicitly declined is not probed, because no such state exists (see F13).
- Source state: HEAD `491a1ac8` plus uncommitted, non-hook changes.

## Findings

"All runners" means the behaviour lives in a shared guard reached through each
runner's wrapper.

| # | Hook (runner) | Behaviour in an ungoverned repo | Class |
|---|---|---|---|
| F1 | `guard-lifecycle-ready` (Claude, every Edit/Write/NotebookEdit). Codex reaches it via the `apply_patch` wrapper route. | **Blocks every file write** with `GUARD-ONBOARDING-CONSENT-REQUIRED` until a consent marker exists. The marker is written **into the repo** as `.claude/.pipeline-install-consent-<session>.json`, it is **per session** (so the question returns every session), and "no" is not durable. Codex Edit/Write are *not* blocked, but `apply_patch` is, so behaviour is inconsistent across runners. Agy is not blocked. | blocks work |
| F2 | `staleness-check` (Claude SessionStart) | Injects `Agent-Pipeline: run /pipeline-core:pipeline-start before any work` in every repo. This **directly contradicts** the session-start hint's "not active, ask first". | wrong instruction |
| F3 | `setup-check` (Claude SessionStart) | Injects "project personalization has not run yet … `node setup.mjs` … compiles `.claude/settings.json` …" in every repo. That is setup advice for the Pipeline's own source repository, shown in foreign repositories. | wrong instruction |
| F4 | `post-compact-reground` (Claude SessionStart:compact) | Injects `POST_COMPACT_REGROUND {"code":"PCR-OUTER-INVALID","workResumptionAllowed":false,…}` after every compaction in every repo. An agent may read this as "do not resume work". | wrong instruction |
| F5 | `native-goldfish-host` (Claude PostToolUse Task, non-git folder; Codex SubagentStart/Stop, both fixtures) | Reports "Goldfish host commit was not completed (NGHF-COMMON-DIR / NGHS-CODEX-START-INPUT) … inspect the worktree and recover explicitly" after **ordinary** subagent use. This is a false alarm. | wrong instruction |
| F6 | `guard-dispatch` (Claude Task/Agent; Codex `spawn_agent`) | **Blocks** a user's own subagent whose type contains "critic" (`DISPATCH-NO-RULESET-SHA`, `DISPATCH-NO-MODEL`), applying the Pipeline Critic template to foreign agents. | blocks work |
| F7 | `antigravity-pretool-guard` "Hardening Layer" (agy) | **Blocks** inline code (`python -c`, `node -e`, `bash`/`sh -c …`) and "critic" subagent prompts containing words such as "please" or "review" **before** the governance check (`hooks/antigravity-pretool-guard.mjs` around lines 395–447). | blocks work |
| F8 | `guard-git` rule **GIT-03** (all runners) | **Blocks every agent `git commit`** whose message lacks `AI-Assisted: true` and `Dispatch:` trailers. This is a Pipeline *process convention*, not destructive-operation protection. | blocks work (decision needed) |
| F9 | `guard-push` (all runners, git fixture) | **Blocks a plain `git push origin main`**: "raw Bash/Git cannot publish refs/heads/main. Only the plugin-owned fixed publication executor …". This is Pipeline publication policy, not destructive-operation protection. | blocks work (decision needed) |
| F10 | State writes into `.git/agent-pipeline/` of ungoverned repos | `dispatch-budget/orchestrator-seen/<session>.json` on **every** Claude tool call; `dispatch-slicing/<session>.jsonl` (Claude Task/TodoWrite); `native-slicing/*.json` (Codex `spawn_agent`/`update_plan`/Subagent*, agy every tool call and PreInvocation); `human-guard-overrides/{audit.key,audit.jsonl,audit.head.json,requests/*}` whenever a Codex/agy wrapper denies, which **creates an audit key** in a foreign repo. Not visible in the working tree, but it is a Pipeline footprint that nobody consented to and that nothing cleans up. | footprint |
| F11 | stderr noise | `guard-dispatch-budget` prints `OBSERVE … common-dir-unresolved` on every tool call in non-git folders; `staleness-check` prints a scratch-lifecycle JSON on stderr. | noise |
| F12 | Fail-closed checks **before** governance in the Codex/agy wrappers (source reading, not probed) | An unsupported tool name, an empty command, or an unresolvable project root is denied regardless of governance (`codex-pretool-guard.mjs` around 342–350, `antigravity-pretool-guard.mjs` around 348–381). This is defensible for governed repos but violates "inert" for ungoverned ones. | blocks work (edge) |
| F13 | No durable "declined" state | Answering "no" to the opt-in question is recorded per session only (F1). The session-start hint asks again every session. | UX / requirement gap |

**Behaved correctly (inert or intended):**
- `guard-git` destructive-operation rules (GG-01…GG-21, for example `push --force`): PO-intended.
- the session-start opt-in hint (Claude and Codex `codex-session-start-hint`, agy `antigravity-start-hint`): intended.
- `guard-testpath`, `guard-devplan`, `guard-gate-strength`, `guard-el01-tripwire`, `guard-handover-size`, `guard-onboarding-consent-lock`, `guard-advisor-prohibition`, `guard-worktree-isolation`: silent.
- `stop-suggest`, `antigravity-stop-hook`, the Antigravity start-hint lock: correctly not written without governance.
- ordinary Bash, Read, and Write on Codex/agy: silent.

## Root cause

There is no single shared "is this repository governed" predicate, and no
hook-wide rule that says "ungoverned means inert". Each hook decides on its own:
- at least four hard-coded marker lists (`codex-session-start-hint`,
  `guard-lifecycle-ready` `BASE_GOVERNANCE_MARKERS` plus the projection
  targets, and the Codex and Antigravity pretool wrappers);
- a different five-marker list in `guard-gate-strength` (including
  `guard-config.json`, see `lib/self-application-attestation-gate.mjs` note 4:
  "the two lanes … diverge in both directions");
- `guard-git`'s `phoenixGovernedProject()`;
- several hooks with no governance check at all (F2–F11).

The governed-only precondition is tested for gate-strength (GST31, from
`2026-08-07-no-test-pins-the-ungoverned-path-rule-stand-down.md`) but for no
other hook.

## Proposal

1. **One predicate:** `lib/governance-scope.mjs`, returning
   `{ state: "governed" | "ungoverned" | "declined", root, markers }` from one
   marker list, resolved lazily and fail-safe. Every hook, wrapper, and nested
   guard calls it **first**. Replace all local marker lists. The destructive
   `guard-git` union deliberately does *not* consult it.
2. **Contract: ungoverned or declined means inert.** Exit 0, empty or `{}`
   stdout, no stderr, **no file writes anywhere** (including `.git/agent-pipeline/`
   and the HOME stores). Two explicit, enumerated exceptions:
   - (a) the `guard-git` destructive union GG-01…GG-21: PO decision, always on;
   - (b) the opt-in hint at session start, which is suppressed once a durable
     decline exists.
   Anything else that should fire outside governed repos needs its own PO
   decision and must be added to the exception list in code.
3. **Split `guard-git`** into (a) the destructive union, always on, and (b)
   Pipeline process rules such as **GIT-03** (trailers). **PO decision
   needed:** does (b) apply only in governed repos? Recommendation: yes.
   `guard-push`'s publication-executor rule (F9) is the same kind of question,
   with the same recommendation. The ref-deletion and force parts of the push
   protection stay in (a).
4. **Fix F1:** in an ungoverned repo, never block writes. The opt-in question
   belongs to the session-start hint, not to a write-blocking guard. If consent
   gating is still wanted, it applies only *after* the user said yes (that is
   `guard-onboarding-consent-lock`'s existing job). Never write consent markers
   into an ungoverned repo's working tree.
5. **Durable decline (F13):** record "no" durably *without* adding files to the
   repo's working tree. For example, a local `git config agent-pipeline.optOut true`
   (lives in `.git/config`, reversible, invisible to the tree), or a user-level
   store keyed by the repo's real path. For a non-git folder, only the
   user-level store works. Then `governance-scope` returns `declined`, and even
   the hint stays silent. Provide `pipeline opt-out` / `opt-in` commands for
   reversal.
6. **Move the pre-governance fail-closed checks** (F7, F12) behind the predicate.
   The Antigravity hardening layer and wrapper input checks apply only in
   governed repos.
7. **Regression gate:** turn the probe into a registered Verify suite (it must
   be registered in `harness/scripts/verify.mjs`). It enumerates hooks **from
   the wiring files**, so a newly added hook is covered automatically, and it
   asserts the inert contract for ungoverned **and** declined fixtures on all
   three runners. The only allowed effects are the two enumerated exceptions.
   Also assert the governed path still enforces, so the predicate cannot become
   a blanket disarm. Where possible, capture real Codex and agy hook payloads
   first to replace the approximated shapes.
8. **Docs:** state the contract ("global install is safe: inert outside opted-in
   repos, except destructive git protection") in SETUP.md and `docs/runner-support.md`.

## Related

- `2026-09-28-agy-imported-plugin-snapshot-shadows-registered-plugin.md`
  (global activation topology).
- `2026-09-28-no-uninstall-path-for-a-repository-that-once-opted-in.md`
  (uninstall must leave the repo in the `declined` state from item 5, or F1–F11
  hit it immediately).
- `2026-08-07-no-test-pins-the-ungoverned-path-rule-stand-down.md` (closed;
  covered gate-strength only).
- `2026-08-19-greenfield-ask-before-install-duty-ignored-live.md`.

## Triage

Additional manual quality review found three boundary gaps: unsupported Git
topology was treated as enrollment without proof, ordinary hooksPath config
reads were classified as destructive, and Agy's oversized-input error enforced
before scope observation. Source corrections retain actually proven enrollment,
allow ordinary inactive config reads, and keep inactive/declined input failures
quiet. Hook9/9 passes; final scope21/23 plus targeted2/2 is not a full-suite
PASS. Fresh-process proof and decline/idempotence controls pass, but an actual
unsupported ancestor Git control varied in the shared temporary namespace.
The permitted stable environment and final candidate gate remain open.
Observation writes no migration; older unreadable decisions without retained
independent proof require explicit recovery. The item stays open.

The final bounded correction course reproduced and fixed historical-witness
handling under proof-store failure, including a valid decline learned through
a root alias. Four final relevant cases pass; the same-controller diagnostic
witness grants no current write authority. Fresh double authority damage with
no independent observable enrollment remains an explicit recovery limit.
The full23 environment qualification above remains open, and this targeted
correction does not close the item.

Independent targeted verification reproduced F1/F3/F6/F7/F8/F9 and the F10 budget
footprint on the current source. See the
[tracked diagnostic evidence](../evidence/2026-09-28-activation-uninstall-targeted-verification.md).
This does not promote the complete handover matrix to independently verified
native-runner evidence.

- **Decision:** Accepted into the next local 0.7 candidate by explicit PO request.
  On 2026-09-28 the PO also confirmed that Git process conventions, including
  commit trailers and the Pipeline publication route, apply only to repositories
  that explicitly chose the Pipeline. Destructive Git protection remains global;
  the installation hint is suppressed after a durable decline.
- **Rationale:** Global availability must not activate project governance or leave
  unsolicited state in another project. The supplied 334-run report is intake
  evidence; independent targeted reproduction and governed-path regression
  coverage are still required before closure.
- **Assignment:** Governance-scope slice, followed by runner entrypoint integration
  and a registered inertness regression suite. Shared interfaces precede changes
  to overlapping hooks. Coordinate decline semantics with the uninstall item and
  activation diagnostics with the Agy imported-snapshot item.
- **Date:** 2026-09-28
- **Scope record:** [Candidate scope intake](../evidence/2026-09-28-candidate-scope-intake.md).
