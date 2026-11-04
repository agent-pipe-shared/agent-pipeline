# w177-lb2 — the continuity schema knows the draft state and the core readers move onto the shared seal reader (candidate 19c, late-binding build step 2)

Delta on w190 (the clone base is the repository state plus the delivered held patch w190, because both edit the same files). **Apply order: w190 first, then this patch.** `git apply --check` against the repository alone is expected to fail until w190 is applied; against the repository plus w190 it exits 0.

Criterion binding: AC-108 is the closest existing accepted criterion; this is a fresh bounded attempt under its unchanged Spec text. The PRD and the Spec are unchanged. Design source: `docs/adr/draft-late-binding-of-prd-and-spec-at-the-approval.md` and the PO decisions of 2026-11-04 (marker `sealed: false` inside `continuity.authority`, no separate record, a draft binds no digest, no deadlock).

## What it changes

- `lib/continuity-state.mjs`: `AUTHORITY_KEYS` knows `sealed`; `validAuthority` accepts exactly one new shape, `sealed: false` with `prd`/`spec`/`result` (and optional `plan`) entries that carry a path and no `sha256`, and rejects every other shape (marker `true`, string or null; a digest on a draft entry; an extra key; a missing entry; an unsafe path; a null plan). A state without the marker takes the old branch unchanged. Every place that read `state.authority.prd.sha256` / `.spec.sha256` / `.result.sha256` (dispatch identity, native continuation binding, close transition, close-intent comparison, legacy adoption preimage) now reads the digests through the shared reader and fails closed for a draft, so a draft can carry neither a dispatch identity nor a close transition. `continuityDispatchAllowed`, `beginCloseTransition` and `bindContinuityResultForClose` (the gates toward dispatch and close) refuse an unsealed package with the typed code `CS-UNSEALED` and `exits: [prepare-seal, reopen-design]`. The ordinary compare-and-swap still moves a draft state, but cannot turn it into a sealed one (the authority entries must stay equal), so a seal never appears from nowhere.
- `lib/plan-spec-state-v2.mjs`: `continuityAuthorityBound` (the predicate that makes `reopen-design` release a bound but never submitted feature) reads the shared reader. A draft is not bound, so it is not locked: `reopen-design` replays as an open design instead of failing, and `submit-plan` still binds by path. Sealed states take the identical branch as before.
- `lib/po-gate-authority-read.mjs`: the authority PRD path is read through the shared reader (the path is available for a sealed package and a draft alike; an authority without a valid shape gives none, and the reader falls back to the plan path as it did).
- `lib/critical-action-authorization-read.mjs`: `verifySignedAction` (authority-bearing gate after the approval) refuses first, when the state carries a `continuity.authority`, on a package that is not sealed: `<prefix>-NOT-SEALED` with the typed exits for a draft, `<prefix>-STATE-AUTHORITY` for an invalid shape. A state with no `continuity` takes the unchanged path.
- `lib/onboarding-continuity.mjs`: new local `boundAuthorityDigests(continuity)`; the bind-plan validation, the promotion postimage validation, both replay checks, the recovery-candidate checks and the kickoff-candidate check compare digests through it, so a draft never matches a sealed bind or a history entry (the callers refuse or report no candidate exactly as for any other mismatch). The continuity repair that compares observed bytes to the bound digests refuses a draft with the typed exits in its message.
- `lib/authority-seal-readers.test.mjs` (new, LB2-1 to LB2-12): registered in `harness/verify-suites.json` as `authority-seal-readers-tests` and in `docs/product-capability-inventory.json` as `verify-phase:harness/scripts/verify.mjs:authority-seal-readers-tests`.

## Sources of the `rg -l "authority\.(prd|spec)"` list (non-test)

Moved or checked in this slice: `lib/continuity-state.mjs`, `lib/onboarding-continuity.mjs` (its continuity-authority digest reads; the remaining `authority.prd.sha256` hits there read the PROMOTION PLAN's own artifact objects, not `continuity.authority`), `lib/plan-spec-state-v2.mjs`, `lib/po-gate-authority-read.mjs` (path read), `lib/critical-action-authorization-read.mjs`.

Examined and deliberately not changed because they do not read `continuity.authority` at all: `lib/push-batch-contract.mjs` (validates a closed push subject whose `authority` digests are mandatory; a draft can not form one, LB2-11 pins that) and `lib/scoped-verify-registration.mjs` (validates a registration entry that pins one fixed PRD digest; a path-only entry is refused, LB2-11).

Left for the next slice (close, design-advisory, critic-preflight and rebind readers and the guard): `scripts/close-coordinator.mjs`, `scripts/publication-close-journal.mjs`, `scripts/pipeline-state.mjs` (59 hits, the largest remaining reader), `scripts/authority-restore.mjs`, `scripts/audit-index.mjs`, `lib/design-advisory-final-approval.mjs`, `lib/critic-preflight-observer.mjs`, `lib/rebind-approval.mjs`, `lib/architecture-design.mjs`, `lib/workflow-writer-preflight.mjs`, `lib/afk-assumption-mode.mjs`, `lib/runner-native-continuation.mjs`, `lib/guard/denial-route.mjs`, `hooks/guard-devplan.mjs`, `hooks/guard-el01-tripwire.mjs`, and the fixtures `lib/architecture-prospective-materialization.fixture.mjs` and `scripts/signing-disclosure-sweep/staged-p16.fixture.mjs`.

## Checks (clone)

- New suite `authority-seal-readers.test.mjs`: RED before the first production edit (7 of 12 failed against the original code, the other 5 pin behaviour that already fails closed or must not change), GREEN 12/12 after.
- Existing suites unchanged and green: see the dispatch report for the exact commands and counts.

## Not changed / not proven

- The formal JSON schema `scripts/continuity-state.schema.json` is not extended: it is used by tests only, not by the runtime validator, and its existing test reads `properties.authority.properties.result.properties.path`; a draft branch there is a separate step.
- `sealed: true` is not an accepted persisted shape (the reader reads it as sealed, the schema stays strict so there is one way to be sealed: no marker).
- The bind writer (`next.continuity.authority = {...}` in the promotion), the seal command and the seal plan do not exist yet; `prepare-seal` names a command that is not built. A draft in a phase other than design with no submission still gets `PLAN-REOPEN-SUBMISSION-INVALID` from `reopen-design`; a draft is created in design by construction, and the writer that creates it is a later step.
- No Full Verify and no Critic review; the independent review of the late-binding chain runs after the chain is built (PO decision 2026-11-04).
