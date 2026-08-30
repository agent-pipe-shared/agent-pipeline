---
schema: pipeline.backlog-item.v1
id: pipeline.happy-path-key-onboarding-must-install-directly-as-critical-human-proof
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-30
sprint: nova
tracking: "NOW / Nova A -- PO explicit future requirement, 2026-08-30, filed alongside the trust-anchor-circularity fix it depends on."
source: "PO live session 2026-08-30, item #4 of a 12-point instruction list: 'künftig muss ein frisches projekt einen neuen oder bestehenden key im happy path easy onboarden und auch direkt als critical proof.json installieren' -- filed as a distinct forward-looking item, separate from verifying today's circularity fix (see Related)."
closed_at: "2026-08-30"
closure_repository: "self"
closure_commit: "64544e404b852c87c24c0fd6424b875bee5742a2"
closure_evidence: "backlog/evidence/2026-08-30-sentinel-retirement-and-nova-a-reverification.md"
---

# Closed — 2026-08-30

The current driver path now proves both required cases rather than merely
guiding them. `onboarding-init.test.mjs` passed 22/22 across Claude, Codex,
and Antigravity for both no-key and valid-existing-key homes; it verifies
reuse without replacement and first-anchor materialization. The driver-only
end-to-end suite passed 5/5 to the first implementation file, and the
onboarding suite passed 158/158 including `critical-human-proof.json`
materialization. The detailed durable evidence is referenced above.

# A fresh project must easily onboard a new-or-existing signing key in the happy path, and have it installed directly as `critical-human-proof.json`

## What the PO asked for

Distinct from confirming that today's `6876ba53` fix
(`2026-08-29-trust-anchor-bootstrap-confirmed-still-circular-live.md`, now
closed) resolves the live circularity: the PO separately wants this
codified as a forward-looking, explicit happy-path requirement, not just an
incidentally-fixed bug. A genuinely fresh project, in BOTH the "no key
exists yet" and "an existing key directory already exists" cases, must be
able to complete signing-key onboarding easily (no manual out-of-session
step, no `--no-verify` bypass) and end with the key's anchor actually
installed in `project/critical-human-proof.json` -- not merely guided
toward a command that a human then has to run and troubleshoot alone.

## Current state, as of today's fixes (2026-08-30)

The individual pieces this requirement needs all exist and are individually
tested, but no single end-to-end regression test drives the WHOLE happy
path (fresh project -> no/existing key -> guided setup -> installed
anchor) in one run:

- No-key detection + guidance: `proposeTrustAnchorAbsentGuidanceAction()`
  (NVA-V17-NOKEYASK) fires a `collect-input` action naming
  `po-human-approval.mjs setup` when no key exists.
- Existing-key detection + reuse: `detectExistingLocalTrustAnchor()` /
  `observeLocalTrustAnchorPointer()`, create-only writes (`flag: "wx"`),
  never overwrite -- covered by `onboarding-init.test.mjs`'s with-key
  fixture case.
- The circularity that previously blocked the FIRST anchor write into the
  already-tracked `critical-human-proof.json` is now closed (`6876ba53`,
  `isTrustAnchorBootstrapUpgrade()` exemption) --
  `trust-anchor-bootstrap-circularity.repro.test.mjs` proves the new-key
  case commits directly, no bypass.

What is NOT yet proven in one place: that the EXISTING-key case also
reaches a fully installed anchor through the sanctioned path post-fix (the
onboarding-init with-key fixture predates `6876ba53` and was never
re-verified against it), and that the two paths (new vs. existing key)
converge to the same "easy happy path" outcome shape end-to-end, the way
`driveOnboardingInit`'s own convergence test already does for the driver's
OWN outcome shape but not specifically for the final installed-anchor
state.

## Proposal

Add one end-to-end regression test (or extend an existing suite) that
drives BOTH cases -- fresh project with no key, fresh project pointing at
an existing key directory -- through the real `onboarding-init.mjs` driver
to completion, and asserts in both cases that
`project/critical-human-proof.json` ends with a valid, matching
`trustAnchors` entry with zero manual/out-of-session steps and zero
`--no-verify` bypass. This is verification/hardening work, not new
mechanism -- if the existing pieces already compose correctly (likely,
given `6876ba53` landed today), this closes quickly; if a gap is found,
scope the fix separately.

## Acceptance criteria

- A single committed test drives the full new-key happy path to an
  installed anchor, zero bypass.
- A single committed test drives the full existing-key happy path to an
  installed anchor, zero bypass, confirming the key is reused and not
  silently replaced.
- Both tests pass against current HEAD (post-`6876ba53`).

## Related

- `2026-08-29-trust-anchor-bootstrap-confirmed-still-circular-live.md`
  (closed 2026-08-30) -- the bug this item's precondition depends on;
  fixes the narrow circularity, does not itself add the end-to-end
  happy-path regression coverage this item asks for.
- `2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` (closed)
  -- the original Direction/Acceptance criteria this item extends with an
  explicit end-to-end proof requirement.

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-raised live 2026-08-30 as a distinct forward-looking
  requirement, filed immediately after its enabling fix landed
- **Date:** 2026-08-30
