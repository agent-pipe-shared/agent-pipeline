> **Persisted 2026-09-06** from the read-only positioning session's scratch
> output `scratch/usp-catalog-2026-09-06.md`, verbatim apart from this header and
> the cross-reference paths noted below. Design input for the 0.6.2
> documentation block (D.1–D.6 in the handover file), not canon: nothing in
> it is a decision until an ADR, a guardrail, or `docs/state.md` says so.
> Status tags inside it (LIVE / CLI / CONTRACT / BUILT-NOT-WIRED / ROADMAP)
> are load-bearing and must not be rounded up.

# Agent-Pipeline — verified USP / feature catalog (2026-09-06)

Compiled read-only from this checkout: `hooks.json` + `codex-hooks.json`, all guard headers,
~110 lib modules and ~130 scripts (heads), `harness/` (verify, pre-gate, 29 check scripts),
6 guardrail catalogs, 79 ADRs + 6 drafts, 10 threat models, 18 governance schemas, 8 skills,
8 agents, 20 templates, capability inventory, changelog, sprint PRDs (Sentinel/Cyborg/Phoenix/
Nova/Agy/Alfred), backlog (638 `"id"` entries in `backlog/index.json`), error register.

Code size: **357,130 lines** of `.mjs` in lib/scripts/hooks/harness — *including* test files.
Verify registers **~515 suites** (517 `file:` entries; 2026-09-06 measurement says 515).

## Status legend — the column that matters

The repo names its own defect: "the mechanism was measured, the path to the mechanism was not."
A catalog listing built next to wired, flat, commits exactly that.

- **LIVE** — wired in `hooks.json`, registered in `verify.mjs`, or actually executed in the
  push/close chain
- **CLI** — shipped operator tool, runs on demand
- **CONTRACT** — shipped library/schema, pure, no invocation path of its own
- **BUILT-NOT-WIRED** — finished, deliberately not connected (the header says so)
- **ROADMAP**

---

## Pillar 1 — Enforcement instead of instruction

### PreToolUse guards, Claude Code (`plugins/pipeline-core/hooks/hooks.json`)

| # | Guard | Refuses | Status |
|---|---|---|---|
| 1 | `guard-git` | force-push, history rewrite, deleting protected branches/tags, hook bypass (`--no-verify` + GG-17..20); quote-stripping, lowercase normalisation, global-option normalisation (`git -C x push --force`); union of three project guards (ADR-0013), project extras only via config | LIVE |
| 2 | `guard-push` | `git push` without verify/security evidence, with stale (commit ≠ HEAD) or red evidence, without approval for exactly this commit; consults v2 security completeness | LIVE |
| 3 | `guard-lifecycle-ready` | closed shell grammar (one simple command per call, bounded `rg\|head` pipelines, ≤6 `&&` segments); lifecycle admission (non-ready session only read-only/lifecycle); cross-repo mutation; write-target containment; consent gate in ungoverned folders | LIVE (Bash/PowerShell **and** Edit/Write/NotebookEdit) |
| 4 | `guard-gate-strength` | agent edits to files deciding gate strength: `pipeline.user.yaml gates.*`, `critical-human-proof.json`, `project/pipeline.yaml`, `guard-config.json`, the **live installed guard code** (GS-6), origin-allowlist/attestation modules (GS-8/9). Born from the measurement "three guards returned allow" | LIVE |
| 5 | `guard-testpath` | edits to tests gating the own implementation (QG-04/GF-04); config-driven | LIVE |
| 6 | `guard-devplan` | implementation edits before plan approval; docs/specs/.claude/backlog exempt | LIVE |
| 7 | `guard-onboarding-consent-lock` | all writes in the window between "consent given" and "onboarding complete" | LIVE |
| 8 | `guard-el01-tripwire` | orchestrator writes production code without a live `dispatch-record*.json` with `outcome: in-progress` | LIVE |
| 9 | `guard-handover-size` | growing write to the handover file at/over the byte cap (30k); shrinking always admitted | LIVE — inventory says "planned", guard header says "live, not merely built" |
| 10 | `guard-dispatch` | Task/Agent/Workflow dispatch whose briefing is not template-built: claims list, hunt list, rerun commands, missing 6 fields — before the subagent's first token | LIVE |
| 11 | `guard-dispatch-budget` | a subagent's tool calls counted externally (self-report lied: "34 logged", runtime 62); at cap only closing acts; Elephant exempt inside the guard | LIVE |
| 12 | `guard-worktree-isolation` | worktree count before/after an isolation dispatch; warning only | LIVE, non-blocking |

Lifecycle hooks: `stop-suggest` (Stop; next phase/gate; never blocks; deduped), `staleness-check`
+ `setup-check` + `codex-session-start-hint` (SessionStart startup/resume/clear),
`post-compact-reground` (compact only; role/feature/phase + bounded state excerpt, classified via
`interaction-continuity`) — all LIVE.

Other runners: `codex-hooks.json` (SessionStart hint; PreToolUse on `Bash` and
`apply_patch|Edit|Write` → `codex-pretool-guard`, translating the same guard verdicts) —
shipped, "host-dependent" per inventory. Antigravity: `.agents/hooks.json` →
`antigravity-pretool-guard`, exit 2 pre-execution (ADR-0067); two fail-open paths closed
(`ab347a74`). Both: "own pre-tool bridges, narrower coverage" — one runner never proves another.

### Human authority, mechanical

- `pipeline-state.mjs` — the **only** sanctioned state writer: approve-plan/submit-plan/
  reopen-design/seal-plan-approval/set-phase/approve-push (per `{remote,destination}`, ADR-0077)/
  close-feature/revocation/deploy approvals/continuity. Gates read, never write — LIVE
- `po-human-approval.mjs authorize-critical` — **one** terminal line for push/deploy/publication/
  release-preflight/feature-package-reconcile: prepare + sign in one call (never sign a leftover
  request file), Ed25519 key + passphrase outside the repo, TTY-attended check (`isatty(0)`
  before any read — an agent harness never has a TTY) — LIVE (ADR-0061/0074)
- Chat mode — explicitly `chat-attributed-unattested`: attribution, not proof; only for
  PO-classified low-consequence repos (ADR-0076) — LIVE
- Human Guard Override (HGO) — release for **one** exact tool call, bound to
  `sha(canonical(toolInput))`, single use, audited, plan window with expiry, signature or chat
  route; own threat model — LIVE
- Guard Maintenance Window (GMW) — signed, time-boxed lift of GS-6/TP-* without in-session
  activation (ADR-0058) — LIVE
- ADR-0079 — hook bypass has **no** agent-side override route; the PO's own manual `--no-verify`
  push in their own terminal is a documented human exception outside Pipeline authority
- `external-push-ledger` — second single-use consumption marker for push proofs **outside** the
  working tree (`wx` create = the single-use mechanism itself); survives checkout/reset/fresh
  clone (PHX-2) — LIVE
- `push-init` / `push-prepare` — **one** read-only line checks all five authorization layers and
  prints the exact fix per unmet precondition, finally the finished `authorize-critical` line with
  correct `--subject-sha256` — LIVE
- `repair-map.mjs` — for every refusal class: liftable? by whom? exact command — **asked of the
  real override planner at runtime**, no hand-maintained table ("refusals should teach") — CLI
- `agent-obligations.md` — **generated from the guards** (protected paths from
  `guard-config.json`, draft prefixes from `guard-devplan`, grammar shapes by asking the exported
  predicates), byte-equality tested; hand-maintained lines marked. Born because agents learned the
  rules "by being refused" and burned 50+ tool uses per block — LIVE
- `generate-vendored-canon.mjs` — guardrails/roles/templates copied into the plugin tree as a
  build step (a consumer has no `guardrails/`); allowlist of universal sources, drift test — LIVE

### Verify as a gate, not a test run

- `verify.mjs` — **one** entry point, ~515 suites, manifest-gated phases (validate-manifest,
  security-scan), evidence artifact `pipeline.verify-evidence.v0` with command + commit + exit
  code — LIVE
- `verify-journal.mjs` — run manifest, lock, per-suite receipts (suite digest, declared inputs,
  env contract, candidate tree), bounded logs; **Tier-B suites run under Node permission
  flags** — LIVE
- `verify-resume` — a voided gate is re-earned from **declared inputs**, never from a commit-diff
  envelope; no cross-candidate reuse without opt-in (ADR-0065) — LIVE
- Lanes: serial lane for suites writing under `.git/agent-pipeline/**`; measured 645.7 s →
  482.5 s on 2026-09-06 via one eviction — LIVE
- `pre-gate.mjs` — the six obligation-finding checkers in seconds instead of ~13 min; drift test
  pins it to `TEST_SUITES` — CLI
- `network-lockdown.mjs` — Node preload throwing at the first outbound primitive (offline
  conformance) — LIVE in tests
- `security-scan.mjs` — adapters gitleaks / osv-scanner / semgrep / license-check + three
  readiness probes; `SKIPPED ≠ PASS`, `ERROR` fail-closed; v2 evidence + completeness verdict
  that push/PR/close/release consult **jointly** (`security-completeness-gate`) — LIVE

### Roles, dispatch, review

- Three Goldfish tiers with effort in frontmatter, not prose: `mechanic` low / `implementor`
  medium / `deep` xhigh (MP-27); Critic `max`; MP-03 hard model floor — LIVE
- 6-field briefing (Goal · Context files · DoD · Forbidden · Stop conditions · Dispatch
  metadata) — template mandatory, structurally checked by `guard-dispatch` — LIVE
- Critic contract: paths/refs only, builds its own input, `Briefing violation … substantive
  review stopped` on contaminated input, two phases (adversarial hunt, then evidence-gated
  report), findings exactly once, no dialog, scratch isolation via CSPRNG directory — LIVE
  (`roles/critic.md`, `critic-review` skill)
- Trigger matrix T0–T6: A/G/S diff → higher model + native isolation **always**; rigor 2 →
  review tier first, escalate only on finding ≥ major; rigor 0 + low → fast path; T6 second
  opinion in a **new** context, never a debate in the same — LIVE
- `critic-skip-decision` — "not required" is a checkable record on the dispatch record, not a
  silent absence — LIVE
- `critic-dispatch-preflight` — binding checks + evidence sweep by task id (landed 2026-09-06) — LIVE
- `dispatch-record-strip-for-critic` / `backlog-item-strip-for-dispatch` — implementor prose
  stripped before a Critic sees it — LIVE
- `plan-verifier` (VERIFIED/GAP/UNPLANNED per plan item, read-only, never the implementor),
  `readiness-reviewer` (fresh read-only spec check: "implementable from the document alone?") — LIVE
- Bounded recovery: one automatic product retry, then course gate with decision brief; loop
  bounds critic-correction 3 / delta-regate 3 / product-retry 1 / environment-failover 1
  (`sdlc-run-graph`); course kinds bounded-diagnosis / scope-split / authority-rebaseline /
  preauthorized-route-change / defer / stop (`review-economy`) — LIVE
- Advisor: model-free capability preflight at bootstrap, consultation only on demand for **one**
  concrete question, export consent explicit (`setup.mjs --configure-advisor-export`), Codex via
  Sol route — LIVE (ADR-0047)
- AFK mode: capability-bounded worker (Read/Grep/Glob only; ten deny classes from child-process to
  secret-request; returns one schema-bound proposal, never applies), activation receipts,
  write-ahead ledger as recovery authority, `afk-review` gate for workflow operations. Live
  evidence: 17-agent sweep 2026-08-25, every worktree checked individually — shipped
  (Batman/Nova); provider Claude only
- `local-worker-supervisor` — same-host workers with own git workspaces, leases, heartbeats,
  orphan detection, cancel, exact cleanup; **no** OS isolation claimed (ADR-0048) — shipped
- `parallel-dispatch-planner` — largest conflict-free subset by write-path overlap/resources,
  receipt names every serialisation reason — CONTRACT
- Workflow-tool dispatch: `pipeline-core:` prefix, tool budget, worktree self-heal with
  containment check — reference doc + `workflow-preflight` — LIVE rule
- Model discipline: dispatch names the model explicitly; frontmatter pin beats text;
  `CLAUDE_CODE_SUBAGENT_MODEL` must be unset (MP-04/MP-29) — rule + bootstrap check

### Built, not wired (headers say so)

`guard-slicing` (default-to-parallel nudge via `additionalContext` — today's channel probe was its
precondition; "NOT WIRED into hooks.json"), `review-retry-planner` ("standalone by
construction"), `tmp-leak-guard` (temp-dir delta around a command, exit 3),
`dispatch-authorship-verify` (trailer ↔ record correspondence: SHA binding, terminality, path
coverage, model — "deliberately NOT wired into verify.mjs"), `project-reset` (`plan` half only),
`session-power` ("starts no host-power child"), `codex-sandbox-compatibility` ("default-off"),
isolated Codex Critic (F2 intermediate class "real verifiziert · produktiv standardmäßig
inaktiv"; `roles/critic.md`: sandbox disabled for this project), `credential-lease` (B2-C, pure),
`gitlab-ci-execution-broker` (ADR-0049 — "authorizes neither a provider request nor a GitLab CI
job").

---

## Pillar 2 — Traceability

**Candidate binding everywhere:** evidence, approvals, receipts, freezes bind **commit and
tree**; "missing, stale, malformed, mismatched" is a typed non-success, never silently carried.
`nova-candidate-freeze` tolerates exactly **one** dirt shape (`approve-push`'s own trailing write
for the current HEAD) and then labels the run `approval-pending`, never `exact` — LIVE

**Who wrote what:**

- GIT-03 trailers `AI-Assisted: true` (all commits), `Dispatch: <TASK_ID> (goldfish|critic)` on
  implementation commits; `check-dispatch-provenance` checks per commit (not per range), stage-0
  exemption only with self-declaration — LIVE
- Dispatch records `evidence/dispatch-record-<TASK_ID>.json` — machine-checked, used by the
  EL-01 tripwire as live signal — LIVE
- Authorship check in the close ritual: "Whose are this session's production diffs?" —
  Elephant diff outside stage-0 = INCIDENT, not a retro point — LIVE
- `agent-model-registry` — recorded model vs. agent definition — LIVE

**Governance kernel (Phoenix):**

- Three append-only streams `human` / `agent` / `lifecycle` under `governance/events/`,
  RFC 8785 canonical bytes, chained digests, sequences; `heads.json` is a projection, **never
  authority**; without an independently retained checkpoint only `prefix-valid`, completeness
  `unknown`, not gate-capable (ADR-0071) — LIVE
- `agent-decision-journal` — only closed events (assumption / selection / verification-scope /
  fallback / escalation) with reason code and candidate digest; **rejects free text, prompts,
  tool output, chain-of-thought and authority-shaped fields by schema**; `command-offer` event
  before every command presentation; "execution-unobserved" until a verifier confirms — shipped
- `human-governance-ledger` — PO decisions and role exceptions as consumed records with
  Ed25519 intent/proof — shipped
- `governance-replay` + viewer — read-only reconstruction per dispatch; incomplete/stale →
  `unavailable`, never partial history — CLI
- `governance-export` — one-way, everything denied without a destination policy; only closed
  safe fields; receipts prove no retention/review — CLI
- `organization-policy` — governance floors via packs; conflicts fail instead of
  last-write-wins; apply only with human readback — CLI
- `audit-bundle` — create-only, offline-verifiable copy of a feature package; manifest binds
  commit/tree/every byte digest/policy digest — CLI
- `evidence-viewer` — static HTML without JS/network, can only say `invalid`, never become a
  pass; `--sharing redacted` replaces paths with ordinals — CLI
- `change-control` — Pipeline authority **and** authenticated ITSM receipt must bind the same
  candidate/artifact/environment/window; emergency profiles need retrospective evidence —
  CONTRACT/CLI
- `external-reference` + forge adapters (GitHub/GitLab) — provider-neutral sanitized
  references; external writes only pipeline-owned with preview/apply/readback — shipped

**Feature package & topology:**

- `lifecycle.json` (`pipeline.feature-package.v1`) binds PRD/spec/acceptance/result paths +
  byte digests + candidate; validator rejects aliases, symlinks, case-fold collisions, stale
  digests (ADR-0045) — LIVE
- Directory contract (ADR-0063, `check-directory-contract`): one home per artifact kind — LIVE
- `docs/doc-reconciliation.md` — machine-read ledger: every ADR implicated by a commit range is
  `checked` or `amended`; the record can never live inside the candidate itself — LIVE
- Spec retention at close (`governance/spec-retention.json`, `transfer-classification`:
  omission only with archive **and** PO disposition) — LIVE

**Handover & continuity:**

- `docs/state.md` as the single canonical handover (ADR-0012); rotation via extraction-then-
  archive with **per-section content-hash acknowledgements** (schema v2) + hard-cap guard
  (ADR-0066/0073); bootstrap payload budget 45k bytes with 1.5× ratio to the handover cap — LIVE
- `resume-hint` (restart cards: intent/scope/constraints/questions/progress; verbatim material
  rejected and routed to the intake checkpoint), `onboarding-continuity` (restart-resilient
  intake checkpoints), `continuity-state` — shipped
- `interaction-continuity` — a user message mid-work is classified (informational / additive /
  decision / control-change) and continued typed — shipped
- `session-cleanup`, worktree lifecycle with session descriptors, `worktree-create` (canonical
  paths only) — CLI

**Docs gated like code (`harness/scripts/check-*`, 29):** ADR consistency, doc contracts,
reference paths, language canon, license contract, ownership, error-register form, section
citations, capability inventory, consumer-safe paths, Critic contract citations, Critic
fail-closed, directory contract, GH Actions permissions, observation/doc governance (every
`docs/` file classified on two axes: audience × lifecycle), skill spec coverage, suite
registration, CLAUDE.md length, authority-tier agreement, auth-gate inventory drift, epic file
contract, PR contributor gates, phase coherence, PO language projection, review retry plan,
agents adapter migration, gitignore anchoring — LIVE

**Learning loop as artifact:**

- `backlog/error-register.md` — curated error classes (~20), no chronology; `recurring` **must**
  resolve to `mechanism | template | lesson | deferred`, form-checked — LIVE
- Retro template with mandatory question ("What should the Pipeline do better next time?" —
  "nothing" allowed, silence not) and escalation column per lesson — LIVE
- Backlog: 638 items, `transitions.ndjson` ledger, generated `STATUS.md`, ledger merge across
  parallel sprints with `entryHash` binding (ADR-0068), done-predicate check, sprint
  assignment, delivery reconciliation (GG-22) — LIVE
- Observation intake: GitHub Issues as global SoT, issue form, `capture-observation` skill with
  privacy rules — LIVE
- 79 ADRs, numbers allocated **at acceptance** (ADR-0069), collision = hard verify failure;
  never rewritten, only superseded

**Public-safe by construction:** `capture-evidence` (absolute paths replaced **before** the
write), `policies/neutral-leakage-policy.v1.json`, privacy sweep, three-roots model (Public Core
/ Private Overlay pinned to exact SHA / machine-local plane — ADR-0046/0054), `machine-plane`
with exact key set — LIVE

---

## Pillar 3 — Proportionality & cost

- Three dials: rigor per task (0/1/2), governance mode per rule set (advisory/enforcing/off),
  profile per topic (`epic`/`feature`/`mini`) — LIVE
- Rigor ≠ risk: a one-liner on a guard is high risk; ceremony follows both separately — LIVE
- `routing-authority.json` — the one machine-readable authority for model/effort per duty and
  runner; uncertified duties `state: unavailable` — LIVE
- `usage-ledger` + `model-prices.json` — tokens from local transcripts (incl. subagents), cost
  always a marked estimate, close-block row — CLI
- `gate-estimate` — ETA to the next gate from evidence; `unknown` never guessed — CONTRACT
- `multi-cli-benchmark` + `nova-a8-benchmark-runner` — five workload classes, serial vs native
  `claude -p`, 1 warmup + 5 measurements, "real, not synthetic" — CLI
- `sdlc-efficiency-metrics` — shadow-only, no gate authority — CONTRACT
- Speed/`mini` profile: ≤5 files, no new dependencies, no canon files; guards stay
  **unconditionally** active; small-session playbook ≤45 min — LIVE
- Context diet: Elephant delegates execution (EL-16), bootstrap budget, handover cap,
  compact re-ground — LIVE

## Pillar 4 — Security & supply chain (Sprint Cyborg)

- Control catalog `governance/security-controls/catalog.json` — closed schema, mappings to
  **NIST SSDF 1.1 / OWASP ASVS 5.0**; applicability resolver with assurance levels
  baseline/elevated/critical and module precedence; evaluation receipts; waiver with
  **mandatory expiry**, fail-closed after expiry — shipped
- Finding lifecycle state machine (observed → needs-triage → confirmed → affected/… →
  verified-fixed; VEX; drift triggers candidate/component/scanner-rule/threat-control/
  waiver-expiry/exploitability/recurrence) — shipped
- SEC-09 six-term completeness vocabulary, doclint-checked — LIVE
- Stack discovery + adapter contract (static/sca/iac/container/ci-workflow/dast/fuzz; offline,
  no scanner install) — CONTRACT
- SBOM manifest (CycloneDX 1.6 / SPDX 2.3; lifecycle states) and provenance attestation
  (digest request, public-key verify, credential hygiene screen) — CONTRACT
- AI-assisted hardening: seven untrusted source classes (repository/issue/PR/log/web/tool/agent)
  × change classes (scope/test/guard/policy/dependency/workflow/evidence) — shipped
- Contributor gates: CLA checkbox accepted only as the PR author's **personal** action on the
  current head; DCO per commit; receipt binds base/head SHA — LIVE (CI)
- GH Actions permission policy: `contents: read` default, write scope only via policy file with
  owner/justification/expiry, checker rejects wildcards — LIVE
- Security support policy with version window, incident runbook, private reporting — shipped
- 10 threat models (Critic isolation, HGO, GMW, marketplace supply chain, Nova execution plane,
  Phoenix governance, Codex onboarding, GitLab CI pilot, local supervisor state, Sentinel scope)
  — each Threat / Control / Verification / Residual boundary

## Roadmap (announce, do not claim)

- **Nova B** (68 open items): onboarding much simpler for agents (driver today: three human
  stops), plan amendments + formal close, runner-specific approval/verify guidance, delivery-loop
  observability, Codex live-execution probes, GitLab live pilot (deferred), native macOS (today
  synthetic only)
- **Alfred** — "agent-first architecture, mechanical governance, measurable rigor, control
  integrity": E1 contract freeze; **A1 enforcement conformance record** (every control declares
  `enforcedBy: git-hook | tool-scope | runner-hook | posthoc-verify | prose`, `prose` a visible
  admission; A1 offline CLI landed, native measurements open); A2 control placement; A3
  protected-surface baseline; B1 rigor derivation; **C1** interruption receipts/telemetry (core
  landed, aggregation + 14-day baseline open); **Track D** architecture: decision records,
  architecture profile, module/contract receipts (context locality, contract/authority/
  side-effect boundaries, parallel-agent boundaries), fitness evidence, adoption state — **not
  started, deliberately behind A1/A2**
