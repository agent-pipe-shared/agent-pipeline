# Tiles collected while the PO is AFK (29d, from 2026-11-13 late)

Present as tiles (max 4 per round, recommendation first, plain explanation) when the PO is back.

## T1 — P2-8: stage-0 trailer on an Elephant's evidence commit (Claude run 3)
Fact: the run's Critic-lineage commit (spec, PRD and evidence paths, no code) was refused for
`Dispatch: administrative (elephant)` with GIT-03-ADMINISTRATIVE-EVIDENCE-REQUIRED (evidence directories are excluded
from the administrative binding by design, guardrails/git.md). The refusal names `stage-0`, the run used it, and the
Critic then reported stage-0 as a minor (it reads stage-0 as the EL-01 production fast path). Commit guard and Critic
disagree; the Critic side lives in roles/critic.md / templates/prompts/critic-review.md (preimage-pinned).
Options:
- (a, recommended) The lineage/evidence writer commits its own output with the verified generator binding
  `Dispatch: <path> (elephant-generated)` (already an admitted form), so neither stage-0 nor administrative is needed
  and the Critic sees a generated commit. No Critic text change, no re-pin.
- (b) One-time re-pin of the Critic preimage to say: stage-0 on a commit touching no production path is not a finding.
- (c) Only sharpen the refusal text (names which paths administrative admits); Critic keeps flagging.

## (info, no tile) K-34 (Glossover): parallel Goldfish stops — root cause found, fixed in 29d
Glossover's forensics: the platform stop made host commit 88ddcce, then failed in the record draft with the K-29 code, so
its lineage proof never came; audit and mail waited for it (78 s / 27 s) and refused with the generic unowned-head.
29d (d37b1e26e, 99c65205d): such a commit is still refused, but at once and by name
(native-concurrent-sibling-commit-unrecorded, sibling + commit, recovery order). NGSP9F reproduces the live failure
without the fix (about 90 s, unowned-head) and is green with it. K-29 itself was fixed in 29c.

## T3 — K-35 (Glossover): scope decision after a Goldfish checkpoint stop
Fact: a Goldfish stopped at a checkpoint (an existing red test it must not touch). Offered routes: resume via
SendMessage (the child correctly refused a scope widening as unauthenticated) or cancel with class budget. Glossover
cancelled with wrong-premise, wrote a recon note, was refused AGY-HOST-BASELINE-DIRTY for the successor because the
predecessor's diff was still in the tree, recovered that diff via goldfish-host-commit-recover, then dispatched the
successor: about 15 tool calls.
Options:
- (a, recommended) A documented successor route without a new authority: the checkpoint result names, besides resume
  and budget-cancel, "scope change: cancel with the matching class, land the predecessor diff with
  goldfish-host-commit-recover, dispatch a successor briefing"; the finalizer text names the cancel class that fits
  instead of always budget. Small, no ADR.
- (b) A typed scope-amend continuation: the coordinator writes an amended briefing, the same child resumes bound to it
  (authenticated scope change). New foundational route: ADR + register entry (EL-04), bigger.
- (c) Leave as is (toil, documented in failure-cases only).
Update 2026-11-14, K-45 (Glossover, same class): a clean no-edit stop on a briefed stop condition cost four calls (cancel refused
SQ-ITEM-CANCEL-STARTED, cancel --started --class wrong-premise, new dispatch id because a one-path scope change gave
DBG-QUEUE-ROW-DRIFT under the same id, heal of the stop failure). The stop-failure and heal part is fixed in 29d by K-36
(68e2720cb: outcome checkpoint with changedPaths [], wait-host-commit answers "checkpoint", exit 0). What remains is exactly
this tile: the cancel class and the successor id after a scope change. Glossover asked to rebind the same id; under (a) the
successor keeps a new id (the id binds the queue row), under (b) the same child resumes bound to the amended briefing.
Update 2026-11-14, K-46 (Glossover): a successor of a --started cancel failed its stop with AGY-HOST-COMMIT-PATH-MISMATCH
(5 of 6 claimed paths "not changed"); cause by code reading: nativeConcurrentPlan keeps a cancelled sibling's allowedPaths as
foreign dirty paths until its member is released, and the admission drops them from the successor's own change set. This is a
defect, fixed in the clone (no decision). Also: "all work done except one out-of-scope pin" has no typed outcome besides
checkpoint (Glossover landed it with recover apply, no cancel) — same scope-decision class as this tile.

## T4 — L5 (Claude run 3): security verdict in the audit bundle when no follow-up push happens
Fact: the close's bundle is committed BEFORE the full security scan (that scan runs on the frozen candidate after the close
commit, finish-feature candidate-frozen → final-verify-green). The final Verify record and the v2 security verdict reach the
bundle only through the follow-up of the push/release route (PO tile 2026-11-10, FOLLOWUP_EVIDENCE: final-verify,
security-verdict). Run 3 made no follow-up push, so its bundle never held security evidence. The v2 verdict file carries the
plan (required list, source), so an empty plan is visible to an auditor once it travels; the close's private record still says
securityStatus "green" for an empty plan (C3 made the console lines honest, not this record).
Options:
- (a, recommended) Keep the follow-up route, and make the close's last line name it: "security verdict and final Verify
  reach the audit bundle with the follow-up at the next push; until then the bundle holds no security evidence", plus a
  coverage label in the private final record (required scanners vs none) that the follow-up carries. No new commit.
- (b) The close itself writes the follow-up (final Verify + security verdict) into the bundle as a second close commit after
  final-verify-green, so every closed feature's bundle holds them without a push. Changes the close flow (one more commit).
- (c) Leave as is (documented only).

## T5 — R10 (AGY run 3): split Critic children on Antigravity cannot be attributed to their entry
Fact: a split round attributes each child's verdict by the first words of its trajectory_evidence (`scope:<entryId>`); the
Claude/Codex briefing tells the child so. The Antigravity envelope is built only from the Critic template's envelope rows
(critic-briefing-build.mjs renderEnvelope; the runner's contamination filter refuses free text), so it cannot carry that
instruction; the builder already labels this as a `limitation`. The child returns without the marker → no Source record →
CSM-PACKET-NO-RECORDS, and the `--split/--child` fallback refuses it too (CSM-CHILD-UNATTRIBUTED); a verdict may not be edited.
Run 3 needed one extra round trip per split round.
Options:
- (a, recommended) One-time re-pin of the Critic template preimage: the envelope gains one structured row
  `- Scope marker: {{SCOPE_MARKER}}` (empty/absent for an unsplit round), the builder fills it per entry, and the return
  contract says the verdict's trajectory_evidence begins with it. Small; same attribution rule for all runners.
- (b) Attribution by dispatch binding instead of text: prepare-dispatch binds each child's dispatch to its entry and the
  stop/merge reads the binding. No template change, but a new attribution route (ADR + register entry, EL-04), and
  Antigravity has no SubagentStop record to bind to today.
- (c) Leave as is: Antigravity split rounds re-dispatch each child once with the marker named by hand (toil).

## T6 — R5 (AGY run 3): may the harvest record bind the host's per-child descriptor?
Built (54096ffcc, ADR-0099): `agy-native-integrate.mjs apply --keep-authorship <id>` lands an Antigravity branch child's own
commits by fast-forward (authorship kept) when the branch was cut from HEAD and every commit carries the briefed
`Dispatch: <id> (goldfish)` trailer. The dispatch record stays `orchestrator-attested` (the script runs in the Elephant's
session; nothing in the host observed the hand-over). The PO's tile said "write the host observation": the one host-written
fact available is Antigravity's descriptor `.system_generated/subagents/<childId>.json` (conversationId, role, workspaceUris).
Options:
- (a, recommended) Bind that descriptor by digest into the take-over record and the attested record under a distinct label
  (e.g. `assurance: "orchestrator-attested, host-descriptor-bound"`), never `hostObserved: true`. Needs the descriptor's
  location measured once in a real Antigravity session (brain root, childId ↔ branch name), then an ADR-0099 amendment.
- (b) Keep it as built: authorship kept, record orchestrator-attested, no host fact.
- (c) Build a real host observation: an Antigravity hook records the child's final commit at its end. Needs a host event
  that Antigravity does not offer today (no SubagentStop equivalent measured).

## T7 — configure-verify replace (ADR-0100): must the test run of the new command pass?
Your tile of 2026-11-13 said "test run first, then one signature" but not whether a red run blocks. Built with the
stricter reading: the replace route runs the new command once on a clean tree (shell, project root, timeout), and only a
passing run with an unchanged tree leads to the signing request. Options:
- (a, recommended) Keep it: only a green run can be signed. A new command that is red today would make every Verify red,
  so signing it gains nothing; a red product test is fixed first.
- (b) Record any outcome: the exit code goes into the signed subject and you sign knowingly, e.g. to switch to a stricter
  command that exposes known failures the feature then fixes.

## T8 — Trivy IaC adapter (28d tiles 4/5): measured, not built in 29d
Measured 2026-11-14 with the official release v0.76.2 (latest, marked immutable on GitHub, after all published advisories;
the March 2026 supply-chain compromise hit v0.69.4 and Docker Hub 0.69.5/0.69.6 only). The tarball's SHA-256 matches the
release checksums file (bc0fc726…fdbf); the checksums file's own sigstore bundle was NOT verified (no cosign on this machine).
Install into `~/.local/bin` was refused by the guard (GUARD-CROSS-REPO-MUTATION, no override route); the binary was run from
`scratch/trivy-dl/x/trivy` only to capture output, network denied (`unshare -rn`), empty cache dir.
Facts:
- Offline works: `trivy config --skip-check-update --cache-dir <empty>` makes no network attempt and falls back to the checks
  embedded in the binary (logged at ERROR level, "Falling back to embedded checks"). Without `--skip-check-update` it first
  tries mirror.gcr.io.
- Real findings: Dockerfile (DS-0002 root user HIGH, DS-0029 HIGH, …), Terraform (AWS-0086/0087/0091/0093 public S3 HIGH,
  AWS-0107 open SSH HIGH), Kubernetes (KSV-0014/0118 HIGH). `--exit-code 7 --severity HIGH,CRITICAL` exits 7 on a HIGH failure.
- **Fail-open on broken files:** an unparseable `main.tf` gives 0 findings and exit 0 (the parse error is only an ERROR line on
  stderr); an unparseable Kubernetes YAML is silently not detected at all. Terraform is scanned per module (target "."), so a valid
  clean `.tf` file never appears as its own target either: the report alone cannot tell "clean" from "broken".
- Surface: a new scanner touches the closed lists SECURITY_ELEMENTS, the capability map, the toolchain registry + preflight schema
  enum + generated docs/toolchain.md, the trusted resolver, readiness, diagnostics, the evaluator and security-scan.mjs (about
  ten files). The onboarding consent text names the tool list but is not digest-bound, so no consumer re-consent is needed.
Options:
- (a, recommended) Build Trivy as its own candidate after 29d with these rules: the Pipeline itself decides "not applicable"
  from the close post-image's tracked files (Dockerfile/Containerfile, `*.tf`, YAML/JSON with `apiVersion` + `kind`), without
  the binary; always `--skip-check-update` (embedded checks, no network); any trivy ERROR line other than the embedded-checks
  fallback is a scanner error (pinned to the tested version, fail closed); HIGH/CRITICAL failures the feature introduced block
  (baseline like Semgrep, ADR-0093); class "optional, required when trigger files exist". Install by you with
  `! install -m 0755 scratch/trivy-dl/x/trivy ~/.local/bin/trivy` (checksum already verified) when the candidate is tested.
- (b) Build it into 29d now: delays the 29d export by the whole surface above.
- (c) Drop Trivy; IaC stays unscanned (documented as a coverage limit in the close's security lines).

## T9 — pipeline-state.mjs sits at the session authority's 1 MiB source bound
Fact: the 29d pre-export run found session-authority-registry-fewer-checks red (WIN-AUTH-SIZE): ADR-0100 had grown
scripts/pipeline-state.mjs to 1,050,379 bytes, past the authority's source-entry bound of 1,048,576 bytes (the native Windows
reader clamps to the same value). Fixed in 29d by moving the replace route into lib/verify-replacement.mjs (now 1,040,728
bytes, about 7.8 KB headroom) plus a pin that fails when any shipped module comes within 4 KiB of the bound. Every larger
feature in pipeline-state.mjs will hit this again soon.
Options:
- (a, recommended) Split pipeline-state.mjs by verb groups into lib modules over a few candidates (one verb group per
  patch, pure moves, each with its importer run), keeping the bound as is.
- (b) Raise the bound (e.g. to 2 MiB): an authority-kernel limit, needs the native Windows reader changed and measured on
  Windows, plus an ADR.
- (c) Leave it; move code out only when the pin turns red.

## Toil noted (no decision needed unless the PO wants it)
- ~/.claude/projects holds hundreds of `-tmp-pipeline-claude-model-probe-*` folders (test runs of the model probe leave
  a Claude project folder per temp dir). Candidate cleanup or probe isolation; check which test spawns them.
  Checked 2026-11-14: no test spawns them (model-role-session tests inject `run`/`makeTemp`). They come from real
  model-role probes (lib/claude-model-host-observation.mjs: `claude --print --no-session-persistence` with cwd = a fresh
  mkdtemp dir per alias and session); the Claude host still creates a projects folder per cwd. A fixed probe dir would
  collapse them to one but is unsafe in a shared /tmp (pre-created dir/symlink); a private dir under the machine plane
  would be the safe variant. Disk clutter only, no workflow toil: not built.

## Glossover toil 2026-11-14 (sent at the PO's request; for the candidate after 29d, tile needed)
- G-T1 Elephant Tier-0 undefined: canon names "Tier-0 per roles/elephant.md — EL-01" only inside the confirmation
  line (roles/elephant.md:398); no definition of scope/size/file classes/evidence/trailer exists (checked: rg in
  roles/elephant.md + docs/operating-model.md). The embedded block + pipeline-start say "epic/feature start with
  Goldfish dispatch from the first edit". Consumer Elephants therefore route every one-line fix through a full package.
  Ask: define Tier-0 explicitly (embedded role block + pipeline-start), or drop the dangling reference. Touches the
  generated role block (generator) → EL-04 check whether this is a foundational change (ADR).
- G-T2 per-package overhead for tiny/low-risk work (10+ steps: package JSON, probe, heal, build, Agent call,
  wait/recover, heal). Checkpoint "targeted delivery blocked" on an out-of-scope pin always needs recover + successor.
  Options: Tier-0 (G-T1) or a "pin follow-up" mode where recover may carry one coordinator-named out-of-scope test line.
  Relates to T3 route (4) in patch 51.
- T3 doc follow-up (after 29d): roles/elephant.md:241 steps (3)-(5) and workflow-dispatch.md:191 still name only the
  budget cancel; step (4) forbids "commit a checkpoint under the original trailer, then dispatch afresh for the same
  outcome" (aimed at budget laundering). Align with patch 51's route 3 (scope change, class wrong-premise, typed
  successor reason) and route 4. Checked for 51: cancel --started only writes the queue file (no commit, pending state
  kept), recover reads the pending state and no queue → routes 3 and 4 work as printed; recover plan prints the full
  apply command (--root, --expect-sha256) as `next`.
