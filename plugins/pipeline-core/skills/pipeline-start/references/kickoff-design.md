# Kickoff intake, the durable design package, and document quality

Load this when a project is pristine, when a first `kickoff plan` is about to
run, when material design input has arrived, or when a design package is being
created or promoted. The core keeps the check that puts you here; everything
below is what to do once you are in one of those states. It was moved out of
the core verbatim (BOOTMOD-1): the core is read at the start of every session
and pays for every byte, including the sessions that never reach a kickoff.

A genuinely pristine repository's `v4Inspection` status is no longer
`kickoff-required` in current code: since commit `10e1b6a0`, that branch
always routes instead to `intake-required`, `intake-design-questions-
required`, or `bootstrap-binding-required` (`kickoff-required` survives only
as an unreachable-in-practice safety net for a drifted state the design does
not otherwise describe). If the observed status is one of those three, load
`references/intake-generate-design.md` instead — that is the coordinator
flow a fresh repository now actually routes toward; it hands off into the
same promotion transaction this file documents below, so read this file
first, then that one. A repository already mid-kickoff under the old model
(`kickoff apply` already ran, `kickoff promote` has not) never reaches that
branch at all — its continuity is already valid, so it keeps following the
rest of this file untouched.

A pristine project's first commits mix two different kinds of file: the
onboarding transaction's own pipeline-scaffolding output (`.claude/settings*`,
guard/hook configs, and any other pipeline-authority file it writes) and the
first feature code the PO actually asked for. Commit those separately —
scaffolding in its own commit(s), never bundled into the same commit as
feature code. A later Critic dispatch escalates to the heavier T1 review tier
whenever the reviewed diff touches "architecture/guardrail/security
surfaces — hooks/, agents/, .claude/settings*, permission/guard config,
guardrails/, policies/, secrets/auth/credentials, or A/G/S-marked `riskZones`
from the calibration" (`skills/critic-review/SKILL.md`), regardless of
whether anything else in that diff has real security surface. A scaffolding
file riding along with ordinary feature code forces that heavier tier onto
work that needed only the standard review.

Neither `kickoff apply` nor `kickoff promote apply` (`applyOnboardingKickoff`/
`applyOnboardingKickoffPromotion`, `lib/onboarding-continuity.mjs`) ever
touches Git — by design, the same as the onboarding transaction referenced
above never touches it either (`project-onboarding-v3.mjs`'s
`applyProjectOnboardingV3`). When one of those calls reports status `applied`,
its own written targets are exactly what must be staged and committed next; a
`ready`-status onboarding that leaves them untracked is not actually done. For
`kickoff apply` that is `docs/state.md` (or whatever path
`.claude/pipeline.json`'s `handover` field names — `docs/state.md` by default)
plus the provisional PRD/Spec pair it just wrote,
`specs/<feature-id>/prd_<feature-id>.md` and `specs/<feature-id>/spec.md`
(`<feature-id>` is `kickoff-<goal-hash>` at this stage). For `kickoff promote
apply` it is the same `docs/state.md` (now updated) plus the promoted
package's `specs/<promoted-directory>/prd_<short-topic>.md`,
`specs/<promoted-directory>/spec.md`, and
`specs/<promoted-directory>/design-input.md`.

Bootstrap questions are answered before any artifact is written. The
project's operator-facing language is decided by what the PO answers, never
inferred from the greeting, the repository's contents, or the runner's
locale — rewriting an already-authored PRD, Spec, or handover in another
language afterwards is the expensive path. Ask it together with the goal and
profile below, before the first artifact is drafted, in plain language —
problem, options, cost, recommendation — never a bare setting name: *"Which
language should the PRD, Spec, and this project's working documents use —
English or German? English is the more portable choice outside a
German-speaking team; German reads naturally if that is how the team already
works, at the cost of a still-English document scaffold underneath either
way. Recommendation: match the language you would already write the PRD
in."* Bind the answer into `<!-- po-language: (de|en) -->` before drafting.

For a hosted (non-Pipeline) project, that operator-facing choice is not the
last language question this flow asks. Before drafting the real, promoted
PRD/Spec — not the provisional kickoff scaffold above, which always stays
bound to the operator-facing answer — ask a second, separate question: *"Which
language should the PRD/Spec document itself be written in? The default is
the same as your operator-facing choice above; if your team, PO, or target
audience needs the document in a different language — French, Chinese, any
language — name it, and that is what gets written."* Bind that answer's
lowercase two-letter code directly into the same `<!-- po-language: ... -->`
marker while drafting the promoted document — exactly the binding instruction
above, just no longer restricted to `(de|en)` in wording. Whatever language is
chosen, the document's own structure and section headings stay in English
underneath either way, exactly like the still-English scaffold above: only
prose content is translated, never the machine-oriented section headings — no
validator anywhere reads heading text, so this is a documentary convention,
not an enforced schema.

Two different guard-drift refusals can hit this same PRD-authoring step in a
row — a `PO-GATE-PRD-LANGUAGE-MISMATCH` on the marker, then a separate
`projection-drift` refusal right after that repair — and they are DIFFERENT
failure classes with different repair tools, not the same repair path run
twice. The language mismatch is cleared by `po-gate-profile-repair.mjs plan
--root <project-root> --human-facing <de|en>`, then `po-gate-profile-repair.mjs
apply --root <project-root> --human-facing <de|en> --plan-sha256 <sha256>
--activate` with the digest the plan step reports. Re-running that same
repair for the `projection-drift` refusal is a no-op: it never touches the
runtime-manifest generation step that is actually out of sync. The
`projection-drift` refusal is cleared instead by `project-onboarding-v3.mjs
plan-repair --root <project-root> --intent <onboarding|bootstrap|session|
dispatch> [--runner claude|codex]`, then `project-onboarding-v3.mjs
apply-repair --root <project-root> --plan-sha256 <sha256> --activate` with the
digest the plan-repair step reports.

Before the first `kickoff plan`, obtain both a single-line project goal and an
explicit PO profile: `epic`, `feature`, or `mini`. Ask for them together when
the project is pristine; if the user supplied only a goal, ask for the profile
before continuing. Explain the choices briefly (`epic` = cross-package
initiative, `feature` = bounded deliverable, `mini` = small, contained change).
Recommendation: `feature` unless the work is visibly cross-package or
trivially small.
Never infer, silently select, or retrospectively claim a profile from the
amount of text, an assistant's preferred route, or a model preflight. The
profile is a PO input, not a second confirmation for an already authorized
local onboarding transaction.

**Self-check before sending the first bootstrap question:** state, to
yourself, the full list of bootstrap questions this step needs answered —
language, goal (if not already supplied), and profile, plus any other
still-open bootstrap question this session has identified — and confirm that
list is complete before composing the message. Never send a question from
that list, then wait for its answer before asking the next one; all of them
go into ONE message, together, before any is answered. Sending them one at a
time is the failure this self-check exists to catch.

The exact invocation shape for `kickoff plan`/`kickoff apply` (guard-enforced,
`guard-lifecycle-ready.mjs` `sanctionedOnboardingArgs`; CLI usage at
`project-onboarding-v3.mjs:56`):

```
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff plan \
  --root <project-dir> --goal <text> --language <de|en> [--runner claude|codex]
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff apply \
  --root <project-dir> --goal <text> --language <de|en> \
  --plan-sha256 <sha256> --activate [--runner claude|codex]
```

`--language <de|en>` is mandatory and sits in this exact fixed position
between `--goal <text>` and (`--plan-sha256`/end) — no reordering tolerance;
the CLI itself rejects a missing value ("kickoff plan/apply requires
--language <de|en>") and the guard's allowlist checks the same position
byte-for-byte. `--profile` is NOT a valid flag for `kickoff plan`/`kickoff
apply` — it belongs only to `kickoff promote` (see below); the guard's
exact-length match rejects any invocation that adds it here.

The transaction-created `specs/kickoff-*` files are provisional bootstrap
anchors, not the standard long-term design location. Once material design input
exists, create the normal design package before presenting a planning result
or proposing a restart, then use the sanctioned kickoff-promotion flow. Its
directory is `specs/YYYY-MM-DD_short-topic/`, where the date is the local
creation date and `short-topic` is a short, lowercase, ASCII-safe summary of
the user's topic. Use `prd_short-topic.md`, `spec.md`, and `design-input.md`.
Never overwrite an existing package; choose an unambiguous suffix after a
readback. The promotion's `--profile`, feature ID, plan/PRD/Spec paths must
bind to that package exactly.

Treat that named package as a pre-authority staging set: write and review its
PRD, Spec, and `design-input.md` there first, then run `kickoff promote plan`
and only its digest-bound `kickoff promote apply` to bind the PRD/Spec in State
and the source-evidence path/hash in the same immutable continuity transaction.
The exact invocation shape (both subcommands take the same flags; `apply` adds
`--plan-sha256` and `--activate`):

```
node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff promote <plan|apply> \
  --root <project-dir> --profile <epic|feature|mini> --id <id> \
  --plan-path <path> --prd-path <path> --spec-path <path> \
  --design-input-path <path> [--runner claude|codex] \
  [--plan-sha256 <sha256>] [--activate]
```

`kickoff promote plan`/`apply` additionally enforce, at the continuity layer
(`lib/onboarding-continuity.mjs`, `promotionInput`/`promotionArtifacts`),
three constraints not visible in the flag list above:

- `--plan-path` must be byte-identical to `--prd-path`, and that path's
  basename must match `prd_*.md`, else `KICKOFF-PROMOTION-PLAN-NOT-PRD`:
  "promotion plan must be exactly the promoted prd_*.md".
- `--id` must be a new feature id and must not start with the literal prefix
  `kickoff-`, else `KICKOFF-PROMOTION-INPUT`: "promotion feature id is
  invalid".
- The files named by `--prd-path`, `--spec-path`, and `--design-input-path`
  must already exist on disk before `kickoff promote plan` runs, else
  `KICKOFF-PROMOTION-AUTHORITY`: "promotion PRD, specification, and design
  input must already exist".

Never edit the active provisional
`specs/kickoff-*` PRD/Spec, or any already bound PRD/Spec, merely to add richer
design documentation. Do not invoke a repair, generic continuity CAS, manifest
repair, or hash-rebinding cascade solely because a new design package was
created. After promotion, a material change to a bound PRD/Spec follows the
ordinary reviewed planning/rebind path; it is not a document cleanup.

`prd_short-topic.md` must carry `<!-- po-language: xx -->`, where `xx` is any
lowercase two-letter language code (not restricted to `(de|en)` — see above),
exactly once on its own line, and
`<!-- technical-spec-sha256: <sha256-of-spec.md> -->`.

`design-input.md` is source evidence, not an unbounded conversation dump. It
records a faithful, sanitised structured extraction of the material input
(context, goals/non-goals, requested behaviour, constraints, risks, open
questions, and stated decisions) plus its capture date. The PRD and Spec both
link to it and carry a compact traceability table from its sections to their
requirements/decisions. Preserve the user's specificity; never collapse a
detailed design into the initial one-line goal. Never persist private
identifiers, credentials, host paths, URLs, commands, or raw transcripts;
when material, record only a redacted statement and a safe digest/reference.

The source-evidence file is immutable after its PRD/Spec reference is bound.
If the design input materially changes, create a new safely named evidence
version and promote/rebind it through the ordinary planning change, rather than
rewriting an old evidence file and provoking authority-hash drift.

For material input, replace the bootstrap placeholders with a useful PRD and
Spec before a normal plan gate. The PRD covers problem/users, outcomes,
success measures, scope/non-goals, testable-acceptance requirements,
assumptions/risks/open questions, and user-flow decisions. The Spec covers
linked source evidence, architecture, component responsibilities,
interfaces/state/data, operational constraints, test/verification approach,
and PRD-to-Spec traceability. Favor thorough, comprehensive coverage of the
material input over brevity — a short initial goal is not a reason for a
thin PRD/Spec. When the initial goal is short relative to that coverage
list, treat the gap as a prompt to ask the user follow-up questions against
it before drafting, not as license to write a thin PRD from the goal alone.
If the input describes an ordered user flow,
state transition, branching, event handoff, or workflow,
include a valid Mermaid flow/sequence/state diagram wherever it materially
clarifies that flow (normally the PRD user flow and/or the Spec execution
flow), with a syntax self-check. Skip a decorative diagram when no flow
exists.
