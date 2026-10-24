# Three-runner Greenfield follow-up, 2026-10-24

The PO supplied the two reports `docs/pipeline-analyse-greenfield_AP_test_vox_codex_070_1.md` and `docs/pipeline-analyse-greenfield_AP_test_vox_claude_070_1.md` from their respective Greenfield projects and requested all P0 and P1 findings in this fix wave. This is an execution mandate for investigation and repairs, not acceptance or permission to weaken guards. Reports describe older builds; source confirmation and regression evidence are required before claiming a current defect fixed. Original report priorities are retained below.

## Complete P0/P1 intake

This is the combined fix wave for all three runner reports. The Antigravity
report's original intake remains in
[Greenfield findings](greenfield-findings-2026-10-23.md), section "Antigravity Greenfield report 1":

| Original Antigravity priority | Existing finding / repair | Current boundary |
|---|---|---|
| P0-1 | G6 / K152A: native file-tool admission and write-target mapping | Source integrated `43e04b207`; synthetic checks passed; native qualification remains open |
| P0-2 | G7 / K144, K152B and the design-phase catalogue route | Source fixes integrated; qualify complete dispatch/return/integration and retain any remaining catalogue refusal |
| P1-1 | G8 / K154, combined with G20 below | Candidate-bound publication/close qualification and independent design-review provenance remain open |
| P1-2 | G9a / K153; G9b / K156 and G30 below | Signed plan-proof delegation integrated earlier; active runner-view retention and mid-session refresh qualification remain open |

The lower-priority Antigravity findings already admitted to the working plan,
including G10/K156, also remain in scope. Combining duplicate findings never
removes their runner-specific regression and native qualification duties.

| ID | Report finding | Required outcome | Existing work / owner | State |
|---|---|---|---|---|
| G18 | Codex P0-1; Claude P0.2 | Diagnose and qualify dispatch through return, source binding and integration before expensive implementation; report every unavailable authority with a usable recovery | G1/K142, K146; G19 Windows prerequisite | K146 source integrated at `a0feac3a4`, safe main checks pass; native host qualification and Windows prerequisite remain open |
| G19 | Claude P0.1 | Early Windows project/plugin/private-state ACL diagnostics, preserving ancestor safety; explain SID-based repair without recursive ACL rewriting | New Windows readiness work | Report evidence; current source and native Windows reproduction pending |
| G20 | Codex P0-2 | Publication qualification must bind required independent review and Verify to the actual candidate; checkpoint and authorized exception claims remain distinct | G8/K154 | Open; signature alone never establishes qualification |
| G21 | Codex P0-3 | Official result bootstrap/reconcile preserves package, continuity and result consistency; real package validation participates in close qualification | New result transaction repair | Report includes an independently reproduced manifest/result hash mismatch and missing reconciliation fence; current source confirmation pending |
| G22 | Claude P0.3 | Reachable honest close after unavailable item dispatch, including test-dependency preparation and required Critic qualification | K146, G17, G21; close preparation work | Open; do not implement a silent no-Critic success route |
| G23 | Codex P1-1; Claude P1.4 read-help portion | Harmless scoped reads/help use ordinary read-only admission and actionable errors; preserve credential, external-path and symlink boundaries | Read grammar/help recovery work | Operator committed complete package `6db0d31f8`; included in installed intermediate build; focused checks pass, native qualification open |
| G24 | Codex P1-2 | Evidence writers cannot overwrite another schema's valid result; bind immutable run records and separate capture/function outputs | Consumer tooling contract / evidence writer investigation | Report confirmed consumer script collision; shared product ownership to establish |
| G25 | Codex P1-3 | Validate HEAD, criterion rendering and source closure before submission mutation; retain already answered intake values | Design submission/intake work | Open; no late approval or fabricated identity |
| G26 | Codex P1-4 | Architecture conformance records disposition of findings and unavailable properties without claiming PASS | Architecture close work | Open; report-only observations are not automatically blocking criteria |
| G27 | Claude P1.4 architecture portion; P1.5; P1.6 | Self-describing greenfield architecture path, editable design before binding, correct criterion examples; avoid repeated PO discard ceremonies | G2/G4 happy-path work | Report now supplies the missing discard/early-bind evidence; current source walk pending |
| G28 | Claude P1.7 | Portable sanitized approval/Verify/Security/review evidence index in the delivered branch; private keys and raw private state remain external | G14, audit export work | Open; durable proof references and actual exported evidence must be distinguished |
| G29 | Claude P1.8 | Public handover accurately follows lifecycle transitions | Lifecycle handover projection work | Report evidence; identify sanctioned writer and regression pin |
| G30 | Claude P1.9 | Trusted hook snapshot refresh has a usable recovery during a session | Existing hook-refresh flow; G9b/K156 | Bootstrap recovery succeeded in this session; mid-session behavior pending |
| G31 | Claude P1.10 | Signing output points to an admissible external proof destination | Signing output work | Open; preserve external-proof requirement |
| G32 | Claude P1.11 | Security candidate identity works for the configured remote destination, without requiring the name `origin` | Security identity work | Report evidence; source confirmation and regression test pending |

All rows are in the current fix scope. Existing G6/G7 (Antigravity native tool coverage/model enforcement), G10 (calibration deadlock), G17 (Codex Critic mutation false positive), and the remaining red Verify suites remain in scope. No P0/P1 row is silently deferred by this table.

## Current source confirmations and regression contract

- **G21 confirmed in Source:** `pipeline-state.mjs:5795` defines a structured Result block without the reconciliation fence; `buildResultBootstrapPlan` appends it to the historical Markdown at line 5894. The writer journals Result/State publication but does not update the registered package. `feature-package-topology.mjs:381` rejects reconciliation without `RESULT_RECONCILIATION_FENCE`. Regression must exercise registration -> bootstrap -> readback -> reconcile/close, including interruption and replay, and retain historical-prefix integrity. Existing already-broken postimages need authenticated journal-based recovery, not a permissive metadata refresh.
- **G32 confirmed in Source:** `security-scan.mjs:371` reads only `remote.origin.url`, returning a null repository digest without that alias. Fix must agree with `security-evidence-evaluator.mjs` and the actual destination identity; renaming a remote must not silently rebind old evidence to a different repository. Tests must include one non-origin remote, ambiguous multiple remotes, changed URL and absent remote.
- **G20 confirmed narrow gate gap:** `close-coordinator.mjs:408` returns from the course Critic gate when the queue is absent. This confirms the missing-course branch, not that every other publication gate is absent. Repairs must cover the actual push gate as well as preparation, preserve intentionally unqualified checkpoints, and refuse a completed rigor>=1 claim without the matching review/Verify lineage.
- **G19 confirmed diagnostic seam:** `windows-owned-authority-backend.mjs` retains a closed `WIN-AUTH-*` reason under `SDC-AUTHORITY-UNAVAILABLE`, while the native helper refuses foreign write ACEs on strict ancestors. It already has a narrowly bounded human-controlled-above-root route; that existing rule must be evaluated before proposing any ACL change. WSL source reading is not native Windows qualification. Never recursively rewrite the operator's project or plugin ACLs.
- **G23 reproduced during this sitting:** unsupported glob flags and a missing legacy state alias produce `GUARD-READ-COMMAND-UNSUPPORTED`, including attempts against a nonexistent file. The admission test must distinguish grammar, missing-file and actual path-containment failures. A diagnostic recovery's successful audit verification is not success of the refused read.
- **G29 qualification:** `pipeline-state.mjs:1206` deliberately publishes a private advisory next-action projection for Git-backed projects; it does not update tracked handover prose. `runtime-handover-projection.mjs` explicitly reports `trackedHandoverChanged:false`. A repair must preserve that custody boundary while making the agent's public handover duty and stale-text diagnosis usable; do not claim that the existing runtime automatically synchronizes the public file.
- **K150 part B narrowed:** a pure call to `compactSigningDisclosure` accepts an 80-character material path and refuses 241 characters with `PO-SIGN-DISCLOSURE-MATERIAL`. The fixture layout derived from `po-human-approval.test.mjs` yields 225 characters in the main checkout (accepted) and 251 under the owned clone (same refusal). This is a synthetic path-length control, not a rerun of the whole signing suite, a real key operation or final proof of every historical failure. Preserve the material digest and revalidation when repairing the path representation/display boundary.

## Verification and attempt evidence from this session

- The direct pure `dispatch-briefing.test.mjs` suite ran at the owned K146 clone's unchanged base: **74 tests, 74 pass, 0 fail, 0 skip**. Its fixtures inject authority readers. This does not qualify a new fix-wave route or native execution.
- The first K146 worker stopped before edits because `scripts/run-in.mjs` delegates to `run-quiet.mjs`, which performs post-suite `repairAddressRootQuietly({home:userInfo().homedir})`. TMPDIR/HOME do not redirect that OS-account lookup. Do not use that helper to promise isolation from the live address-root directory.
- The second K146 worker stopped on an unsupported `ls -ld` read before producing a diff. Its returned exact read-only audit recovery was then executed successfully by the parent (`status:valid`). Unsupported read spelling can follow the guard's ordinary grammar guidance; that event is not a new PO gate.
- The installed `duty.deep` selector returned V3 fallback `gpt-6-sol` / `medium`. K146 now uses that stronger route for the accepted-plan/requester/host contract analysis, with both earlier attempts retained. Neither a fresh owner nor the escalation erases earlier budget or outcome evidence.
- No implementation fix, new native qualification, Full Verify, independent Critic result, Reader third round or acceptance has been claimed in this session. The P0/P1 intake is committed; K146 remains in progress.

The preceding bullet records the initial intake cut. Later, the separately authorized K146 source import committed as `a0feac3a4` with all hooks enabled; main generator 76/76, carrier/model 4/4 and source whitespace check pass. No native integration receipt was observed or manufactured. The prior one-task exception and extended fix-wave exception remain methodological provenance, not independent review or acceptance.

## Current execution boundary

**PO direction, 2026-10-24 (mobile continuation):** extend the existing delivery machinery and use existing accepted ACs; do not open a new design course. PRD and Spec must not be changed without the PO's explicit approval. No such change is authorized by this repair wave. Collect signature-dependent packages until the PO is at a terminal; ordinary questions can be answered from mobile.

The generator's supported `--criterion` route already binds an exact existing approved AC without inventing a K146 item row: a read-only AC-264 binding with the configured Deep route succeeded in this session. K146's delivery/happy-path repair uses AC-264 and its original `three-runner-happy-path-with-two-po-approvals` requirements; role/recovery clauses can reference AC-245 only where their original acceptance actually applies. AC-204 is a report-only reverse coverage inventory, so a syntactically successful binding to it does not authorize unrelated carrier enforcement. Never select an AC merely because its title sounds related. Reuse the existing criterion-bound item delivery, requester, checks, queue and host integration contracts wherever they suffice. The earlier scratch-only proposal for an unanchored `repairTask` union is not the selected course.

Bootstrap resolved `0.7.0+codex.20261024080351.b00899b`, runtime ready, approved epic implementation, valid continuity. Hook snapshots were refreshed through the exact bootstrap recovery. Optional model-role confirmation is pending; the sanctioned selector returned the unchanged V3 implement fallback `gpt-6-luna` / `high`.

The installed read-only dispatch generator currently refuses a fix-wave task with `DBG-AC-ROW-MISSING`: the approved Alfred acceptance matrix has no original item row for K146. Do not invent an acceptance row, transplant a different item's identity, or bypass the generator silently. K146 is the concrete repair for this missing fix-wave route and carrier/template enforcement.

**PO decision, 2026-10-24:** the PO explicitly approved a one-task exception for K146: a fresh Codex worker uses the prepared template briefing in an owned clone to repair the unavailable fix-wave route. Existing hooks remain enabled; protected changes are delivered only as a reviewable proposal. This is a methodological bootstrap exception, not native item/host-commit evidence, a new acceptance row, a blanket implementation exception, or permission to bypass a refusal. The exact briefing input is `evidence/dispatch-specs/spec-k146-codex.json`; `scripts/fill-goldfish-briefing.mjs` renders it into `scratch/briefing-k146-codex.md`.

**PO extension, 2026-10-24:** after the K146 and K152A proposal packages were committed, the PO explicitly extended this methodological exception to the entire approved fix wave. Fresh workers may prepare bounded repairs in owned inert clones using the existing accepted ACs, focused tests and honest patch reports. This does not establish native host integration, authorize guard bypasses, or authorize PRD/Spec changes. Protected application and signature-dependent ceremonies remain collected for the operator. The next independent scopes are K150B/G31 signing, G17 Critic baseline, and K152B Antigravity model enforcement. Their complete template briefings are rendered from the scratch JSON task inputs; source proposals remain separate from qualification and acceptance.

Stamp/install/push and the scheduled Critic batch remain on the PO's explicit call. The PO offered an intermediate candidate if the active Codex runtime cannot complete its work; no stamp has been performed. Protected source integration remains on its sanctioned human-operator path. Execute audited pure or synthetic fixture tests at the declared host boundary. Do not use `run-in`/`run-quiet` to promise isolation: their post-suite repair reaches the real OS-account home through `userInfo`, regardless of HOME/TMPDIR. Broader session-authority tests remain unrun unless actual isolation is established.

**Concrete K146 application approval:** the PO separately approved applying `evidence/verify-fixes/k146-protected-proposal.patch` and attempting ordinary verification and commit with active hooks. Automatic approval review had initially rejected live application under the inert-only exception; after this explicit approval the sanctioned import succeeded. Main generator regression passed 76/76 and synthetic carrier/model checks 4/4. A protected commit refusal, if encountered, remains operator work; no bypass or signature is authorized. The PO also directs that remaining decision needs be collected until available while independent work continues.

## Later proposal and integration queue

| Package | Concrete state | Next owner/action |
|---|---|---|
| K146 | Integrated `a0feac3a4` with ordinary active hooks; main 76/76 generator and 4/4 carrier/model | Native qualification, integrated Verify, independent Critic and acceptance remain open |
| K152A | PO-approved source integrated `43e04b207`; main synthetic integration 3/3, evidence phase committed `20c07bde6` | Native qualification, integrated Verify, independent review and acceptance pending |
| K152B | PO-approved source integrated `eac1d2dc8`; combined model/read controls 39/39 | Native model qualification, integrated Verify, independent review and acceptance pending |
| K150B/G31 v2 | Inert three-path correction preserves bounded disclosure, full authoritative material path and external proof output; focused 4/4, selected AC-261 4/4, consumer 9/9 and synthetic real signing/proof flow 2/2 | Exact v2 patch/report retained; main application and integration pending; v1 regression and attempts preserved |
| G17 v1 | Seven-path inert proposal; syntax/diff checks pass; bounded fingerprint helper 1/1, full host attempt interrupted exit 130 | Not qualified: launch/finalize timing, custody compatibility, independent negative controls and meaningful RED/GREEN still required. Do not apply or re-pin |
| G21 v2 | Exact inert four-path patch, including retained/retired legacy Result journal recovery; final synthetic bootstrap 15/15, close 35/35, consumer 9/9 | Source companion catalogue-present route and real signature/native qualification remain unexercised. Existing proof kind is used separately for exact repair and manifest reconcile; no main application |
| G20/K154 v2 | Exact inert seven-path proposal and cumulative report retained; focused synthetic close/push/resolver/consumer checks green | Partial: approved rigor provenance, pushed-tree binding and independent design-review provenance remain incomplete; no main application |
| G19 v2 | Exact inert eleven-path readiness/consumer/closure proposal; targeted 108/108, readiness 9/9, Windows preflight 4/4, consumer/skill 17/17 | Source review/application decision and native Windows qualification pending; no live ACL mutation |
| G32 | Inert four-path effective remote-identity proposal; focused scanner/synthetic guard, existing scanner and consumer checks green | Main integration, inherited kernel closure review and native push qualification remain pending |

K152B's two earlier stops are retained: library-only scope could not perform native wiring; the next dispatch hit the unavailable native opening-record command. A3's complete replacement briefing explicitly includes both minimal hook wiring and the PO-approved methodological opening exception. These are neither hidden successes nor fresh attempt budgets. G23 read/help briefing is prepared for the next slot; G24-G32 and K156/K155/G2/G4 remain in the committed intake, not silently removed.

G19's first owner created an untracked diagnostic module but stopped after clone-local reads were repeatedly misclassified by the current guard. The coordinator verified the file exists and can be read using its complete root-relative path from the actual main workspace. The same owner continues through that ordinary path spelling, preserving the stop and partial work. G23 now has a fresh owner investigating this concrete symptom and help/read admission. G21's clone-only commit did not land because no author identity was configured; its exact staged patch is retained, with no invented identity or native commit claim.

**Approved combined integration:** the PO specifically approved K152A/K152B/G23 applications and ordinary tests/commits. K152A and K152B committed with active hooks. G23 remains applied after the ordinary pre-commit hook refused three `PB-GUARD-HOOKS` paths as `PB-COMMIT-OVERRIDE-NONOVERRIDABLE`; nothing was seeded and no bypass used. Keep its complete seven-path package for a later operator commit, not a different partial composition. Main checks: model/read 39/39, selected QP4 2/2, native file tools synthetic 3/3, generator 76/76, consumer 9/9. Documentation initially failed three assertions because K152A changed the source matcher; the exact generator recovery updated `docs/enforcement.md`, committed `925224574`, and documentation contracts passed 76/76. PRD/Spec hashes are unchanged.

**Stamp call:** the PO explicitly requested a new intermediate version now and will run operator commands/install after the mobile window (later extended to 40 minutes). Stamping is authorized. The sanctioned `scripts/stamp-candidate.mjs` requires a clean committed checkout; the outstanding operator-only G23 commit must precede the actual main stamp. Do not evade that freeze check or stamp an unstated different source. Prepare the remaining ordinary commits and operator handoff, then stamp as soon as the operator commit returns. Installation remains the PO's action. Open P0/P1, actual dispatch-route compatibility, native qualification, integrated Verify, independent review and acceptance remain explicit.

## Installation readback and continuation, 2026-10-24

This readback supersedes the pending operator/stamp wording above. The PO
committed G23 as `6db0d31f8`. The sanctioned stamp then committed as
`16c9e1936`, build `20261024111543.6db0d31`. Following the PO's installation
and continuation message, installed Codex preflight reports version
`0.7.0+codex.20261024111543.6db0d31`, matching loaded/installed content digest
`39885be0c06d5a62cb5dfe2532a65961d1f9a023731c2618065511866d63b7cc`.
Its exact hook-refresh recovery completed; fresh preflight and onboarding
inspection are ready, runtime readback is current, continuity is valid and
the existing Epic plan remains approved in implementation. PRD/Spec hashes
match their recorded authority. Observation governance passed.

Optional model-role mapping confirmation is collected for a later attended
terminal; it has no lifecycle impact. The sanctioned `duty.deep` selector
still returns V3 `gpt-6-sol` / `medium`. No signature or HEAD-bound command
is outstanding. No new stamp, push, Critic batch, re-pin or acceptance is
implied by installation. The prior session's workers are no longer live;
retain their clones, partial diffs, evidence and attempt histories when
preparing further bounded work. Inert proposals remain separate from this
installed candidate.

The G21 v2 source patch is 73,944 bytes, SHA-256
`8dbcf5911dcac363041c1eefb279ce33631a2623c7dbebfd3dc76d4450e635d7`.
The G20 v2 patch SHA-256 is
`0115916161f171f9dd80b8c4436260db3e1cb1eddb6e8469d3b4c3bebfcfa46b`.
Both were copied byte-for-byte from retained worker outputs into
`evidence/verify-fixes/`, with matching source/destination hashes; this is
proposal custody, not live Source application or additional test execution.

Current bounded work: K156/G30 continues calibration and runtime recovery in
the existing inert clone, retaining the prior attempt. G24 owns evidence
collision prevention and the distinction between shared writer behavior and
consumer-authored scripts. G28 owns the existing audit-pack export gap; an
archive for its exact named candidate must not be confused with a new rule
qualifying later commits. Existing ADR-0063 and R7-3 remain the tracked
artifact baseline. No C-to-P evidence-promotion decision is assumed.
