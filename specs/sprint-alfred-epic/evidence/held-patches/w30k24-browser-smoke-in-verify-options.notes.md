# w30k24 - analysis: what a browser smoke step in Verify would be, where it sits, the smallest first stage (candidate 30k, lane K24)

Required order: apply the integrated 30j tree (the held patches w30j01 to w30j28 chained on the 30i chain, plus the 30k wave 1 lanes K10 to K18) first, then this patch. The patch is a delta on that tree. Observed: `git apply --check` against the integrated 30j clone returned exit 0; the real checkout was not checked (an exit 1 is expected there before the 30j tree is applied). The check test does not run `git apply` for that reason.

## What it adds

- One new document, `specs/sprint-alfred-epic/plans/browser-smoke-in-verify-options-2026-11-18.md` (114 lines), analysis only, PROVEN/INFERRED with `path:line`. It states that:
  - the capability half already exists (`browser-evidence-preflight.mjs`, typed outcomes, no install) but no Verify path calls it, and its refusal text names no human step;
  - a consumer Verify is a list of suites in which a `verifyImpact` entry becomes the step `project-<id>`; evidence steps carry only a name and an exit code, so "unavailable" cannot be a distinct step value without a record-shape change;
  - recommendation (a): applicability is derived from a declared reserved id `browser-smoke`, absence means not applicable (never red); (b) placement is that existing declaration, B2 (new result kind) and B4 (new calibration field) are listed as PO decisions with default no, a derived report-only readback row is stage 2; (c) an unavailable browser is a non-zero step before any test ran, with a typed code and a human startup instruction, never a pass; (d) stage 1 is one new dispatcher script plus a two-line producer routing edit, with six failing-first cases (each tagged producer level or dispatcher unit level) and eight neighbour suites; (e) eight open decisions with defaults. It also states the cost to the acceptance path (a red Verify stops before the acceptance question) and that stage 1 is Playwright-and-Chromium only.
- It also notes two drift points it did not repair (a wrong path in the preflight closure evidence; front matter versus body of the greenfield browser item).

## Why

The PO tile of 2026-11-18 put "browser smoke in Verify" into 30k, but neither the queue nor the backlog specifies it; the analysis-first lane makes the first stage releasable (or not) without a gate, a stored field or a record-shape change. The criterion binding AC-112 is the closest existing accepted criterion (it concerns an unrelated item); the PRD and the Spec are unchanged and no new criterion is claimed.

## Checks

- `node --test specs/sprint-alfred-epic/evidence/held-patches/w30k24-browser-smoke-in-verify-options.check.test.mjs`: red first (patch absent, exit 1, 0 of 2), green after the patch was written (exit 0, 2 of 2: the patch exists and is non-empty; it touches only the one document).
- The Critic is suspended by the PO for this repository's candidates and no Full Verify ran: this change is verified by that check alone. No product suite ran.
- The new check file is a plain node:test file and is **not registered** in the Verify suite list.

## Not changed / not proven

- No code, test, template, PRD, Spec, record shape, digest or key byte changed; no stored status, gate or Verify step added. The queue has no DO-NOT-DO section; the list of the state-machine analysis (lines 290 to 303) was applied and is restated in section 7 of the document.
- Not proven: the close readback row builder; whether the file list at `guard-maintenance-window.mjs` lines 684 to 701 must name a new script; the case ids of `verify-evidence-producer.test.mjs`; a real Playwright launch on a consumer fixture; install-command wording per package manager. All are named in the document's last section.
- The backlog items and the 30k plan are not edited (the Coordinator's).
