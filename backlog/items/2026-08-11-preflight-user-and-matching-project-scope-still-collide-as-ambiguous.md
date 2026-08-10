---
schema: pipeline.backlog-item.v1
id: pipeline.preflight-user-and-matching-project-scope-still-collide-as-ambiguous
type: defect
owner: pipeline
status: open
created: 2026-08-11
source: "GF-111 dispatch report (commit 5f0af080, cherry-picked as 257444c8 onto feat/sprint-nova-codex-v046), stop condition 'genuine ambiguity the briefing does not resolve' — the goldfish caught a real self-contradiction in its own briefing and correctly stopped rather than inventing a fix."
---

# `pipeline-start-preflight.mjs`: a `user`-scope entry plus a matching `project`-scope entry for the SAME id still resolve as ambiguous

## Description

GF-111 fixed the original reported bug: `installedPipelineIdentityClaude`
(`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`) counted every
enabled `pipeline-core@agent-pipeline` registry entry toward its ambiguity
check regardless of which project it belonged to, so two DIFFERENT projects
each holding their own `scope: "project"` registration (e.g. this repo and a
sibling `agent-pipeline-shared_phoenix` checkout) made every session on the
machine report `plugin-refresh-required` even though neither project's own
session should have cared about the other's registration. The fix (commit
`5f0af080`) makes a `scope: "project"` entry eligible only when its
`projectPath` matches the running session's `cwd`.

That fix is real and correct as far as it goes, but it does not fully close
the original incident. If BOTH a `scope: "user"` entry AND a `scope:
"project"` entry whose `projectPath` matches the running project exist at the
same time — e.g. because this repo's own committed `.claude/settings.json`
(`enabledPlugins: {"pipeline-core@agent-pipeline": true}`) auto-reprovisions
this project's own `scope: "project"` registration after a manual
user-scope-only cleanup — both entries are still eligible, both have the same
`id`, and `localMatches.length + officialMatches.length` is still `2`, so the
result is still `ambiguous: true`. GF-111's own regression tests confirm this
is the fixture's actual, unforced behavior (two new tests added, neither
tests nor claims a forced `ready` outcome for this case).

## Triggering situation

Live incident this session (2026-08-10/11): a `user`-scope registration was
manually reduced to be the only entry in `~/.claude/plugins/installed_plugins.json`
to unblock `pipeline-start-preflight.mjs`. Within roughly 40 minutes, the
sibling `agent-pipeline-shared_phoenix` project's own committed
`enabledPlugins` declaration auto-reprovisioned ITS `scope: "project"` entry,
reproducing the ambiguity. The same auto-reprovisioning mechanism applies
symmetrically to THIS repo's own project-scope entry, which GF-111's fix
alone does not neutralize once it exists alongside the user-scope entry.

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` —
`installedPipelineIdentityClaude`'s eligibility/ambiguity logic (Claude
runner path only; the Codex path was checked by GF-111 and has no
`scope`/`projectPath`-equivalent field to begin with).

## Proposal

GF-111's own final report names two live options for the PO to weigh, plus a
third the Elephant deliberately did NOT implement unreviewed (EL-01
self-implementation boundary — an epic-profile plan does not let the Elephant
answer its own dispatch's escalation):

1. **Coexistence stays ambiguous (current/fixed behavior is already
   defensible):** a `user`-scope registration and a `project`-scope
   registration for the same id are two independent, human-authored
   installation decisions; silently preferring one over the other could mask
   a real intent conflict. Accept the residual `plugin-refresh-required` and
   treat clearing it (dropping to a single scope) as an occasional manual
   maintenance step, same as this session did once already.
2. **`project` scope shadows `user` scope when both are present and eligible
   for the same id:** add an explicit precedence rule — when the eligible
   set contains exactly one `project`-scope match (after the GF-111
   `projectPath` filter) plus any number of `user`/`local`-scope entries for
   the same id, resolve to the `project`-scope entry and do not treat the
   coexistence as ambiguous. Needs its own regression coverage and a
   deliberate statement of why this precedence is safe (it does not, by
   itself, address case 3 below).
3. **(Elephant's candidate, NOT implemented, flagged for review only)
   collapse on agreement rather than count:** ambiguity should arguably be
   about eligible entries DISAGREEING (different `installPath` and/or
   `version`), not merely existing in multiple registration records. Two
   entries that agree on `installPath` and `version` name the same physical
   code regardless of how many records point to it. Caution raised against
   this option: it would also loosen the EXISTING, already-tested
   local-vs-official ambiguity case (`pipeline-start-preflight.test.mjs`,
   "a Claude registry with two eligible entries fails closed as ambiguous",
   two different ids) if a locally-developed copy ever happened to resolve to
   the same `installPath` as an official one — that test exists specifically
   to catch code-identity confusion, so this option needs explicit PO
   sign-off on loosening that guarantee, not a default pick.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
