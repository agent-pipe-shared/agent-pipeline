# Result — Codex fresh-root onboarding 0.4.5

## Delivery status

The 0.4.5 candidate closes the blocking fresh-empty-folder path from Issue
#61. It does not claim that every broader lifecycle ambition originally listed
in that Issue is complete. The Issue should be closed only after the final
0.4.5 commit is pushed and read back; the remaining work below must first be
captured in the follow-up Issue.

Post-spec PO disposition (2026-07-26): after the recorded sequence of fresh
operator live tests, the PO stopped further local-install iterations and
explicitly authorized completing the functional candidate, moving all three
stable version surfaces to 0.4.5, and creating the final local commit(s) through
the Git-push PO gate. Push, tag, merge, publication, Issue mutation, and release
remain separately gated. This disposition supersedes only the earlier
candidate wording that held versioning and commits until another live test; it
does not weaken any Verify, Security, Critic, or immutable-publication gate.
The same disposition explicitly grants the TP1–TP5 test-protection lifts needed
to add or tighten the focused regression cases for this hotfix; no test was
removed, skipped, or weakened.

The released 0.4.4 failure was reproduced red before the final correction and
the permanent regression is green in 0.4.5. Exact command, commit, output, and
the before/after assertion are recorded in
[`evidence/pre-fix-reproduction.md`](evidence/pre-fix-reproduction.md).

## Delivered in 0.4.5

- An ungoverned Codex folder receives a visible, optional Agent Pipeline offer
  before project work. No Pipeline command or mutation runs before consent.
- `project-onboarding-v3` exposes closed V4 states and digest-bound actions for
  portable seed, kickoff, runtime progression, and readiness.
- The portable seed and kickoff produce validator-compatible V3 source,
  calibration, manifest, state, handover, and private continuity.
- A fresh Codex protected-control layout receives one separately confirmed
  host Git initialization. It creates `main` without a commit, preserves the
  private continuity binding, and asks for one project-session restart.
- The post-restart protected Git view is admitted only through the exact
  root-, authority-, and history-bound host-init receipt. Copied, malformed,
  permission-weakened, or drifted receipts fail closed.
- The lifecycle PreToolUse adapter accepts the exact session-ready V4 result or
  that narrowly bound host-init compatibility admission only for the two
  authenticated cross-view repository-control failures. App-Server, runtime,
  continuity, malformed-observation, and unknown failures remain blocked.
- An explicitly approved calibration transition from `host-managed` to
  canonical `local-only` preserves the original host-init binding and permits a
  pre-HEAD local project without remote, push, or publication claims.
- Repository freshness distinguishes `pre-head`, `local-only`,
  `remote-tracked`, and the bounded host-managed transition without a false
  remote-freshness claim.
- Pipeline start reports its loaded version/root. A loaded/installed Codex
  plugin mismatch is `plugin-refresh-required`, not a repository or onboarding
  defect.
- Refresh instructions are runner-specific: Claude Code may use
  `/reload-plugins`; Codex installation uses `/plugins` followed by `/new`.
  When an external Codex CLI update is current on disk but an older persistent
  App-Server catalog remains loaded, the Pipeline asks before the operator
  closes all affected sessions and runs `codex app-server daemon restart`
  outside them. No nonexistent Codex `/reload-plugins` command is prescribed.
- Remediation actions use complete argv and one copy-safe rendering; the
  kickoff syntax is locally authoritative and never discovered through web or
  repository search.
- Advisor/Critic timeout budgets are raised only on their bounded host paths,
  avoiding repeated premature restarts during bootstrap and review.

## Intentionally deferred

The following original Issue #61 ambitions are not completion claims for
0.4.5:

- live, in-process invalidation of a persistent Codex App-Server plugin catalog
  after an external `codex plugin add`;
- a Codex-native cross-view session attestation that removes the temporary
  host-init receipt fallback in the lifecycle guard;
- automatic refresh of a stale skill/hook catalog by code already loaded from
  the removed cache generation;
- native Codex hook interception for every implementation, Goldfish, or
  subagent-launch tool name beyond the currently declared shell/file mutation
  surface;
- broader installation-ceremony and confirmation-count tuning, owned by
  Issue #25;
- platform certification beyond the automated Linux/macOS/Windows command and
  fixture matrix; native macOS assurance remains with Issue #49.

The first four bullets form the follow-up Issue below. They are valuable
hardening, but they no longer block starting and using a local fresh project
with the documented attended boundary.

### PO-approved deferred-risk register

| Deferred risk | Owner | Tracking | Expiry |
| --- | --- | --- | --- |
| Persistent App-Server catalog invalidation after external install | @skar667 (PO) | Follow-up Issue draft below, `sprint:NONE` | 2026-08-31 |
| Native cross-view session attestation replacing the 0.4.5 receipt | @skar667 (PO) | Follow-up Issue draft below, `sprint:NONE` | 2026-08-31 |
| Safe handoff from a removed stale cache generation | @skar667 (PO) | Follow-up Issue draft below, `sprint:NONE` | 2026-08-31 |
| Native lifecycle interception for implementation/agent-launch tool events | @skar667 (PO) | Follow-up Issue draft below, `sprint:NONE` | 2026-08-31 |
| Installation ceremony and confirmation-count tuning | @skar667 (PO) | Issue #25 | 2026-08-31 |
| Native macOS and remaining platform certification | @skar667 (PO) | Issue #49 | 2026-09-30 |

At each expiry the PO must either accept a completed fix, set a new explicit
owner/date, or remove the corresponding claim. None of these rows is an
implicit warn-only gate or a 0.4.5 assurance claim.

## Follow-up Issue draft

**Title**

```text
[P2][Codex] Make refresh, cross-view attestation, and launch hooks native
```

**Labels**

`enhancement`, `area:runners`, `area:lifecycle`, `sprint:NONE`

**Body**

```markdown
## Context

Agent Pipeline 0.4.5 closes the blocking fresh-empty-folder onboarding path
from #61. Live validation also exposed two Codex host boundaries that remain
attended compatibility paths rather than native assurances.

## Problem

An external `codex plugin add` can update the installed registry and replace
the cache directory while a persistent Codex App Server continues serving an
older skill/hook catalog. Ordinary TUI `exit`, `/new`, and a new project
session may still retain that daemon snapshot. Codex CLI has no
`/reload-plugins` slash command.

Codex 0.145 can also expose different physical Git-control views to bootstrap
commands and PreToolUse hooks. 0.4.5 bridges the initialized fresh-root case
with a strict private host-init receipt, but that is a compatibility admission,
not a native cross-view session attestation.

The 0.4.5 Codex hook manifest also covers the supported shell/file mutation
surface used by this onboarding flow. A future native contract must enumerate
and intercept implementation, Goldfish, and subagent-launch events as first
class lifecycle-governed tools instead of assuming those events share the
shell/file matcher.

## Outcome

Provide one Codex-native, typed refresh and attestation contract so a current
installed plugin becomes the loaded catalog without stale-path failures and a
fresh initialized repository presents the same authenticated lifecycle state
to bootstrap and hooks.

## Scope

- Observe loaded, installed, and App-Server plugin generations as separate
  identities.
- Use a supported Codex invalidation/install route when available; otherwise
  expose one attended, explicit global-daemon restart action.
- Never prescribe Claude's `/reload-plugins` command to Codex.
- Retain the old loaded cache generation until its hook/skill handoff can
  complete, or provide an equivalent stable native resolver.
- Replace the 0.4.5 host-init guard receipt fallback with a native cross-view
  session attestation.
- Declare and enforce supported Codex hook events for implementation,
  Goldfish, and subagent launch paths, not only shell/file mutation tools.
- Preserve fail-closed behavior for copied, stale, malformed, or ambiguous
  identities.
- Cover persistent-daemon updates, removed old cache roots, new threads,
  resumed threads, protected Git views, and plugin rollback.

## Acceptance criteria

- [ ] A supported plugin update never leaves SessionStart or PreToolUse pointing
      at a removed cache root.
- [ ] Loaded and installed versions either converge or yield one typed,
      actionable user-confirmed transition.
- [ ] Codex guidance contains no `/reload-plugins` command.
- [ ] A normal new thread after native installation observes the new skills and
      hooks.
- [ ] External CLI installation has a bounded recovery that names its global
      impact before any daemon restart.
- [ ] Bootstrap and PreToolUse consume the same native authenticated repository
      lifecycle observation.
- [ ] The 0.4.5 compatibility receipt can be removed without weakening the
      lifecycle guard.
- [ ] Supported implementation and agent-launch tools cannot bypass lifecycle
      readiness through an unregistered hook event.
- [ ] Linux, macOS, and Windows adapters have automated fixtures; native
      platform assurance remains separately labelled.

## Non-goals

- General preference/configuration and confirmation-count UX (#25).
- Remote repository creation or Git identity setup.
- Release publication.

## Planning

Priority P2. `sprint:NONE`.
```

## Issue #61 close comment draft

```markdown
Implemented by the 0.4.5 fresh-root onboarding candidate.

Delivered:

- optional SessionStart install offer;
- typed V4 portable-seed and kickoff progression;
- separately confirmed host Git initialization without a commit;
- one-restart protected-control admission;
- exact lifecycle write guard and copy-safe remediation;
- canonical `local-only` transition after host initialization;
- focused regression fixtures plus Full Verify, Security, and independent
  Critic evidence bound to the final commit.

The original Issue was rescoped to the blocking fresh-empty-folder path. Native
persistent-App-Server plugin refresh and replacement of the cross-view
compatibility receipt are tracked in FOLLOW_UP_ISSUE. Installation ceremony and
confirmation-count tuning remain in #25.

Merged/pushed commit: FINAL_COMMIT
Verification evidence: FINAL_VERIFY_PATH
Security evidence: FINAL_SECURITY_PATH
Critic result: FINAL_CRITIC_PATH
```

The placeholders are intentionally filled only after the exact candidate has
passed its final gates and the PO-authorized push has been read back. This
prepared text is not itself a remote Issue mutation or completion claim.
