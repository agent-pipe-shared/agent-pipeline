---
schema: pipeline.backlog-item.v1
id: pipeline.two-guards-block-an-unrelated-file-via-substring-name-matching
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-19
closure_repository: self
closure_commit: 70069a74ddcf56bdd65c91b8ee940a5a815079bf
closure_evidence: plugins/pipeline-core/hooks/guard-git.test.mjs
created: 2026-08-17
source: "Live consumer-project happy-path test, D:\\Dev\\HA, 2026-08-17, runner Claude, version 0.5.5+claude.20260817142605.6465407 -- relayed and independently re-verified against this checkout's own current source before filing."
---

# Two guards match a filename as a plain substring, blocking files that only resemble a protected/secret name

## Description

Two independent guards refuse a command because a filename contains a
protected/secret pattern as a raw substring, not because the file actually
IS the protected/secret file:

**A — `.bak` backup copies blocked as if they were the real protected file.**
`hooks/guard-lifecycle-ready.mjs`'s `gateStrengthShellRefusal()` (~lines
516-518) does `haystack.includes(needle)` against the command text. `rm
project\pipeline.yaml.bak` is refused because `project\pipeline.yaml.bak`
contains `pipeline.yaml` as a substring — even though the target is a backup
copy, not the file itself. The function's own code comment (~lines 507-515)
documents that it deliberately cannot distinguish a read from a write for
this class of refusal, but says nothing about matching an unrelated file by
name alone. No in-session override exists for this specific shell-lane
refusal (confirmed by the guard's own denial text).

**B — a file named `fakesecrets.yaml` is blocked by the `secrets.yaml` rule.**
`hooks/guard-git.mjs` (~line 403), the "staging secrets/state" rule, uses a
regex `secrets\.yaml\b` with no boundary anchor BEFORE "secrets" — it
substring-matches inside `fakesecrets.yaml`, an explicitly-named, real,
intentional non-secret CI fixture file (dummy values only). `git add --
homeassistant/fakesecrets.yaml` is refused under `GG-11`. A
`PIPELINE_GUARD_OVERRIDE` ceremony with PO confirmation works around it but
is disproportionate for what is, at bottom, a naming coincidence rather than
a real secrets risk.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (`gateStrengthShellRefusal()`),
`plugins/pipeline-core/hooks/guard-git.mjs` (the `secrets\.yaml` pattern,
`GG-11`).

## Not a duplicate

Independently re-verified: this is NOT the same defect the already-closed
`guard-string-match-makes-a-file-uncommittable-by-any-agent`-class item
fixed — that one addressed the read/write-verb ambiguity for the SAME
protected file; both instances here are about matching a DIFFERENT,
unrelated file purely by name substring.

## Proposal

Not designed here. Two independent, narrower fixes:
- **A:** add an explicit exclusion for known non-live-artifact name patterns
  (e.g. a trailing `.bak` suffix) before the substring match, or require an
  exact basename/path match rather than `includes()`.
- **B:** anchor the regex on a word/path boundary before "secrets" (e.g.
  `(?:^|[/\\])secrets\.yaml\b` or equivalent), so `secrets.yaml` matches but
  `fakesecrets.yaml` does not.

Both are narrow, mechanical, well-scoped fixes to guardrail-tier code —
still needs goldfish-deep (per this repo's own agent-tier rule for guard
files), not a same-session Elephant patch.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, current scope. Real, reproducible false positives
  on legitimate, non-secret operations; the workaround exists for B but is
  disproportionate, and A has no workaround at all.
- **Rationale:** independently re-verified against this checkout's own
  current source, both sites confirmed as described.
- **Assignment (if accepted):** goldfish-deep, guardrail-tier (MP-07), plus
  Critic review before considered done.
- **Date:** 2026-08-17

## Progress (2026-08-17)

**A — fixed.** Landed as part of dispatch NVA-LCGUARD-4's Gap 1:
`gateStrengthShellRefusal()` now uses a boundary-aware
`matchesProtectedBasename()` (`(?<![a-z0-9._-])needle(?![a-z0-9._-])`)
instead of raw `includes()`, so `pipeline.yaml.bak` no longer matches
`pipeline.yaml`. Verified: `guard-lifecycle-ready.test.mjs` 93/93 pass,
including new test `NVA-LCGUARD-4 gap 1`. Commit
`e854b7bbdc82850d266d93068fe9f78fa3d7284c`.

**B — still open, tracked separately as `NVA-GG11FIX-1`.** Blocked: the fix
requires adding a test case to `guard-git.test.mjs`, a TP-1 protected test
path. `repair-map.mjs --help` for the applicable code
(`HGO-AUTHOR-ROOT-REQUIRED`) reports `liftable: author-repair-required`,
`by: attended-author-outside-session`, `command: (none)` — confirmed there
is no in-session-triggerable override for this lift class (unlike the
general `HGO-ELIGIBLE` case, which prints a 3-command
plan/prepare-authorization/authorize-by-signature sequence). This item stays
`open`, scoped to part B only, until the PO does something out-of-session to
lift it or an alternative path is found.

### Confirmation, 2026-08-18

**Decision:** Part B remains blocked on an out-of-session human ceremony,
confirmed unchanged. `guard-git.test.mjs` is a TP-1 protected test path;
`repair-map.mjs --help` for `HGO-AUTHOR-ROOT-REQUIRED` reports
`liftable: author-repair-required`, `by: attended-author-outside-session`,
`command: (none)` — no in-session-triggerable override exists for this lift
class. **What the PO needs to do:** run the attended-author repair ceremony
outside this session to unlock an edit to `guard-git.test.mjs`, after which
the bounded fix from the existing Proposal applies directly: anchor the
`secrets\.yaml` pattern in `guard-git.mjs` (`GG-11`, ~line 403) on a
word/path boundary (e.g. `(?:^|[/\\])secrets\.yaml\b`) so `secrets.yaml`
still matches but `fakesecrets.yaml` does not, plus the accompanying test
case the protected path currently blocks. Status stays open; not closeable
from within a session.
- **Date:** 2026-08-18

### PO decision, 2026-08-18 (20-item decision batch) — ceremony scheduled, no in-session step exists

PO decision: A — schedule the author-repair ceremony now. Checked
whether anything could be prepared in-session first (matching the
plan/prepare-authorization/emit-signature-digest pattern used for
signature-mode ceremonies): confirmed there is none. `repair-map.mjs
--help` for `HGO-AUTHOR-ROOT-REQUIRED` explicitly reports `command:
(none)` — this lift class (`by: attended-author-outside-session`) has
no in-session-triggerable command at all, unlike the general
`HGO-ELIGIBLE` signature-mode class. **What the PO needs to do,
exactly:** outside any session, as the attended author, directly edit
`plugins/pipeline-core/lib/guard-git.test.mjs` to add the boundary-
anchored regex test case (`fakesecrets.yaml` must NOT match, per this
item's own Proposal), then apply the accompanying one-line fix to
`guard-git.mjs`'s `GG-11` pattern (~line 403) the same way. No signature
ceremony, digest, or session command is involved — this is a plain,
attended, out-of-session edit to a TP-1 protected test path. Status
stays open until the PO does this.

### Resolved, 2026-08-19 — Part B ceremony completed by the PO

The PO ran the attended-author edit outside this session
(`scratch/apply-po-author-fixes-2026-08-19.mjs`), landing the fix
exactly as scoped above, plus the same boundary-anchor bug found to
recur identically at two more sites while preparing the fix (GG-15's
quoted `git add`, GG-16's quoted `Remove-Item`) — included with an
explicit `FIX_SIBLINGS` toggle rather than silently expanding scope.
Chosen anchor: a negative lookbehind
`(?<![a-zA-Z0-9_])secrets\.yaml\b`, not this item's own suggested
`(?:^|[/\\])secrets\.yaml\b` — the path-boundary form would have broken
existing bare (`git add secrets.yaml`) and quoted
(`git add "secrets.yaml"`) fixtures that have no leading `/`/`\`.
Committed by the Elephant as `c6a99c8d` (the `guard-git.mjs` fix) and
`70069a74` (the new `fakesecrets.yaml` ALLOW test case in
`guard-git.test.mjs`). Verified: `node --test
plugins/pipeline-core/hooks/guard-git.test.mjs` 220/220 green at the
time (224/224 as of the later GIT-01 work in a separate item). Both
Part A (2026-08-17) and Part B (2026-08-19) are now landed on trunk —
**closing this item.**
- **Date:** 2026-08-19
