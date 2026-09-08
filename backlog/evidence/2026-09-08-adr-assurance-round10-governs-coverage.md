# Assurance and governance-event Governs coverage rationale

The four source headers name tracked current owners and their direct tests. The
runnable fixed-baseline proof is `node scratch/NVA-B-ADR-GOVERNS-ASSURANCE-10/check.mjs`;
its machine report and raw command capture remain in that task's scratch directory.

## ADR-0037 — bounded Batman assurance

The AFK capability worker, ledger, Git adapter, transaction host, review path,
activation host, and their schemas/tests are the implemented bounded-assurance
surface. `verify.mjs` and the suite-registration checker are the static Verify
consumer path. The continuity, worktree, publication-close, and T1 override
paths cover the ADR's separately stated lifecycle and delivery responsibilities.
The header does not claim OS isolation, universal network exclusion, or a
generic activation system; the ADR expressly excludes them.

## ADR-0042 — global observation and document lifecycle

The Issue Form and observation-intake skill produce the global, sanitized
observation shape. The governed inventory, observation checker, document
checker, bootstrap wrapper, and Verify runner consume it fail-closed.
`public-core-observation` is the repository-global public-intake boundary and
has its direct test. The header intentionally names repository-root canon,
rather than generated plugin copies, so a changed governed source remains
visible to reconciliation.

## ADR-0065 — re-earned Verify evidence

The Verify runner, journal, resume planner and schema implement declared-input
receipts and their direct test coverage. The registration checker is the
current suite membership consumer. Push preparation, the push guard, and the
security scanner are included because the ADR explicitly retains their exact
candidate/tree bindings and refuses to narrow them; their listed tests make
that non-relaxation reviewable. A selective named membership list remains an
explicitly unimplemented follow-up, so it is not fabricated as an owner.

## ADR-0071 — immutable governance events

The envelope and receipt schemas, canonical event primitives, store,
projection, lifecycle producer, and direct tests enforce the portable stream's
closed record shape, chaining, idempotency, publication, and replay boundary.
The CLI, replay, and authority consumers are listed as current direct paths.
The Human Governance Decision Ledger is deliberately omitted: ADR-0071 says it
remains the historical source for human authority rather than becoming a
generic event-kernel owner.

## Deliberate omissions

No vendored copy is changed: these four ADRs are absent from the generator's
universal ADR manifest. No runtime, checker, policy, schema, ledger, or
generated-canon bytes are changed; the headers only declare their existing
responsibility surface.
