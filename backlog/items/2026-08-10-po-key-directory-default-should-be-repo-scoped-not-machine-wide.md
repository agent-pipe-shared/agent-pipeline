---
schema: pipeline.backlog-item.v1
id: pipeline.po-key-directory-default-should-be-repo-scoped-not-machine-wide
type: defect
owner: pipeline
status: open
created: 2026-08-10
source: "PO review of GF-080 (commits 2f8d813c/67c160c4), 2026-08-10, immediately after the fix landed: 'das der Pfad maschinenweit ist, ist nicht gut weil man ggf unterschiedliche Identitäten an der selben [Maschine] will aber den späteren Aufruf macht ja der agent. daher müssen wir den Standardpfad von Maschinenweit auf Repoweit umstellen.'"
due: 2026-08-23
---

# The `poKeyDirectory` default GF-080 added is machine-wide; it should default to repo-scoped instead

## What happened

GF-080 (commit `2f8d813c`) made `po-human-approval.mjs setup --directory <dir>`
persist that directory into `~/.agent-pipeline/machine.json`'s
`poKeyDirectory` field, so a later command on the same machine that omits
`--directory` resolves it from there. This closed the reported friction (a
human/agent having to retype `--directory` every time) — but the PO flagged,
immediately on review, that the chosen SCOPE is wrong: machine-wide, not
repo-wide.

## Why machine-wide is the wrong default

A human may legitimately want DIFFERENT PO signing identities for different
repositories on the same machine (e.g. a personal project vs. a work
project, or two clients). But the command that actually CONSULTS this
fallback (`sign-intent`, `authorize-critical`, etc., when `--directory` is
omitted) is run by the AGENT, not the human, and an agent session is
ordinarily scoped to one repository at a time. A machine-wide default means
an agent working in repo B could silently resolve and use the identity/key
directory a human set up for repo A — the wrong signer, silently, with no
prompt — the exact opposite of the explicit, human-confirmed identity this
whole ceremony exists to guarantee.

## Direction

Change the default resolution scope from machine-wide to repo-scoped: the
directory a human establishes via `setup --directory <dir>` for a given
repository should be remembered per-repository, not globally. A plausible
storage location is something already established as pipeline-owned,
repo-local, never-committed state (e.g. under `.git/agent-pipeline/`, in the
same spirit as other repo-scoped private state this codebase already
keeps) rather than `~/.agent-pipeline/machine.json`. The existing
machine-wide plane and its `poKeyDirectory` field may still have a role (a
genuine "I use the same identity everywhere" case), but it should not be the
DEFAULT a repo-scoped agent session falls back to silently. Design the exact
precedence (explicit `--directory` > repo-scoped remembered value > any
machine-wide fallback > environment variable) as part of this fix, and add
regression coverage proving an agent working in a SECOND repository never
resolves the first repository's remembered directory.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
