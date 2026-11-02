# Signing-preparation parity audit across the runners (C18-21, 2026-11-02)

Status: read-only audit, no code changed. Criterion binding: AC-262 is the closest existing accepted criterion; the PRD and
the Spec are unchanged. Basis: the applied chain (repository plus held patches w83 and w100). Findings that depend on w83 or
w100 say so; the real checkout does not contain those two patches yet.

Decision under audit (PO, 2026-11-02): the Antigravity finding "no short signing wrapper" is answered by parity. On every
runner (Claude, Codex, Antigravity) the agent may run every preparatory command of a human-signed gate and is told by the
texts it sees that it does, so only the sign-off in the terminal is handed to the PO. Rule source: `docs/push-release-flow.md`
"Quick reference" (about line 680; rows 2+3 `authorize-critical` are "PO only", the agent builds the command).

## 1. How the three runners reach the same guard (this makes most rows identical)

- Claude: `hooks/hooks.json` lines 54 and 63 run `hooks/guard-lifecycle-ready.mjs --runner claude` directly.
- Codex: `hooks/codex-pretool-guard.mjs` line 456 spawns the same `guard-lifecycle-ready.mjs --runner codex`.
- Antigravity: `hooks/antigravity-pretool-guard.mjs` line 922 spawns it with `--runner antigravity`; line 741 additionally
  consults the same catalogue (`isSanctionedLifecycleCommand`).
- All decisions about signing commands live in shared code, not in a runner branch: `lib/guard/evaluate.mjs` line 243 refuses
  `isHumanPoSigningCommand` (`lib/guard/po-commands.mjs` lines 61-64, list `HUMAN_PO_SIGNING_COMMANDS` in
  `scripts/po-human-approval.mjs` lines 975-983: setup, approve, approve-all, approve-critical, authorize-critical,
  sign-intent, approve-fork-disposition). Everything else is not in that list and is therefore not refused by this rule.
- In a READY session `lib/guard/lifecycle-gate.mjs` consults the sanctioned catalogue only on the not-ready branch (lines
  340-368); a ready session is not narrowed to the catalogue. In a NOT-READY session only the catalogue is admitted
  (`lib/guard/command-catalogue.mjs` `sanctionedLifecycleScriptArgs`, lines 453-560).
- Consequence: guard admission is identical on all three runners. Parity differences can only be in the texts each runner's
  hook adds to a refusal (section 3) and in docs. A live check on Codex and Antigravity hosts was not run: "not established".

## 2. Table per signing kind and runner

Columns: preparation command | admitted by guard | named to the agent by | gap. "All" means Claude, Codex and Antigravity
alike (shared guard, section 1).

### 2.1 Push

| Runner | Preparation command | Admitted (guard code) | Named to the agent by | Gap |
|---|---|---|---|---|
| All | `push-init.mjs` (chains reconciliation, satisfiability, `push-prepare`) | `PUSH_INIT_SCRIPT` in `command-catalogue.mjs` line 479, args `sanctionedPushInitArgs` (`sanctioned-args-scripts.mjs` line 139ff); admitted in not-ready state too | `docs/push-release-flow.md` line 684; `push-init.mjs` outcome `signature-required` lines 607-615 ("Run this at the PO's own attended terminal") | none |
| All | `push-prepare.mjs` (read only) | not in the catalogue (no `PUSH_PREPARE` constant); admitted only when the session is READY | same doc and the `push-init` outcome | guard (not-ready only) |
| All | `pipeline-state.mjs materialize-push-threat-model` | `sanctioned-args-scripts.mjs` line 437 | `push-prepare.mjs` line 310 names it; `prepare-push-subject` path does not (triage M5) | text |
| All | sign-off `po-human-approval.mjs authorize-critical` | refused by design: `evaluate.mjs` 243 / `po-commands.mjs` 61 | `push-init.mjs` 607-615; `docs/push-release-flow.md` 687 | none for the sign-off; the refusal text itself (section 3, G3) |
| All | `pipeline-state.mjs approve-push` (after sign-off) | READY: admitted; not-ready: only global chat mode (`sanctioned-args-scripts.mjs` 535-555) | `docs/push-release-flow.md` 688 | none |

### 2.2 Deploy / publication / release-preflight / feature-package-reconcile (the `--kind` family)

| Runner | Preparation command | Admitted | Named by | Gap |
|---|---|---|---|---|
| All | `po-human-approval.mjs prepare-critical`, `verify-critical` | not in the HUMAN list, so not refused; admitted when READY; in not-ready state the catalogue admits only `--help` for this script (`command-catalogue.mjs` line 460) | `USAGE` text of the script; `references/push-approval.md` for push only | guard (not-ready only), doc |
| All | the exact `authorize-critical` line for the PO | agent only needs to print text | push: `authorizeCriticalPushCommand` (`po-human-approval.mjs` 2057, used by `push-prepare.mjs` 895). Reconcile: `reconcileSigningRoute` (`pipeline-state.mjs` 6094-6135, `executed:false`). Deploy, publication, release-preflight: `templates/human-terminal-actions/catalog.json` lines 101-139, 161 mark them `legacy-renderer` with `builderId: null`; the generic builder `authorizeCriticalActionCommand` (2078) has no caller for these kinds | doc and code: no agent-side producer prints the command, the agent hand-formats it and computes `--subject-sha256` |
| All | sign-off | refused (same rule) | as above | none |

### 2.3 Critic-bound (residual acceptance, portable Critic export, Critic consent)

| Runner | Preparation command | Admitted | Named by | Gap |
|---|---|---|---|---|
| All | request producers (`critic-export-consent.mjs`, `portable-critic-export.mjs`, `prepare-critical --kind residual-acceptance --critic-packet`) | READY: admitted; not-ready: not in the catalogue | `po-human-approval.mjs` lines 2744 (request invalid text) and 1142-1145 (flags) | doc: no shipped text states "agent prepares, PO runs sign-intent --request" for this kind; established only by reading, not run |
| All | `sign-intent --request scratch/...` (sign-off) | refused (`sign-intent` is in the HUMAN list) | refusal text only (section 3, G3) | text |

### 2.4 Design approval

| Runner | Preparation command | Admitted | Named by | Gap |
|---|---|---|---|---|
| All | `pipeline-state.mjs inspect` offers the exact request; `approve-plan --design-approval-request scratch/design-approval-request-<64hex>.json` after the PO signed | `sanctioned-args-scripts.mjs` 495-517, admitted even when not ready | Antigravity: `antigravity-pretool-guard.mjs` 776-788 (self-approval refusal names the exact `approve-plan --design-approval-request` route). Claude and Codex: the same guard family (`guard-devplan.mjs`); the identical wording on those two was not established | text (Claude and Codex wording not established) |
| All | `po-human-approval.mjs sign-intent --request <request>` (sign-off) | refused | `antigravity` line 788; `pipeline-state.mjs` line 4654 | none |
| All | M2 (triage): refuse BEFORE the prompt when the approval-mode source is uncommitted | `po-human-approval.mjs` line 373 comment "A18-M2 (AC-264)" is present in the chain (w83); real checkout dependence: state before w83 still prints `(uncommitted)` and goes on | n/a | none after w83 (chain), guard before it |

### 2.5 Human-guard override (denial of a guarded Edit/Write/Bash)

| Runner | Preparation command | Admitted | Named by | Gap |
|---|---|---|---|---|
| All | `guard-human-override.mjs plan`, `prepare-for-signature`, `refreeze-plan`, `render-copy-safe`, `emit-signature-digest`, `prepare-authorization`, `verify-audit` | `sanctionedHumanOverrideArgs` (`sanctioned-args-scripts.mjs` 658-700); admitted in every lifecycle state (`command-catalogue.mjs` 550) | Claude: `hooks/guard-testpath.mjs` 338-352 and `guard-gate-strength.mjs` 727-729. Codex: `codex-pretool-guard.mjs` 607-611. Antigravity: `antigravity-pretool-guard.mjs` 1053-1054. All carry the same sentence "the agent runs prepare-for-signature ... the person then receives exactly one sign-intent command" | none (parity holds; the three texts are the same wording) |
| All | `authorize-by-signature --proof <external .json>` (import of the signed proof) | admitted (`sanctioned-args-scripts.mjs` 715-721), agent work | same three texts: "the agent imports the proof with authorize-by-signature" | none |
| All | `authorize` / chat attribution | `sanctioned-args-scripts.mjs` 722-731 (chat mode) | chat branch of the same texts | none |
| All | sign-off `sign-intent` | refused | the texts above | none |
| Codex | a plan that returns `external-operator-required` / `author-repair-required` | admitted for the plan itself | `codex-pretool-guard.mjs` 618-633 prints JSON | text: raw JSON, no sentence naming who acts (same on Antigravity 1062-1082; Claude route not read for this branch: not established) |

## 3. Gaps, ordered by PO terminal work caused

G1. Deploy / publication / release-preflight kinds print no ready-made `authorize-critical` line (2.2). The agent hand-formats a
quote-sensitive command with a self-computed `--subject-sha256`; a wrong digest or quoting error costs the PO a spent
passphrase. Fix: add `pipeline-state` or `push-prepare`-style producer calls to `authorizeCriticalActionCommand`
(`po-human-approval.mjs` 2078, already kind-parametric) for the three kinds and switch their `catalog.json` dispositions from
`legacy-renderer` to a builder. Files: `scripts/pipeline-state.mjs` (publication runner), `scripts/release-preflight-cli.mjs`,
`templates/human-terminal-actions/catalog.json`. Size: medium (about 80-150 lines plus tests). Most PO work saved: one signing
retry per mistake.

G2. Critic-bound sign-off has no shipped agent-facing statement (2.3). Fix: one paragraph in
`skills/pipeline-start/references/push-approval.md` (or a sibling reference) that lists, per kind, "agent prepares: ...; PO runs
only: ..." plus the `--request scratch/...` path rule. Size: small (docs only, about 30 lines).

G3. The refusal for a signing command, `externalPoSigningOnly()` (`lib/guard/po-commands.mjs` 16-22), reads "PO setup and
approve are human-terminal actions; the agent may prepare and verify only public request/proof artifacts". It names no next
command and says nothing about authorize-critical or sign-intent. An agent that attempts the sign-off (as the Antigravity run
did when it asked for a wrapper) is not told "hand this exact line to the PO". Fix: the refusal states "hand the exact command
to the PO; run its preparation steps yourself" and, when the command is `authorize-critical`, prints the copy-safe line via the
existing builder. Files: `lib/guard/po-commands.mjs` (protected plugin source; PO applies). Size: small (10-20 lines plus one
test). Same text on all runners because the guard is shared.

G4. `templates/prompts/agent-obligations.md` has no signing statement (section 6 is commit discipline only; the file is
generated, section 6 is hand-maintained in `harness/scripts/generate-agent-obligations.mjs`). Fix: one hand-maintained
section "Human-signed gates: prepare yourself, hand over only the sign-off" with the three runner-independent rules.
Size: small (about 12 lines plus the pinned byte-equality test).

G5. `config/runner-capabilities.json` has no "Signing preparation" row (the eight rows read cover dispatch, budget, record,
close and push second gate only). Fix: add one row with the same value for all three runners ("agent runs every preparation
command; sign-off is the PO's"), owner `docs/push-release-flow.md`; the `happy-path.md` table is checked against this file, so
update both. Size: small (about 10 lines plus the existing check).

G6. Not-ready sessions: `push-prepare.mjs` and `po-human-approval.mjs prepare-critical` / `verify-critical` are admitted only
when READY (2.1, 2.2). Impact is low because signing is a late-phase act; add only if a not-ready signing case is shown.
Size: small per command (one catalogue line), but touches protected guard code: PO applies.

G7. `external-operator-required` and `author-repair-required` branches print raw JSON on Codex and Antigravity
(`codex-pretool-guard.mjs` 628-633, `antigravity-pretool-guard.mjs` 1076-1082): no sentence says who acts next. Size: small
(two lines per hook). Protected plugin source.

G8. Triage M5 (threat-model remedy on the `prepare-push-subject` path) remains a text gap; already planned (slice 14).

## 4. Not established (would need a live run or a host check)

- Whether the Codex and Antigravity host prompts add a second classifier before a guard-admitted preparation command (the
  capability row "Push second gate" says "runner prompt, not measured").
- Whether `guard-devplan.mjs` carries the same self-approval wording on Claude and Codex as the Antigravity hook line 788.
- The Claude-side wording of the `external-operator-required` branch.
- Behaviour of any signing command at run time: none was run, no request was seeded, no override state was touched.
