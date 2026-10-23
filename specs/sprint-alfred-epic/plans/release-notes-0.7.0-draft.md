Draft, not published, not PO-accepted.

# Release notes 0.7.0 (draft)

This is a draft for the `0.7.0` release candidate. It is not a release, a Git tag, a marketplace publication or a production-installation recommendation. Every claim below carries its source in an HTML comment so that a reader can trace it; a claim that no source supports is left out. Where a change is described as "held for the operator sitting", it is built and measured in a clone but not yet applied to the candidate tree.

<!-- source: docs/overview.md#the-next-release-line-070 -->
<!-- source: specs/sprint-alfred-epic/evidence/sitting/README.md#before-the-first-command -->

## Highlights

### Staged architecture adoption for existing repositories

- An existing repository can adopt the architecture standard in stages, starting with a read-only adoption status and proposal, instead of all at once. <!-- source: docs/overview.md#the-next-release-line-070 -->
- The scope adds a machine-readable architecture map, baseline and fitness checks, and typed architecture impact at feature close. <!-- source: docs/overview.md#the-next-release-line-070 -->
- The adoption CLI is present only where the installed plugin contains it; read back the installed plugin version and root in a fresh `pipeline-start` session first. <!-- source: docs/overview.md#the-next-release-line-070 -->
- A capability entry for the architecture adoption and fitness checks is prepared for the capability inventory and is applied at the operator sitting. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-43-finding-64 -->

### Guided adoption on three runners

- The documented Greenfield route (an empty directory to the first implementation step) is covered for Claude, Codex and Antigravity. <!-- source: docs/overview.md#the-next-release-line-070 -->
- The public Driver leads the route through its returned actions, keeps resumable onboarding context and installs a real verify setup. <!-- source: docs/overview.md#the-next-release-line-070 -->
- Scoped parallel delivery is part of the same model. <!-- source: docs/overview.md#the-next-release-line-070 -->

### Durable delivery governance

- Explicit human decisions, evidence bound to the candidate commit, deterministic gates before review, safe boundaries for external actions and recoverable public records are the integrated foundation of this scope. <!-- source: docs/overview.md#the-next-release-line-070 -->
- Receipts bound to the candidate commit and validated packages can support an audit trail; they do not certify compliance or replace an auditor. <!-- source: docs/overview.md#overview -->
- Missing, stale or malformed evidence, and evidence that does not match the candidate commit, stays a typed non-success. <!-- source: docs/overview.md#the-next-release-line-070 -->

### Refusals that name their repair

- A read of a protected credential location is refused with the typed code `GUARD-READ-CREDENTIAL-TARGET`. It names the path as the cause and states the repair: a human places the needed content in a non-credential file inside the project, or releases that one path by a signed one-time override where the override planner offers a route. The shell route, the Claude native read tools and the Antigravity native read tools print this code. <!-- source: docs/security-controls.md#guard-read-credential-target -->
- The refusal for a dirty push-approval record in the pipeline state file names the working form. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-7-row-7 --> <!-- source: git:7e08f3c4a -->
- The refusals for chat-mode `approve-push` with a session-authority catalogue and for an unavailable machine-plane trust anchor are to carry a concrete runnable repair and the missing home directory. This is held for the operator sitting. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-7-rows-1-2 --> <!-- source: specs/sprint-alfred-epic/evidence/sitting/runbook.md#32-pro-c35-k103 -->
- The closed shell grammar admits the bounded `git show ... | head -N` form; every other pipe stays refused. This is held for the operator sitting. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-6-row-15 --> <!-- source: specs/sprint-alfred-epic/evidence/sitting/runbook.md#31-pro-c34-k98 -->

### Safer parallel work

- When you dispatch in parallel, the dispatch guard refuses by default a Goldfish dispatch whose declared write scope overlaps another dispatch in the same call or one that may still be writing in the working tree. The refusal names the overlapping paths and the repairs; read-only dispatches are not judged and a scope that cannot be read only warns. <!-- source: docs/parallel-work.md#when-parallel-work-helps --> <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-2-row-25 -->
- The briefing generator applies the same overlap check when it binds a dispatch. <!-- source: docs/parallel-work.md#when-parallel-work-helps -->
- Cancelled slices can carry a cancel class (`take-over` carries one `--class` for all freed slices), and the briefing generator requires a recon-note reference before a same-slice re-dispatch after a `wrong-premise` stop. These are held for the operator sitting. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-3-rows-22 -->

### Scanner findings with provenance

- For a Semgrep scan that completed and reported findings, the scanner diagnostic record carries per finding (at most 20) the rule id, the repository-relative file and line, and an evidence fingerprint (a short hash prefix of the matched text and its byte length). It never carries the matched text, a snippet or the finding message. <!-- source: docs/security-controls.md#scanner-diagnostic-record --> <!-- source: git:0eaba7e3f -->

### Setup, installer and Antigravity route

- `clone-hook-readiness --apply` refreshes stale mandatory hook snapshots. <!-- source: git:57c12ecc0 --> <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-7-row-10 -->
- Setup documents the Antigravity route from what the installer does: the installer's **Global topology refresh** choice is the documented default, Workspace-Local is the documented alternative. <!-- source: SETUP.md#antigravity-agy-workspace-local-binding --> <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-43-finding-8 -->
- The consumer documents state that the Driver asks for Advisor export consent and that nothing is exported without recorded consent. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-43-finding-60 -->

### Review receipts

- The review receipt can carry an optional, closed `fallback` field that records a self-dispatch fallback route. This is held for the operator sitting. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-41 --> <!-- source: specs/sprint-alfred-epic/evidence/sitting/runbook.md#44-pro-k128-fallback-record-on-the-review-receipt -->

### Capability inventory at a glance

The product capability inventory lists these capabilities and statuses. <!-- source: docs/product-capability-inventory.json#capabilities -->

- Shipped: command and write-path guardrails; deterministic verification; human accountability roles; parallel Sprint promotion gates; pipeline update channels; session and delivery skills; setup and runtime projection; specialist delivery agents; V3 routed duties; V3 work profiles; handover hard size gate; critical human authorization ceremonies; continuity and handover tools; capability-bounded AFK workers; error-register quality gate.
- Host-dependent: Codex host safety bridge.
- Optional (an operator or caller invokes them explicitly): governance extension examples; plugin distribution and publication controls; release planning controls; project starter templates; generated agent obligations; governance event ledger; agent decision journal; audit and evidence command-line tools; change-control command-line tooling; security control catalog and waivers; SBOM and provenance contracts; AI-assisted change hardening; refusal repair guidance; local worker supervision; cost and benchmark command-line tools; organization policy packs; external traceability adapters; human guard override and maintenance window; documentation quality gates.

## Known limits and host limits

- **Windows file-permission checks are verified on Linux/WSL only.** The Windows cases for these checks stay typed skips. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-10-d133-items -->
- **Read blocks and the credential-target refusal on native Windows are unverified.** The Windows behaviour of the credential-target refusal and the shared `git show` lane are on the native-host canary list. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-38 --> <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-6-row-16-m7 -->
- **Scanner diagnostic suffix.** The suffix (rule id, location, evidence fingerprint) was built additively as optional fields of the existing record. The wording of the private suffix it relates to was unreadable and is unchecked; this decision supersedes the earlier decision that moved the suffix to a later 0.7.x release. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-9-k13-ac-249 --> <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-35 -->
- **Antigravity.** The documented route is the global installer choice. Which workspaces Agy loads for a global registration is not verified from the code; the Antigravity run checks it. Before the release tag is published there is no Antigravity route. The first acceptance of the Antigravity driver and design routes, the parallel-write recheck and the imported-plugin-snapshot behaviour are folded into that run. <!-- source: SETUP.md#antigravity-agy-workspace-local-binding --> <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-43-finding-19 --> <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-8-row-18 -->
- **Advisor export.** The Advisor export asks for consent and exports nothing without recorded consent. No default is stated. A real Codex/WSL run of the required Advisor route is still missing. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-43-finding-60 --> <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-6-row-16-codex-wsl -->
- **Policy packs.** The documentation does not say where an approved organization policy pack comes from; this gap is accepted and needs analysis by its owner. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-43-finding-49 -->
- **Architecture map currency.** The completion report states that the productive push wiring, the durable checkpoint debt and its consumption at the next planning boundary were not yet built when it was written, and that the repository's own adoption was deferred. This draft has not re-checked that against the current tree. <!-- source: docs/sprint-alfred-completion-report.md#1-executive-summary-zielerreichung --> <!-- source: docs/sprint-alfred-completion-report.md#wp-d3 -->
- **Runner enforcement.** A common methodology does not mean that every host has identical native hooks, sandbox isolation, model identity or platform coverage. <!-- source: docs/overview.md#the-next-release-line-070 -->
- **Deferred past 0.7.0.**
  - Forensics and audit evidence (AC-175), greenfield comparisons (AC-190) and the lifecycle read scope for a host-declared system skill (AC-209). The built forensics parts stay documented. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-5-row-33 -->
  - The quick route (`verify.quick`) comes after 0.7.0; the briefing generator keeps reporting "quick route: missing" as a typed result. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-5-row-33 -->
  - Three fail-open conditions of the Antigravity write-authorization tripwire (unparseable hook input, a spec with no Risk class row, an open dispatch record not bound to the caller) are named residual risks for 0.7.1. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-5-row-33 --> <!-- source: specs/sprint-alfred-epic/plans/po-list-afk-2026-10-22.md#row-33 -->
  - Antigravity isolated-worktree preparation is a 0.7.x follow-up; parallel work is accepted for 0.7.0 on Claude and Codex. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-11-parallel-work-in-one-checkout-is-unsafe -->
  - Compaction of repeated source material in the design generator moves to 0.7.x as its own item. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-10-row-16-triage -->
  - Cross-process ownership cases of the model-family host store (MFHS023, MFHS028) follow after 0.7.0. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-8-rows-3-4-5-9 -->
  - The supervisor CLI cases LWSC01 and LWSC03 to LWSC10 are typed pending cases until the journal-phase design after 0.7.0. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-2-row-30 -->
  - The before/after measurement of Elephant context needs live sessions and is measured in the Greenfield test; no number is claimed. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-5-row-33 -->
- **Pending cases in the end-to-end measurement.** The TOFU push measurement stops, typed and bounded, at the design-course boundary and names what the Greenfield test measures instead. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-3-row-23 -->

## What changed for existing users

- **Project identity (S4).** An aliased project identity is refused for consumer projects, following the released R1 wording (`PCI-ALIAS-REFUSED`). This repository itself gets a typed source-checkout exemption whose identity comes from the two tracked identity files and never from the directory name. This is held for the operator sitting. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-11-project-calibration --> <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-42 --> <!-- source: specs/sprint-alfred-epic/plans/po-list-afk-2026-10-22.md#row-42 -->
- **User configuration (GS-1).** An edit of `pipeline.user.yaml` stays liftable by signature. The refusal `HGO-NARROWER-USER-CONFIG-REFUSED` gets a signed-override repair route. This is held for the operator sitting. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-2-row-29 --> <!-- source: specs/sprint-alfred-epic/evidence/sitting/runbook.md#19-pro-c29-k92 -->
- **Write-scope overlap.** Overlap refusal is enforced by default, without a slice queue. Unjudgeable owners count as running, so a stale open dispatch record can block an overlapping dispatch until it is finalized; the refusal names the repair. On Claude Code only, a dispatch in its own worktree is not checked, and the hook environment variable `PIPELINE_FANOUT_SCOPE_MODE=shadow` turns the refusal into a warning. <!-- source: docs/parallel-work.md#when-parallel-work-helps --> <!-- source: specs/sprint-alfred-epic/plans/po-list-afk-2026-10-22.md#row-25 --> <!-- source: specs/sprint-alfred-epic/evidence/sitting/runbook.md#21-pro-c30-k104 -->
- **Review receipts.** A review receipt may carry a `fallback` record. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-row-41 -->
- **Native read tools on Antigravity.** The Antigravity native read tools are checked against the same credential-target check as the shell route; before, a test pinned "all read-only tools allowed". <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-6-row-16-m5 --> <!-- source: docs/security-controls.md#guard-read-credential-target -->
- **Baseline-only carry.** A baseline-only design state is rejected at release Verify and admitted as a typed carry at implementation entry. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-4-row-34 -->
- **Governed delivery checks.** An inherited `NODE_TEST_CONTEXT` made governed delivery checks pass falsely; the fix makes the check ignore the inherited value. This is held for the operator sitting. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-k120 --> <!-- source: specs/sprint-alfred-epic/evidence/sitting/runbook.md#38-pro-k120-governed-delivery-check-ignores-an-inherited-node_test_context -->
- **Stale hook snapshots.** `clone-hook-readiness --apply` refreshes stale mandatory hook snapshots as part of its apply. <!-- source: specs/sprint-alfred-epic/plans/po-list-afk-2026-10-22.md#row-10 --> <!-- source: git:57c12ecc0 -->

## Evidence and acceptance status

Nothing in this release is PO-accepted.

- **Independent Critic review.** The Critic batch has not run. Every one of the 174 delivery items lists an open Critic entry. <!-- source: specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-23/README.md#validation-and-spot-check -->
- **PO acceptance.** No delivery item is at the accepted stage; 172 items list an open acceptance entry. <!-- source: specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-23/README.md#open-by-owner -->
- **Delivery index.** The remeasure on its own head counts 3 items at stage 25, 56 at 50 and 115 at 75, an index of 66.09 percent. It is engineering progress, not acceptance, and a later remeasure replaces it. <!-- source: specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-23/README.md#delivery-remeasure-2026-10-23 --> <!-- source: specs/sprint-alfred-epic/plans/index-75-plan-2026-10-23.md#arithmetic -->
- **Full Verify and security checks.** The candidate-bound Full Verify has not run. The last security scan ended blocking only because the secret scanner timed out under load; it is to be re-run on a quiet machine. <!-- source: docs/overview.md#the-next-release-line-070 --> <!-- source: specs/sprint-alfred-epic/plans/po-list-afk-2026-10-22.md#row-13 -->
- **Native host runs.** 70 open entries over 65 items need a native-host run (Windows, Codex or Antigravity); the host runs listed in the sitting notes (credential-target refusal, shared `git show` lane, orphan node processes, Antigravity run, Greenfield acceptance on all three runners) have not run. <!-- source: specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-23/README.md#open-by-owner --> <!-- source: specs/sprint-alfred-epic/evidence/sitting/README.md#host-runs-that-stay-open-not-part-of-this-sitting -->
- **Greenfield acceptance.** The three-runner happy path with two PO approvals, the Codex/WSL required-Advisor route and the first-enrollment consent change stay open as Greenfield acceptance criteria. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-6-row-16-triage -->
- **Operator sitting.** The protected patches are not yet applied. The re-pin of the Critic preimage digests is deliberately done last, after the Critic batch, and the test stays red until then. <!-- source: specs/sprint-alfred-epic/evidence/sitting/README.md#order --> <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-1-row-19 -->
- **Documentation review.** The Reader course closes after a second correction batch; that batch counts as editorially corrected, not freshly read. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-12-reader-course -->
- **Recorded gaps.** No dispatch record exists for the adoption proof run, and none is written retroactively. The signed quality-package import changed prior verify-suite entries with operator approval; the Critic batch reads them. <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-4-row-32 -->
- **Architecture boundary check.** The boundary checker exits non-zero because the top-level operating-tools folder has no owner entry in the boundary policy. <!-- source: specs/sprint-alfred-epic/plans/po-list-afk-2026-10-22.md#row-45 -->

## Upgrade notes

- Until `0.7.0` is released, an application repository continues to use its approved GitHub-distributed plugin version; a release candidate is not an installation recommendation. <!-- source: docs/overview.md#the-next-release-line-070 -->
- The pinned `v0.7.0` example in Setup applies only after that tag is published on the official repository. <!-- source: SETUP.md#antigravity-agy-workspace-local-binding -->
- Antigravity: bind with the installer's Global topology refresh (prompt choice `2`, the documented default), then fully restart Agy before the first `pipeline-start`. The installer needs the `agy` command on its `PATH` at version 1.2.12 or later and refuses before changing anything otherwise. <!-- source: SETUP.md#antigravity-agy-workspace-local-binding -->
- Once a global registration exists, the installer refuses Workspace-Local and has no mode for going back, and the code does not show a repair for it. Choose Workspace-Local only deliberately, with the source inside the workspace. <!-- source: SETUP.md#antigravity-agy-workspace-local-binding -->
- To upgrade after a newer release tag is published, clone that tag into a different durable directory and run its installer from each consumer project root with the same choice. <!-- source: SETUP.md#antigravity-agy-workspace-local-binding -->
- If git hook snapshots are stale after an update, run `clone-hook-readiness --apply`. <!-- source: git:57c12ecc0 -->
- Overlap refusal is now on by default for parallel dispatches (see the changes above); a stale open dispatch record can block an overlapping dispatch until it is finalized. <!-- source: docs/parallel-work.md#when-parallel-work-helps -->
- For consumer projects an aliased project identity is refused (S4 follows R1). <!-- source: specs/sprint-alfred-epic/plans/po-decisions-2026-10-23-tiles.md#batch-11-project-calibration -->
