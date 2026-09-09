# Alfred autonomous continuation — PO decision queue

Updated 2026-09-09. This is the collection point for decisions that genuinely
need the PO during the approved Alfred continuation. It is not a new approval
mechanism, a substitute for signed gates, or a record of feature acceptance.

## Standing instructions

- Continue the approved Alfred scope locally; the user will perform the
  terminal push after the local-priority rebase, and agents must not push.
- Keep `origin/feat/sprint-alfred` as the only upstream. Do not create
  `sprint_alfred`; the prior handover target has been corrected.
- The PO's 2026-09-09 instruction supersedes the prior no-push hold for the
  terminal user action. Keep the repository's force-push and signed-approval
  controls in force; agents do not execute the push.
- Use bounded parallel tasks where dependencies and file ownership permit.
  Check the intended slice/parallel hooks with actual observations; a tool
  call, configured hook, or running child alone is not execution evidence.
- Collect nonblocking questions here; continue independent approved work.
  Stop dependent work at a configured human gate, a material scope decision,
  or a typed hard block without a safe recovery route.

## PO decisions

### Event 16 deterministic scanner collision — permanently approved and applied

The exact clean candidate is `d88b543486ddc8e6215d3944fafc1e38aa6790da`
(tree `f803aa1a4b353ee6093676b3f33961359d193fe1`). Full Verify is red (exit 1,
499/508 green); the security finding is one high `gitleaks` `generic-api-key`
finding at line 1, column 987 in the immutable public-safe event
`governance/events/human/16-evt-hgo-deny-cc612114562e4c5069cb6c66c06dda55-0.json`.
The focused diagnostic exits 0 and confirms the raw match equals the producer
`denyDecisionId`, `payload.decisionId`, and `idempotencyKey`. Evidence:
`evidence/alfred-recovery-d88b5434-verify.json` and
`evidence/alfred-event16-scanner-proposal.json`.

The PO explicitly approved on 2026-09-09 one permanent, narrow `content-v1`
exception bound exactly to the event path, `generic-api-key`, line 1, column
987, and the machine-confirmed content fingerprint in the scanner proposal.
The exact prepared entry has now been applied once through the permitted
mutation route and read back. The event remains immutable; the ignore file
pre-edit and post-edit hashes, event hash, and fixture result are recorded in
[event16-permanent-scanner-exception-2026-09-09.md](event16-permanent-scanner-exception-2026-09-09.md)
and [event16-permanent-scanner-exception-2026-09-09.json](event16-permanent-scanner-exception-2026-09-09.json).
Candidate Security and Full Verify remain separate pending gates.

The candidate `84eeb02fc4b7aec0f808d8549efb48993d0c5045` then recorded Full
Verify exit 1 at 500/508 with the same eight failures; Security exited 0 with no
findings. The exact machine summary is
[event16-candidate-verification-2026-09-09.json](event16-candidate-verification-2026-09-09.json).
The PO separately requested on 2026-09-09 that this committed candidate be
pushed for PC transfer once prerequisites are handled. The prior no-push
standing is superseded for that request; use only `origin/feat/sprint-alfred`.
Push remains unexecuted because Verify failed and push preflight reports an
expired armed capability and divergent histories. Prepare reconciliation and
push prerequisites before any execution; do not claim a push or signature.

## Open agent work and later gates

| Topic | Current status | Next owner/action |
|---|---|---|
| C1 observer/store suite registration | Preparation is documented in [the registration route](c1-suite-registration-route-2026-09-08.md); implementation and focused tests are not yet complete | Implement the observer/store suites, run focused tests, prepare the exact registration patch, then evaluate the actual current TP-3 authorization; apply only through the valid active TP-3 route; no signature is presumed and no new approval is requested prematurely |
| C1 pure aggregation | Implementation and focused tests committed at `854b0da8`; receipt 64/64 and consumer checks 9/9 pass | With source projection now landed, prepare emission/local-report refinement, then run the next candidate Verify and independent T1 review |
| C1 source projection | Committed at `125a2d160ac7b3c4d16979ed4cfbe305a98f8ed5`, tree `173ccbd8f7b0e6e5438742c6a79be6692d01e9c6`; C1 receipt suite 80/80 (64 preserved plus 16 source-projection tests), consumer 9/9, diff-check 0; candidate `96238c3c` Verify is now recorded red at 499/508 | Prepare store/controller contract and later usage/observer work; T1 remains gated by red Verify and baseline is not started |
| C1 producer capture | Committed at `3e11cdadfe8c0e6ab9bd864211fc6dc6e03270dc`, tree `ab433771e3711d999d75d04fbc3f71acbeb7a845`; focused checks baseline 6/6 then 20/20, consumer 9/9, diff-check 0 | Integrate the reviewed store/observer/controller plans, then run a new candidate Full Verify; no emission or baseline claim |
| Slice/parallel hooks | Exact hook identity, native tool coverage and live invocation evidence unmeasured | Read-only investigation, then bounded tests where admitted |
| Existing first-core and scanner-exception review | Installed CAS-READY health and physical Critic adapter layout fix are observed; selected execution and T1 remain pending while Verify is red | Recheck the selected transport and candidate-bound review after the next green Verify |
| Real collection baseline | Native evidence and measured 14-day window remain open | Implement/validate collection before recording a real start; never backdate |
| Future publication | Local-priority rebase is complete and ready for the user terminal push; agents must not push | User performs the terminal push against `origin/feat/sprint-alfred` after independently checking the configured gates; refresh refs afterward |
| Feature acceptance | Open | Present only after the required work and evidence exist |

The two earlier A1 decisions remain resolved as recorded in
[a1-po-decision-queue.md](a1-po-decision-queue.md). Their historical wording
does not reopen them. The suite-registration implementation and verification
status are in [registered-verify-gate-handoff.md](registered-verify-gate-handoff.md).

New entries must state the concrete decision, affected package, alternatives,
recommendation, consequence of deferral, and the evidence path. Clearly separate
an agent-recoverable blocker from a human decision; preserve resolved entries
with their disposition instead of silently dropping them.
