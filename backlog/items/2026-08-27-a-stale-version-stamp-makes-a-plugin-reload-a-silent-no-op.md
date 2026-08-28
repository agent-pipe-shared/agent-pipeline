---
schema: pipeline.backlog-item.v1
id: pipeline.a-stale-version-stamp-makes-a-plugin-reload-a-silent-no-op
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: nightwing
source: "Live observation, 2026-08-27: the PO caught a stale cachebuster in plugin.json after a block of work that included wiring a new PreToolUse hook; nothing in Verify compares the stamp against HEAD. Corrected in ruleset a49cd41a."
---

# A stale plugin version stamp makes a reload a silent no-op, and no check compares the stamp against HEAD

## Description

`plugins/pipeline-core/.claude-plugin/plugin.json` (and its Codex sibling,
`.codex-plugin/plugin.json`) carries a `+claude.<YYYYMMDDHHMMSS>.<short-oid>`
cachebuster in the version string. Per
`docs/claude-local-plugin-development.md` ("The cachebuster mechanism and
version convention"), the registry materializes an install into a cache
directory named after that string with `+` replaced by `-`. An unchanged
version string therefore means an unchanged directory name, and a reload
installs nothing new — silently. There is no error, no diff, no warning
anywhere in the reload path.

On 2026-08-27 the stamp still read `20260827092834.1bd88d8` after a block of
work landed that included wiring a new PreToolUse hook — a change whose
entire purpose is to take effect at runtime the next time a session reloads.
Had the reload gone ahead on the stale stamp, the repository (with the new
hook committed) and the running session (still loading the pre-hook cache
directory) would have diverged with no error anywhere to surface it. The PO
caught this by asking directly; nothing in Verify compares the stamp against
the actual `HEAD` the manifest is supposed to describe.

## Why this is not "the same as forgetting to bump a version"

The failure mode is specifically that it **looks exactly like success**: the
reload command returns normally, the session appears to be running the
plugin, and only a manual diff between the installed cache directory's
contents and the source checkout would reveal the mismatch. The correction
itself is mechanical (regenerate the stamp) — the actual gap is the absence
of a check that would catch a stale stamp automatically, not the absence of
a habit of remembering to bump it by hand.

## The one real constraint on any such check

`docs/claude-local-plugin-development.md` documents, as a deliberate
convention adopted 2026-08-07, that **a released version carries no
`+claude.<...>` build metadata** — the cachebuster is stripped when a
release tag is cut, because a released artifact must be reproducible from
its own commit (a timestamp in the string would make two builds of the same
commit produce two different version strings). A check that simply demands
"the stamp must be present and match HEAD's short-oid" would therefore be
wrong for a released version and right only for a candidate under review. A
usable check has to distinguish those two states before it can compare
anything — it cannot uniformly require a stamp.

## Triggering situation

Live observation during a 2026-08-27 session: the PO asked directly whether
the stamp had been refreshed after a block of work that included a new
PreToolUse hook wiring; it had not. Corrected in ruleset `a49cd41a`.

## Affected artifact

- `plugins/pipeline-core/.claude-plugin/plugin.json` (cachebuster field)
- `plugins/pipeline-core/.codex-plugin/plugin.json` (Codex sibling)
- `docs/claude-local-plugin-development.md` (documents the mechanism and the
  release-vs-candidate distinction, but no check enforces it)
- Verify (`harness/scripts/verify.mjs`) — no suite currently compares either
  manifest's stamp against `HEAD` for a candidate under review

## Proposal

Not designed here (this item records the gap, not a fix). A worked check
would need to: (1) determine whether the current tree is a release (no
`+claude.<...>` suffix expected) or a candidate under review (suffix
expected and must match), and (2) for the candidate case, compare the
`<short-oid>` in the stamp against the actual current HEAD (or the last
functional commit's oid, per the existing convention that the oid names the
functional commit, not the metadata commit).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** The item is right that the correction is mechanical and the gap
  is the missing check — and the evidence for that grew after filing. On
  2026-08-27/28 the candidate had to be re-stamped twice (`94c40e87`, then
  `009bb825`) because the first stamp named a commit the work had already moved
  past; both times it was caught by a human noticing, which is precisely the
  control this item says does not exist. A failure mode whose only detector is
  the PO asking "did you bump it?" is not detected.
  The item's own constraint section is the reason this is real work rather than
  a one-line assertion: a released version deliberately carries no `+claude.<...>`
  metadata, so a check cannot uniformly demand a stamp. It has to classify
  release-vs-candidate first, which is a decision about what the tree IS, not a
  string comparison. That is also why this should not be bolted onto an existing
  suite as an afterthought.
  Pairs with `pipeline.repository-agent-definition-is-inert-runtime-loads-installed-copy`:
  same failure shape one layer down (an artifact authoritative in the repository
  but not the one actually loaded), and a single session-start comparison could
  answer both. Worth scoping them together before either is designed.
- **Assignment (if accepted):** Sprint Nightwing (unchanged).
- **Date:** 2026-08-28
