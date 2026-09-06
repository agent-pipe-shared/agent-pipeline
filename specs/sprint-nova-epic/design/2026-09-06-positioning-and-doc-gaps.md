> **Persisted 2026-09-06** from the read-only positioning session's scratch
> output `scratch/positioning-and-doc-gaps-2026-09-06.md`, verbatim apart from this header and
> the cross-reference paths noted below. Design input for the 0.6.2
> documentation block (D.1–D.6 in the handover file), not canon: nothing in
> it is a decision until an ADR, a guardrail, or `docs/state.md` says so.
> Status tags inside it (LIVE / CLI / CONTRACT / BUILT-NOT-WIRED / ROADMAP)
> are load-bearing and must not be rounded up.

# Positioning decision, market context and documentation gaps — input for Nova B (2026-09-06)

Agent-facing. Compiled read-only from this checkout plus a web survey on 2026-09-06. Supersedes
the earlier "split into two products" recommendation, which the PO rejected; see §1.

## 1. PO decisions recorded 2026-09-06 (chat, verbatim where it matters)

- **One product.** "anpassen auf 2 Produkte will ich bewusst nicht." No split into a
  standalone guard plugin and a governance product; no license split. SUL-1.0 stays.
- **Target audience, deliberately:** teams with audit obligations, and users who want
  *measurable* rails ("die team Zielgruppe mit audit Herausforderungen und User mit Interesse
  an messbaren rails"). Documentation, README and positioning are to be aligned to that
  audience.
- **Reddit feedback still happens**, with the target audience stated early in the post so
  that the wrong audience self-selects out rather than bouncing off cost.
- **The post ships with 0.6.2** (the Nova B interim release carrying the efficiency work), not
  0.6.1.

Everything below is shaped by those four decisions.

## 2. Market context in one page (sources at the end)

The 2026 market has sorted into four segments; Agent-Pipeline spans all four, which is its
differentiation and the root of every positioning problem:

| Segment | State of the market | Where Agent-Pipeline stands |
|---|---|---|
| Guardrail hooks for Claude Code | Commodity. `git-safe`, git-guardrails skills, `claude-security-guardrails` (30+ patterns), `karanb192/claude-code-hooks` (20 plugins, OWASP-LLM-Top-10 mapped, ~300 stars). Mostly MIT, a few hundred lines each. | `guard-git` is better (quote-stripping, global-option normalisation, union config) but *reads* as the same thing. `guard-gate-strength` ("an agent that can weaken its own gate has no gate") is unique and undocumented on the front door. |
| Spec-driven kits | Spec Kit (constitution, worktrees), OpenSpec ("lightweight change management without excessive overhead"), BMAD (12+ agent roles, "most expensive to run", "$2,000+/month/developer is a filter"), Kiro. Comparison sites with scoring heatmaps exist. | Rigor tiers, EARS criteria, readiness reviewer, six-field briefing. Heavier than BMAD in ceremony; no positioning statement that says which of the four tools an adopter is installing. |
| Orchestration frameworks | claude-flow/ruflo (29k stars, 250k lines TS), workflow-orchestration plugins; community verdict "hobby vs. team" per framework. | Elephant/Goldfish/Critic + supervisor + AFK + parallel-dispatch planner. Not the headline and should not be. |
| Enterprise governance / audit | EU AI Act, NIST AI RMF, SOC 2: "policy documentation without technical evidence of enforcement is insufficient"; hash-chained audit trails (Provena), skills registries with risk profiles, on-demand audit evidence. | **This is where the product's unique value sits**: candidate-bound evidence, typed non-success, three hash-chained governance streams, decision journal, audit bundles, change control with ITSM double-binding, control catalog mapped to NIST SSDF / OWASP ASVS, waivers with expiry, ten threat models. None of it is on the front door. |

Two platform facts the docs must absorb rather than fight:

- **Auto mode is Claude Code's default since 2026-08-14**: a classifier model reviews every
  action against intent and visible context, `permissions.deny` is hard, a circuit breaker
  pauses after three blocks. Native sandbox (Seatbelt / bubblewrap), worktree isolation for
  subagents, `additionalContext` in hooks since 2.1.9. A user now has *two* enforcement layers
  with different semantics; the docs must say which layer refuses what, and why the Pipeline's
  layer sits *above* the commodity (candidate binding, evidence, human proof), not beside it.
- **The runtime moves fast** (five Claude Code versions in six days on this machine). Guard
  behaviour depends on matcher semantics that already changed once (2026-08-27 match-all
  incident). Alfred A1's `enforcedBy` conformance record is the honest answer; until it lands,
  the docs must not claim more than `hooks.json` + a live probe prove.

Community sentiment (Reddit, spring–summer 2026): "financially literate and less impressed by
vibes"; threads about "$0.02 task becomes $2.00 after five hops" and "33k tokens before reading
your prompt" get upvoted. The measured 8–16× cost will be respected for its honesty and will
still filter out the hobby audience — which is fine given §1, provided the post says so first.

## 3. Documentation gap audit — measured, not felt

Method: `rg -o -i` over the **front-door set** an adopter actually reads — `README.md`,
`SETUP.md`, `PIPELINE_FLOW.md`, `docs/overview.md`, `docs/usage.md`,
`docs/design-decisions.md`, `docs/runtime-boundary.md`, `docs/whats-new-0.6.0.md`,
`docs/README.md` — for the name of each capability in `specs/sprint-nova-epic/design/2026-09-06-positioning-usp-catalog.md`.
"Index only" = the term appears solely as a link in `docs/README.md`.

### 3.1 Zero front-door presence (capability is LIVE or shipped; the words never appear)

| Capability | Status | Code / canon source | Nearest existing doc |
|---|---|---|---|
| Closed shell grammar (one command per call) — the first thing every user hits | LIVE | `hooks/guard-lifecycle-ready.mjs`, `templates/prompts/agent-obligations.md` | none user-facing |
| `guard-gate-strength` (agent cannot weaken its own gate / installed guard code) | LIVE | `hooks/guard-gate-strength.mjs` | none |
| `guard-dispatch` (briefing must be template-built; contamination refused) | LIVE | `hooks/guard-dispatch.mjs`, `lib/dispatch-policy.mjs` | none |
| `guard-dispatch-budget` (external tool-call count per subagent) | LIVE (registered; firing unconfirmed — see `backlog/evidence/2026-09-06-po-decision-queue.md` #3) | `hooks/guard-dispatch-budget.mjs` | none |
| `guard-el01-tripwire` (orchestrator cannot write production code without live dispatch record) | LIVE | `hooks/guard-el01-tripwire.mjs` | `roles/elephant.md` EL-01 (agent-facing) |
| `guard-onboarding-consent-lock` + consent gate in ungoverned folders | LIVE | `hooks/guard-onboarding-consent-lock.mjs`, `guard-lifecycle-ready.mjs` | `SETUP.md` mentions "consent" only for advisor export |
| `guard-handover-size` | LIVE (inventory says "planned") | `hooks/guard-handover-size.mjs` | none |
| Human Guard Override (per-call, digest-bound, one use, audited, expiry) | LIVE | `lib/human-guard-override.mjs`, `docs/human-guard-override-threat-model.md` | threat model only (not in index) |
| Guard Maintenance Window | LIVE | `scripts/guard-maintenance-window.mjs`, ADR-0058 | threat model only |
| `authorize-critical` one-command ceremony; TTY-attended check | LIVE | `scripts/po-human-approval.mjs`, ADR-0061/0074 | `docs/po-human-approval.md`, `docs/push-release-flow.md` (neither linked from `docs/README.md`) |
| `repair-map` (every refusal names its lift and who holds it) | CLI | `scripts/repair-map.mjs` | none |
| `agent-obligations.md` generated from the guards | LIVE | `harness/scripts/generate-agent-obligations.mjs` | none |
| `pre-gate` (seconds instead of the 13-minute gate) | CLI | `harness/scripts/pre-gate.mjs` | none |
| `verify-resume` / per-suite receipts / Tier-B permission-restricted suites / lanes | LIVE | `lib/verify-resume.mjs`, `scripts/verify-journal.mjs`, ADR-0050/0065 | none |
| Critic trigger matrix T0–T6, cascade, non-blocking option, `critic-skip` record | LIVE | `harness/review-protocol.md` §2.1, `lib/critic-skip-decision.mjs` | `PIPELINE_FLOW.md` says "Critic trigger" without the matrix |
| Governance kernel: three hash-chained streams, canonical bytes, checkpoints | LIVE | `lib/governance-event*.mjs`, `docs/governance-events.md`, ADR-0071 | index only |
| Agent decision journal (rejects free text / CoT by schema) | shipped | `lib/agent-decision-journal.mjs`, `docs/agent-decision-journal.md` | index only |
| Audit bundles, evidence viewer, governance replay, governance export | CLI | `docs/audit-bundles.md`, `docs/evidence-viewer.md`, `docs/governance-replay.md`, `docs/governance-event-export.md` | index only |
| Change control (ITSM receipt + Pipeline authority double-bound) | CONTRACT/CLI | `docs/change-control.md` | index only |
| Organization policy packs | CLI | `docs/organization-policy-packs.md` | index only |
| External traceability / forge adapters | shipped | `docs/external-traceability.md` | index only |
| Security control catalog with NIST SSDF / OWASP ASVS mappings, assurance levels, waivers with expiry | shipped | `governance/security-controls/catalog.json`, `lib/security-policy-resolver.mjs`, `lib/control-waiver-lifecycle.mjs` | none |
| Finding lifecycle (VEX, drift triggers) | shipped | `lib/finding-lifecycle.mjs` | none |
| SBOM manifest (CycloneDX / SPDX) and provenance attestation | CONTRACT | `lib/sbom-manifest.mjs`, `lib/provenance-attestation.mjs` | none |
| AI-assisted hardening source classes | shipped | `lib/ai-assisted-hardening.mjs` | none |
| Cost telemetry: `usage-ledger`, price table, `telemetry/costs.md` | CLI | `scripts/usage-ledger.mjs`, `templates/costs.md` | `PIPELINE_FLOW.md` says "telemetry" once |
| Benchmarks: `multi-cli-benchmark`, `nova-a8-benchmark-runner` | CLI | `lib/multi-cli-benchmark.mjs` | README says "benchmark" once, unexplained |
| AFK mode (capability-bounded worker, ledger, review gate) | shipped | `lib/afk-*.mjs`, `agents/afk-claude-worker.md` | none |
| Local worker supervisor (leases, heartbeats, orphan detection) | shipped | `lib/local-worker-supervisor.mjs`, ADR-0048 | threat model only |
| Parallel dispatch planner / scheduling lifecycle | CONTRACT | `lib/parallel-dispatch-planner.mjs` | none |
| Handover rotation with per-section extraction acknowledgements; hard cap | LIVE | `scripts/handover-rotate.mjs`, ADR-0066/0073 | none |
| Error register (`recurring → mechanism \| template \| lesson`) | LIVE | `backlog/error-register.md`, `harness/scripts/check-error-register.mjs` | none |
| `capture-evidence` (paths redacted before write), `tmp-leak-guard`, `network-lockdown` | CLI / built | `scripts/capture-evidence.mjs`, `scripts/tmp-leak-guard.mjs`, `harness/scripts/network-lockdown.mjs` | none |
| 29 harness doc-lint checkers ("docs gated like code") | LIVE | `harness/scripts/check-*.mjs` | none |
| Contributor gates bound to the PR author's personal action | LIVE (CI) | `docs/contributor-gate-security.md`, `.github/workflows/contributor-gates.yml` | `CONTRIBUTING.md` (DCO/CLA), not the security property |
| Ten threat-model documents as a family | docs | `docs/*-threat-model.md` | three of ten linked from the index |

### 3.2 Present, but only as an internal label

`README.md` names `chat-attributed` four times and `Ed25519` once (SETUP), i.e. the approval
*mode* is documented but the *ceremony* (one command, `approve`, passphrase, TTY check) and the
*override* family are not. "Three dials" and "rigor" appear; the risk axis and the trigger
matrix do not. "Evidence discipline" appears as a principle; the artifacts that carry it
(receipts, streams, bundles) do not.

### 3.3 The capability inventory is the sanctioned lever

`docs/product-capability-inventory.json` (`pipeline.product-capability-inventory.v3`, checked
by `harness/scripts/check-product-capability-inventory.mjs`; QG-08: "registering a suite is not
done until the capability inventory covers it") lists **16 capabilities**:
`claude-hook-safety`, `codex-host-hook-bridge`, `deterministic-verification`,
`governance-example-extensions`, `handover-hard-size-gate`, `human-accountability-roles`,
`parallel-sprint-promotion-gates`, `pipeline-update-channels`,
`plugin-distribution-and-publication`, `release-planning-controls`,
`session-and-delivery-skills`, `setup-and-runtime-projection`, `specialist-agent-roles`,
`starter-templates`, `v3-routed-duties`, `v3-work-profiles`.

Absent from the inventory although shipped: the governance kernel, decision journal, audit
bundles / evidence viewer / replay / export, change control, organization policy packs,
external traceability, the security control catalog and finding lifecycle, SBOM/provenance,
AI-assisted hardening, cost telemetry and benchmarks, AFK mode, the local worker supervisor,
the human-override/maintenance-window family, `repair-map`, generated obligations, handover
rotation, the error register, the doc-lint family. The inventory also still carries
`criticReview.status: required-before-publication` and marks `handover-hard-size-gate` as
`planned` while its guard is wired.

**Consequence:** the docs do not "lack a chapter"; the product's own public capability
authority under-declares the product by roughly 30 capabilities. Adding them there first makes
every downstream doc obligation mechanical (the inventory check, `check-doc-contracts`,
`check-observation-governance`).

## 4. Front-door structure for the chosen audience

Principle: lead with what gets **refused**, what gets **recorded**, and what it **costs** —
measured. No sprint codenames, no candidate banners, no rule IDs in the first screen.

### 4.1 `README.md` (English part) — proposed outline

1. **Who this is for.** Teams that have to *show* an auditor what an agent did and who
   approved it; people who want rails they can measure, not rails they are told about. Who it
   is *not* for: a throwaway script, a same-day spike (the dials exist for that, but the
   default is expensive).
2. **What gets refused** — the live guard list, one line each, generated from `hooks.json`
   (see §5 item 3), with the two enforcement layers named: Claude Code auto mode / sandbox
   below, Pipeline guards above.
3. **What gets recorded** — candidate binding, receipts, streams, journal, bundles, viewer,
   replay, trailers, ADRs; one line each with the doc link.
4. **What it costs, measured** — the paired numbers, the forensic breakdown, the admin/product
   share once metered (§6), the verify wall clock trend; the three dials as the mitigation.
5. **What it does not claim** — the existing non-claims paragraph, kept, moved up.
6. **Runners** — Claude Code full enforcement; Codex and Antigravity own pre-tool bridges,
   narrower; one runner's evidence never proves another's.
7. **Install** — the two commands and the restart rule; link to SETUP.
8. **Learn more** — regrouped as in §4.2.
9. Acknowledgments; license line with the commercial intent stated in one plain sentence.

Remove from the English README: the `0.6.0` candidate banner, "battle-tested", the sprint
codenames, the V3 migration command table (belongs in SETUP), the bilingual note's apology
(keep the German reference below the marker).

### 4.2 `docs/README.md` — regroup

- **Adopt and use** (SETUP, usage, PIPELINE_FLOW, runtime-boundary, migration)
- **Enforcement** — new page `docs/enforcement.md` (§5 item 3), `push-release-flow.md`,
  `po-human-approval.md`, `human-authorization-inventory.md`, the override and maintenance-
  window threat models
- **Evidence and audit** — new landing page `docs/audit-and-evidence.md` (§5 item 4) that ties
  governance events, decision journal, audit bundles, evidence viewer, replay, export, change
  control, organization packs, external traceability
- **Security** — new landing page `docs/security-controls.md` (§5 item 5): scanners and
  `SKIPPED ≠ PASS`, control catalog and mappings, waivers, finding lifecycle, SBOM/provenance,
  AI-assisted hardening, contributor gates, support policy, incident response, all ten threat
  models
- **Cost and measurement** — new page `docs/cost-and-measurement.md` (§5 item 6)
- **Reference** — operating model, ADR index, design decisions, artifact topology, directory
  contract

## 5. Nova B work items derived from this (each one-dispatch sized)

1. **Doc-drift fixes** (mechanical, `goldfish-mechanic`): README/operating-model/overview/usage/
   whats-new banners → 0.6.x; `docs/release-state.json`; `docs/runtime-boundary.md` guard table
   (4 → 12 guards, three runners, drop `agent_runtime` claim, drop stop-suggest budget
   warnings); `SETUP.md` Codex SessionStart sentence; `CHANGELOG.md` missing version entries
   or an explicit note; `docs/codex-isolated-critic-foundation.md` language.
2. **Capability inventory extension** (`goldfish-implementor`): add the ~30 absent
   capabilities to `docs/product-capability-inventory.json` with `surfaceIds`, correct
   `handover-hard-size-gate` to shipped; then clear `criticReview.status` through a real
   Critic round. This is the lever that makes the rest checkable.
3. **`docs/enforcement.md`, generated** (`goldfish-deep`, guard/canon class): a generator in
   the `generate-agent-obligations.mjs` pattern that renders every `hooks.json` entry (matcher,
   guard, what it refuses from the guard's own exported description, exit semantics,
   override route from `repair-map`) plus the Codex/Antigravity bridges, byte-equality tested.
   A hand-written guard list will drift — the repo has already paid for that twice.
4. **`docs/audit-and-evidence.md`** (`goldfish-implementor`): the audit-audience landing page;
   one paragraph per artifact family, each ending in "what this proves / what it does not".
   Reuse the existing specialised docs; do not duplicate them.
5. **`docs/security-controls.md`** (`goldfish-implementor`): as above for the Cyborg surface;
   link all ten threat models.
6. **`docs/cost-and-measurement.md`** (`goldfish-implementor`): the measured numbers with their
   sources and caveats (self-estimate vs. metered), the dials, `usage-ledger` usage, the
   benchmark runner; a table that is regenerated at each release.
7. **Front-door rewrite** (`goldfish-deep`, Critic T1 — README is canon): §4.1; German
   reference regenerated below the marker; `check-language-canon` stays green.
8. **Metering: administration-vs-product share** (`goldfish-deep`): the open item
   `backlog/items/2026-08-29-three-runners-showed-wide-pipeline-administration-overhead-variance.md`
   — sourced from tool-use/token counts, not self-estimates; two runners minimum. Positioning
   on "measurable rails" is not credible while the one adoption-deciding number is unmeasured.
9. **Critic effectiveness number** (`goldfish-implementor`): a read-only report over
   `backlog/evidence/*findings*.md` and dispatch records: reviews run, verdicts, findings by
   severity, findings that changed a candidate. Publish in item 6's table.
10. **Subtraction discipline, as a rule** (design note → ADR draft): a guard or checker keeps
    its place only with measured denials per quarter or a named threat; duplicates of native
    auto-mode/sandbox behaviour are delegated, not re-enforced. First candidates: whatever
    `guard-dispatch-budget`'s payload capture (decision-queue #3) shows, and the
    `agent_runtime: other` path.
11. **Runner focus statement** (doc): Claude Code is the enforcement runtime for the next
    increment; Codex/Antigravity are "methodology + bridge", no new claims until Alfred A1's
    conformance record exists. Put it in `docs/runner-support.md`, which is the right home and
    already says most of it.
12. **Three external consumer repos before Alfred Track D** (PO/process, not a dispatch): the
    architecture doctrine needs codebases that are not the Pipeline and not an HTML game.

## 6. What "measurable rails" requires to be published

The audience chosen in §1 will ask for numbers. Today the repo can publish, with sources:

- cost per task, paired with/without (2026-08-09): $26.27 vs $1.62; $13.30 on a fixed candidate
- wall-clock by phase for one full session (2026-08-10): 1h37m, 79% pipeline mechanics
- verify gate wall clock: 419 s (08-25) → 571 s (09-01) → 646 s → 482 s (09-06)
- guard denials in this repo's own sessions: recorded per denial in
  `.git/agent-pipeline/human-guard-overrides/requests/` (private) — countable, not yet reported
- Critic rounds and verdicts: in `backlog/evidence/` — countable, not yet reported

Not yet measurable and therefore not claimable: administration-vs-product share (self-estimates
only), dispatch bootstrap token cost (observed 50–150k, no breakdown), Critic finding rate.

## 7. Critique that still applies within one product (carried over, trimmed)

- **Complexity ratchet.** "Prose → incident → hook" adds and never removes; 68 open Nova B
  items mostly add controls. Item 10 above is the counterweight.
- **Self-referential validation.** ~5,700 commits, largely agent-authored under the Pipeline's
  own process, on the Pipeline itself; two small consumer projects. Item 12.
- **Runner spread.** Three runners × three platforms for one maintainer. Item 11.
- **License signalling.** SUL-1.0 + CLA + DCO reads as "commercial product" before there are
  users. Kept by decision; mitigate by stating the commercial intent in one plain sentence in
  README and NOTICE, and by making the internal-use permission the first thing a reader sees.
- **Vocabulary.** "typed non-success", "control-execution-exchange", rule IDs on the front
  door. Keep the precision in `docs/operating-model.md`; translate on the front door.

## 8. Removed from the earlier feedback by PO decision

- Split into a standalone MIT guard plugin and a SUL governance product — **not pursued**.
- License change for any component — **not pursued**.

## Sources (web survey 2026-09-06)

- https://github.com/karanb192/claude-code-hooks · https://hooks.karanbansal.in/
- https://github.com/mafiaguy/claude-security-guardrails
- https://github.com/mattpocock/skills/blob/main/skills/misc/git-guardrails-claude-code/SKILL.md
- https://dev.to/boucle2026/git-safe-stop-claude-code-from-force-pushing-your-branch-115f
- https://www.augmentcode.com/tools/best-spec-driven-development-tools
- https://github.com/cameronsjo/spec-compare
- https://reenbit.com/bmad-vs-spec-kit-vs-openspec-choosing-your-spec-driven-ai-framework/
- https://www.marktechpost.com/2026/05/08/9-best-ai-tools-for-spec-driven-development-in-2026-kiro-bmad-gsd-and-more-compare/
- https://github.com/samart/claude-flow · https://shipyard.build/blog/claude-code-multi-agent/
- https://www.miniorange.com/blog/ai-agent-audit-trail/
- https://github.com/systempromptio/awesome-ai-agent-governance
- https://www.augmentcode.com/tools/ai-coding-tools-eu-ai-act-compliance
- https://claude.com/blog/auto-mode · https://triedandtyped.com/2026/08/30/claude-code-auto-mode-default/
- https://code.claude.com/docs/en/sandboxing
- https://www.techi.com/claude-code-update-agent-permissions-worktree-isolation/
- https://dev.to/lura_cardena_7de06f82aacd/ai-agents-on-reddit-late-april-to-early-may-2026-ten-threads-about-cost-reliability-and-real-4f20
- https://arxiv.org/abs/2608.18167 (Adversarial Review)
- https://spdx.org/licenses/SUL-1.0.html · https://docs.n8n.io/privacy-and-security/sustainable-use-license
