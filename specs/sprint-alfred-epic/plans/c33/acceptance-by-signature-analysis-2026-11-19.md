# Analysis: acceptance by signature instead of a chat question, tied to the push signature (2026-11-19, nothing built)

Status: analysis only, read from the code. Recommendation at the end. Own candidate after 32, ADR first.

## As it is today
- The acceptance question comes in the one-shot close AFTER the candidate Verify and BEFORE the irreversible state close (`finish-feature.mjs`, stop `ONESHOT-ACCEPTANCE-REQUIRED`). The answer is a fixed affirmative form and becomes `acceptance.md` (an attribution record, "nothing is signed"). Anything else is a rejection and starts a correction round; the design stays closed.
- The close status vocabulary already separates "technical close" from "product acceptance" (`featureStatusVocabulary`, "Product acceptance: not recorded").
- The push comes AFTER the close: bound to the last closed feature, the PRD and Spec digests of the push candidate, the push-mode Verify, the threat model and the signature (`push-init`, `push-prepare`, `authorize-critical`).
- A checkpoint push to `feat/*` has no signature ceremony (opt-in lane).

## Existing building blocks (why it is feasible)
1. The signature infrastructure exists in every project (design approval and PRD release use it, the key lives outside the repository), so a local project needs no new setup.
2. Stop-and-rerun with a signed proof already exists in the same close (the SBOM override: `sign-intent --request`, proof file, rerun with `--sbom-override-proof`, bound to the current commit, the tree must not change in between).
3. `po-human-approval.mjs` knows a list of kinds (push, release-preflight, residual-acceptance, and others); a new kind `feature-acceptance` follows the pattern.
4. `gates.push_approval: signature|chat` is already THE switch for how a human clears a gate, so acceptance can follow it (chat projects keep the chat question).
5. `repositoryMode` (local-only or remote-tracked) is readable from the calibration, so the switch between local and remote exists.

## Local (stays local): well feasible
Flow: Verify green, stop with a signature card (feature, candidate commit, Verify result, open checks, the line "how I really started it") and a ready command, the PO signs in the terminal, rerun with `--acceptance-proof`, the proof is checked against the candidate HEAD, the feature id and the digest of the open checks, `acceptance.md` says "by signature". A rejection stays free chat text (no proof) and starts a correction round as today.
Gain: the affirmative forms (English and German), the "first sentence" rule, `ONESHOT-ACCEPTANCE-NOT-YES` and the German-form problems disappear in signature mode; acceptance becomes real proof (today the agent could pass `--human-acceptance` itself with an invented answer, it is only attribution).
Cost: three steps (copy the command, `approve`, passphrase) instead of one sentence; it needs the terminal of the machine that holds the key (cannot be answered from a phone or the web).

## Remote: feasible, with real decisions
1. ORDER: today acceptance comes before the irreversible close because a rejection means a correction round of the same feature. The push signature comes after the close. If acceptance moves there, "rejected" means do not sign plus a new fix feature or mini, and "closed, not accepted" must become a first-class status that is never called "done" (the vocabulary exists).
2. STORAGE: an `acceptance.md` committed after the close changes the push candidate. Acceptance may therefore live only in the signed push proof and the state (read as derived), not as a tree file after the signature.
3. SEMANTICS: a push is not always acceptance (backup, review branch, pull request). The coupling must be VISIBLE: a line on the push card "This signature also accepts feature X (open checks: ...)", the digest in the signed subject so it cannot be stripped. Checkpoint pushes never accept. Open: a push to a review branch without acceptance must stay possible (a flag), or acceptance belongs to merge or release.
4. SEVERAL FEATURES per push: today the push binds only the last closed one. A rule is needed: every closed, not yet accepted feature in the range is listed and accepted with it, or one push per feature.
5. FIT: `push-prepare` builds the fresh readiness report (Verify, security, threat model) before the signature anyway; the card shows the PO the Verify result right before the acceptance (this meets the expectation of the C30G-E1 decision).
One common driver: `authorize-critical` with kind `push` gets an acceptance clause in the signed subject; locally there is the kind `feature-acceptance`. Each is produced by its own driver (the close stop, or `push-init`); the switch is `repositoryMode`.

## Risks and effort
- It changes the signed subject format, which is trust-boundary code (protected plugin source, the PO commits) and needs an ADR (it changes ADR-0056 and the C28 decision "one fixed affirmative form").
- Chat mode stays: the code does not shrink, a second path is added.
- Many acceptance tests (C22, C28, C30G) must be restated for the changed requirement (QG-04, legitimate).
- Windows and WSL signing parity has to be checked.
- Effort: stage 1 (local, signature mode) is one medium-to-large slice (finish-feature, close-acceptance-record, a `po-human-approval` kind plus card, proof verification, tests, documentation, ADR). Stage 2 (remote) is large: push-prepare, push-init, guard-push, approve-push, subject digest.

## Recommendation
Stage 1 first and only in signature mode (chat mode keeps the question). Stage 2 only after decisions on points 1, 3 and 4. Both as their own candidate after 32, ADR first.
