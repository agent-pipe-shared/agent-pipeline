title:	[P0] Implement direct AGY Antigravity runner after Nova Alpha
state:	CLOSED
author:	agent-pipe-shared (APS)
labels:	area:runners, blocker, enhancement, sprint:NONE
comments:	1
assignees:	
projects:	
milestone:	
issue-type:	
parent:	
sub-issues:	
sub-issues-completed:	
blocked-by:	
blocking:	
number:	69
--
## Purpose

This follow-up owns the direct, executable Antigravity CLI (`agy`) runner implementation that was deliberately removed from Sprint Nova's Alpha scope.

## Context

Sprint Nova provides only the visible Alpha integration boundary: a documentation-bound Antigravity runner descriptor, Gemini selector/capability mapping, and fail-closed selection semantics. It makes no claim that `agy` is installed, discoverable, authenticated, network-enabled, or invocable.

The Alpha slice does not close the direct runner implementation. It is recorded on #15 and closes with Sprint Nova close under its narrowed Alpha acceptance.

## Outcome

Deliver a genuinely usable, certified Antigravity CLI runner in a separately planned sprint, directly against the then-current official AGY/Antigravity contract.

## Scope

- Revalidate and pin the official Antigravity/AGY contract at implementation time.
- Obtain explicit authority for installation/discovery, authentication, network egress, and live capability observation.
- Implement invocation, cancellation, structured result parsing, usage projection, error taxonomy, and requested-versus-observed model identity.
- Certify every advertised Antigravity capability and Gemini model selector through #7.
- Keep Advisor, review, and write unavailable unless independently certified.
- Preserve Claude and Codex frozen-fixture regressions.
- Bind acceptance evidence to the exact implementation candidate and merged commit.

## Exclusions

- No generic Google-provider or direct model-API integration.
- No silent capability promotion from the Nova Alpha descriptor.
- No change to the Nova Alpha's explicit non-live boundary.

## Planning

- **Sprint:** none — assign only during a later, dedicated AGY sprint.
- **Dependency:** the then-current official contract plus an explicitly approved authentication/credential boundary.
- **Relation:** supersedes the direct-live portion previously planned in #15; #15 remains Sprint Nova work only for the re-scoped Alpha integration boundary.

## Acceptance criteria

- A direct `agy` execution path is observed under the explicitly authorized boundary.
- Every advertised runner cell and Gemini selector passes #7 conformance.
- Cancellation, result, usage, failure, and model-identity semantics are evidence-bound and capability-honest.
- Claude/Codex regressions remain green.
- The final issue comment identifies the merged commit and exact verification evidence.

## Rollback Path Documentation
Rollback path is documented as follows: Since this is an unreleased internal configuration layer update, a standard git revert commit of the target integration commits is sufficient. No production feature flags or database down-migrations are required.

## Backward-compatibility Assessment
The backward-compatibility impact is assessed as none. The integration purely adds `antigravity` as a supported capability for consumers without modifying or redefining the existing `claude` and `codex` usage footprints, which are protected by strict backward-compatible test suites like `C01 v1 preserves Claude routes and projects exact Codex routes` in `p3b-runner-conformance.test.mjs`. Old shapes continue to be consumed natively by legacy systems and are protected.
