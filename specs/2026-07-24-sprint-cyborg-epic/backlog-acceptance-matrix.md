# Sprint Cyborg — backlog acceptance matrix

> Maps every `sprint:cyborg` issue and absorbed backlog item to its work
> package, acceptance-criteria clusters, and required evidence class. The
> GitHub issue text remains the normative AC source (snapshot read
> 2026-07-24); each package's feature spec translates its ACs verbatim into
> checkable form at dispatch time — this matrix tracks coverage and status.
> Close accounting: one evidence comment per issue naming the merged commit
> and exact acceptance evidence; no bulk closure.

## GitHub issues

| Issue | Pkg | AC clusters (count) | Evidence class | Status |
| --- | --- | --- | --- | --- |
| #41 P0/XL control catalog | CYB-1 | closed schema; 3 assurance profiles; module precedence; `unknown` never exempts; verifier/evidence binding; candidate+policy digest; waiver lifecycle; mappings-without-certification; 5 stack fixtures; baseline-without-tooling; single receipt for consumers; view consistency; no silent historical satisfaction; drift detection (14) | schema fixtures + resolver suites + receipt on this repo | open |
| #42 P0/XL policy-complete verification | CYB-2 | green = all required capabilities terminal; all-/required-skipped fail typed; optional absence safe; identity/digest binding; closed finding+coverage schemas; visibility of exclusions; no floating rules; one evaluator for Push/PR/Close/Release; #40 binding; preflight; v0 migration; failure-class fixtures; docs; no commercial dependency (14) | evidence v2 + negative-gate fixtures + guard-push extension suites | open |
| #39 P1/XL SBOM lifecycle | CYB-3 | ADR-0032 amended; #22 artifact class; one-command resolve; CycloneDX/SPDX pinned profiles; manifest completeness; deterministic staleness; partial≠complete; release immutable binding + delta; typed outcome diagnostics; monorepo semantics; consumer interface; privacy/export policy; #9 bundle refs; #6 checks; 16 fixture classes; zero-byte legacy compat; docs (17) | manifest fixtures + Node adapter run + release-binding suite | open |
| #43 P1/L threat model + requirements | CYB-4 | deterministic applicability; closed schemas; stable IDs; traceability; change-impact review; propose-not-approve; boundary blocking; generated human views; #22 discovery; secret exclusion; 8 fixture classes; no invented history (12) | schema fixtures + repo reference instance + impact-engine suites | open |
| #46 P1/XL AI-assisted hardening | CYB-5 | typed untrusted inputs; no authority from content; digest-bound definitions; task-authority manifest; explicit host fallback; deny-by-default context export; independent change-integrity checks; independent review for control changes; origin/trust preservation; CI isolation; drift requalification; injection fixtures; evidence hygiene; runner-neutral conformance (14) | taxonomy doc + guard/verify suites + injection fixture corpus | open |
| #44 P1/XL stack-aware verification | CYB-6 | inventory-driven plan; explainable selection; required-unavailable fails; provider-neutral adapter conformance; #42 evidence feed; exact non-production dynamic targets; fuzz reproducers + replay; typed partial outcomes; no auto-install/untrusted setup; enforced boundaries; cross-platform fixtures; offline conformance; adapter-addition docs (13) | family registry + adapter conformance suites + synthetic fixtures | open |
| #45 P1/XL provenance + integrity | CYB-7 | digest-addressed artifacts; typed provenance envelope; subject-mismatch rejection; pinning policy; external-key signing; least-privilege credentials; multi-artifact subjects; digest verification at 3 boundaries; honest reproducibility; 7 tamper fixtures; immutable history; local-key conformance; no unproven SLSA claims (13) | envelope fixtures + reference-builder run on plugin package + release companion | open |
| #47 P1/XL finding/VEX lifecycle | CYB-8 | distinct artifact kinds; deterministic dedup; typed authorized transitions; VEX binding (absence≠VEX); waiver expiry/drift invalidation; no self-approval; replay-based closure; release blocks on exact unresolved state; drift reopening; projection-only externals; 8 fixture classes; safe metrics (12) | ledger + state-machine suites + VEX/SBOM link fixtures | open |
| #48 P2/L product-security readiness | CYB-9 | applicability-driven artifact set; public/restricted separation; versioned support/EOL consistent with releases; named response authority; runbooks bound to real capabilities; human gates for advisory/incident/production; release evidence links; no restricted leakage; typed staleness failures; 6 fixture classes; consumer-without-authority interfaces; responsibility docs (12) | artifact schemas + this repo's reference instance + staleness suites | open |

## Absorbed backlog items

| Item | Pkg | Acceptance | Status |
| --- | --- | --- | --- |
| `pipeline.recovery-preview-callback-attestation` (due 2026-07-27) | CYB-A0 | open Critic findings resolved; one-preview-one-acknowledgement invariant; deterministic negative tests; independent review; ledger transition with evidence | open |
| `pipeline.critic-context-isolation` (due 2026-07-27) | CYB-5b | read-only out-of-band Critic monitoring; paths/refs-only dispatch assertion in checklist + deterministic check | open |
| `pipeline.dispatch-provenance` (due 2026-07-27) | CYB-5b | dispatch-record ID mandatory in handoff; close authorship check fails closed on missing mapping/trailer with public-safe remediation | open |
| `pipeline.cross-repository-override-ledger-binding` (due 2026-07-27) | CYB-5c | ledger root bound to validated target repo; fail-closed unwritable ledger; no cross-repo leakage; one-time token semantics; positive/negative tests | open |
| `pipeline.elephant-direct-implementation-under-afk-authorization` | CYB-1 (waiver class) | "PO-waived direct implementation" typed waiver with expiry + mandatory follow-up fresh-context Critic wired into close ritual | open |
| `pipeline.verify-gate-scoped-registration` | CYB-2 | scoped registration is the only wiring path for new suites; drift detection covers registration scope | open |

## Coverage guarantee

Every AC checkbox of every issue maps into exactly one package's feature
spec; a package may not close while any mapped AC is unevidenced. Deviations
D1–D8 (spec §3) change the HOW, never silently drop an AC — where a
deviation narrows delivery (D2, D3, D4, D5), the affected ACs are satisfied
by contract + synthetic conformance evidence and the narrowing is named in
the package's PO gate.
