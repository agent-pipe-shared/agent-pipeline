---
schema: pipeline.backlog-item.v1
id: pipeline.no-governed-directory-contract
type: workflow-improvement
owner: pipeline
status: closed
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
6. **`evidence/` mixes citable artifacts with throwaway material and nothing ever
   prunes it.** Its file listing alone is now 128.7 KB of paths.
   `plugins/pipeline-core/lib/session-cleanup-recovery.mjs` — the built,
   descriptor-bound cleanup machinery — contains no reference to the directory,
   so nothing retires anything there. The quantity is the lesser half. The
   directory holds, side by side and indistinguishable by any rule: one-off probe
   scripts, TAP dumps, commit-message drafts, **and** artifacts that Verify
   receipts and backlog `closure_evidence` fields actively cite. A cleanup that
   cannot tell those apart breaks citations; one that refuses to run leaves the
   directory growing without bound. Neither is acceptable, and no rule currently
   distinguishes them — which is this item's thesis in its sharpest form.

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

- **Decision:** Accepted as an ADR-track item, but scoped SIMPLE/minimal for
  now rather than the full comprehensive treatment of all 6 decision
  points — the Nightwing sprint will optimize this area further, so this
  pass should resolve the six already-measured instances pragmatically
  without over-engineering a taxonomy that gets revisited soon anyway.
- **Rationale:** PO, 2026-08-12: "ja folge empfehlung aber in 'einfach'
  machen da es in nightwing noch mal optimiert wird."
- **Assignment (if accepted):** a lean ADR covering the 6 points at minimum
  necessary depth, queued for this session; expect Nightwing to revise.
- **Date:** 2026-08-12
- **Status update (2026-08-12, NVA-BL-79):** the ADR now exists —
  `docs/adr/0063-repository-directory-contract.md`, indexed in
  `docs/adr/README.md`. It resolves the 6 decision points at lean depth and
  names three deferred follow-ups as required, tracked obligations rather
  than silent gaps: the `.gitignore` anchoring audit beyond the
  already-fixed `evidence/` line, wiring the kinds table into
  `pipeline-start`/dispatch templates, and the Verify gate assertion. None
  of the three is built yet; each needs its own dispatch. This item is not
  closed by the ADR's existence alone.

- **Re-triage, 2026-08-18 (0.6.0 release sweep):** none of the three named
  follow-ups is deferred to a named future sprint or superseded by another
  mechanism — all three are real, unbuilt work against ADR-0063's own
  contract. Queued together for one follow-up implementation dispatch
  (guardrail/agent-briefing code needing test coverage to trust, not a
  read-only doc fix):
  1. **`.gitignore` anchoring audit** — review every ignore rule for
     anchoring (leading `/`) the same way the `evidence/` line was fixed,
     across the whole file, not just that one line.
  2. **Wire the kinds table into agent-facing briefing** — surface
     ADR-0063's kinds table (or a pointer to it) in the `pipeline-start`
     skill and the dispatch templates (`templates/prompts/`), since a
     contract only `docs/` carries is one a Goldfish dispatch will never
     read.
  3. **Verify gate assertion** — add the cheapest credible check ADR-0063
     itself names: a Verify gate asserting no tracked file sits in a
     directory the contract does not name, and that each ignore rule is
     anchored.
  Scope stays exactly these three items already named in the 2026-08-12
  status update; no re-opening of the six original decision points, which
  ADR-0063 already resolved.
- **Date:** 2026-08-18

### Implementation, 2026-08-18 (wave 1, dispatch NVA-W1-8)

Started from base HEAD `c2f8cd13` per this dispatch's briefing. Before making
any change, found that two of the three named follow-ups already exist at
that exact base HEAD, landed by other dispatches earlier in the same wave:

- **Follow-up 1 (`.gitignore` anchoring audit): already fully done**, commit
  `2b90e547` (`fix(.gitignore): anchor directory-only ignore patterns per
  ADR-0063 audit`, dispatch NVA-SWEEP-I2f) — anchors the bare `scratch/` line
  to `/scratch/`, documents `.vscode/`/`.idea/` as deliberately
  depth-unbounded, and adds `harness/scripts/check-gitignore-anchoring.test.mjs`
  (4 tests, still passing).
- **Follow-up 2 (kinds table wired into agent-facing briefing): partially
  done, gap closed by this dispatch.** Commit `99aeafd2` (`docs(pipeline-start,
  templates): surface ADR-0063's directory-kinds table`) had already wired
  `plugins/pipeline-core/skills/pipeline-start/SKILL.md` (the executable
  form) plus `templates/prompts/goldfish-task.md` and
  `templates/prompts/critic-review.md` (and their vendored copies), but had
  **not** touched `harness/session-bootstrap.md` — the file this dispatch's
  own scope summary named explicitly, and CLAUDE.md's "full spec" pointer for
  the bootstrap protocol. This dispatch added the same condensed pointer to
  `harness/session-bootstrap.md` §1 Purpose (new paragraph inserted after
  the "Why a dedicated protocol" paragraph, before the first `---` divider,
  so every role reads it during bootstrap regardless of which role-specific
  section follows) — see `harness/session-bootstrap.md:28-45`. Added
  `harness/scripts/check-session-bootstrap-directory-contract.test.mjs` (5
  tests: pointer presence, `scratch/` mention, kinds named, SKILL.md
  cross-reference, placement inside §1 ahead of §2) to pin it.
- **Follow-up 3 (Verify gate assertion): already built standalone, TP-3
  registration confirmed blocked (matches this dispatch's own briefed
  contingency).** Commit `760bcc6c` (`feat(harness): add standalone
  ADR-0063 directory-contract check`) added
  `harness/scripts/check-directory-contract.mjs` (checks: no tracked file in
  an undeclared top-level directory; every bare directory-name `.gitignore`
  pattern anchored or justified) plus
  `harness/scripts/check-directory-contract.test.mjs` (20 tests, still
  passing), explicitly NOT registered in `harness/scripts/verify.mjs`'s
  `TEST_SUITES` because that file is TP-3-protected. This dispatch
  independently re-confirmed the block live rather than trusting the prior
  commit message alone: attempting to add a `TEST_SUITES` entry for
  `check-directory-contract.test.mjs` was refused pre-execution by
  `guard-testpath.mjs`, **Rule ID TP-3**, no mutation occurred. Per this
  dispatch's briefing, stopped that sub-step, made no retry, attempted no
  override. Registering the check into `verify.mjs` remains open, requiring
  the audited human-guard-override signature ceremony — out of any single
  Goldfish dispatch's authority.

**Test count this dispatch added:** 5 (all passing,
`node --test harness/scripts/check-session-bootstrap-directory-contract.test.mjs`
exit 0). Pre-existing suites `check-directory-contract.test.mjs` (20 tests)
and `check-gitignore-anchoring.test.mjs` (4 tests) re-run as a regression
check, both still passing, unaffected by the doc-only edit.

**Files changed by this dispatch:** `harness/session-bootstrap.md` (new
pointer paragraph), `harness/scripts/check-session-bootstrap-directory-contract.test.mjs`
(new test file), this backlog item (this section). Commit SHA reported
separately by the dispatching Elephant/orchestrator.

**Status left for central triage (not decided by this dispatch):** follow-up
3's `verify.mjs` registration is the only genuinely unbuilt sub-item left
across all three follow-ups; it needs a dedicated TP-3-ceremony dispatch.
Frontmatter `status:` and any Closure section are intentionally left
untouched here, per this dispatch's own briefing — closure is a central,
post-Critic-review decision.

### Verification, 2026-08-19 (Wave 5)

Directly re-ran all three test suites named above:
`harness/scripts/check-directory-contract.test.mjs` (20/20 pass),
`harness/scripts/check-gitignore-anchoring.test.mjs` (4/4 pass),
`harness/scripts/check-session-bootstrap-directory-contract.test.mjs`
(5/5 pass) — 29/29 total, confirming all three follow-ups' actual code
is live and correct, not merely reported so. **Status stays `open`** for
the same reason across this whole item and its siblings this session
(`guard-dispatch-has-no-workflow-tool-awareness`,
`test-suites-use-host-tmp-instead-of-the-repos-own-scratch-convention`):
the one remaining piece — registering `check-directory-contract.test.mjs`
into `harness/scripts/verify.mjs`'s `TEST_SUITES` — is TP-3-protected and
needs a signed/maintenance-window ceremony, not a routine dispatch.

## Closure, 2026-08-19

The remaining piece landed via the signed TP-3 ceremony, commit
`92bb2a08`: `check-directory-contract-tests`,
`check-gitignore-anchoring-tests`, and
`check-session-bootstrap-directory-contract-tests` are all now present in
`harness/scripts/verify.mjs`'s `TEST_SUITES` array and ran green (29/29
combined) in the full 378-suite Verify run against commit `f047f639`. All
three of ADR-0063's named follow-ups are now built, tested, and actually
wired into the gate. Closing.
