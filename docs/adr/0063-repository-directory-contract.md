# ADR-0063 — Repository directory contract (lean, Nightwing-pending)

**Status:** accepted (lean scope, deliberately incomplete) · **Date:** 2026-08-12

## Context

Agents invent a directory layout each session because nothing in the ruleset
says what kind of artifact goes where. Six concrete instances measured on one
night (2026-08-08, backlog item
`backlog/items/2026-08-08-no-governed-directory-contract-so-every-session-invents-one.md`)
show the failure mode is real, not hypothetical: agent-authored material
fell back into `.git/`; `scratch/` was declared in `.gitignore` and in the
manifest example but wired to nothing; `.gitignore`'s `evidence/` line
lacked a leading slash and matched `backlog/evidence/` at any depth, silently
swallowing files the backlog closure contract requires; the repo-root
`evidence/` directory was used as a scratch area by an orchestrator because
no other location was designated; dispatch records landed in `evidence/`
by independent, unread convention rather than a stated one; and `evidence/`
itself mixes citable, gate-referenced artifacts with throwaway probe output
that nothing ever prunes.

ADR-0045 (`docs/adr/0045-canonical-artifact-topology.md`) already governs the
`specs/<feature-id>/` package topology for rigor-1/2 feature work. This ADR
does not restate or widen that scope; it covers the artifact kinds ADR-0045
does not — repo-root working directories, plugin-private state, and the
tracked/ignored boundary between them — and treats `specs/` as one already-
solved instance of "normative package with a dedicated home."

Per PO instruction (2026-08-12, in response to the backlog Triage): this ADR
is scoped SIMPLE/minimal on purpose. A future Nightwing-era sprint will
revisit and expand this area; building a comprehensive taxonomy now would be
work discarded at that revision. This ADR resolves the six measured instances
pragmatically, at the minimum depth needed to give each of them a stated home
and a stated check obligation — it is not a completeness audit of every
directory in the repository.

## Decision

**1. Kinds, named, with one home and an explicit "not this" per kind.**

| Kind | Home | Tracked? | May NOT go here |
|---|---|---|---|
| Normative canon (CLAUDE.md, `docs/operating-model.md`, `roles/`, `guardrails/`, `policies/`) | repo root / `docs/`, `roles/`, `guardrails/`, `policies/` (existing locations, unchanged) | tracked | working files, evidence, drafts |
| Decision records | `docs/adr/` | tracked | anything that is not a formalized, numbered decision (see ADR-0045 for feature-authority records, which are a separate kind below) |
| Specifications / feature authority packages | `specs/<safe-feature-id>/` (ADR-0045, unchanged by this ADR) | tracked | ad hoc feature notes outside a package |
| Evidence, machine-regenerated (Verify status snapshots, dispatch records not otherwise cited) | `evidence/` (repo root) | ignored — regenerated per Verify run, never a durable audit trail | anything a gate or a backlog `closure_evidence` field cites durably; that belongs in the row below instead |
| Evidence, durable citation target (backlog `closure_evidence`, Critic verdicts, artifacts a Verify receipt or backlog frontmatter actually points at) | `backlog/evidence/` or `specs/*/evidence/` | tracked | scratch/probe scripts, commit-message drafts, anything not actually cited by name from a gate or frontmatter field |
| Agent-authored temporary material (probe scripts, working notes, intermediate drafts) | `scratch/` (repo root) | ignored | anything a gate, ADR, or backlog item cites as durable evidence |
| Plugin-owned private runtime state | `.git/agent-pipeline/**` and other plugin-declared private paths (`.claude/.usage-*.json`, `.claude/.stop-suggest-*.json`, etc., per `.gitignore`) | ignored | agent-authored deliverables of any kind — this is machine state, not a workspace |
| Generated projections (compiled manifests, routing tables, setup.mjs output) | the resolved authority tier the generator targets (ADR-0053/ADR-0054), never a directory an agent chooses ad hoc | tracked or ignored per the generator's own declared contract | hand-edits (the generator is the single writer) |

**Carve-out: dispatch records.** A dispatch record (`evidence/dispatch-record-<TASK_ID>.json`) always lives at that exact path, in the "evidence, machine-regenerated" row above, EVEN when a backlog `closure_evidence` field or a Critic verdict cites it by name — the row's own "may NOT go here" column would otherwise send a durably-cited record to `backlog/evidence/` instead. This is a stated exception to the general "cited evidence belongs in `backlog/evidence/`" rule, not an application of it: the placement is dictated by what `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` actually reads (`readRecordFile`, `DEFAULT_EVIDENCE_DIR`), which resolves exactly one path and nothing else. Whether a dispatch record's durable-provenance nature means it should live somewhere else long-term — including whether `evidence/` should even be gitignored — is a separate, open question (tracked by `backlog/items/2026-09-01-fourteen-evidence-files-are-tracked-inside-a-gitignored-directory.md` and `backlog/items/2026-09-03-dispatch-records-are-written-to-a-name-the-verifier-cannot-find.md`). This carve-out states where the file goes today; it does not settle that question, and must not be cited as having settled it.

The failure mode this closes: a kind with no home sends its instances
wherever an agent guesses next (instance 1, `.git/` misuse; instance 2,
`scratch/` unwired). Every kind above now has exactly one stated home, and
every home states what it excludes.

**2. Tracked vs. ignored, and the anchoring rule.**

An ignore rule for a directory that is meant to match only at the repo root
MUST be anchored with a leading slash (`/evidence/`, not `evidence/`).
`.gitignore` line 39 already carries the anchored form as of 2026-08-09
(`/evidence/`), fixing the instance-3 bug for the root `evidence/` directory
specifically. **Required follow-up, not done in this ADR:** an audit of the
rest of `.gitignore` for the same unanchored-directory-name pattern is still
open — this ADR states the rule (any directory-name-only ignore pattern must
be justified as intentionally depth-unbounded or anchored with a leading
slash) but does not perform that audit. Track it as a backlog follow-up
referencing this ADR.

**3. What a fresh session is told, and where.**

A contract that lives only in `docs/adr/` is a contract most sessions never
read. The kinds table above (or a condensed pointer to it) MUST appear in the
agent-facing surfaces a fresh session actually loads: the `pipeline-start`
skill (`harness/session-bootstrap.md` / `plugins/pipeline-core`) and the
Goldfish/Critic dispatch templates (`templates/prompts/`). This ADR states
the obligation; wiring the pointer into those surfaces is implementation
work for a follow-up dispatch, not performed here.

**4. What checks it — a future obligation.**

No Verify gate exists yet asserting that a tracked file sits only in a
directory this contract names, or that ignore rules are anchored per point 2.
Building that check is explicitly deferred to a future dispatch (candidate
form: a Verify gate assertion, in the spirit of the existing gate chain,
that scans tracked paths against the kinds table and flags unanchored
directory-name ignore patterns). This ADR names the obligation so it is not
the seventh unmeasured instance; it does not build the check.

**5. Consumer-project inheritance.**

A consumer project has its own layout and must not have this repo's directory
names imposed wholesale. What transfers to a consumer project is the *kinds*
taxonomy (point 1's row categories — normative canon, decision records,
specifications, evidence, agent-authored temporary material, plugin-private
state, generated projections) and the *anchoring rule* (point 2). The
concrete directory names in the table above (`scratch/`, `evidence/`,
`specs/`, `docs/adr/`) are this repo's calibration, not a portable
requirement — consistent with ADR-0046's project-authority layering.

## Consequences

- The six 2026-08-08 instances each now have a named home and a stated
  exclusion; a session choosing where to put a new file has a table to read
  instead of inventing one.
- Three obligations are explicitly deferred and MUST be tracked as follow-ups
  rather than silently dropped: (a) the full `.gitignore` anchoring audit
  beyond the already-fixed `evidence/` line, (b) wiring the kinds pointer into
  `pipeline-start` and the dispatch templates, (c) the Verify gate assertion.
  Until those land, this ADR is a stated contract without an enforcing check —
  the same gap the backlog item's "Why an ADR rather than a README section"
  section warns against; the difference from a README is that this artifact
  now has the standing to be checked, once the check is built.
- This ADR is intentionally lean. It does not build a comprehensive taxonomy
  covering every directory in the repository, does not resolve every
  possible future kind, and is expected to be revisited and expanded by the
  Nightwing-era sprint the PO named. Treat gaps discovered before then as
  candidates for that revision, not as defects in this ADR's scope.

## Discarded alternatives

- **A full per-directory audit and exhaustive taxonomy now.** Rejected per
  explicit PO instruction (2026-08-12): "ja folge empfehlung aber in
  'einfach' machen da es in nightwing noch mal optimiert wird." A
  comprehensive pass now would be substantially rewritten at the Nightwing
  revision; the lean form captures the six measured instances without that
  sunk cost.
- **A README section instead of an ADR.** Rejected for the same reason the
  backlog item gives: a convention nobody enforces is what produced the
  current state, and an ADR is the artifact with the standing to gain an
  enforcing check later (point 4), where a README section has no such path.
- **Building the Verify gate check and fixing `.gitignore` in this same
  dispatch.** Rejected — out of this dispatch's briefed scope; named as
  required follow-ups instead (points 2 and 4) so they are not silently
  dropped.

## Resubmission

- Nightwing-era sprint: full taxonomy revision, superseding this ADR's lean
  scope with whatever depth that sprint's own briefing calls for.
- Before then: the three deferred obligations above (`.gitignore` anchoring
  audit, `pipeline-start`/template wiring, Verify gate assertion) each need
  their own dispatch; none is scheduled by this ADR.
