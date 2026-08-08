---
schema: pipeline.backlog-item.v1
id: pipeline.no-governed-directory-contract
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "PO, 2026-08-08: 'uns fehlt da noch eine art adr die die verzeichnisstrukturen besser hart vorgibt und definiert was wo hin gehört - agenten neigen bei jeder neuen session dazu neue strukturen zu erfinden. das muss die pipeline steuern.' Five corroborating instances from that same night are recorded below."
---

# No artifact says what goes where, so every session invents a directory layout

## The problem, as the PO states it

Agents tend to invent a new structure each session. Nothing in the ruleset
governs where a given kind of file belongs, so each session makes a locally
reasonable choice, and the choices do not agree with each other or with the
previous session's. The Pipeline governs commit format, review separation,
evidence discipline and gate authority — and says nothing about layout.

This is not a tidiness complaint. Every instance below is a case where the
missing contract produced either a wrong location, a silently ignored file, or a
capability that could not be used.

## Five instances from one night (2026-08-08)

1. **Agent-authored material fell back to `.git/`.** Observed by the PO:
   dispatches wrote helper scripts and evidence into the git directory, because
   the guard refuses everything outside the project root and no text told them
   where inside it to go. It works and nobody would have chosen it.
   (`.git/agent-pipeline/**` is legitimate plugin-owned private state and is not
   what this describes.)
2. **`scratch/` was sketched and never wired.** It is in `.gitignore`, it appears
   commented out in `templates/pipeline.yaml.example` as a cleanup-allowlist
   entry, and nothing creates it, briefs it, or binds cleanup to it. The intent
   existed in two files and reached no agent.
   (`2026-08-07-session-scratchpad-is-unwritable-under-the-cross-repo-guard.md`)
3. **`.gitignore` line 25 carries `evidence/` without a leading slash**, so it
   matches any directory of that name at any depth, including `backlog/evidence/`
   — the location the backlog closure contract requires `closure_evidence` to
   point at. Fourteen older files there are tracked from before the rule; every
   new one is silently ignored while the gate, which only checks the frontmatter
   field is set, still passes. Filed separately as
   `2026-08-08-an-over-broad-ignore-rule-swallows-the-closure-evidence-the-gate-demands.md`.
4. **The orchestrator used the repo-root `evidence/` as a scratch directory**,
   parking commit-message drafts (`evidence/msg-*.txt`) there because no other
   in-repository location was designated. That directory is meant for evidence
   artifacts, not for working files.
5. **Dispatch records landed in `evidence/` untracked**, which each dispatch
   independently decided was correct. It may well be correct — but five
   dispatches arrived at it separately rather than reading it anywhere.

## Why an ADR rather than a README section

A convention nobody enforces is what produced the current state: the intent for
`scratch/` already existed in two files. What is missing is an artifact with the
standing to be *checked* — the same standing `docs/adr/` gives the runner
contract and the authority precedence chain, both of which have enforcing code.

## What such an ADR has to decide, not merely describe

1. **The kinds, named.** At minimum: normative canon, decision records,
   specifications, evidence artifacts, agent-authored temporary material,
   plugin-owned private runtime state, and generated projections. The failure
   mode is a kind with no home, which is what sent helper scripts into `.git/`.
2. **One home per kind, and the reverse direction too.** For each directory, what
   may NOT go there. Instance 4 is a directory used for a kind it was not for.
3. **Which are tracked, which are ignored, and how the ignore rule is anchored.**
   Instance 3 is an ignore rule that was correct for its intended target and
   wrong for a same-named directory elsewhere. Anchoring is a rule, not a detail.
4. **What a fresh session is told, and where.** A contract that lives only in
   `docs/` is one an agent may never read. The kinds an agent writes during a
   session must appear in the agent-facing briefing — the `pipeline-start` skill
   and the dispatch templates — or the ADR will be as effective as the
   commented-out `scratch/` entry was.
5. **What checks it.** Without a check this becomes the sixth instance. The
   cheapest credible form: a Verify gate asserting that no tracked file sits in a
   directory the contract does not name, and that each ignore rule is anchored.
6. **How a consumer project inherits it.** The Pipeline governs other repositories;
   a layout contract that applies only to this one is half a contract. Note the
   tension explicitly: a consumer project has its own layout and must not have
   this one imposed wholesale. What transfers is likely the *kinds* and the
   ignore-anchoring rule, not the directory names.

## Relationship to the existing record

`backlog/items/2026-07-19-documentation-information-architecture.md` is the
Nightwing-era item the PO recalled. It is a recovered Sentinel baseline stub
carrying scope and status only, with no content, and its subject is
documentation information architecture rather than repository layout. It is the
nearest existing record and should be read together with this one; this item does
not supersede it and does not claim to close it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
