# Critical-action authorization threat model

**Status:** immutable Nova release-boundary model. This document describes a
local control-plane change only; it is neither a release approval nor evidence
that any remote action has occurred.

## Authority and candidate binding

`approve-push` is a fail-closed durable writer action. It always requires a
verified detached `push` proof, even if `project/critical-human-proof.json` is
missing, malformed, or omits `push`. The writer resolves this exact file as a
regular in-repository file, hashes its bytes, and adds `{ path, sha256 }` to
the signed push action subject with the candidate commit/tree, source commit,
remote and full destination ref. A changed model, candidate, remote or ref
therefore requires a newly prepared detached request and proof.

The checked-in model cannot truthfully name the commit that contains it. After
the final clean candidate exists, the control plane prepares the public
detached request outside the repository, including this model's exact
path/digest through the writer-owned subject. The Critic verifies that request
against the exact candidate and policy immediately before the final PO
decision. Repository text, a chat approval, or an attribution string never
substitutes for that detached proof.

## Threats and controls

| Threat | Control | Verification | Residual boundary |
| --- | --- | --- | --- |
| A project edit disables push proof by removing `push` from the policy. | `approve-push` independently requires a push proof and rejects a policy without `push`; the push guard rejects required approvals without a proof. | `critical-human-proof-gate.test.mjs` exercises the omitted-policy rejection; `guard-push.test.mjs` rejects a fresh attribution-only approval. | A trusted maintainer can still change source and tests, but must pass fresh Verify, Security, Critic and the external final gate. |
| A valid proof is redirected to another remote/ref or a changed candidate. | The signed subject binds candidate commit/tree, source commit, remote, destination and this model digest; the guard compares stored remote/ref with the actual push. | Critical-proof and guard-push fixtures reject missing or mismatched bindings. | The Git remote itself remains an external authority and is read back by the fixed executor. |
| A proof is reused after another push approval replaces the single current slot. | The writer appends each consumed push proof digest to an additive consumption ledger and rejects any repeated digest. | Critical-proof fixture consumes a proof once and rejects the second use. | Ledger retention is local audit state; a repository rewrite is not an approved recovery action. |
| A missing, symlinked or oversized model is silently treated as current. | The writer resolves one fixed path, rejects unsafe or unavailable files, and hashes only the checked regular file. | Focused writer test supplies the model and Verify exercises the governed inventory. | The document is reviewed content, not a signing key or external trust anchor. |

## Rollback and incident recovery

Before an external push, rollback is to stop before the fixed executor: do not
delete or edit State by hand. Create a corrected candidate, run fresh Verify,
Security and Critic, then prepare a new detached request/proof. The old proof
remains consumed and cannot be transferred.

After a push, production rollback is an ordinary forward revert commit of the
affected release change to the same destination ref. That revert is a new
candidate: it requires fresh Verify, Security, Critic, a new model-bound proof
and a separately authorized push. Force-push, history rewriting, state-file
deletion and proof reuse are prohibited recovery mechanisms. This change has
not executed an external action, so no live production rollback is pending.

## Deferred risk

Remote-side branch protection and the trusted public-key resolver are external
controls. Their owner is the release PO; the control review expires on
2026-08-31 and is also required at each final external release decision. An
unavailable or mismatching resolver keeps the gate closed.
