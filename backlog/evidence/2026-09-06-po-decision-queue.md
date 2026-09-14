# PO decision queue — collected 2026-09-06

## GG-22 backlog-closure recovery — signature deferred 2026-09-14

The ordinary close-and-reconcile sequence has a recovery gap: after a backlog
item's `status: closed` lands without its four closure fields, the official
reconciliation driver can generate the correct transition chain, but GG-22
still refuses the one local commit that would persist those projections. No
source, policy, release, or remote state has been weakened or bypassed.

- **PO action later:** approve one narrowly bound Human Guard Override for the
  local commit containing only the closure metadata and the generated
  `backlog/STATUS.md`, `backlog/index.json`, and
  `backlog/transitions.ndjson` projections. A fresh plan and signature digest
  must be generated immediately before signing because they bind HEAD/tree.
- **Follow-up implementation:** make this valid repair route reachable without
  an override (either prevent incomplete closure frontmatter before the status
  changes, or accept the driver-generated reconciliation as the exact GG-22
  recovery sequence).
- **Blocking status:** this blocks committing the current candidate branch,
  not isolated source investigation or future PO decisions.
- **Evidence:** local closure fix `0605b19f7e9db2fa84ca19a6f4078c8cedd50df7`;
  the driver generated ledger transitions 1867–1868 before the commit guard
  refused their persistence.

## Protected-testpath lifts — signature deferred 2026-09-14

Several candidate blockers are mechanically localized to protected test and
verification registrations, not to product or guard-policy code. They must not
be resolved through `--no-verify`, a hook bypass, or a broad permission change.

- **PO action later:** authorize the separately prepared, digest-bound Human
  Guard Override / TP-lift for each exact protected-path repair, after reviewing
  its staged diff. Each authorization is one use and binds the then-current
  candidate tree.
- **Current required repair:** align the stale approval fixtures in
  `harness/scripts/pipeline-state.test.mjs` (TP-5) with the now-required
  bootstrap acknowledgement receipt. The path is intentionally exact: the
  similarly named `plugins/pipeline-core/scripts/pipeline-state.test.mjs` is
  not the protected failing suite.
- **TP-3 disposition:** the previously observed observation-corpus-count
  mismatch in `harness/scripts/verify.mjs` is currently green and therefore
  is not part of the next lift. Do not authorize or edit it unless a fresh
  Verify run reproduces that separate failure.
- **Fresh verification, 2026-09-14:** full Verify at candidate
  `6505e62f5c2f768a74db1ec283b19317045f87fb` was 85/86 green with Security
  Scan green. The only failure was TP-5's six stale expectations:
  `PS12b`, `PS12d`, `PS14b`, `PS14c`, `PS14f`, and `PS14h`. They still invoke
  attribution-only `approve-plan --by`; the writer correctly requires the
  current shared-human-approval receipt. This is fixture migration only, not a
  reason to weaken the signature policy or approval writer.
- **Scope boundary:** this permits only the listed test or verifier projection
  updates; it does not authorize a hook bypass, a guard-policy relaxation, a
  production behaviour change, or a push/release.
- **Blocking status:** these are full-Verify and candidate-stamp blockers. Work
  in isolated branches may continue while the signature is unavailable.

## Stable Nova-B candidate — threat-model signature at freeze

ADR-0083 LND-2 changes the repository-public governance-event validation
boundary. Its implementation and correction are complete, but policy checklist
item 2 requires a detached threat-model approval request bound to the exact
stable delivery candidate and effective policy before the final PO decision.

- **Timing:** prepare the request only after the Nova-B candidate is stable;
  earlier signatures would become stale after the next implementation commit.
- **PO action later:** verify and sign that exact prepared request using the
  configured external trust key.
- **Blocking status:** blocks only push/release of the stable candidate. It does
  not block LND-3 through LND-8 or other local Nova-B work.
- **Evidence:**
  `backlog/evidence/2026-09-12-lnd2-envelope-store-reader-admission.md`.

## Torn HGO audit append — equivalent live evidence accepted 2026-09-12

The implementation and adversarial repair fixture are complete. The fixture
constructs the historical authenticated-prefix/contiguous-tail state, exercises
the attended `repair-audit` command, proves interruption recovery and
idempotency, and passed the two independent review rounds. The repository's
actual ledger is currently valid at 6,165 authenticated entries.

- **PO decision:** accept the valid live readback plus the exact adversarial
  repair fixture as satisfying the acceptance sentence that says this
  repository's ledger is reconciled "by that operation". Deliberately damaging
  a valid production audit ledger only to replay a historical repair would add
  risk and no stronger contract evidence.
- **Evidence:**
  `backlog/evidence/2026-09-12-hgo-audit-repair-critic-round1.md`, the round-two
  review at candidate `54a20d83a0501de98d522f7d7da7a829ccf16cc1`, and
  `backlog/evidence/2026-09-12-hgo-live-audit-readback.json`.
- **Execution:** the item is closed and reconciled in the append-only backlog
  ledger. Final release-bound threat-model approval remains a separate
  candidate-freeze obligation.

## Native Codex sandbox scope under WSL — superseded 2026-09-12

The PO has deferred every native Codex sandbox/App-Server acceptance question
under WSL to a separate future package that will be exercised on native
Windows. Those routes are neither Nova-B acceptance evidence nor Nova-B
blockers. Historical WSL receipts remain diagnostic evidence only; they do not
establish native execution, isolation, model identity or readiness. The
ordinary fresh-session Critic remains the supported autonomous review route,
and platform-neutral/offline contracts remain in Nova-B scope. No new PO
decision is required to continue that work.

## Reusable review-transfer consent — 2026-09-10

The PO explicitly requested implementation and a direct test of a one-time,
project/service-bound review-transfer consent, while retaining the existing
access mode. Ordinary candidate commits and new evidence inside its approved
data areas must reuse the decision. A new recipient, project, purpose or wider
data area is a scope change; local consent must never be relabelled as host
approval or used to bypass a denial.

The current gate and host observations, including the completed 517/517 Verify,
native review timeout and denied bounded starts, are retained in
[the host-rejection record](2026-09-10-critic-export-host-rejection.md).
Implementation is in progress; this entry does not claim installed support,
accepted host authorization, successful review or a test-ready local candidate.

## Standing autonomous Critic execution, including user projects — 2026-09-10

The PO clarified: "Es darf auch keine Freigabe brauchen! Das sind per operating
model keine definierten Po Gates", "Stelle sicher das der po nicht mehr gefragt
wird künftig", and "Das muss für User Pipelines auch klar sein".

Ordinary Critic execution is agent work after the applicable plan and
deterministic gates: prepare the bound input, start the supported review,
monitor it, read the actual result and continue the authorized work. Do not
ask for an additional Pipeline PO approval or routinely delegate the command
to the user's terminal. This applies to consuming projects as well as this
source repository and belongs in the shipped runtime instructions.

Use the host's supported execution-permission mechanism where necessary;
it is not an additional Pipeline PO gate. Diagnose actual permission denials
and unavailable execution honestly without bypassing them. Expressly defined
decision gates, final acceptance and bounded review rules remain applicable.
Correct coordinator/input defects within the existing execution mandate;
retain failed attempts and distinguish briefing rejection from a substantive
review. No automatic approval or fabricated PASS follows from this decision.

Execution readback: pin transcription completed in
`0650ef46a94e7ee173c9f17468afd29a18463de9`. Candidate
`c7b991578956dfebfa92c5f5a640649c05628ca3` passed 517/517 full Verify steps,
security exit 0, zero reuse (main-checkout receipt
`evidence/verify-1789027100561-f887115261642078.json`). The agent launched the
native Critic itself. Corrected attempt
`attempt-1789032164991-22ba135b13a99089ea9afe92` completed but rejected the
briefing for including a prior verdict; it explicitly withheld substantive
judgment. Its `pass: false` with zero findings is not an inventory approval.
The earlier instruction to keep the prior result available must be reconciled
with the Critic's prohibition on prior-verdict prose before another dispatch.
The original receipt remains retained; no new review has been started.

## PO authorization of the two completion actions — 2026-09-10

After the exact single-hash proposal and the one-time additional inventory
review were presented separately, the PO replied:

> Beides okay und machen. Lege mir gerne Befehle vor

This explicitly authorizes the prepared Critic-host digest substitution below,
performed by a separate mechanical transcriber, and one additional inventory
correction review after green deterministic gates. The QG-13 exception is for
this inventory package only, not an unlimited retry allowance. The prior
inventory result must remain available to the reviewer; already cleared
unrelated packages are not reopened. QG-16 separation remains mandatory.
No PASS, publication, installed plugin replacement or push is implied.
The pending labels in the historical request below are superseded by this
decision; execution results are recorded separately.

## Concrete candidate completion decisions — 2026-09-10

The clean repaired candidate `8f68ec7cc0f3f12738d7190e123a00ee893f251c`
completed full Verify with 516/517 passing and security exit 0. Receipt:
`evidence/verify-1789023969047-0b2e12acd8e3216a.json` in the main checkout.
The sole failing suite is `codex-isolated-critic-protected-preimage-tests`.
An independent mechanical audit checked all nine protected hashes and found
exactly one mismatch, caused by the Critic host repair in
`7ec7311314ef01ca40da86f9de8ab00274f171ee`.

- **Decision requested, pending:** authorize separate mechanical transcription
  of exactly the `plugins/pipeline-core/scripts/codex-critic-host.mjs` entry in
  `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json`:
  `4bdd5487ec60115232cacda2ac53235200c74a2733db10176bf12081500dfcdf`
  becomes `e4511f1ee520b200de2e011ad8df641726accf32b10e38dbb6e4b8237997a5fe`.
  No other pin or test changes are included. QG-16 requires explicit action
  authorization and separation from the source repair's authorship.
- **Frozen proposal:** main-checkout
  `scratch/NVA-CRITIC-PIN-PROPOSAL-1/proposal.json`, with exact before/after
  files and all nine computed hashes. Proposed inventory byte SHA-256:
  `aafc9bfcb5650324c5b29c522f791d7decfe622c43d5f385db929f16232d43d5`.
  This mechanical audit does not supply a correctness verdict.
- **Second decision requested, pending:** the one-time inventory review
  exception detailed below, after deterministic gates pass. Neither decision
  is inferred from the instruction to prepare the local candidate.
- **Next execution:** after authorization, transcribe the exact pin, run the
  protected test and full Verify on the resulting bound candidate, then
  complete the authorized review and required reader closure. No push,
  release or installed plugin replacement is included.

## Completed split review batch and inventory decision — 2026-09-10

The external five-job batch completed on candidate
`8741613004e7ac84e48fa00a0a25e3d08ab682d1`. Compatibility/bootstrap passed;
the other four results contain ten findings in total. Lifecycle/override
explicitly remains partial because two large test bodies exceeded its tool
budget. `reviewed` records execution, not approval. Repairs are isolated in
the `candidate-review-fixes-8741613004e7` worktree; no installed plugin swap,
push or release is authorized. The combined corrected candidate's full
Verify is still pending at this entry.

- **Question:** once the concrete inventory corrections and deterministic
  checks are complete, may one final, narrowly scoped inventory correction
  review exceed the usual two-round cap?
- **Recommendation:** retain the required genuine passing inventory receipt;
  obtain an explicit one-time QG-13 exception for that package only. Do not
  interpret this entry as granting the exception or start it automatically.
- **Alternatives/consequences:** retain the normal cap and leave publication
  attestation pending; local repair and other approved work can continue.
  Direct parent verification is required by QG-13 after the second blocking
  round, but is not the genuine passing receipt the current inventory spec
  expressly requires. Changing that attestation contract would itself need
  an explicit PO decision, never a silent substitution.
- **Evidence:** both genuine inventory rounds found blocking defects.
  Initial result: `2026-09-10-current-artifact-critic-round-1.json`.
  Correction result: [retained inventory verdict and receipt](2026-09-10-split-critic-inventory.json).
  Other retained results: [lifecycle](2026-09-10-split-critic-lifecycle.json),
  [advisory](2026-09-10-split-critic-advisory.json),
  [compatibility](2026-09-10-split-critic-compatibility.json), and
  [handover](2026-09-10-split-critic-handover.json).
  Batch summary:
  `scratch/NVA-CANDIDATE-REVIEW-COMPLETION-1/batch-1789020476965-f8c06b06/summary.json`.
  Governing requirements: [QG-13](../../guardrails/quality-gates.md)
  and [inventory attestation contract](../../specs/sprint-nova-epic/design/2026-09-10-capability-current-source-review.md).
- **Affected package/blocking status:** inventory publication attestation and
  its downstream final reader closure; no additional approval is needed for
  the already authorized repairs, focused tests, local commits, documentation
  corrections or combined Verify. Prepare those results before asking the
  PO to decide.

The PO also requested a global, concise README with runner details on the
linked detail page. Obsolete Claude-only enforcement claims are corrected:
Codex and Antigravity have blocking adapters, with coverage and prerequisites
documented separately. Recent happy paths without observed bypass are
reported by the PO; no independent live receipt is invented from that report.

## Morning review result — 2026-09-10

The PO executed the prepared remaining-candidate review in an external
terminal. The process completed normally and returned `reviewed`, but its
verdict is **partial, `pass: false`**. The 54-file packet exhausted its
24-call review budget. It found three major and two minor defects; it did
not grant full-scope approval. The packet was too large for that review
budget and will be split for the remaining coverage, not repeated unchanged.

- **Question/action:** no new PO decision is needed to correct the five
  findings and complete the remaining authorized review coverage.
- **Recommendation:** fix archive symlink containment, obsolete Claude
  Advisor routing instructions, commentary/final answer handling, repeated
  plan nudges and stale close instructions; preserve all protection rules.
- **Alternatives/consequences:** leaving these findings unresolved keeps the
  local candidate pending. A completed process or green test suite alone
  does not supply the missing review approval.
- **Evidence:** [actual partial verdict and execution receipt](2026-09-10-remaining-candidate-critic-partial.json),
  reviewed candidate `f0e1f5b17c888d374bcdd905a0d4d86995c5868f`, and exact clean
  full Verify `verify-1788999328347-b2ae127599874ff9` (517/517, zero reuse).
- **Affected package/blocking status:** local candidate completion waits on
  these corrections and unfinished technical coverage. The separate
  nineteen-artifact correction has no completed correction verdict yet;
  its interrupted attempts are not approvals. Inventory attestation and
  fresh reader closure remain pending.
- **Operator boundary:** the earlier command was rejected with
  `GUARD-GATE-STRENGTH-SHELL` and external-operator recovery. The PO's
  successful terminal execution resolves that particular execution request;
  it does not authorize guard bypasses, push, release or plugin replacement.

## Evening continuation — 2026-09-09

The PO requested completing the local 0.6.2 test candidate first, followed by
autonomous work on approved Nova backlog scope. Collect human decisions here
while progressing independent work. A technical failure is not an extra
approval gate, and prior decisions below must not be asked again.

| Topic | Current disposition | Human decision needed |
|---|---|---|
| Local candidate and subsequent backlog | Continue the accepted candidate scope, then eligible Nova work. | None for ordinary implementation, tests, local commits or review preparation. |
| Native preflight | Historical WSL reviews and smoke receipts remain diagnostic only. Native Codex sandbox/App-Server activation and acceptance are deferred to the future native-Windows package and do not block Nova B. | None for Nova B; revisit only in the separate native-Windows package. |
| V3 migration recovery | The correction Critic found the later required Verify-command question could be lost. Final correction `712f2aa3` preserves it; parent reproduction returns `collect-input`. Full Verify passed exact/clean 517/517, zero reuse, including security. See `2026-09-10-review-progress-and-input-repair.md`. | None for completed repair and self-verification. Live Alfred acceptance remains unverified. |
| Remaining inventory and reader technical coverage | Native current-artifact adapter correction passed genuine independent review at `dbd20a2f`, after exact/clean 517/517 Verify. The nineteen-artifact audit found two major inventory defects and four documentation inconsistencies; bounded correction is underway. Exact reports: `2026-09-10-native-artifact-adapter-critic-round-2.json` and `2026-09-10-current-artifact-critic-round-1.json`. | None for these repairs. Candidate completion waits for the single substantive correction review, genuine inventory attestation and fresh reader closure; no waiver is requested. |
| Final test acceptance | Report the stamped build identity, actual checks, installation status and residual limitations when available. | PO testing/acceptance after delivery. |
| Material new scope, protected external actions or required signatures | Prepare concrete proposals and append them here when encountered; work on independent approved items continues. | Only the specific decision or proof required by the configured gate. |

No new approval, review PASS, live Alfred readiness or release is asserted
by this queue entry.

For each new human decision, record the concrete question, recommendation,
alternatives and consequences, evidence, affected package, and blocking status.
Continue independent approved work while that package waits. Technical repair,
focused tests, local commits and review preparation need no repeated routine
approval. Existing answered decisions remain effective within their scope.

## PO decisions — 2026-09-07, Codex takeover

These decisions supersede the waiting/recommendation text below; numbering is unchanged.
Approval of work is not evidence that it has been implemented or exercised.

| Item | Decision and execution boundary |
|---|---|
| 14 | Follow the recommendation: measure missing bootstrap receipts before activation; establish a usable receipt path before enabling GL-09 if the measurement shows broad blocking. Activation is approved subject to that sequence. |
| 2 | Proceed with slicing-hook wiring. The PO applied the attended helper and committed the Claude hook/inventory at `2dab5966ee827b390c99546738628a29adf49308`; no repeated ceremony is required. Native Codex/Antigravity advisory delivery is also in candidate scope under ADR-0080. |
| 11 | Proceed; already implemented by `9c15d74d5a833678ad9b2f352953d03059cf73bc`, corrected closure OIDs at `f94882ba6e59cc093b4500af3ad50c3fb50f818c`. Verify: 517/517, exact binding at the latter commit. No repeat signature is needed. |
| 10 | Accept the proposed split and wire it into the backlog: reader review within the documentation block; release preflight checks a record bound to the documentation state. |
| 13 | Keep the change-request procedure in Nightwing. |
| 12 | Follow the recommendation: prioritize the ADR reconciliation coverage after the item-10 decision, as its own bounded package; complete coverage before relying on that mechanism for the new review binding. |
| 4 | Retain the anonymous `AI-Assisted: true` marker; no provider/model co-author or session trailers. Existing dispatch-evidence trailers remain governed by GIT-03 and the previously recorded PO decision. |
| 8 | **Superseded 2026-09-12:** the former WSL live-run approval is withdrawn from Nova B. Native Codex Critic sandbox/App-Server execution moves to the future native-Windows package; the ordinary fresh-session Critic remains the autonomous route. |
| 7 | **Superseded 2026-09-12:** the supervisor native live probe moves with item 8 to the future native-Windows package and is not a Nova-B gate. |
| 6 | The latest PO boundary is read-only. Working operator-local access and actual Desktop/WSL read evidence were supplied; import with provenance and keep B2 execution separate. No CI start, project configuration change or push is authorized. See `2026-09-07-gitlab-read-access-observation.md`. |

The GitLab project coordinate is held in local operational context, not copied into
the public core. No key, credential, or account identifier belongs in this record.
The original prose below is historical context, including obsolete waiting states.

**Additional PO scope, 2026-09-07:** finish the authorized potential 0.6.2 content,
then stamp a new local test candidate; publication is not requested. Update this
repository's V3 model routing sensibly for current Claude, Codex and Antigravity
models, with provider/runner evidence and role-appropriate cost/effort. The PO
committed protected model authority/projection at
`f895abafb9d99da259b1d407143d82402f177db6`; no repeat model ceremony is needed.
Actual model and effort choices must consume V3 authority rather than duplicate
constants in call sites. No credential search or renewal is delegated to agents.

**PO sequencing and model constraint:** produce the local candidate first;
D.2–D.6 follow while the PO tests it and remain in the final 0.6.2 scope.
Exclude Claude Fable 5.1 from all selected routes, including fallbacks, because
the PO's subscription does not include it. Existing floating `fable` aliases
must therefore not remain active routes.

**Historical access attempt:** an earlier bounded read request returned HTTP
403, recorded in `evidence/gitlab-access-observation-2026-09-07.json`. Its exact
credential identity cannot be reconstructed. The later supplied successful
read observation supersedes the access blocker, not that historical uncertainty.

**AFK continuation:** complete the local candidate with the confirmed Greenfield
repairs and the read-evidence report. Collect actual human-only decisions and
signatures together; at technical blocks continue independent work. D.2–D.6
follow the test candidate; eligible Nova B work follows where those are blocked.
No release, push, global plugin refresh or daemon restart is implied.

The original override-message finding is retained separately in
`backlog/items/2026-09-07-guard-override-message-misassigns-roles-and-omits-signing.md`.
Nonliftable lifecycle recovery and executable legitimate signing guidance are
different contracts; evidence for one does not close the other.

Everything that is blocked on the PO rather than on work. Collected because
the PO is mobile and cannot sign today. Ordered by what unblocks the most.

Nothing here is urgent in the sense of decaying. Each item states what it
costs, what it unblocks, and what happens if it is never done — so the PO can
skip any of them deliberately rather than by omission.

---

## 1. TP-3 signature: register `guard-slicing.test.mjs` in the verify gate

**DONE 2026-09-06** — signed at the desk, landed as `eecb4273`; the
inventory obligation the registration created is met in `ec0b158c`.

**Needs:** an Ed25519 signature at a desktop, ~2 minutes.

**Effect:** the gate goes from 514/515 to fully green. The 33 `guard-slicing`
tests begin running in CI; today they run in no gate at all.

The edit is two lines in `harness/scripts/verify.mjs`, after the
`guard-dispatch-tests` entry:

```js
{ name: "guard-slicing-tests", file: join(hooksDir, "guard-slicing.test.mjs") },
```

**Note on the ceremony:** the one seeded on 2026-09-06 binds to HEAD
`0768bbff` and lapses at 12:27:41Z. It is expected to expire unused. Re-seeding
is two minutes of work and produces a fresh digest — do NOT try to reuse the
old one.

**If never done:** the gate stays red for one suite, and the slicing tests
stay invisible to CI. Everything else keeps working.

## 2. `hooks.json` wiring for `guard-slicing.mjs`

**Needs:** an attended operator-tool run outside any agent session.
`hooks.json` is on `NEVER_LIFTABLE_KERNEL_PATHS`; no in-session route exists,
by design.

**Effect:** the slicing nudge starts firing at all. Until then the module is
built, tested and inert.

**Do item 3 first.** Wiring this before knowing why the sibling guard never
fires risks a second registered, tested, silently inert guard.

**If never done:** the increment-1 experiment never runs, and increment 2 has
no data to be decided on.

## 3. Payload capture: why does `guard-dispatch-budget.mjs` never fire?

**DONE 2026-09-06 — answered, and the answer is actionable.** The capture ran
against two live dispatches. Every payload, from a dispatched subagent as much
as from the orchestrator, carries the PARENT session's `transcript_path` and
`session_id`; no payload ever carries a `subagents/agent-<id>.jsonl` path. The
guard's discriminator therefore never matches, which is exactly why its
counter never moved. The real discriminator is the key set: a subagent payload
carries `agent_id` and `agent_type`, an orchestrator payload does not, and
`agent_type` additionally names the agent definition, so a budget could be
tiered per tier. The capture hook itself was dead for hours for an unrelated
reason worth remembering: its inline `node -e` program carried the log path in
double quotes inside a double-quoted program, the shell stripped the inner
pair, node died on a SyntaxError, and a `PreToolUse` hook exiting
non-zero-but-not-2 reports only to the user — invisible from inside the
session. The sink is a file now. Full record:
`scratch/payloadcapture-finding.md`, to be filed as evidence.

**No longer blocked on the PO.** The guard fix (swap the discriminator to the
presence of `agent_id`, with tests pinning both payload shapes) is ordinary
work and is filed as its own backlog item.

**Needs:** a temporary hook in the user-level `~/.claude/settings.json` plus a
Claude Code restart — the same cheap route the channel probe used, no
repository ceremony.

**Effect:** answers the most consequential open question of the day. The guard
is registered, its logic is proven correct by direct probe, and after four
dispatches its state directory holds no counter and no diagnostic log. The
probe resolved `maxTurns: 80` and a working cap of 65 — **this guard, working,
would have prevented all four of the day's harness truncations**, two of which
lost their entire dispatch report.

Leading hypothesis to confirm or refute: a real subagent's `PreToolUse`
payload may carry the PARENT session's `transcript_path`, which would classify
every subagent call as the orchestrator and silently count nothing.

**If never done:** every tool budget in every briefing stays advisory with no
mechanism behind it, and dispatches keep being cut mid-run.

## 4. Attribution conflict: session instruction vs. GIT-03

**Needs:** a decision, no tooling.

A session-level instruction in this environment asks for `Co-Authored-By` and
a session URL on every commit. `guardrails/git.md` GIT-03 forbids provider or
model co-author trailers, session URLs and correlation identifiers, and says
"there is no override" — the guard enforces it, and refused such a commit
today. A dispatch independently reached the same conclusion and flagged it.

The repository rule is currently winning, which is correct behaviour for an
agent. Whether that is what the PO *wants* is not an agent's call. If the
attribution instruction is meant to apply here, it needs a deliberate decision
(an ADR amendment), not a silent per-commit choice.

**If never done:** commits keep carrying `AI-Assisted: true` only. No harm;
the conflict simply stays unresolved and will be rediscovered.

## 5. Stale installed plugin copy

**DONE 2026-09-06** — the PO ran the marketplace copy, `claude plugin update`
and `/reload-plugins`; the preflight reads back
`0.6.1+claude.20260906172530.87af6b6` as the loaded version, so this
checkout's own sessions now enforce the current guards. No restart was needed:
`hooks.json` changed only inside its `$comment` between the installed build
and this one.

**Needs:** a marketplace/plugin update plus `/reload-plugins`.

`docs/state.md` records that the installed copies of at least two guards are
stale, and an open backlog item tracks it
(`pipeline.installed-plugin-copy-stale-vs-repo-source`). Today's diagnosis
showed the dispatch-budget registration is NOT stale, so this is narrower than
feared — but it is unmeasured for the rest.

**If never done:** fixes that land in the repository may not be enforced for
this checkout's own sessions, and the gap is invisible.

## 6. GitLab evidence for B2/B4

**Needs:** the PO's project name or URL, and whether the API key still lives.

The PO stated a real GitLab repository was built and tested against, and that
it worked. No durable trace of that run exists anywhere in this repository's
branches or history. Either the evidence lives outside the repo, or the items
are documented as more proven than they are.

**If never done:** B2/B4 keep claiming a live-tested state that this
repository cannot evidence.

## 7. B1 / Codex: one live provider probe

**DEFERRED BY PO 2026-09-12.** Native Codex sandbox and App-Server execution
under WSL is not an acceptance environment. Revisit this only in the separate
native-Windows package; it is not a Nova-B blocker or acceptance criterion.

`local-worker-supervisor.mjs` has never executed a real provider. Its only
production caller runs it in `fixture` mode, and the `codex-exec` path
requires `allowProviderExecution: true`, never passed. The PO decided to
retain the supervisor for Codex/AGY runner neutrality; that decision is
recorded but unexercised.

**If never done:** the supervisor stays retained on paper and unproven in
practice.

## 8. One real end-to-end Codex Critic review run

**DEFERRED BY PO 2026-09-12.** Run this only as part of the separate
native-Windows package. The supported Nova-B review path is the ordinary fresh
read-only Critic session; WSL results must not be presented as native
readiness.

Handed over from the Alfred checkout: the selected-Codex-Critic transport has
a producer and no consumer, so the `selected-runner-transport` gate has no
implementation. Criteria 1–4 of that handover (the host-side consumer, real
launch under the selected profile, correctly bound receipts, safe refusal) are
buildable here without the PO and are being built.

Criterion 5 is not. "At least one real successful end-to-end review run" means
executing a live provider, the same class as item 7. An agent must not
authorize that for itself, and satisfying it with a fixture while reporting it
as real would reproduce precisely the defect the handover is complaining
about — "existing tests with substituted functions do not prove this
connection" — one level higher up.

**If never done:** the transport ships tested but never once exercised against
a real Codex, which is a weaker claim than the handover asks for and must be
reported as such rather than rounded up.

Analysis: `backlog/evidence/2026-09-06-codex-selected-critic-transport-gap.md`.

## 9. Accept the slicing design as ADR-0080

**DONE 2026-09-06** — accepted by the PO in session ("accept", all five decisions); renamed and indexed in this commit.

**Needs:** one word from the PO — "accept".

`docs/adr/0080-parallel-dispatch-slicing-enforcement.md` has had two T1
Critic rounds (FAIL then PASS-bounded-by-step-1), its blocking precondition is
cleared by the channel probe, its open parameter is resolved by measurement,
and the mechanism it describes is built and tested. ADR-0069 D2 allocates a
number *"in the act of being accepted into the trunk — the same moment its
`Status:` becomes `accepted`"*. That is a PO act, not an agent's. On
acceptance the file is renamed to `0080-…`, its status set, and every
slug reference rewritten in the same commit — the agent does that; the PO
says the word.

**If never done:** the design stays a draft referenced by slug. Nothing
breaks; ADR-0069's counter simply never learns of it.

## 10. Where the reader's review is anchored so it cannot be skipped

**Needs:** a decision on placement, not on whether it happens — the PO already
required the review itself.

A reader's Critic (Lektor) reads the user-facing documents as a user and
judges comprehensibility, order, granularity and weighting, with a hunt for
the recency inversion agent-written documentation reliably produces. The first
round ran on 2026-09-06 and produced findings no structural check produces
(`backlog/evidence/2026-09-06-doc-reader-review-round1.md`): the word "audit"
appears in two of six front-door documents while the decided audience is
teams carrying audit obligations.

The placement problem is the PO's own: a review at the release preflight
produces findings, which produce documentation changes, which produce a new
candidate the preflight would have to review again. The proposal on the table
is to split the expensive judgment from the cheap binding — run the review
inside the documentation block, record it against the documentation state it
read, and let the preflight check only that binding, exactly the way
`check-doc-reconciliation.mjs` binds an obligation to a commit range. Full
reasoning in `backlog/items/2026-09-06-documentation-has-no-reader-facing-review-and-no-machine-binding-for-one.md`.

**If never done:** the review stays a practice one Elephant remembers, which
is the failure mode the reconciliation check's own header warns about.

## 11. TP-3 signature: run the done-predicate checker as a gate check

**Needs:** one PO signature on `harness/scripts/verify.mjs`, whenever the PO
is at the desk — the same ceremony as item 1.

`check-backlog-done-predicate.mjs` finds items whose declared completion
predicate contradicts their status. It is registered in the gate **only as a
test suite**, so the checker itself never runs against the live tree. Its
sibling `check-backlog-sprint-assignment.mjs` IS registered as an executable
check, so the asymmetry is visible in one file. Running it today reports three
items in `status: open` whose predicate is already satisfied — work that is
finished and still counted as open.

**If never done:** the backlog's own contradiction detector stays advisory and
the open counts drift quietly.

## 12. Does the reconciliation precedent get its coverage back?

**Needs:** a priority call, not a signature.

`check-doc-reconciliation.mjs` enforces only against ADRs carrying a
`**Governs:**` line: 12 of 80 today. The rest are counted and never enforced,
deliberately, so the check was usable on day one. Adding the missing lines is
mechanical and cheap; the question is only whether it is worth doing before
the reader-review record is built on the same mechanism.

**If never done:** the push-time documentation gate keeps covering roughly a
sixth of the decisions it was built to cover, and any new mechanism modelled
on it inherits the same quiet gap.

## 13. The change-request procedure is Nightwing, not Alfred — decide whether that stands

**Needs:** a scheduling call, and only that. No signature, no ceremony.

The PO asked on 2026-09-06 whether the change-request procedure should be
pulled forward, and wondered whether it might already be coming with Alfred.
Measured: it is issue #97, "Support PO-approved design amendments during
implementation without full rebaseline", labelled `sprint:nightwing`, P1/L,
with an activation gate on issue #67 (the integrated Nova/Cyborg/Phoenix
baseline). Alfred does not carry it.

It is not a process rule that can be adopted quickly. It defines a
rebase-stable Authority Revision over a closed authority boundary and
deliberately dissolves the mutable digest chain that currently binds the PRD
to the Spec — a foundation change, not a procedure laid alongside the
existing one.

What is separable, and worth knowing: issue #97's scope item 7 already states
the principle a blocked session needs, in almost these words — unapproved
authority drift must return a typed result with sanctioned recovery actions
rather than a generic lifecycle deadlock, and the guard must admit exactly
those actions. That principle is therefore settled and no longer needs
deciding. What is open is only whether it gets applied to other triggers at
their own size, which the continuity-deadlock item now proposes.

**If never decided:** the procedure waits for #67, which is the current plan,
and each deadlock class gets handled on its own as it appears.

## 14. Should the bootstrap-receipt gate (GL-09) actually start gating subagents?

**Needs:** a yes or no. No signature, no ceremony, but it is not an
implementor's call.

GL-09 in `guard-lifecycle-ready.mjs` is built to require a bootstrap preflight
receipt before a dispatched agent's first `Edit`/`Write`/`NotebookEdit`. It has
never gated anything, because it identifies a subagent by a transcript-path
shape no payload carries — the same measured defect as the budget guard's.

Correcting the discriminator does not merely fix bookkeeping there: **it turns
the gate on.** Every dispatched agent in every session would then be denied its
first write until a preflight receipt exists. That is very probably what GL-09
was built for, and it is a real change in what the guard admits, so a dispatch
briefed only to re-scope state correctly refused to make it silently
(`NVA-B-GLIDENT-1`, stopped clean, nothing touched).

Two smaller questions ride along and only matter if the answer is yes: a
payload with a relative transcript path is denied today through an
invalid-identity sentinel and would flip to admitted; and about a dozen test
cases exercise identity states the corrected two-state check has no analogue
for.

The third call site in the same file (`denialClassesScopeKey()`) is
admission-neutral and needs no decision — it proceeds as ordinary work whatever
you answer here.

**If never decided:** GL-09 stays dead, and a dispatched agent can write before
its bootstrap is proven. Nothing breaks that is not already broken; the gate
simply never becomes real. Full analysis in
`backlog/items/2026-09-01-subagent-identity-may-never-resolve-so-per-agent-scoping-is-inert.md`.

---

## Not on this list, deliberately

The verify-runtime optimisation. The four-module thesis was **refuted** by
audit: `pipeline-state.mjs` and `human-guard-override.mjs` are process-global,
so the two heavy suites the win was expected from cannot be evicted. Twelve
lane members remain eligible on that criterion alone, gated by two further
modules. That is ordinary work, not a PO decision, and it is not promised for
this candidate.
## CI failure reporter public-log boundary — ready for PO decision

The current reporter is reachable and bounded, but an independent review on
2026-09-12 confirmed that it publishes an otherwise-unclassified raw log tail
after only four credential-pattern replacements. Its exception handler also
publishes raw `error.message`. The draft requirement at
`docs/adr/0084-ci-failure-reporter-public-log-boundary.md` is therefore a
material public-log trust decision rather than editorial cleanup.

**PO decision — 2026-09-12:** accept draft AC5's positive allow-list and AC10's
disclosed, non-gating failure behavior. The repaired reporter emits only typed
suite/name, coarse status, safe structured attribution, and a
repository-relative or digest reference to private evidence; any unclassified
content becomes an explicit redaction marker. Reporter failure remains visible
but does not create a second CI gate after Verify is already red. The PO
declined the broader sanitized-excerpt grammar and its higher residual
disclosure risk. Implementation may proceed.

## Advisor calls from dispatched children — ready for PO decision

Five known Goldfish/Critic dispatches called the Advisor despite a concrete
briefing prohibition; the repository learned about them only through voluntary
self-reporting. The normal demand-gated Advisor submission already produces a
receipt, but the raw child call that caused these incidents has no durable
trace. The prohibition is conditional: it is present when the Elephant has
already bound the relevant Advisor demand, rather than a blanket ban on useful
consultation.

**PO decision — 2026-09-12:** when the exact child dispatch is bound to that
explicit prohibition, block the raw Advisor call before its model effect and
record a minimal private audit event. Without that prohibition binding, this
rule does not block the call, but the existing demand, consent, candidate,
route and evidence checks remain mandatory and the attempt remains auditable.
This makes the promise in the concrete briefing enforceable while preserving
permitted Advisor use.

Alternative one is allow-and-audit, which makes the current Forbidden section
non-binding and requires removing that promise from policy and templates.
Alternative two blocks every direct child Advisor call and routes all judgment
through stop, Elephant consultation and re-dispatch; it is simpler but adds
turns and latency and discards consultation that has measurably improved prior
work. The PO declined both alternatives. The runner-neutral core and the
currently interceptable runner surface may now proceed; native Codex sandbox
execution under WSL remains outside this decision.

## Tool budgets on runners without authenticated live-call events — PO decision 2026-09-12

Codex and Antigravity may receive budget-bearing role dispatches even though
their current host surfaces do not provide authenticated per-call events for
the shared counter. The dispatch and its result must label the base budget as
not technically enforced on that runner. A shared policy core, briefing duty,
stop condition or `maxTurns` value is not evidence of live-call enforcement.
The existing Claude adapter may claim enforcement only for its measured and
authenticated caller shape. This decision does not weaken the declared stop
condition or the runner's actual `maxTurns` cliff, and it does not block later
authenticated Codex or Antigravity adapters.

## Governance-action lifecycle ADR — proposed, review evidence pending

The proposal at `docs/adr/draft-governance-action-events.md` keeps
queue dispatch/status events on the existing dispatch-correlated payload and
adds a separate closed `pipeline.governance-action-event.v1` payload in the
same lifecycle stream for verification, review, gate, recovery, and
reconciliation actions. Every portable action binds an exact commit/tree; the
payload and envelope identifiers are deterministically derived and checked for
equality; the admitted kind/status/reason combinations are fully enumerated.

Recommended decision: accept and number the ADR so the nine `LND-*` slices can
proceed reader-first. The alternative is to keep the current false choice:
either omit these governance actions or fabricate queue/worker identity for
them. On 2026-09-12 the PO selected the minimal exact-candidate HGO projection
described by ADR-0083 D5: the public fact is digest-bound and contains no
command, path, human name, rationale, target detail, key identity or private
request/receipt bytes. The authenticated private HGO ledger remains the
detailed authority record. Native Codex sandbox/App-Server execution under WSL
is outside this decision. The prior Critic-PASS note was not candidate- or
trajectory-bound; a fresh review failed that evidence boundary. Formal
acceptance therefore also requires exact-candidate deterministic evidence and
a fresh refs-only review on the stable candidate.

## Terminal-action privacy signoff — final-candidate ceremony

**Needs:** a data-privacy reviewer signature bound to the final candidate.

The terminal-action producer now requires the PO's `humanName` before it can
prepare authority setup. The independent correction review cleared the
functional boundary, private request storage, digest-only receipts, rollback,
dependency surface and secret handling, but governance checklist item 1
requires an attributed privacy signoff whenever a personal-data field or flow
changes. This record cannot manufacture that human signature.

The signoff must cover the final candidate containing `614b8daa` and its
unchanged descendants, and confirm that `humanName` is confined to the
existing private authority request/receipt flow and is not added to portable
or public evidence. It is a final-candidate ceremony; it does not block other
Nova-B implementation batches.
