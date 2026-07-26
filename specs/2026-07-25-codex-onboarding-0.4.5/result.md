# Result — Codex fresh-root onboarding 0.4.5

## Delivery status

The 0.4.5 candidate closes the blocking fresh-empty-folder path from Issue
#61. It does not claim that every broader lifecycle ambition originally listed
in that Issue is complete. The Issue should be closed only after the final
0.4.5 commit is pushed and read back; the remaining work below must first be
captured in the follow-up Issue.

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
  that narrowly bound host-init compatibility admission. Other governed writes
  remain blocked.
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
- broader installation-ceremony and confirmation-count tuning, owned by
  Issue #25;
- platform certification beyond the automated Linux/macOS/Windows command and
  fixture matrix; native macOS assurance remains with Issue #49.

The first three bullets form the follow-up Issue below. They are valuable
hardening, but they no longer block starting and using a local fresh project
with the documented attended boundary.

## Follow-up Issue draft

**Title**

`[P2][Codex] Make plugin refresh and cross-view onboarding attestation native`

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
