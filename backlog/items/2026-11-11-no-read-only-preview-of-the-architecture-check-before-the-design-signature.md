---
schema: pipeline.backlog-item.v1
id: pipeline.no-read-only-preview-of-the-architecture-check-before-the-design-signature
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-11
source: "Windows greenfield run on candidate 27, monitoring note 2026-11-11 (transcript read only, no run report yet)"
sprint: none
done_when: manual
---

# No read-only preview of the architecture check before the design signature

## Description

The architecture dependency permission a feature may use is read from the architecture map,
and the map exists only after the PO has signed the design. A session that wants to know
whether a design change is enough therefore cannot ask the Pipeline: in the observed run the
agent rebuilt the guard's rule by hand ("according to my rebuild of the guard") to predict
whether a signature would suffice. Each wrong prediction costs a full signature round (the run
needed four design signatures, three of them for real design changes and the rest for rejected
rules).

## Acceptance

- A read-only command evaluates the tracked tree against the PROPOSED architecture design of
  the PRD (the modules, `ownedPaths` and `allowedDependencies` in the unsigned package) with
  the same rules as `architecture-boundary-check.mjs`, and prints each violation with the file,
  the module and the rule. It writes nothing and needs no signature.
- The design-approval stop and the preflight of `present-plan` name that command.

## Status (2026-11-11): built in candidate 28b, not accepted

`architecture-boundary-check.mjs --root <root> --preview-prd <repo-relative PRD path>` (read-only) checks the tracked tree against the modules of the PRD's proposed design block with the
same observation as the real check (ownership, forbidden dependency, line bound), writes nothing and needs no signature (`previewArchitectureBoundaries`; tests ABC14 and ABC15 with injected
modules, ABC16 through a real PRD design block and the real design parser; not run against a live project yet). The happy-path reference names it before
the design signature. Not built: a mention inside the `present-plan` output itself. Accepted only after a real run on a project with code and a design change.

## Checked against the code (2026-11-11)

The same run reported that the planning-time architecture check takes every path that appears
anywhere in the PRD text and that its refusal does not name the violated rule. Read in
`lib/architecture-entry-readiness.mjs`: the first half is true by design
(`deriveArchitecturePlanningSurface` takes every path-like token of the plan, and the repair
guidance of `ARCHITECTURE-FITNESS-REPAIR` says so). The second half is already covered: the
refusal text names the fitness class, its outcome and the first violation as JSON with
`ruleId`, `module` and `target`. What remains is the preview above; a path that only appears
in prose (for example in a sentence about what is NOT done) still counts as planned surface,
which the preview would make visible before a signature is spent.
