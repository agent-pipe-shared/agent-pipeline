---
schema: pipeline.backlog-item.v1
id: pipeline.ruleset-freshness-wsl-subsystem-absent
type: defect
owner: pipeline
status: in_progress
source: merge report section 4 finding 10 (specs/sprint-phoenix-epic/evidence/merge-0.5.2-what-fell-away.md gitignored evidence artifact); merge commit 75b8361
created: 2026-08-07
due: 2026-09-06
done_when: manual
---

# The WSL host-authorized freshness/self-application-comparison subsystem is gone

## Description

The 0.5.2 merge (`75b8361`, local only) resolved
`plugins/pipeline-core/scripts/ruleset-freshness.mjs` to main's version.
Main took this file in an unrelated direction (introducing
`PIPELINE_UPDATE_AVAILABILITY_SCHEMA`), which does not carry forward
Phoenix's WSL host-authorized freshness/self-application-comparison
subsystem — the mechanism that compared this checkout's ruleset against the
public marketplace remote under the `host-authorized-wsl` execution
boundary.

## Triggering situation

Merge conflict resolution, code-conflict batch (28 files, origin/main taken
verbatim per PO's same-function policy).

## Affected artifact

`plugins/pipeline-core/scripts/ruleset-freshness.mjs`, and any bootstrap
step that previously depended on its WSL-specific freshness comparison
(session-bootstrap.md's freshness check, per CLAUDE.md's session bootstrap
step 2).

## Proposal

**Investigated (2026-08-07), not resolved.** Confirmed by direct execution:
`plugins/pipeline-core/scripts/ruleset-freshness-host.mjs` (Phoenix-only,
merged cleanly, never a conflict) fails to import — it depends on 8 named
exports from `ruleset-freshness.mjs` and `observeCodexRulesetSource` from
`codex-host-plugin-list.mjs`, none of which exist in main's versions. This
is an active, currently-broken import chain, not a hypothetical gap.

A straightforward re-port is blocked by two concrete problems, not just
effort:
1. **Name collision:** pre-merge `ruleset-freshness.mjs` exports
   `inspectRulesetFreshness` with WSL-boundary-aware semantics
   `(repoPath, options)`; main's current `ruleset-freshness.mjs` already
   exports a symbol of the exact same name as a deprecated alias for
   `inspectPipelineUpdateAvailability` (line 382). Re-porting verbatim would
   silently clobber an existing compatibility export.
2. **Deeper coupling:** `ruleset-freshness-host.mjs` also imports
   `freshnessHostActionForPreflight` from `pipeline-start-preflight.mjs` —
   which doesn't exist on main either, and whose pre-merge equivalent folded
   ruleset-source verification into the bootstrap readiness gate's `status`
   decision itself (see companion item
   `2026-08-07-self-application-integrity-check-absent.md` for the full
   detail — the two items are one investigation, not two independent ones).

A third, independent finding: `harness/session-bootstrap.md:159` still
describes the WSL host-authorized network-boundary mechanism this subsystem
provided ("use the host-authorized network-open/read-only command boundary
directly") — but main's replacement (`inspectPipelineUpdateAvailability`)
does a direct `git ls-remote`/fetch with no host-boundary delegation at all.
That sentence in the actual bootstrap protocol doc may now describe a
mechanism that doesn't exist in the merged tree either way — worth checking
independently of whichever way this item resolves.

Open question for the PO: is the WSL host-authorized network-boundary
concept still wanted at all, given main's simpler direct-read approach
already works? If not, `ruleset-freshness-host.mjs`'s removal,
`harness/session-bootstrap.md:159`'s sentence, and
`docs/phoenix-governance-threat-model.md:61-70`'s "host receipt package"
rollback text all need to move together (that threat-model section defines
its own rollback protocol for exactly this file).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted (APS, 2026-08-07) — repair the WSL host-authorized
  boundary mechanism, but **scoped specifically to Codex running under
  WSL** (the concrete problem this boundary exists for: a broken/DNS-limited
  Codex sandbox on WSL). It is explicitly NOT a universal requirement for
  every runner/host combination — other runners/environments don't have
  this sandbox problem and must not be forced through the host-boundary
  path. Design-first → Critic review → implement, same sequence as the
  companion item (WP5's Critic review just demonstrated why, on a related
  gate-adjacent design, in this same session).
- **Rationale:** PO decision. The scoping constraint (Codex+WSL only, not
  universal) is load-bearing — a design that makes this boundary mandatory
  for every runner would be over-scoped relative to the actual problem.
- **Assignment (if accepted):** design phase, next dispatch (combined with
  the companion item — one investigation, one design).
- **Date:** 2026-08-07

**Design phase (2026-08-07):** produced — commit `a75a45d`,
`specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`
Part B. Fixes a scoping bug (`executionBoundary` was WSL-presence-only,
present pre-merge too — not a merge regression) to
`runner === "codex" && wsl`; repairs the freshness read via
`inspectPipelineUpdateAvailability`'s existing `options.spawn` seam rather
than reviving the retired single-fixed-action host model, which is confirmed
technically insufficient for main's richer channel/tag-based reads. Confirms
the scoping condition for every other runner/host combination (Claude Code on
any host; Codex on non-WSL) stays unchanged. Flags the new closed
host-action-family's exact schema (§B.3/§B.8) as real remaining design
surface for a fast-follow sub-design, not resolved here given its security
sensitivity. A first (not delta) Critic review is dispatched next, before
implementation.

**Critic review (2026-08-07): FAIL.** Full findings:
`specs/sprint-phoenix-epic/evidence/wp2wp3-design-critic-review-a75a45d.md`.
Part-B-specific findings: (F2, MAJOR) the proposed "closed" host-action
family covers only 4 of the 8 git invocations that actually flow through the
`options.spawn` seam §B.2(b) selects — either the uncovered ones silently
degrade the freshness comparison (contradicting §B.7's "strict improvement"
claim) or an unrecognised-command passthrough reopens exactly the
direct-execution fallback the threat model forbids; (F3, MAJOR) §B.4's claim
that the mis-scoped `executionBoundary` is "currently inert" is false — it is
live-consumed by the mandatory bootstrap skill, and a separate, already-closed
backlog item (`2026-08-05-pipeline-state-rebind-codex-default-runner.md`)
already recorded this exact defect, which a narrower-than-claimed grep
("repo-wide" was actually `plugins/`-scoped) missed; plus 2 MINOR (a missed
threat-model doc-update row; a mis-cited `session-bootstrap.md` line). A
rework dispatch addressing these plus the companion item's Part-A findings is
next, then a bounded re-review before implementation.

**Rework (2026-08-07): landed, commit `8c526dd`.** F2 accounts for all 8 git
invocations behind the seam (2 network-delegated typed shapes, 6
local-passthrough that never leaves the local machine); F3 corrects the
false "inert"/"zero behavioral change" claims, citing the already-closed
prior-art backlog item and re-running the grep genuinely repo-wide; F6/F8
(minor) fix the missed threat-model doc-update entry and the mis-cited
line. A bounded delta Critic re-review is dispatched next.

**Delta re-review 1 (2026-08-07): FAIL — 4 new MINOR, 1 Part-B-relevant.**
Full findings:
`specs/sprint-phoenix-epic/evidence/wp2wp3-design-critic-delta-review-1-8c526dd.md`.
(D) F6's threat-model fix defers replacement wording to a "§B.8 open item"
that doesn't exist in the document — the exact "documented risk, no owner"
shape F6 originally flagged, recurring one level down. F2/F3/F6/F8 remain
genuinely resolved otherwise. A scoped rework is dispatched next.

**Rework 2 (2026-08-07): landed, commit `d99e59f`.** (D) §B.8 now has an
actual open-item bullet (not just a §B.6 pointer to nothing) with owner
"implementation dispatch" and explicit trigger "once §B.3's action-family
shape is finalized," covering both §B.6 threat-model doc-update entries. A
bounded delta re-review is dispatched next — round 3 of 4 (initial + delta 1
+ this delta 2).

**Delta re-review 2 (2026-08-07): FAIL — Part-A-only, Part B unaffected.**
Full findings:
`specs/sprint-phoenix-epic/evidence/wp2wp3-design-critic-delta-review-2-d99e59f.md`.
Finding D (this item's §B.8 fix) verified fully resolved — real owner +
trigger, both threat-model pointers resolve cleanly, citations verbatim. The
3 new MINOR findings (1-3) are all Part-A scoped (see companion item
`2026-08-07-self-application-integrity-check-absent.md` for detail). A
scoped rework 3 is dispatched next — round 4 of 4, the last delta re-review
allowed before a PO course gate.

**Rework 3 (2026-08-07): landed, commit `0d8ed74`, Part-A-only — Part B
untouched.** Findings 1-3 were all Part-A scoped; see the companion item for
detail. A bounded delta re-review is dispatched next — round 4 of 4.

**Delta re-review 3 (2026-08-07): PASS — round 4 of 4.** Part B confirmed
byte-identical (md5-verified) across the whole rework/re-review sequence —
zero regression. Full findings:
`specs/sprint-phoenix-epic/evidence/wp2wp3-design-critic-delta-review-3-0d8ed74.md`.
**Design phase DONE for the combined package — ready for implementation
dispatch.**

**Sub-design for §B.8's deferred action-family item (2026-08-08):** produced
— commit `e844bcf1`,
`specs/sprint-phoenix-epic/design/codex-wsl-freshness-host-action-family.md`.
Opus/xhigh, DESIGN ONLY. Specifies the eight-member closed action family
(schema, dispatch rule, rejection path, receipt shape, threat-model
amendments, full test plan) that §11 states would serve PX0-AC-13, PX0-AC-14,
PX0-AC-11, PX0-AC-12 in full. Its own §13 leaves one open PO question
(Option A/B/C on the threat model's "no repository mutation" sentence) and
§1 explicitly excludes repairing `ruleset-freshness-host.mjs`'s broken
import chain, naming both as the implementation dispatch's work. **Never
implemented.**

**What actually got implemented instead (2026-08-11, commit `7dffa72e`,
"PX0-AC-13 rework"): a deliberate interim placeholder, not the sub-design
above — and it did not work.** `createWslHostAttestedSpawn` was added to
`ruleset-freshness.mjs`, with its own code comment explicitly citing this
item's design lineage and naming itself as "the minimal surface needed to
satisfy §B.2(b) without pre-empting" the eight-action-family sub-design —
i.e. a disclosed, deliberate stopgap, not a hidden shortcut. But the
stopgap only checked a local Codex App-Server health observation and then
spawned git in the SAME sandboxed process with a sterile env swap — it
never actually delegated to a genuine host-side process. Two independent
investigation dispatches this session (2026-08-11/12,
`PHX-WP-PX0AC13-HOSTDELEGATION` and `-REMOVEATTESTATION`) confirmed this
directly, tracing the call graph to `run()`/`git()` at
`ruleset-freshness.mjs:42-50` (`options.spawn` only, never
`hostTransport`) and to `ruleset-freshness-host.mjs`'s own header comment
stating genuine boundary-crossing is an agent/runner tool-tier decision,
not in-process code.

**Resolved 2026-08-12 (`PHX-WP-PX0AC13-FAILCLOSED`, commit `cd38619e`\*):
the fake placeholder is removed, replaced with an honest fail-closed
substitute** (network-delegated calls under `host-authorized-wsl` now
always refuse without ever attempting to spawn — no misleading "attested
success" path remains). `specs/sprint-phoenix-epic/acceptance.md`'s
PX0-AC-13 amended (commit `7fa07d54`) to record this precisely: clause 2
("without consuming a known-failing sandbox attempt") satisfied; clause 1
("use the selected host transport") stays open, pointing at this item's
own `codex-wsl-freshness-host-action-family.md` sub-design as the real,
already-specified, still-unbuilt path — not a proved impossibility, an
unbuilt one. \* the object exists and is content-verified but the branch
ref move to it was blocked pending PO action — see `docs/state.md`'s
2026-08-12 checkpoint; the tree is correct either way.

**This item stays open.** The eight-action-family sub-design
(`codex-wsl-freshness-host-action-family.md`) is still the concrete next
step whenever implementation is picked up — its own §13 open question
needs a PO answer first.
