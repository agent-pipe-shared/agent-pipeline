# Kickoff intake, the durable design package, and document quality

Load this when a project is pristine, when a first `kickoff plan` is about to
run, when material design input has arrived, or when a design package is being
created or promoted. The core keeps the check that puts you here; everything
below is what to do once you are in one of those states. It was moved out of
the core verbatim (BOOTMOD-1): the core is read at the start of every session
and pays for every byte, including the sessions that never reach a kickoff.

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
Never edit the active provisional
`specs/kickoff-*` PRD/Spec, or any already bound PRD/Spec, merely to add richer
design documentation. Do not invoke a repair, generic continuity CAS, manifest
repair, or hash-rebinding cascade solely because a new design package was
created. After promotion, a material change to a bound PRD/Spec follows the
ordinary reviewed planning/rebind path; it is not a document cleanup.

`prd_short-topic.md` must carry `<!-- po-language: (de|en) -->` and
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
and PRD-to-Spec traceability. If the input describes an ordered user flow,
state transition, branching, event handoff, or workflow,
include a valid Mermaid flow/sequence/state diagram wherever it materially
clarifies that flow (normally the PRD user flow and/or the Spec execution
flow), with a syntax self-check. Skip a decorative diagram when no flow
exists.
