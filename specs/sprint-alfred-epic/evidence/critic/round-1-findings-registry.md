# Round-1 findings registry — sprint-alfred-epic design package

Neutral findings registry per `templates/prompts/critic-review.md` (input
contract for fix-verification dispatches): finding IDs with gap, severity,
evidence, and spec-ref only. No verdicts, no trajectory prose, no
dispositions, no implementor justification. All `file:line` references bind
to the reviewed base commits — `74e5a4d4` for the intake package (A-*),
`584acbda` for the PRD/spec/acceptance package (B-*) — not to any later
state.

## Package A (base `74e5a4d4`): design intakes

- **A-F1** · minor · Commit `74e5a4d4` carries `AI-Assisted: true` but no
  `Dispatch:` trailer in either form sanctioned by
  `templates/prompts/agent-obligations.md` §6; the two sibling design-package
  commits show the identical pattern. Whether §6's two forms cover
  design-phase Elephant document authoring is unresolved inside that
  dispatch's reference boundary. Evidence: `git log -3 --format=%B -- specs/`;
  `specs/sprint-alfred-epic/evidence/design-authoring-record.json:5`.
  Spec-ref: `templates/prompts/agent-obligations.md` §6 (GIT-03).
- **A-F2** · minor · `design/issue-intake.md` (#103 disposition) states four
  receipt codes were "measured in this repo on 2026-08-27"; only one maps to
  a same-dated backlog item, "dispatch truncation" maps to a 2026-08-08
  item, and "TP-ceremony cost" / "readiness `partial` deadlock" matched no
  Alfred backlog item by title/phrase search. Evidence:
  `rg -l "sprint: alfred" backlog/items` (24 files);
  `rg -il "TP-ceremony|readiness.{0,25}partial.{0,25}deadlock" backlog/ docs/state.md`
  (single unrelated hit). Spec-ref: `design/backlog-intake.md:4` (own
  re-verification standard); `design/po-input-2026-08-27.md` constraint 2.

## Package B (base `584acbda`): PRD / spec / acceptance

- **B-F1** · major · PRD §10 binds the Critic-per-document duty to "§7.2 of
  spec"; spec §7.2 is D2 and the duty appears nowhere in `spec.md`.
  Evidence: `prd_sprint-alfred-epic.md:346`; `spec.md:410`;
  `design/po-input-2026-08-27.md:21`. Spec-ref: `kickoff-design.md:206-208`
  (PRD-to-Spec traceability).
- **B-F2** · major · PRD §5 lists four entry conditions under "(from #108,
  live-verified)"; #108 states five — the omitted one is "no active Sprint
  branch is expanded or coupled to Alfred". Evidence:
  `evidence/issues-snapshot-2026-08-27.md:1226`;
  `prd_sprint-alfred-epic.md:258-264`; coupling context at `prd:12-17`,
  `prd:304-308`. Spec-ref: #108 Entry conditions (scope authority,
  `spec.md:10` / ADR-0043).
- **B-F3** · major · Spec §4.1 routes the TP-4 `hooks.json` `$comment`
  replacement (Wave 0) through "B2-ii's batbatchable route"; B2-ii (Wave 1)
  designs a route only for TP-3 suite registration under its own new TP
  class. Evidence: `spec.md:93-96`; `spec.md:271-280`;
  `templates/prompts/agent-obligations.md` §2 (TP-3 vs TP-4);
  `prd:241-247`. Spec-ref: `kickoff-design.md:206-207`.
- **B-F4** · minor · Acceptance-criterion ids A1–A15/B1–B4 collide with WP
  ids A1–A5/B1–B3 inside the same rows of `acceptance.md`. Evidence:
  `acceptance.md:15`, `:20` vs `:34`, `:24` vs `:37`. Spec-ref:
  `kickoff-design.md:204`.
- **B-F5** · minor · `acceptance.md` says member-issue lists "apply in
  full"; PRD §7 permits explicitly PO-accepted deviations. Evidence:
  `acceptance.md:5-7`; `prd_sprint-alfred-epic.md:287-289`. Spec-ref:
  `kickoff-design.md:208`.
- **B-F6** · minor · PRD §7 anchors acceptance to "`spec.md` §V", a section
  that does not exist (intended target §12). Evidence: `prd:283-284`;
  `spec.md:226`; `spec.md:555`. Spec-ref: `kickoff-design.md:208`.
- **B-F7** · minor · PRD §5 states it "Follows #108's five stages" while
  moving #99/D1 from stage 1 into Wave 2 with no declared deviation; the
  intake carries exactly two argued deviations, neither about sequencing.
  Evidence: `evidence/issues-snapshot-2026-08-27.md:1249`, `:1287`;
  `prd:239`, `:248`; `spec.md:434-436`; `issue-intake.md:60`, `:135`.
  Spec-ref: #108 Delivery sequence; PRD §7 criterion 2.
- **B-F8** · minor · `pipeline.verify-suite-registration.v1` is written by
  every WP and reshaped by C2, yet absent from the E1 frozen-families table.
  Evidence: `spec.md:51-62`; `spec.md:513`; `spec.md:364-367`;
  `spec.md:557-559`; `acceptance.md:44-46`. Spec-ref: `spec.md:42-48` /
  `prd:207-209`.
- **B-F9** · minor · D1 deliverable `skills/architecture-decision/` is
  unqualified while its siblings are fully rooted; skills live under
  `plugins/pipeline-core/skills/`. Evidence: `spec.md:382-385`. Spec-ref:
  `kickoff-design.md:206`.
- **B-F10** · minor · Commit `584acbda` carries no `Dispatch:` trailer in
  either sanctioned form; `dispatch-authorship-verify` reports such commits
  `UNVERIFIABLE`. Mitigation present:
  `design-authoring-record.json` `commits[].files` matches the touched paths
  exactly; pattern not introduced by this commit. Evidence:
  `git log -8 --format='%h TRAILER=[%(trailers:key=Dispatch,valueonly,separator=;)] %s'`.
  Spec-ref: `templates/prompts/agent-obligations.md` §6.
