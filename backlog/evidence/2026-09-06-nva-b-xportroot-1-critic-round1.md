# Neutral findings registry — `b5a181ce` (NVA-B-XPORTROOT-1, transport ruleset anchor)

Source: T1 Critic round 1 (requested route `claude-opus-5 at max`, effective
identity observed as Opus 5 from the dispatch's own runtime prompt; lane
`functional-equivalent-read-only; OS isolation not asserted`). Verdict:
**PASS** — one minor, no major, no blocker. Trajectory: consistent. Briefing
violations: none contaminating; four disclosures (auto-injected context
unused as evidence; Advisor not invoked per MP-26; CR-06-D persistence
unavailable because the Write tool was disabled and the shell grammar
refuses redirects — the Critic did not route around the guard; one empty
scratch directory created).

- **F1** (minor): the installed-layout fixture in
  `plugins/pipeline-core/scripts/codex-critic-host.test.mjs` copies the
  plugin tree to `<tmp>/marketplace/plugins/pipeline-core`, so the pre-fix
  three-levels-up anchor (`<tmp>/marketplace`) still resolves
  `plugins/pipeline-core/scripts/critic-verdict.schema.json` inside the
  fixture; the absence list checks the schema only at `<tmp>`, and the
  fixture's comment claims the old anchor resolves none of the three
  references. The negative control therefore discriminates two of the three
  references, and requirement R4's own sub-clause ("no
  `plugins/pipeline-core/scripts/critic-verdict.schema.json` at
  `<tmp>/marketplace`") is unsatisfiable under the layout R4 prescribes.
  Evidence: test file lines 1796–1808; red capture line 121 (the red is
  driven by `roles/critic.md`, not by the schema).

## Disposition

**F1 — accepted; half of it is dispatcher-side.** The unsatisfiable
sub-clause was written by the dispatcher into R4 (and the goldfish disclosed
the same false cell in its report). The remedy is a spec correction plus a
fixture correction: R4 is amended to prescribe a layout with no
`plugins/pipeline-core` segment above the plugin root — the runner cache
shape `<tmp>/cache/<marketplace>/<plugin>/` that
`docs/claude-local-plugin-development.md` documents for a git-sourced
install — so the old anchor resolves none of the three references and the
absence assertions, the schema one included, are all true; the fixture
comment then states exactly that. Dispatched as `NVA-B-XPORTROOT-2`, which
**stopped on a briefing defect** (record
`evidence/dispatch-record-NVA-B-XPORTROOT-2.json`, outcome
`stopped-briefing-defect`; its probe `evidence/NVA-B-XPORTROOT-2-anchor-probe.json`):
the first R4 amendment prescribed a three-segment layout and named an anchor
one level deeper than `resolve(HERE, "..", "..", "..")` actually yields —
the same shape of error (a claim the assertions would not prove) that F1
reported, made a second time by the dispatcher. R4 is re-amended with the
four-segment cache shape and an anchor computed by `path.resolve` before it
was written; re-dispatched as `NVA-B-XPORTROOT-3`; round 2 follows on that
correction commit.

**Dispatcher-side rule, inherited from this (the third of the day's kind):**
a path or formula prescribed in a briefing is computed first — one `node`
probe with the real `resolve` call — never written from a mental count of
segments. Two consecutive briefings on the same fixture carried an
uncomputed path claim, and both were caught downstream (once by the Critic,
once by the dispatch's own probe) at the cost of a Critic round and a
stopped dispatch.
