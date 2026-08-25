# Human-authorization inventory

Point-in-time catalog of every place Pipeline requires a live human action,
and whether it sits on the shared detached-proof contract
(`docs/po-approval-proof-contract.md`) or a bespoke mechanism — delivered as
the "inventory of every existing human intent and configured gate" step of
`backlog/items/2026-08-02-unified-human-authorization-ux.md`'s Proposal.
Compiled 2026-08-25 by direct inspection of the cited artifacts; re-verify
before relying on it after a material change to any of them.

## Gates on the shared detached-proof contract

| Intent / gate | Mechanism | Proof-bound? | Configured mode | Reference |
|---|---|---|---|---|
| Push (`git push` to a gated destination) | `po-approval-gate.mjs prepare-critical`/`verify-critical` + `po-human-approval.mjs approve-critical`/`authorize-critical` (kind `push`), or the `chat-gate-ceremony.mjs` attended-TTY confirmation | Yes in `signature` mode; attribution-only in `chat` mode | `gates.push_approval` in `pipeline.user.yaml` (this repo: `signature`) — [ADR-0056](adr/0056-push-approval-mode.md) | `docs/push-release-flow.md`, `docs/po-approval-proof-contract.md` |
| Deploy | Same critical-action contract, kind `deploy` | Yes | No source-of-truth mode of its own yet (ADR-0056 Follow-up: "if an operator ever asks for one, the shape is already proven") | `docs/po-approval-proof-contract.md` §"Critical-action binding" |
| Publication | Same critical-action contract, kind `publication`, verified externally by the fixed publication executor at consumption | Yes | No source-of-truth mode of its own; **not** rebuilt onto ADR-0056 Decision 7's push shape — ADR-0056 Follow-up states outright "the two now differ in shape, and one shape would be better than two" | `docs/adr/0056-push-approval-mode.md` Follow-up |
| Guard Maintenance Window (GMW) lift | `guard-maintenance-window.mjs install`, signed via `po-human-approval.mjs sign-intent` against a bare intent digest | Yes | n/a (always proof-bound) | `docs/po-human-approval.md` §"Signing a bare intent digest" |
| Human Guard Override (HGO) | `guard-human-override.mjs plan`/`prepare-authorization`/`emit-signature-digest`/`authorize-by-signature`, or in-session chat clearance | Yes in `signature` mode; attribution in `chat` mode | Same `gates.push_approval`-style mode selection | CLAUDE.md "No tree mutation while a HEAD/tree-bound PO command is outstanding" |
| Kickoff language confirmation (`project-onboarding-v3.mjs`) | `chat-gate-ceremony.mjs`'s attended-TTY confirming-step primitive (the same primitive `chat`-mode push/HGO clearance uses) | No — this is a confirmation gate, not a critical-action proof; not in scope for `push`/`deploy`/`publication` | n/a | `plugins/pipeline-core/lib/chat-gate-ceremony.mjs` header comment |

`project/critical-human-proof.json` (`pipeline.critical-human-proof-policy.v3`)
is the live source of truth for which kinds are mandatory: currently
`["push", "deploy", "publication"]`, none waived in this repository.

## Deliberately outside the proof contract

| Intent / gate | Mechanism | Why it is not on the contract |
|---|---|---|
| PRD approval (`pipeline-state.mjs approve-plan`) | Plain `--by <name>` attribution string; PO-gate-authority's own path/profile/SHA candidate binding | **Resolved by explicit PO decision, 2026-08-18** (`backlog/items/2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md`, closed/rejected): PRD approval does **not** get the same Ed25519 signature requirement as push. It is already SHA-bound and judged less security-critical than a push; adding a signature requirement would violate the "minimize PO gates" line already established for the HGO ceremony. Not an open gap — a settled answer. |
| Remote provisional approval (`remote-provisional-approval.mjs`) | Hashed, one-time, candidate-and-scope-bound code, 30-minute expiry | Deliberately excluded by design: a code pasted into chat is agent-visible and therefore not a secret or identity proof. Structurally rejected by push, deploy, publication, release, override, merge and deletion flows — it authorizes only a local continuation acknowledgement, never a durable external-effect authorization. | 

## Remaining gaps against this item's Proposal (as of 2026-08-25)

- **PRD-approval migration** — resolved (see table above); no further action.
- **Publication shape unification** — still open, but it is its own named
  follow-up in ADR-0056, not this item's responsibility to re-litigate.
- **Formal inventory** — delivered by this document.
- **Adoption-enforcement check** ("prevents new one-off human-approval UX
  from being introduced") — still does not exist. A `rg -l "approv"
  plugins/pipeline-core/scripts/ -g "*.mjs"` pass during this triage returned
  over 70 matching files, most unrelated to human authorization (test files,
  publication/backlog tooling, etc.) — building a check that reliably tells a
  new bespoke approval prompt apart from ordinary code mentioning "approval"
  is a real design/scoping task in its own right, not a bounded mechanical
  addition, and was not attempted in this pass.
- **Passkey/WebAuthn or other adapters** — none exist beyond the shipped
  external encrypted Ed25519/SSH-style key adapter (`po-human-approval.mjs`,
  0.5.0). No desktop application currently exists in this repository to
  consume a WebAuthn adapter; building one without a real consumer would be
  speculative.
- **Cross-platform conformance** — unverified in this pass; would need
  execution on macOS/Windows/WSL, not available in this sandboxed session.
