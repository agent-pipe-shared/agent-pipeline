# Cyborg → Nova backlog handover

> **Purpose:** this is a delivery handover for Nova's canonical backlog
> writer. It is not a Cyborg-side ledger transition, does not close an Issue,
> and does not change `backlog/` on this branch.

## Handover envelope

| Field | Value |
| --- | --- |
| Delivery baseline | `fec77b901a04cdae3ae3b6233e5c1f4b72f62bcb` |
| Delivery tree | `c9530f94adaba76759617af81c7c7791e3e96f20` |
| Deterministic evidence | exact-candidate Full Verify passed; security scan clean |
| Independent review | final Cyborg delta Critic: pass, no findings |
| Canonical status authority | Nova ledger and its sanctioned writer |

The six items below were assigned to Cyborg in
[`backlog-acceptance-matrix.md`](backlog-acceptance-matrix.md). Their local
`open`/`in_progress` text is a historical delivery projection, not a second
ledger. Nova must validate the cited evidence on its selected candidate and
then use the sanctioned writer for any state transition. Do not reconstruct,
renumber, or hand-edit ledger history.

## Requested Nova transitions

| Backlog item | Cyborg package and source evidence | Validation before Nova transition |
| --- | --- | --- |
| `pipeline.recovery-preview-callback-attestation` | CYB-A0: [`cyb-a0-feature-spec.md`](cyb-a0-feature-spec.md); implementation and regressions in `recovery-preview-attestation.{mjs,test.mjs}` and `runner-profile-migration-v3.{mjs,test.mjs}`; corrective commit `6b5157c`. | Re-run the two named test suites and confirm the replay, typed-failure, schema-type, and post-hoc-timeout cases remain covered. The early feature-spec status header predates `6b5157c`; it is not current delivery evidence. |
| `pipeline.critic-context-isolation` | CYB-5b: `codex-critic-host.mjs`, `codex-critic-host.test.mjs`, [`harness/checklists/critic-review.md`](../../harness/checklists/critic-review.md), and Critic skill contract; Cyborg authority hardening includes `bec9110` and `46d43cf`. | Confirm the Critic dispatch remains paths/refs-only, read-only, disposable, and remote-free under the selected runtime. |
| `pipeline.dispatch-provenance` | CYB-5b: [`harness/checklists/goldfish-dispatch.md`](../../harness/checklists/goldfish-dispatch.md) and [`plugins/pipeline-core/skills/close-block/SKILL.md`](../../plugins/pipeline-core/skills/close-block/SKILL.md). | Confirm the dispatch-record identifier and close-authorship mapping are required and fail closed when absent. |
| `pipeline.cross-repository-override-ledger-binding` | CYB-5c: `guard-push.mjs`, `guard-push.test.mjs`, `guard-git.mjs`; binding hardening commits `fdbcf61`, `72c1e83`, and `88a051a`. | Run the positive and negative guard fixtures; verify ledger/root identity follows the validated target repository and rejects overrides or unwritable/cross-repository targets. |
| `pipeline.elephant-direct-implementation-under-afk-authorization` | CYB-1 waiver class: `control-waiver-lifecycle.{mjs,test.mjs}`, `afk-ledger.{mjs,test.mjs}`, and AFK review/activation contracts. | Confirm expiry, typed waiver authority, and mandatory fresh-context Critic follow-up are all enforced. |
| `pipeline.verify-gate-scoped-registration` | CYB-2: shared [`harness/scripts/verify.mjs`](../../harness/scripts/verify.mjs), five registered security suites, product capability inventory, and [`delivery-delta-verify-registration.md`](delivery-delta-verify-registration.md). | Run the shared Verify gate and confirm drift is rejected rather than silently bypassing a newly registered suite. |

## Nova action

For each row, retain a tuple of `{ itemId, spec, candidateCommit, evidence }`
in the Nova work package. If the selected candidate still satisfies the stated
acceptance and evidence, perform the canonical transition with Nova's
sanctioned writer. If any validation is stale or fails, keep the item open and
create a narrowly scoped follow-up; do not rely on this handover as a closure
claim.

## 0.5.0 human-authorization boundary

The delivered 0.5.0 approval mechanism is the portable CLI adapter: an
external encrypted Ed25519/SSH-style key signs an exact candidate-bound public
intent, while the agent sees neither private key nor passphrase. Passkey,
IAM/hardware-key adapters and optional remote provisional-approval codes are
future adapter work; they are not represented here as shipped functionality.

---

## Deutsche Lesefassung (nicht normativ)

Diese Übergabe fordert Nova auf, die sechs Cyborg-zugewiesenen Backlog-Punkte
mit dem kanonischen Writer zu prüfen und gegebenenfalls zu schließen. Cyborg
ändert den Ledger nicht selbst. Jede Transition muss den genannten Commit und
die Evidenz am tatsächlich ausgewählten Nova-Kandidaten erneut prüfen. Der in
0.5.0 ausgelieferte Freigabeweg ist der externe verschlüsselte Ed25519/SSH-Key;
Passkey/IAM-Adapter und mobile Übergangscodes sind ausdrücklich noch keine
ausgelieferte Funktion.
