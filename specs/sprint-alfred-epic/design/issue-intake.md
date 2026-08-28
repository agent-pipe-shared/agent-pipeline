# Issue intake — the nine `sprint:alfred` GitHub issues (read in full, 2026-08-27)

Per-issue analysis and design disposition. Source of truth for membership and
sequence: #108. Issue bodies were read completely from
`agent-pipe-shared/agent-pipeline` on 2026-08-27; this file records what the
design **takes, adds, and deviates from** — it does not restate the issues.

Work-package (WP) identifiers reference `../spec.md`.

## Membership and status (verified live 2026-08-27)

| # | Title (abbrev.) | Size | State | WP mapping |
|---|---|---|---|---|
| #99 | Architecture decision continuity | XL | OPEN | D1 |
| #101 | Immutable, self-protecting protected-path baseline | M | OPEN | A3 |
| #102 | Protect approved design authority during implementation | M | OPEN | A4 |
| #103 | Planned gates vs unplanned interruptions | L | OPEN | C1 |
| #104 | Agent-first architecture standard, measurable default | L | OPEN | D2 |
| #105 | Deterministic minimum rigor floor | L | OPEN | B1 |
| #106 | Fitness enforcement, baseline-and-ratchet | L | OPEN | D3 |
| #108 | Assemble and qualify the Alfred governance core | XL | OPEN | E1/E2 |
| #109 | Architecture-baseline adoption demand for existing repos | M | OPEN | D4 |

Entry condition named by #108: **#100** (P0, fail-closed on an absent
push-approval record) — a prerequisite hotfix *outside* Alfred, required
"accepted on `main`" before an Alfred implementation branch is cut.

**Re-verified 2026-08-28, and the earlier reading corrected.** The issue is
still `state: open` on GitHub with all seven acceptance checkboxes unticked
and its last comment dated 2026-08-08 — but its substance is already on
`main`:

- `2ae06d91` *"fix(guard-push): fail closed when the blocking evaluation
  itself faults"* is an ancestor of `origin/main`
  (`git merge-base --is-ancestor` exits 0). It implements scope item 3, the
  terminal exception boundary, which the 2026-08-08 verification comment
  named as the one thing still missing.
- The fixtures for scope item 4 are on `origin/main`: `PG11c` (state lacks
  `lastApproved`), `PG11e` (no `pushApproval` key at all, pinned equal to
  PG11c), `PG28` (injected fault in the blocking evaluation fails closed),
  `PG29` (the same fault under mode `warn` stays non-blocking — AC-4),
  `PG30` (the fault sentinel is inert without its exact value).
- The suite is registered in the shared Verify gate on `origin/main`:
  `harness/scripts/verify.mjs:233`, `guard-push-tests` (AC-6).
- The residual backlog item is already `status: closed` with
  `closure_commit: 2ae06d9133beed3859f8e0a5ca1b61b1d97a4771`.

What is genuinely outstanding is AC-7 alone — a closing comment naming the
merged commit and its test evidence — plus the administrative close. The
entry condition is therefore materially satisfied and **does not depend on
Nova's release**; the Nova rebase gate stays in force for its own reasons
(PRD A-1). The reading boundary is stated honestly: fixture presence and
Verify registration were verified by reading `origin/main` blobs; the suite
was not executed against `main` in this pass.

**PO decision 2026-08-28 (PRD §9.3):** neither "land it with Nova" nor
"waive" — the issue gets an evidence comment from this session and the PO
performs the close itself. The comment is posted
(`#issuecomment-5448916870`); the issue is deliberately left `open` and
`sprint:NONE`.

### `sprint:NONE` portfolio, decided at the same gate (PRD §9.4)

No `sprint:NONE` issue is an Alfred prerequisite beyond #100. Enumerated live
on 2026-08-28: #100, #107, #92, #72, #52, #13. #92 and #13 carry their own
unmet entry gates, #72 is blocked on hardware, #52 is an evaluation with no
code dependency, and #107 is an explicit #108 non-goal.

The PO used the same reading to clean the portfolio: the four
adapter/extension issues moved to Sprint Batman, whose label scope is exactly
*"optional capabilities: governed adapters, built-in tools, recommendations,
and safe pilots"* — **#107** (IAM identity vs. decision authority; its scope
item 5 is a provider-adapter boundary), **#92** (third-party runner-adapter
extension path), **#52** (additional Git forge adapters), **#13** (external
execution-plane adapter pilot). Each edit was previewed and read back through
`github-issue-operations.mjs`. **#72 was deliberately left `sprint:NONE`** —
a native Apple-Silicon acceptance follow-up for Nova is not an optional
capability and does not match Batman's scope; **#100** likewise stays
`sprint:NONE` as a P0 hotfix.

One boundary this creates for Alfred, recorded in `spec.md` §10: Alfred's
B2(i) briefed test-change authorization and B2(iv) per-key trust anchors add
new *human* authority surfaces. They stay inside the existing exact-scope
signature-or-chat model and introduce no identity provider, so they do not
pre-empt #107's invariant that authentication is identity evidence and never
decision authority.

## Cross-issue architecture: one shared contract set

The eight member issues repeatedly reference one another's schemas. #108's
"freeze shared identifiers" entry condition is therefore the real first
implementation act (WP-E1). The shared identifier families the spec freezes:

- **profile identity**: `{profileId, source: inherited-agent-first|accepted-custom, revision, digest}` (#104, #105, #106, #109)
- **finding/coverage outcome enum**: `pass | finding | unavailable | unsupported | unknown | excepted` (#106; consumed by #105, #109; #103's receipts reference finding lineages)
- **decision identity**: ADR/decision `{id, digest, status, supersedes, scope}` (#99; consumed by #104/#106 overrides, #109 adoption decisions)
- **candidate binding**: exact commit/tree + artifact digests (already house convention — Nova spec §2.2 is reused verbatim, not re-invented)
- **interruption lineage**: `{eventId, lineageId, classification, derivationRevision}` (#103; consumed by #104 receipts, #105 inputs)
- **protected-surface identity**: baseline `{revision, digest, entries[]}` (#101; consumed by #105 inputs, #106 mandatory floors)

## Per-issue dispositions

### #99 — Architecture Decision Continuity → WP-D1

**Take:** the typed baseline assessment (`initial-adr-required |
architecture-baseline-sufficient | no-material-architecture-decision`), the
significance rubric, the decision skill, the typed architecture-impact result
at every close, the existing-project adoption rules (no fabricated history),
and the follow-by-default / deviate-by-auditable-human-exception model for
inherited org/team decisions.

**Consume, don't build:** the org policy-pack identity/precedence contract is
#9's (not in Alfred). D1 defines the *interface* it consumes (stable id,
digest, layer, applicability, status) and returns typed diagnostics when a
configured source is missing — it does not implement pack resolution beyond
that interface. A project with no configured org source resolves the effective
set from Pipeline + project layers only; that path is fully deliverable inside
Alfred.

**Deviate (argued):** #99 §6 requires the typed architecture-impact result on
"every Epic, Feature, Sprint, and Mini close". Alfred delivers the typed
result enum and its recording; *enforcing* its presence on close paths that
Nova's close coordinator owns is wired behind the same close-ritual extension
point (`ritualExtensions.close.pre`) rather than a new close path — no second
close machinery.

### #101 — Protected-path baseline → WP-A3

**Take:** everything — versioned plugin-owned minimum baseline, deterministic
additive merge, malformed/absent config ⇒ baseline-only + typed diagnostic,
subtraction/shadow/alias detection, evidence-bound baseline identity,
migration, the full fixture list.

**Add (from 2026-08-27 evidence):** two extensions the issue predates.
(1) *Closed-evidence bindings join the protected set*: the paths a
`closedFeatures[].continuityClose` entry pins (Result, close-evidence) become
protected surfaces at close time — the closed-Result incident
(`backlog/items/2026-08-27-a-closed-result-can-be-amended-…`) is exactly a
protected-surface gap one lifecycle stage after #102's.
(2) *Enforcement-layer honesty*: the baseline's decision must be delivered
through layers that provably execute for the actor performing the mutation
(WP-A1/A2) — a baseline enforced only by orchestrator-session PreToolUse
hooks is, on measured Claude Code behavior, not enforced for dispatched work.
The issue's "every supported mutation path receives the same protected-surface
decision" acceptance line is *only satisfiable* through A2's layer relocation.

### #102 — Seal approved design authority → WP-A4

**Take:** everything — exact-path immutability during implementation,
`reopen-design` and the #97 amendment path as the only transitions,
out-of-band drift ⇒ invalidated authority (never silently blessed), human
root of authority preserved, runner-neutral fixtures.

**Add (from 2026-08-27 evidence):** the staging-draft defect
(`…-plan-approval-binds-a-staging-draft-as-project-authority.md`) is the
mirror-image failure at the *entry* to approval: A4 additionally requires
`submit-plan`/`approve-plan` to refuse a `planPath`/`specPath` inside the
onboarding staging directory (or any path carrying the generated
pre-authority banner), with a typed reason naming the promotion action. A
sealing control on approved bytes is worthless if the wrong bytes can be
approved.

### #103 — Interruption telemetry → WP-C1

**Take:** the five-way classification contract, receipt fields, lineage
correlation, privacy boundary, local aggregation, the two-week dogfood before
thresholds, no external telemetry.

**Add:** C1 is the *scheduling driver* of the sprint — its two-week dogfood
gates #105 calibration and #104 friction thresholds, so it lands in the first
implementation wave and starts the clock. The receipt registry also gets four
concrete first-class codes measured live in this repo, each with named
provenance: guard refusal of a read-only command (2026-08-27,
`backlog/items/2026-08-27-a-read-only-command-is-refused-for-naming-a-protected-path.md`);
readiness-`partial` deadlock (2026-08-27,
`backlog/items/2026-08-27-discard-feature-writes-a-state-the-cleanup-observer-rejects-and-strands-the-session.md`);
TP-ceremony cost (2026-08-18 — the two live OT09 ceremony attempts recorded
in `CLAUDE.md`'s guard-testpath rule and `docs/state.md`'s prior handovers;
no standalone backlog item); dispatch truncation (2026-08-08,
`backlog/items/2026-08-08-long-dispatches-truncate-before-emitting-their-report.md`).
The dogfood therefore starts with known-real categories, not invented ones.

### #104 — Agent-first architecture standard → WP-D2

**Take:** the nine property classes, versioned machine-readable profile,
inherited-default semantics (`inherited-agent-first`, never `unconfigured`),
module inventory, interaction/contract receipts with
measured/estimated/unavailable/unknown status, PO custom-profile authority,
the pluggable navigation representation with a pinned-revision OKF default.

**Add:** the concrete OKF pin — Google's Open Knowledge Format v0.1
(`GoogleCloudPlatform/knowledge-catalog`, `okf/SPEC.md`), pinned by content
digest at implementation time; markdown+YAML-frontmatter concept bundles fit
the "readable by humans without tooling, parseable by agents without SDKs"
requirement and keep the AGENTS.md ecosystem adjacent (research doc §1). The
representation decision is recorded as a repo ADR during this design phase
and re-bound through #99's machinery once D1 exists (the issue asks for #99
machinery that does not exist yet at design time — recorded as an explicit
bootstrap deviation).

**Deviate (argued):** the issue's context-locality measurements assume
observable per-session read telemetry ("modules/files consulted, wall time to
establish context"). On Claude Code, subagent-side hooks are measured
non-firing (A1), so first-increment receipts derive read-surface data from
what *is* observable without runner cooperation: dispatch briefing content,
diff surface, transcript-derived tool logs where the runner exposes them, and
`unknown` status otherwise. The receipt schema keeps the fields; the first
increment fills them honestly (`unavailable`/`unknown`) rather than
pretending. This is exactly the issue's own "missing telemetry is
distinguishable from zero" rule applied to its own wishlist.

### #105 — Minimum rigor floor → WP-B1

**Take:** the asymmetric floor (human may raise; agent may never lower;
mechanical escalation on surface/impact/uncertainty growth), the observable
input contract, planned-vs-actual recomputation, report-only rollout, #11 Mini
lane preserved as consumer.

**Add:** the derivation's first-increment input set is trimmed to inputs that
exist by then (protected surfaces from A3, profile/fitness from D2/D3,
interruption baselines from C1, path/diff/dependency surface from git) —
each input names its source contract and version; inputs not yet produced are
typed `unavailable` and can only escalate, never lower.

### #106 — Fitness enforcement → WP-D3

**Take:** the core enforcement invariant (a requirement is enforceable only
with id, closed schemas, deterministic check or bounded adapter, explicit
outcome enum, digests, fixtures), the ten property classes, baseline-and-
ratchet, lifecycle placement including push-time staleness debt, report-only →
blocking promotion, PO-only profile/baseline/exception transitions.

**Add (research-informed):** the deterministic/agentic split is stated as a
design principle: hard gates stay deterministic; model-judged evaluation may
*propose* findings but its verdicts enter evidence as `finding` candidates
requiring deterministic confirmation or human acceptance — never `pass`.
(Mirrors the InfoQ agentic-fitness-function guardrails; research doc §2, and
is the same rule #106 already states as "prompt/prose compliance has no gate
value", extended to model-run evaluators.)

**Placement note:** dispatch-boundary enforcement ("project the accepted
module/write/authority surface into task authority; block silent scope
widening") is delivered through briefing-generation + post-hoc candidate
comparison (A2 layers), not through subagent-side PreToolUse interception,
until A1's conformance probe proves interception reaches dispatched work on
the runner in use.

### #108 — Integration → WP-E1/E2

**Take:** membership authority, entry conditions, the five-stage sequence,
integrated qualification of one exact candidate, per-issue closing comments.

**Add:** E1 (schema/identifier freeze) is pulled to the very front of
implementation and versioned as its own artifact
(`specs/sprint-alfred-epic/design/contract-freeze.json` at freeze time), so
every WP builds against frozen identities. E2 additionally qualifies the two
2026-08-27 incident classes (closed-evidence drift; writer/observer
conformance) because they are Alfred-filed control-integrity defects on the
same surfaces the sprint hardens.

**Deviate (argued):** #108 stage 1 asks for #99's decision authority early so
#104/#106 consume accepted rather than provisional module identities. The
PRD's wave plan (§5) moves D1 to the head of Wave 2, behind the
control-integrity foundation of Waves 0–1, and declares this there as a
sequencing deviation: the falsified-enforcement findings make measured
control placement (A1/A2) a precondition for trusting any new authority
surface, including D1's own decision records. The stage-1 intent survives in
substance — D1 still lands before D2/D3 consume identities, and the interim
is bounded by the provisional-identity marking in the module inventory
(spec §7.2).

### #109 — Adoption demand → WP-D4

**Take:** everything — typed adoption states, decision-ready staged proposal
with per-figure estimation status, exactly one durable PO decision, no
per-session nagging, agent-backfill safety, this repository as first
brownfield dogfood case.

**Add:** the dogfood run doubles as E2 qualification evidence, and its
migration proposal deliberately prices the *pipeline repo itself* (443
backlog items, 471-suite Verify, 60+ scripts) — the most honest available
stress test of the proposal generator's cost model.

## What the design adds beyond the issue set (grounded in backlog evidence)

Three work packages have no single owning issue but are required for the
issues' own acceptance criteria to be true in practice:

- **WP-A1 — enforcement conformance probe:** measured runner truth (do
  guards fire in subagents? does payload indirection bypass?) as a typed,
  Verify-run record. Without it, #101/#102/#106's "cannot be silently
  weakened / same decision on every mutation path" claims are unverifiable
  assertions on Claude Code.
- **WP-A2 — enforcement-layer relocation:** per-control placement across
  layers that execute in the acting process (git hooks, agent tool
  allowlists, post-hoc deterministic verification), consuming A1's record.
- **WP-A5 — lifecycle/evidence closure integrity:** closed-evidence
  protection + typed repair, writer/observer conformance suite, worktree-vs-
  HEAD divergence warning. #101 protects files; A5 protects the *lifecycle's
  own bookkeeping* — the 2026-08-27 incidents are its evidence.
