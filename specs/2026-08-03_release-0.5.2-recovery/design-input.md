# Release 0.5.2 Recovery — Design Input

## Problem statement

Release 0.5.1 cannot complete a clean protected publication: the Push Gate
assumes a `lastApproved` record exists and may dereference it when it does not.
The publication executor's external-remote capability model also reports a
permanent unavailable state instead of a typed, independently evidenced
preflight result.

The Codex write adapter exposes a related reliability gap.  Its outer
PreToolUse budget is shorter than the nested `apply_patch` guard's sequential
work.  A timeout is not remembered by the selected-sandbox circuit breaker,
because that breaker governs dispatched child invocations rather than native
tool hooks.  Repeated attempts therefore spend tokens without new evidence.

## Goals

- Ship a local 0.5.2 candidate; never recreate v0.5.1.
- Make absent or malformed Push Gate approval fail closed with a typed result.
- Keep direct raw `git push` denied while allowing publication only through
  independently evidenced executor readiness.
- Add targeted preflight and no-start guarantees at effectful invocation
  boundaries, including Critic/governance paths.
- Introduce a fingerprinted, session-scoped circuit breaker for classified
  native-hook sandbox timeout/permission failures.
- Raise and align the Codex adapter and nested-guard budgets so legitimate
  bounded guard work can finish; retain a finite global cap and fail closed.
- Make release version and public release-state surfaces consistently 0.5.2.

## Explicit exclusions

- GitHub issue #107 and any IAM identity-vs-decision redesign.
- Direct push, tag, GitHub release, or other external publication while fixing.
- A universal sandbox fallback or generic suppression of arbitrary guard errors.

## Safety shape

Only classified `ETIMEDOUT`, `EPERM`, `EACCES`, or `EROFS` failures produced by
the native hook execution path may open the breaker.  The record binds tool
class, adapter/guard identity, repository/session fingerprint and failure code.
On a repeat it must return a typed recovery or supported host route before the
tool action starts.  Semantic guard denials and unclassified execution errors
remain fail-closed and are never bypassed.
