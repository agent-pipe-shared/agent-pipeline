---
schema: pipeline.backlog-item.v1
id: pipeline.capture-evidence-refuses-fixture-literal-as-host-path
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
done_when: manual
tracking: "Nova B -- capture-evidence.mjs's windows-drive-letter leak heuristic (scripts/capture-evidence.mjs:120) matches a synthetic fixture literal such as C:\\Users\\Foo\\repo inside a test's own description and body, and on any match refuses to write the capture (:197). The tool has no allowlist. Consequence measured 2026-09-06: guard-maintenance-window-tests clears every serial-lane safety signal and passes solo 62/62, but its self-race evidence cannot be captured because GMW45's description contains that literal -- so the suite stays in the lane on a tooling refusal, not a safety finding, at 16.3s of lane time."
source: "NVA-B-LANEEVICT-2 dispatch, 2026-09-06: both concurrent capture-evidence.mjs invocations of guard-maintenance-window.test.mjs refused before writing; a direct node --test run of the same suite is green. Trigger confirmed by the orchestrator at plugins/pipeline-core/lib/guard-maintenance-window.test.mjs:1668,1679,1682."
---

# The evidence-capture tool refuses a fixture literal as if it were a host path

## The gap

`plugins/pipeline-core/scripts/capture-evidence.mjs` exists to keep
machine-specific absolute paths out of evidence artifacts, and it does that
job by refusing to write any capture whose redacted body still contains a
host-path shape. One of its shapes is the Windows drive letter:

```js
{ name: "windows-drive-letter", regex: /(?<![A-Za-z0-9_%])[A-Za-z]:[\\/][^\s"'<>]*/gu }   // :120
```

That regex cannot tell a real host path from a **synthetic literal a test
uses on purpose**. `guard-maintenance-window.test.mjs` GMW45 hashes the
`/mnt/c/...` and `C:\...` spellings of one repository to the same
fingerprint — the `C:\Users\Foo\repo` string is the test's subject, printed
in its description (`:1679`) and constructed in its body (`:1668`, `:1682`).
Node's test reporter echoes the description into stdout; the capture tool
sees the drive letter; it refuses (`:197`). There is no allowlist, no
per-invocation override, and no way to say "this string is a fixture".

## Why it matters beyond one suite

The refusal is not a false negative on the leak it guards against — it is a
false positive that **blocks evidence for a suite that has nothing to hide.**
On 2026-09-06 that had a measurable cost: `guard-maintenance-window-tests`
clears all three serial-lane signals and passes solo 62/62, but the
eviction package's DoD required capture-tool-produced self-race evidence,
and the tool would not produce it. The dispatch correctly declined to evict
without evidence or to fabricate it, so 16.3s of lane time stays on the
critical path for a tooling reason.

More generally: any test that legitimately exercises Windows path handling
— and this repository has a tri-platform contract (ADR-0051) — will trip the
same shape whenever its description or assertion output mentions a drive
letter. The set of affected suites is not known; it was found by accident.

## Not yet decided

- A narrow allowlist of *fixture-shaped* literals (e.g. the exact
  `C:\Users\Foo\repo` strings tests already use), matched before the
  heuristic runs. Cheapest; grows by hand.
- Distinguishing test-reporter *description* lines from *output* lines and
  applying the heuristic only to the latter. More precise; depends on
  reporter format.
- Treating a refusal as "unverified" rather than "refused" in callers that
  can tolerate it, so an eviction DoD can accept a solo `node --test` exit
  code when the capture tool declines. Weakens the evidence rule and should
  not be the first choice.

Whichever direction, the refusal message should name the matched substring's
*source line* so the next reader can tell fixture from leak without a
second dispatch.
