---
schema: pipeline.backlog-item.v1
id: pipeline.two-guards-block-an-unrelated-file-via-substring-name-matching
type: defect
owner: pipeline
status: open
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
