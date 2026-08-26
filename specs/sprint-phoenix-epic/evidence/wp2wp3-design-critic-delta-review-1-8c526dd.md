# Critic delta re-review 1 (round 2/4): WP2+WP3 rework (base `a75a45d`, head `8c526dd`)

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max.
**Reviewed object:** delta `a75a45d..8c526dd` on
`specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`,
prior finding IDs F1-F8. (Note: this dispatch's first attempt truncated with
no verdict after 42 tool uses / ~480s — redispatched identically with a
pacing note; this is the completed retry's result, not a second round.)
**Verdict: FAIL — 4 new MINOR (3 introduced by this rework, 1 an undisclosed
consequence of the new F5 mechanism). F1 (blocker) and F2-F5 (major) all
genuinely and substantively resolved — independently re-verified line by
line, including a re-run of the design's own repo-wide grep, which
reproduced exactly.**

## Findings

A. **MINOR** — F7 (below-Design-tier authorship, undisclosed) recurs in the
   rework itself. The new disclosure paragraph names only the *original*
   dispatch's below-tier model; the rework dispatch that authored this very
   correction also ran below the Design tier (`claude-sonnet-5`, per its
   scratchpad dispatch-record), undisclosed. The disclosure's cited evidence
   pointer also no longer resolves to the original dispatch (the scratchpad
   file was overwritten by the rework's own record).
B. **MINOR** — §A.6's PO-facing scope figure ("four files instead of one")
   contradicts the rework's own enumeration: the bullet list actually names
   3 distinct companion files (not 4, some listed twice), and §A.3 in the
   same commit adds 2 more files to Part A's scope (a new allowlist module +
   a `guard-gate-strength.mjs` entry) — 5 files total, not "four instead of
   one". Each change is separately disclosed elsewhere; only the PO-facing
   summary figure is wrong.
C. **MINOR** — F5's new `GATE_STRENGTH_PATHS` entry would be the first entry
   in the repo protecting product **source** (all 6 existing entries are
   config files), directly reversing GS-6's own documented deliberate
   choice to leave a source checkout's `plugins/pipeline-core/` writable.
   Since the guard has no in-session override, this also blocks the
   implementing Goldfish from creating the module in the same session the
   rule lands, and blocks all future in-session maintenance (e.g. adding a
   third reviewed origin) without a PO hand-edit. Undisclosed consequence.
D. **MINOR** — F6's new threat-model doc-update entry defers replacement
   wording to "§B.8's open item," but §B.8 contains only 4 scope-exclusion
   bullets, no tracking item/owner — the exact "documented risk with no
   owner" shape F6 originally named, now recurring one level down.

## Deliberately not flagged (genuinely resolved)

F1 (blocker) — resolved substantively: real mechanism change (new advisory
`nextAction` kind + 3 companion-file edits named), not softened wording;
checked for collateral damage against other `nextAction`-shape consumers,
none found. F2 (major) — resolved, all 8 invocations verified at their
cited lines, the 2-network/6-local split independently confirmed correct
(only `ls-remote`/`fetch` touch a remote URL), local-passthrough class
introduces no new network path or argv drift versus today's behavior. F3
(major) — resolved; the "currently inert" claim is genuinely corrected, and
the design's own re-run repo-wide grep reproduces exactly (4 files, matching
exactly). F4 (major) — resolved; `public-core-observation.mjs` verified to
contain zero remote-read verbs; the corrected guarantee and its disclosed
limitation are both accurate. F5 (major) — the underlying gate-strength gap
is genuinely closed (the proposed rule is mechanically viable and would
fire); Finding C above is about undisclosed consequences, not whether the
gap closes. F6 (minor) — the omission itself is fixed (quote verified
verbatim); only the tracking anchor is defective (Finding D). F8 (minor) —
resolved and verified verbatim against the real file. Scope clean (design
doc only). Authorship trailer clean, no lifecycle violation.

## Trajectory check

Consistent — every load-bearing claim independently reproduced, including a
full re-run of the design's own repo-wide WSL-detection grep (returns
exactly 4 files, exactly as claimed).

## Disposition

Round 2 of 4 for this package (initial + this delta). All four remaining
findings are minor and independently fixable without touching F1-F5's
substance. A scoped rework addressing Finding A-D is dispatched next, then a
bounded delta re-review — round 3 of 4, within cap.
