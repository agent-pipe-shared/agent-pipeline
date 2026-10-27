# Recon notes: D52, D43, D45 - which commit gate refused the Elephant (PARTIAL)

Slice W7-RECON-ELEPHANT-COMMIT-GATE-CAUSE-C1-20261027. Read-only recon, no patch, no test change. Candidate cb051a3a3. Cut at the 80 % budget checkpoint (counted call 28 of 35); items marked NOT REACHED were not read. No clone/driver was created (no patch is delivered).

All paths under `plugins/pipeline-core/` unless stated.

## 1. The commit gates (Q1)

### 1.1 Pre-commit hook (onboarding-installed backstop)
Source: `scripts/pre-commit-hook-install.mjs` (generated `impl.mjs`; `main()` at line ~957). Order of refusals in `main()`:

1. `snapshotIsStale()` (line 958, rendered by `lib/hook-currentness.mjs:68-93`). The installed hook records the content-addressed runtime snapshot it was rendered against (`<state>/runtime-<sha256>/lib`). It is stale when the recorded sha256 differs from the manifest digest of the plugin tree loaded now (`assessHookCurrentness`, `hook-currentness.mjs:95-107`). Any plugin change after the last install makes it stale; an unassessable comparison against an existing source is stale (fail closed). Refusal: `HOOK-SNAPSHOT-STALE` plus the one refresh command `node <plugin>/scripts/refresh-mandatory-hooks.mjs --root <repo>`. Applies to EVERY commit, including a plain `docs/state.md` commit, whenever the plugin tree moved since the install. This is the most likely cause of a refusal that has nothing to do with the file committed.
2. Root/common-dir unresolved, staged diff unenumerable: fail-closed block (lines 961-970).
3. Private-identifier scan of the staged additions (`scripts/check-private-identifiers.mjs`, lines 975-985): "staged content contains private local identifiers". A `docs/state.md` or pipeline-doc edit that pastes a machine-specific absolute path or similar triggers it. Also fails closed when the scanner is unavailable.
4. Observation/document governance (`lib/staged-observation-doc-classification.mjs`, lines 989-999): `staged observation/document governance refused: <codes>`, only in repositories carrying the observation-document policy.
5. Rule-module load failure (line 1019), fail closed.
6. Handover size cap (lines 1023-1054): refuses when the staged `handover.path` (here `docs/state.md`) is at or over `handover.maxBytes` AND the commit is not a net decrease versus HEAD. Unmeasurable size also blocks. Remedy named in the message: rotate with `handover-rotate.mjs`, or commit a smaller version.
7. Protected paths (lines 1056-1135): `gateStrengthRuleFor` (GS-1..GS-5, GS-7..GS-15 in `hooks/guard-gate-strength.mjs:99-187`: `pipeline.user.yaml`, `project/critical-human-proof.json`, `project/pipeline.yaml`, `project/guard-config.json`, `.claude/pipeline.yaml`, `.claude/guard-config.json`, two plugin lib files, `project/pipeline.json`, `.claude/pipeline.json`, `pipeline.json`, policy locks, `project/.onboarding-staging/*`) and the protected test-path rules (TP-1..TP-13). Refusal text "N staged path(s) are protected and carry no matching consumed human-guard-override capability", followed by the commit-scoped override course (`PB-COMMIT-OVERRIDE-*`, AC-258) when the paths are eligible. Exemptions: quality-package authorization, calibration verify transition, maintenance window, consumed capability, first appearance in history, trust-anchor bootstrap.

IMPORTANT finding: `docs/state.md`, `CLAUDE.md`, `docs/`, `policies/`, `roles/`, `templates/` are NOT in the gate-strength table and NOT test-path patterns. The pre-commit hook therefore does NOT treat them as protected paths. For those files the only pre-commit refusals possible are items 1, 3, 4, 6 (snapshot, private identifiers, observation governance, handover size).

### 1.2 commit-msg backstop (GIT-03)
`guardrails/git.md:30-47`: final contiguous trailer block; correlation data always blocks; when either `AI-Assisted:` or `Dispatch:` is present both must form one complete grounded pair. The same `HOOK-SNAPSHOT-STALE` check is rendered into commit-msg (`pins/git-hook-runtime-snapshots-go-stale-after-plugin-changes.test.mjs:70-74`, AC-179). Codes seen in `hooks/guard-git.mjs` (agent-issued commit lane): `GIT-03-MARKER-MISSING`, `GIT-03-MARKER-AMBIGUOUS`, `GIT-03-DISPATCH-MISSING`, `GIT-03-DISPATCH-AMBIGUOUS`, `GIT-03-DISPATCH-MALFORMED`, `GIT-03-UNREADABLE-MESSAGE-FILE`, `GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED` (+ `GIT-03-ADMINISTRATIVE-*`), `GIT-03-INTEGRATION-EVIDENCE-REQUIRED` (+ `GIT-03-INTEGRATION-*`) (lines 1042-1114).

### 1.3 Binding table (what admits what)
Source of the bindings: `guardrails/git.md:30-70`; verifier `scripts/dispatch-authorship-verify.mjs`.

| Commit content | Refusal code that can arise | Cause | Admitting route |
|---|---|---|---|
| `docs/state.md` | `HOOK-SNAPSHOT-STALE` | plugin tree moved since hook install | `refresh-mandatory-hooks.mjs --root <repo>` (a refresh, not a bypass) |
| `docs/state.md` | handover size (pre-commit item 6) | staged size >= cap and not a net decrease | rotate (`handover-rotate.mjs`) or commit a smaller version |
| `docs/state.md`, any pipeline doc | private-identifier finding | staged text carries a private identifier | remove it |
| `docs/state.md` | `GIT-03-DISPATCH-*` / `GIT-03-MARKER-*` | missing/ambiguous trailer | any honest binding below |
| `docs/state.md` | trailer binding | not covered by `administrative (elephant)` (only backlog items, `backlog/transitions.ndjson`, STATUS/index, planning Markdown under `specs/<topic>/`); stage-0 admits it only within 2 files and ~25 lines; `design (elephant)` only in design phase, at most 10 paths | stage-0 for a small edit; otherwise `D<n> (elephant-exception)` (PO decision) or a Goldfish record |
| `CLAUDE.md`, `docs/`, `policies/`, `roles/`, `templates/` | same as above (no protected-path rule) | same | same |
| intermediate feature state (code, tests, hooks) | `GIT-03-*` binding; GS/TP findings only if a protected path is staged | no sanctioned Elephant binding | Goldfish `(goldfish)` record, `Commit-Act: orchestrator` if the Elephant ran the act; otherwise PO exception |
| gate-strength or test-path file | `N staged path(s) are protected ...` + `PB-COMMIT-OVERRIDE-*` | GS-n/TP-n | signed override course, quality package, or maintenance window |

Stage-0 limits: at most `ELEPHANT_STAGE0_MAX_PATHS` paths (`dispatch-authorship-verify.mjs:146-149`, enforced `:398`); the "about 25 lines" limit is operating-model §3.3 and is NOT machine-checked by the verifier (it checks path count only).

### 1.4 Which gate led to --no-verify
NOT measured. No session log of the refusal was read. The code evidence supports two candidate causes for a refusal on `docs/state.md` that an agent would be tempted to bypass: (a) `HOOK-SNAPSHOT-STALE` (affects every commit, appears after any plugin change, remedied by one refresh command) and (b) the handover size cap. A binding refusal (GIT-03) is NOT a pre-commit refusal on the hook side; it comes from the guard lane before the commit runs. Confidence in (a) as the usual cause: medium; no direct evidence.

## 2. Commit-Act: orchestrator (Q2, partial)
- `templates/prompts/goldfish-task.md:589`: an optional third trailer line, set ONLY when the orchestrating Elephant ran `git commit` instead of the dispatched Goldfish (e.g. finishing a truncated dispatch, `roles/elephant.md` EL-13a). `Dispatch:` evidences who authored the diff, `Commit-Act:` who performed the commit act; independent.
- `templates/prompts/critic-review.md:443` tells the Critic to read it as the commit act, not the author.
- `lib/native-goldfish-host-state.mjs:1497` (D40b): the commit may carry `Commit-Act: orchestrator` or be the Goldfish's own; both count toward the dispatch's scope.
- `lib/close-authorship-record.mjs:8`: the close route no longer scopes its Critic gate by dispatch records alone; it also reads this trailer.
- Pinned by `lib/native-goldfish-host-state.test.mjs:789-835` and `lib/pins/close-coordinator-refuses-a-required-critic-without-evidence.test.mjs:274`.
- NOT REACHED: whether the commit-msg backstop or guard-git validates the `Commit-Act:` value or position.

## 3. v3 record as Critic-admission or push evidence (Q3, NOT REACHED)
Only this was read: `dispatch-authorship-verify.mjs:529-549, 766` accepts v4 and v3 records (`record-v3` contract check), treats v2 as readable but non-binding for new delivery ("a v3 disposition is required"), and pre-v3 as `record-pre-v3-nonbinding`. So a v3 record still BINDS for authorship verification. `critic-dispatch-preflight.mjs` has no matching hit for dispatch-record schema handling; `lib/critic-course-admission.mjs` was not opened (the single grep returned only the preflight file; the lib path may not exist under that name). The Critic admission reader and the signed-push check were NOT located.

## 4. Installed plugin copy registers SubagentStop (Q4)
Measured, read only: the marketplace copy the hooks run from (`agent-pipeline-local-marketplace/plugins/pipeline-core/hooks/hooks.json`) contains `"SubagentStop"` at line 143 and the same two `$comment` lines at 145 and 157 as the repository copy (`hooks/hooks.json:143-157`). The registration is present in the installed copy; hypothesis H2 of the PF-82 note (installed copy lacks the entry) is NOT supported. Not compared: the full file contents beyond those lines.

## 5. Gap list
| # | Gap | Tag |
|---|-----|-----|
| H1 | Stale pre-commit/commit-msg snapshot refuses ordinary commits with no hint of a safe route for an agent beyond the refresh command; an agent may read it as an obstacle and reach for `--no-verify` | code-fixable-here (message should state "refresh, never --no-verify"; check the text of the refusal) |
| H2 | No Elephant binding for `docs/state.md`, pipeline files and intermediate feature states | po-decision (unchanged from PF-82 note G7) |
| H3 | stage-0 "about 25 lines" is not machine-checked; only the path count is | po-decision (is a line bound wanted) |
| H4 | Handover size refusal is correct but its remedy depends on rotation extraction acknowledgment (CLAUDE.md rotation rule) | po-decision / process |
| H5 | PF-82 note H2 (installed copy lacks SubagentStop) refuted | closed by measurement |

## 6. Minimal slices (code-fixable)
- Slice E (H1): `scripts/pre-commit-hook-install.mjs` and the commit-msg installer: append "Do not use --no-verify; run the refresh command" to the `HOOK-SNAPSHOT-STALE` text rendered in `hook-currentness.mjs:89`. Files: `lib/hook-currentness.mjs`, `lib/pins/git-hook-runtime-snapshots-go-stale-after-plugin-changes.test.mjs`. RED: the stale refusal text names the refresh command and states that bypassing is forbidden. Subject: `fix(hooks): tell a stale-snapshot refusal not to be bypassed`. Needs a re-read of the exact current text first (not done).
- Nothing else is code-fixable without a PO decision.

## 7. Confidence
- High: the pre-commit refusal list and order; docs/pipeline files are not gate-strength protected; installed hooks.json registers SubagentStop.
- Medium: that HOOK-SNAPSHOT-STALE or the handover size cap, rather than a trailer binding, led to the --no-verify workaround.
- Low / NOT REACHED: the exact session refusal, the Critic admission reader, the signed push check, whether `Commit-Act:` is validated.
