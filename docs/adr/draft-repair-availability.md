# Draft ADR: Recovery remains available when the in-session verifier is broken

> Agent-Pipeline · Sprint Alfred · 2026-10-03

**Status:** proposed; design only, not accepted authority.

**Context source (verbatim user requirement):** “dann mach das bitte heile und sorge dafür dass das nicht generell passieren kann. Es muss immer eine möglichkeit geben per maintaince window oder wie auch immer zu reparieren”. The concrete incident was a dead session binding; exact descriptor cleanup removed it at `2026-10-03T11:54:07.316Z` while preserving the active feature. That cleanup is historical runtime context, not proof that every future damaged state has an in-session route.

## Context

The repository already has bounded recovery for specific shapes. ADR-0082 repairs one diagnosed continuity collision using a digest-bound plan, locked compare-and-swap, append-only repair record and exact readback. ADR-0058 permits a signed, expiring Guard Maintenance Window only for GS-6 and TP-*; its verifier, lifecycle and other kernel paths remain outside that window. ADR-0059 provides exact-action HGO authorization for classified actions, while its external-operator route handles cases outside that adapter. `repair-map.mjs` derives HGO eligibility codes from the live classifier and separately reports lifecycle and GS-6 structural cases; it is not an inventory of every bootstrap, planner, verifier or writer refusal.

These mechanisms are useful in-session paths, but they depend on the current checkout, guard adapter, lifecycle and proof readers being usable. If one of those mechanisms is itself defective, expired, unavailable or unable to classify the failure, the same broken runtime cannot be its sole recovery authority. A bare refusal ending in `nobody` does not meet the user's requirement.

## Decision proposed

Recovery has three explicit levels, selected only from observed evidence:

1. **Known-shape intrinsic recovery.** Keep narrow planners such as ADR-0082's continuity repair. Diagnose one closed corruption shape, preserve the bytes and authority it cannot validate, bind the exact preimage and proposed postimage, and recheck under a lock before mutation. Never infer a missing proof or choose among ambiguous claimants.
2. **Scoped in-session maintenance.** Existing GMW/HGO APIs remain available only within their established authority, with valid signer, exact target, repository identity and bounded TTL. Expired, wrong-scope or invalidly signed proof authorizes nothing. This proposal does not expand GMW's rule set or make an in-session verifier edit itself.
3. **Attended external source/install repair (new proposal).** Distribute a pinned standalone Node CLI artifact using Node built-ins only; it imports no code from the target checkout or plugin. An attended operator selects its artifact identity and public signer anchor from a known-good version/channel outside the broken runner. Target-supplied trust configuration is never authoritative. The CLI supports only native Windows, Linux and macOS layouts that the existing repository resolver can establish; WSL is bound as a distinct physical root. A platform without verified resolver evidence returns typed unavailable.

   The CLI permits exact, bounded Pipeline executable/code/test paths only. It cannot rewrite portable Pipeline State, runtime-private evidence, approval proofs, trust anchors or unrelated plugin configuration; those data require their sanctioned recovery writers after code repair. It preserves immutable preimages and a closed proof-bound manifest in an owner-private independent recovery root, never publishing private preimage content. Repair uses the repository's configured detached human Ed25519 ceremony; models cannot sign. Lost trust or signing keys return typed unavailable with attended key re-establishment as the prerequisite.

   A live or ambiguous lock owner blocks application; age never establishes death. Multi-file repair is a journaled prefix of per-file atomic replacements, not an atomic multi-file transaction. Every step rechecks its expected preimage before replacement. A crash resumes forward from the authenticated journal only while every already-written file and every remaining preimage still matches the journal; intervening changes stop the run and are preserved. Ready is reported only after exact postimage readback of every manifest file. No automatic rollback overwrites a later writer; correction is a new authorized forward transaction.

The new external protocol is **not an existing API**. `repair-map.mjs`, `guard-maintenance-window.mjs`, HGO, `signed-quality-package.mjs` and `quality-package-materializer.mjs` provide precedent or bounded pieces; none currently implements this independent recovery protocol. The external verifier must not trust readiness claims from the runner it repairs. It must obtain its trusted source and signer configuration from its own known-good installation and human-attended boundary.

Every refusal class found in the real bootstrap, inspection, guard, planner and writer routes must have a tested disposition. Inventory is derived from executed predicates and each producer's typed results, not a hand-guessed list of error-code strings. Each new refusal path registers an observed positive/negative fixture and its declared repair or handoff. A CI static inventory/wiring check catches an unregistered producer; at runtime an unknown refusal gets an explicit attended external diagnostic handoff rather than a terminal dead-end. A changed or registered refusal path maps to one of: safe intrinsic repair, a currently valid scoped authorization, an executable attended external handoff, or a typed `unavailable` result naming the concrete missing prerequisite and how an operator can obtain it. No route may report `nobody` or silently claim ready. If evidence, signing secrets or original bytes are lost, the protocol preserves what remains and reports that limitation; it does not reconstruct authority or promise recovery of unavailable evidence.

ADR-0058 remains unchanged for in-session operation. This draft proposes a separate out-of-session route for failures that cannot safely be repaired through that window. ADR numbering is deferred under ADR-0069 until acceptance. No schema or implementation authority is created by this draft.

## Consequences

Sessions can report a concrete repair route even when their own verifier cannot run, while scope and proof checks stay outside that verifier's control. The design adds a separately maintained verifier, release/source trust, operator ceremony, transaction journal and recovery testing. Loss of trusted source, required human proof or irreplaceable evidence can still make a repair unavailable; the response must identify that prerequisite and preserve the observed state.

## Affected contracts

- Existing: ADR-0058, ADR-0059, ADR-0082, `repair-map.mjs`, GMW and HGO behavior remain as currently governed.
- Proposed: independent recovery verifier, source/install repair request and receipt, apply journal, refusal-coverage contract, and operator handoff.
- Required before acceptance: independent artifact release and host evidence for each claimed platform, threat model, exact identity and signer source, install boundary, lock ownership and crash-resume evidence, owner-private retention/audit format, and complete refusal inventory. These are evidence gates for the proposed defaults above, not unresolved design choices.
