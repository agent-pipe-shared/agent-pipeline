---
schema: pipeline.backlog-item.v1
id: pipeline.codex-greenfield-report-findings
type: defect
owner: pipeline
status: open
created: 2026-11-09
source: forensic analysis written by the Codex greenfield run on build 0.7.0+codex.20261109080736.4b9add3, secured on PO request 2026-11-09; the report itself stays in that private consumer repository
sprint: alfred
done_when: manual
---

# Findings of the Codex greenfield forensic report (build 20261109080736.4b9add3)

## Description

The Codex greenfield run delivered, pushed and then analysed itself. Its report judges the state as fit for a limited pilot once the P0 findings are fixed, not for a mandatory rollout to critical banking teams. This item keeps every finding so none lives only in a private repository or in chat. The run changed builds several times, so each finding is checked against current code before anything is built for it.

Status words: `built-c21f` is implemented in the held candidate 21f and not yet applied. `earlier-fix` is addressed by an earlier candidate, with the live proof named if still missing. `open` needs work. `po-decision` needs a Product Owner tile. `no-action` is method or product observation with nothing to change.

## Priority findings

| ID | Finding | Proposal in the report | Status |
|---|---|---|---|
| CGF-01 | P0. Forensics cannot be fully reconstructed: the prior-session scan stops at 2000 candidates, the active main session and child raw text are not exportable. | Project-bound read-only export of all own segments and children with cursor, completeness manifest, hashes and privacy consent. Missing raw data reads "incomplete", never 0. | built-c21f: the bound now keeps the newest sessions (it cut in filesystem order). Measured: recovery already lists children and reports `complete` or `partial` with reasons. Raw export of the active session and children is a po-decision |
| CGF-02 | P0. The official tool counter miscounts the real Codex format: `custom_tool_call` was not counted. | Adapter for both call forms, anonymised real rollout fixtures, structured nested calls, turn end on real task-end markers. | built-c21f for the count; nested calls, fixture and turn end open |
| CGF-03 | P0. Independence and test-first assurance must not be upgraded in wording: the receipt says `freshContext:false`, `historyInherited:true`, `caller-authored-fallback`; test-first is self-attested. | Check native role and provenance before dispatch. Critical profile blocks or takes a deliberate exception up front. UI and reports show the receipt's assurance. | po-decision taken (second Codex role `critic-high-risk`), Slice A; pre-dispatch check open |
| CGF-04 | P0. Close must not become unresolvable through its own evidence commits (dirty tree at signing, then `FCA-PACKAGE`, then a refused completed-to-verifying move). | Transaction plan Freeze, Verify, Audit, Signature, Close; idempotent conservative candidate rebind; integration test over the whole CLI flow. | earlier-fix (21c requalify, 21e addenda before Verify, dirty-path note); live close and whole-flow test missing |
| CGF-05 | P0. Provenance of security verdicts: green with OSV not applicable and licences skipped; v2 is report-only. | Show "PASS with not applicable/skipped". Critical profile fixes mandatory checks and exceptions and enforces execution. | display exists (`Security close status`, `reportStatus`); mandatory scanners po-decision |
| CGF-06 | P1. Generated metadata repeatedly blocks scanners and classifiers: `CCI-MIXED` after a historic document move, gitleaks hits on generated review digests. | Classify own generated artefacts by verifiable schema, separate digest from credential fields, judge renamed documents consistently. No blanket ignore, no history rewrite. | earlier-fix: the run's own record says an official update resolved `CCI-MIXED`, and PO decision 2026-11-01 ships a narrow ignore for the Pipeline's close artefacts. Schema-based classification not built |
| CGF-07 | P1. Lifecycle recovery must be a normal agent step: `SDC-REQUESTER-UNAVAILABLE` and `WT-ORPHAN-ARCHIVE-OWN-SESSION` kept the same active session from re-entering. | Tell own active from foreign orphaned descriptors, check offered recovery for executability beforehand, durable waiting state with event wakeup after an unchanged hard block, no status polling. | earlier-fix for re-entry (a later installed build returned `ready`); the repeat-check loop stays open with CGF-22 |
| CGF-08 | P1. Architecture projection and blocking fitness diverge: stored projection `observed-open` while the narrow check is green; after close orientation says `adoption-required`. | Label every architecture verdict with candidate, observation date, scope, blocking or report-only; one current projection for preflight, plan and Verify; losing active feature references at close is not losing accepted architecture. | built-c21f for the close part (see CGF-30); labelled verdicts and the single projection open |
| CGF-09 | P1. Approved architecture bytes need a governed change route: the coordinator edited the signed map for a regression test, later reverted. | Show the approved digest and the permitted route before a map or policy edit; typed "new decision or exact exception" route at the edit. | po-decision. Measured: no guard refuses or annotates an edit under `architecture/`; `ARCHITECTURE-DESIGN-ARTIFACT-DRIFT` only catches it at the next inspection |
| CGF-10 | P1. Harmless reads need a robust simple interface: search filters and a numbered file excerpt were refused, one with a signed override offer. | Separate unknown syntax from dangerous action; no signature for a file excerpt. | several `-g` filters are admitted in current code (earlier-fix). Open po-decision: the read grammar does not know `nl`, so `nl -ba file \| tail` draws a signed-override offer, and `rg x dir/*.ext` is refused. built-c21f: `nl` is admitted and a reader-only pipeline no longer offers a signature; shell-glob operands stay refused |
| CGF-11 | P1. Limit extra PO work to real decisions: the PO moved a file by hand and installed official fixes; signing failed once on workflow-made dirty state. | Reuse actor and intake answers, agent does all preparation, only tested copy commands, check key directory, trust, clean tree and candidate binding before the signing prompt, automate recovery. | key and trust probe exists (`probeSigningReadiness` in the toolchain preflight), push has a clean-tree precheck, 21e2 names the dirty paths at acknowledgement, printed signing lines tested in built-c21f; reuse of intake answers and hand-step removal open |
| CGF-12 | P1. Documentation and CLI drift: documented `push-prepare --close` got only usage; `docs/state.md` keeps active rows after close. | Test documented commands as a CLI contract, project status from receipts, separate product acceptance, technical close and push in the final report. | built-c21f for `--close` and a flag contract test over the push flow document (no drift found); status projection open |
| CGF-13 | P2. Reader rounds out of proportion for small consumer documents. | At most two rounds, one bundled finding set, explicit end; no full course for evidence-only commits. | open. Measured: the skill defines two paired rounds plus one justified third, so the round bound exists at three; the evidence-only exemption is not established |
| CGF-14 | P2. Effort recorded by role heuristic rather than events. | Store PO-to-answer and child intervals, tokens per answer with cache, model, phase and a/b/c class; fixed delivery cutoff before analysis. | open |

## Loops and PO interventions

| ID | Event | Classification in the report | Status |
|---|---|---|---|
| CGF-15 | Onboarding first in the sandbox (`EPERM`), identical host call then worked. | Agent error at the execution boundary. Route correctly from the first call. | open, check whether the action's boundary is printed clearly enough |
| CGF-16 | Mandatory restart before product work, an extra human terminal step. | Expected runtime boundary; a technically secured handoff could shorten it. | open |
| CGF-17 | After foundation delivery a stale agent and authority assignment; PO moved a file by hand. | Pipeline recovery problem. | earlier-fix (`heal`, `move-aside`); check that no PO hand step remains |
| CGF-18 | Historic document rename blocked the first Critic input; a suggested branch rename was refused. | Classifier fault plus wrong repair suggestion. | earlier-fix, with CGF-06 |
| CGF-19 | Project-bound push description clear only after another review. | Documentation gap and agent error while materialising; a correct local template would have saved the last round. | open |
| CGF-20 | Caller-authored Critic needs its own acknowledgement only late in close. | Avoidable late discovery. | with CGF-03 |
| CGF-21 | Push-init lacked the canonical Verify file; an earlier green run was not the canonical push evidence. | Expected precondition, path and flow friction. | open |
| CGF-22 | Automatic continuations re-checked a missing push signature and repeated the same request. | Avoidable orchestration work at a real human gate. | partly earlier-fix (bounded proof wait); Codex goal continuation open |

## Operating-model comparison and audit

| ID | Finding | Status |
|---|---|---|
| CGF-23 | Reports need candidate, gate effect, scope and current or superseded label; open report-only classes beside the blocking PASS. | with CGF-08 |
| CGF-24 | Read isolation is only declared: observe read permission and provenance at runner or tool level and report it separately from declared scope. | open |
| CGF-25 | Audit package is not portable: evidence spreads over `specs/.../evidence/`, ignored `evidence/`, `scratch/` and private stores. Close should produce a redacted transportable export (index, candidate and tree, mandate and changes, binding approvals, provenance, test and scanner scope including skips, review chain, acceptance status, publish readback), with missing files machine-checked. | open; 21e2 adds the evidence index and acknowledgement proof |
| CGF-26 | Dispatch records count only host launch and return; separate worker usage receipts and per-turn events are needed. | open |
| CGF-27 | Test-first order is self-attested; the first correction carried no test-first block. Do not report it as observed order. | open |
| CGF-28 | `chat-gate-ceremonies/*.terminal-observed.json` records entry lifecycles, yet its name reads like chat approvals. | open |
| CGF-29 | Generate the handover as a compact current projection and keep history apart (`docs/state.md` stayed at an intermediate state). | with CGF-12 |
| CGF-30 | Close should not read "adoption-required" merely because active feature references were cleared. | built-c21f: the receipt of a closed feature stays the accepted design while plan and targets are byte-equal; orientation only, the planning gate still needs an approval in force |

## Method notes for transcript forensics

| ID | Note | Status |
|---|---|---|
| CGF-31 | Naive string matching counts error codes quoted in loaded documentation as refusals; only call and result pairs count. | built-c21f in `references/transcript-forensics.md` |
| CGF-32 | Summing tokens: only per-response usage, never both record forms or cumulative counters. | built-c21f, same reference |
| CGF-33 | A child's prior-session selector was refused with `MODEL-ROLE-SESSION-IDENTITY-CONFLICT`; the parent had to capture the source. | open |
| CGF-34 | A Git-ignored `evidence/` and absent backlog make a close's backlog comparison unprovable in a consumer without a backlog (empty digest in tracked close). Report says do not backfill. | no-action |
| CGF-35 | Number of source updates during one approved change is itself a release and reproducibility risk from a bank's view; rollout needs a pinned build. | open, release criterion |
| CGF-36 | Runner, hook and trust setup should be provisioned centrally rather than repaired per team. | open |

## Straight-run system tests proposed by the report

A pinned build should pass these without a private manual file operation and without a source update:

1. New consumer repository, bundled intake, every answered value reused, successful re-entry, no lost material input.
2. Complete design package and required design signature, then autonomous implementation with disjoint dispatches and a built-in integration owner.
3. Critic role attested beforehand, one continued review chain with bounded deltas, honest test and provenance assurance, no late surprise signature.
4. Own generated evidence handled correctly by scanners and classifiers; freeze, Verify, signature and close stay idempotent despite own audit commits.
5. Session transfer and real push with remote readback without endless loops; human gates rest until the event; harmless reads stay possible.
6. An auditor can reconstruct all main and child events, the three effort pots, active time, skipped checks and the approval scope, redacted and complete; the parser knows the real Codex format.

## Product comparison (no Pipeline change)

The report's A/B comparison credits the Pipeline variant with read-back confirmation, partial-corruption recovery, validated image import, a persistent chore ledger and locking on unreliable storage. It rejects a numeric cost ratio as unproven and notes that real Android acceptance is pending for both variants.

## Scope decided by the PO on 2026-11-09

Every finding was weighed against current code before this split.

- **Candidate 21f:** all open P0, P1 and P2 findings, CGF-01 to CGF-14, with their dependents CGF-20, CGF-22, CGF-23 and CGF-29. Quick wins on top: CGF-19, CGF-21, CGF-28 (explain the name, no rename across roughly 90 uses), CGF-33 and CGF-35 (a pinned build as a release rule, documentation only).
- **CGF-01:** 21f keeps the repaired count and the "incomplete" label. The raw export of active and child sessions moves to 0.7.1 together with the audit package CGF-25.
- **CGF-05:** in the critical profile a `skipped` scanner blocks the close unless a named exception was recorded beforehand. `not applicable` stays allowed with a reason. Other profiles are unchanged.
- **CGF-09:** an edit of an approved architecture file gets a notice naming the permitted route, and the existing drift check keeps blocking later. No hard refusal and no reopen route.
- **CGF-10:** the read grammar admits `nl`, and a pipeline of readers only no longer offers a signed override. Pipelines with a writing part stay as they are. Shell-glob operands stay refused because `-g` covers them.
- **Version 0.7.1:** CGF-16, CGF-24, CGF-25, CGF-26, CGF-36 and the automated straight-run tests 1, 2, 3 and 5. Straight-run test 4 belongs to CGF-04.
- **Nothing further:** CGF-15 (agent error, the boundary rule is documented), CGF-17 and CGF-18 (earlier fixes, recheck in the next greenfield), CGF-27 (the record already says `self-attested; ... the order of events was not observed`), CGF-34.
- **Left as they are:** a test-only correction after a passed Critic round keeps its bounded delta round, and the push guard exception for `git rev-parse <commit>^{tree}` is not widened.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** the PO asked on 2026-11-09 for every finding to be secured and worked through.
- **Assignment (if accepted):** candidate 21f and later; the tables carry per-finding status.
- **Date:** 2026-11-09
