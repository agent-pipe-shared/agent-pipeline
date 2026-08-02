# CYB-5 — AI-assisted development hardening (feature spec)

> **Status: IMPLEMENTATION.** Translates issue #46 (fetched
> verbatim via `gh issue view 46`, 2026-07-25) into checkable form. Phase III
> per spec.md §4, EXCEPT slice (c)'s override-ledger fix which may start in
> Phase II (self-contained). Depends on CYB-1 (module/control IDs). Not
> dispatched.

## 1. Problem (condensed)

Agent-assisted development adds attack surfaces conventional scanners miss:
prompt/context injection through repo artifacts, malicious/replaced tool
definitions, excessive authority, hidden out-of-scope edits, test weakening,
sensitive-context leakage, dependency/workflow manipulation, confused-deputy
CI behavior, and cross-subagent instruction laundering. Outcome: one binding
AI-assisted-development hardening module treating all external/repo-derived
context as untrusted, constraining authority by role/task, validating changes
independently, preserving human accountability.

## 2. Three-slice structure (from spec.md §4, this package's own delivery plan)

Per spec.md, CYB-5 is delivered as three slices, co-located because
requalification (slice a) consumes slice (a)'s own digest inventory:

- **(a) Trust taxonomy + definition-integrity inventory + task-authority
  manifest & guards + drift requalification.**
- **(b) Change-integrity verify suites + dispatch-provenance enforcement +
  Critic isolation checklist.** Absorbs two already-filed backlog items (both
  due 2026-07-27, Nova-ledger `in_progress`/Cyborg-assigned, canonical status
  stays in Nova — this spec does not self-close them):
  [`pipeline.critic-context-isolation`](../../backlog/items/2026-07-20-critic-context-isolation.md)
  (make active Critic monitoring read-only/out-of-band; add a dispatch-checklist
  assertion that a Critic receives paths/references only, no coordinator prose
  after launch) and
  [`pipeline.dispatch-provenance`](../../backlog/items/2026-07-20-dispatch-provenance.md)
  (require the dispatch-record ID in the Goldfish commit handoff before the
  coordinator accepts delivery; close authorship check fails closed with
  public-safe remediation on a missing mapping/`Dispatch:` trailer).
- **(c) Override-ledger target binding + CI authority suites + the D10 Codex
  equivalence mapping.** Absorbs
  [`pipeline.cross-repository-override-ledger-binding`](../../backlog/items/2026-07-20-cross-repository-override-ledger-binding.md)
  (bind command evaluation/token consumption/ledger append to one physical
  target repository; fail closed if the target ledger is unwritable; no raw
  cross-repo command text/paths/remotes into a coordinating Public checkout;
  retain one-time token semantics; positive+negative tests for ordinary
  commands, absolute/relative `git -C` targets, mismatched coordinator/target
  roots, missing target ledgers, replayed tokens) — **this is the one
  self-contained piece of CYB-5 and may start in Phase II**, independent of
  the CYB-1 boundary.

## 3. Acceptance criteria — checkable form, mapped to slice

| # | #46 AC (paraphrased) | Slice | Checkable criterion | Evidence class |
| --- | --- | --- | --- | --- |
| AC1 | Repo/issue/PR/log/web/tool/agent content typed untrusted | (a) | Trust-classification fixture: every listed source type tags as untrusted by default | Classification fixture |
| AC2 | Untrusted content cannot change policy/scope/permissions/allowlists/gates | (a) | Injection fixture: a crafted repo file/comment attempting a policy change is rejected, not silently applied | Injection fixture |
| AC3 | Skills/roles/hooks/tools/adapters inventory- and digest-bound, deterministic precedence | (a) | Definition-integrity fixture: a shadowed/duplicate definition resolves to one deterministic winner, digest-checked | Integrity fixture |
| AC4 | Every dispatch has a bounded task-authority manifest, cannot delegate broader rights | (a) | Manifest fixture: a subagent attempting to grant itself wider scope than its manifest is rejected | Authority fixture |
| AC5 | Host fallback/privilege expansion require explicit policy + durable evidence | (a) | Fallback fixture: an implicit fallback attempt is blocked; an explicit one produces a durable evidence record | Fallback fixture |
| AC6 | Sensitive-context export deny-by-default, tested across multi-agent flows | (a)/(b) | Export fixture across ≥2 multi-agent hop scenarios | Export fixture |
| AC7 | Scope/test/guard/policy/dependency/workflow/evidence-integrity deltas independently checked | (b) | Change-integrity suite: each of the seven delta classes has its own mechanical check, independent of the change's own author | Change-integrity fixture |
| AC8 | Security-sensitive control changes receive independent review | (b) | Review-routing fixture: a control-file diff triggers a reviewer-identity check distinct from the author | Review fixture |
| AC9 | Multi-agent messages preserve origin/trust, cannot launder authority | (a) | Provenance fixture: a relayed claim from a lower-trust agent cannot silently upgrade to higher-trust authority | Provenance fixture |
| AC10 | CI privileged contexts cannot consume untrusted code/artifacts without isolation+validation | (c) | CI fixture: a fork/untrusted-event workflow cannot reach a privileged job without the isolation gate | CI fixture |
| AC11 | Runner/model/tool drift triggers typed requalification | (a) | Drift fixture: a definition-digest change triggers a typed requalification event, not silent continuation | Drift fixture |
| AC12 | Injection/poisoning fixtures cover markdown, Unicode, filenames, logs, tool output, cross-agent propagation | (a)/(b) | 6-class injection fixture corpus | Injection fixture corpus |
| AC13 | Evidence excludes secrets, raw hidden reasoning, unrestricted transcripts | (a) | Evidence-hygiene fixture | Evidence-hygiene fixture |
| AC14 | Core conformance works across supported runners without assuming provider/model trust | (a)/(c) | Runner-neutral conformance suite (ties to PRD deviation D10's Codex transport mapping / typed `unavailable`) | Runner-neutral fixture |

Coverage note: matches `backlog-acceptance-matrix.md`'s "14" count for #46.

## 4. Threat model coverage (from #46, already a checklist)

Malicious repo file/README/comment/generated artifact · poisoned issue/PR
text/logs · compromised/mutable skill/role/tool/MCP definition · tool output
containing executable instructions · sandbox escape/host fallback · credential/
environment discovery · unauthorized egress/exfiltration · out-of-scope edits ·
test/guard/policy weakening · malicious dependency/action/image insertion · CI
token confused deputy · cross-agent instruction laundering · stale workaround/
capability assumptions · fabricated verification/evidence · model/runner
behavior drift. Each needs at least one fixture under §3's classes above; none
is currently orphaned from an AC, but this list is the completeness check to
re-run once fixtures are actually written.

## 5. Non-goals (verbatim from #46)

Detecting every prompt-injection string heuristically; recording hidden model
reasoning; trusting a runner/model by name; eliminating human accountability;
granting agents autonomous waiver/release/credential authority.

## 6. Dependencies

#41/CYB-1 (control catalog, hard for slices a/b; slice c is self-contained).
#14 (isolated execution-plane), #27 (least-privilege baseline), #38
(invocation-failure learning) — related but "must not depend on their
unpublished Sprint commits." #30/#31 — soft, Cyborg emits its own required
security receipts from the go-live base regardless.

## 7. Gate

The accepted Cyborg sprint plan authorizes normal implementation, focused
tests, Verify, Critic preparation and corrective work without per-step Human
authorization. The final package gate is exact Verify + Security, a fresh
diff-scoped Critic, and the bound PO proof before push/release. A Human decision
is required only for that configured final gate or a genuine exception.
