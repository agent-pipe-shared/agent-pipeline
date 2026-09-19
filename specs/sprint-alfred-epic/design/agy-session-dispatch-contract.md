# AGY implementation dispatch — PO requirements and implementation contract

Status: PO-requested candidate scope, 2026-09-19. Not live execution evidence,
not authority to bypass host controls, install plugins, sign or publish.

## Product behavior

Codex remains Elephant. Prefer Antigravity Gemini 3.8 Flash High only for large,
clearly specified implementation tasks with few unresolved design choices.
Never select this fast implementation route for Critic, independent readiness
or design/architecture judgment. Routing enforces role restrictions; a prompt
alone is insufficient. Existing independent review requirements remain intact.

Installed AGY or an available model is NOT session consent. Project settings in
pipeline.user.yaml may store the preferred work mode, but the actual live
dispatch mode needs one conscious explicit PO opt-in for each runtime session.
Default is no AGY model invocation before that opt-in. Session identity changes
invalidate consent. Resume may reuse consent only if the same authoritative
runtime session identity is proven; an unknown identity requires fresh consent.

The consent summary names provider/runner, requested model, implementation-only
role, potential quota/cost use, data sent from the governed task, and scope.
The agent may record an actual PO chat decision using the existing human-mode
mechanism; a preference, install, config read or self-written approval cannot
stand in for that decision. Config cannot silently become cross-session consent.
Changed provider/model/privilege scope requires renewed consent. This operational
session opt-in is separate from the one final design-package PO approval.

If authentication, tokens/quota or execution capability is unavailable, report
a typed unavailable outcome. Never retry indefinitely, silently change models,
spend another provider's quota or claim task completion. Ask about fallback
unless the current session consent explicitly included that fallback.

## Reuse and exact engineering constraints

Reuse role-dispatch-preflight and invokeAgy, canonical model routing, physical
candidate/path/input bindings, session identity and receipt primitives. Do not
reinterpret E3's fixture-only host or its unavailable A1/A2/A3/A5 evidence as a
live grant. A live wrapper is a separate explicit route through the normal
Goldfish admission boundary, not a direct unguarded CLI shortcut.

Preflight must revalidate consent and actual session, role, candidate and input
digests immediately before launch; prevent stale packet/replay/result collision.
Requested model and observed model are distinct. Unobserved effective identity
and OS containment remain unknown, never asserted by self-report. Use the
existing CLI sandbox; never --dangerously-skip-permissions. Do not auto-install,
change login state, inspect credentials or export unrelated repository data.

## Briefing and Elephant acceptance

Every dispatch has explicit owned files, complete requirements, non-goals,
acceptance checks, permitted tests and stop conditions. No shortening scope,
weakening checks or omitting difficult cases merely to produce green results.
No delegation. Preserve other workers' edits and report partial work honestly.

Elephant reads the actual returned diff, checks each requirement against code,
runs relevant tests and verifies dispatch/result provenance. Agent success text
is not acceptance evidence. Select tasks where that verification cost still
makes the fast implementation route worthwhile. Independent Critic is separate
and cannot be replaced by Elephant review or AGY self-review.

## Required tests and pilot

No consent, wrong session, stale/tampered packet, wrong role, changed model,
missing auth/quota, timeout, malformed output, model mismatch and existing result
must fail before false success; before consent there are zero model calls.
Config preference alone grants nothing. Positive consent allows one bounded
implementation dispatch and permits subsequent same-session/same-scope tasks
without repeatedly asking. A real read-only admission probe precedes an owned
implementation pilot; capture actual behavior and don't count mock tests as live
proof. All of this is required for the next local candidate, with a new stamp.
