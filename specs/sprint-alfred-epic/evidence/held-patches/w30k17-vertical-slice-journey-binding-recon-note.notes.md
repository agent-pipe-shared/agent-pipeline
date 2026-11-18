# w30k17 - recon note: where the journey-criterion binding of a delivered item persists (candidate 30k, lane K17)

Required order: apply the integrated 30j tree (the held patches w30j01 to w30j28 chained on the 30i chain) first, then this patch. The patch is a delta on that tree. Observed: `git apply --check` against the integrated 30j clone returned exit 0; the real checkout was not checked (the briefing expects an exit 1 there before the 30j tree is applied). The check test does not run `git apply` for that reason.

## What it adds

- One new document, `specs/sprint-alfred-epic/plans/vertical-slice-journey-binding-recon-note-2026-11-18.md` (82 lines): stage 0 of `plans/vertical-slice-gate-verdict-2026-11-18.md` section 9, read-only. It states, PROVEN/INFERRED/NOT READ with `path:line`, that
  - the criterion-to-check binding is **stored** in the item-owned slice-queue row (`delivery.criteria`, `criterionLocator`, `checks`);
  - "integrated" is **derived** on every read (native integration record, or commit evidence), never a row state;
  - the per-check pass result is stored per pending state with no readable criterion id; Verify evidence is suite-level, so a "Verify green per check" reading joins only for command-id checks and for check files registered as a suite in this repository, and depends on the Verify mode;
  - what is not persisted (legacy, basic, maintenance and orphan rows, ungoverned projects, other machines).
- Recommendation: proceed with stage 1; the one proposed delta to the verdict's bound-check-only stage is an added "integrated yes/no" reading (decision R1, with the narrow default open to the PO); never write "run" or "Verify green" in the line; five open decisions R1 to R5 with defaults.

## Why

The verdict could only INFER that the link from a named journey to a delivered check is derivable (its section 4, and it asks the question at its line 169). The recon answers it with line references; no premise of the verdict breaks, but its 5.1 item 3 (Verify green per check) is derivable only in the join cases the note lists. The criterion binding AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Checks

- `node --test specs/sprint-alfred-epic/evidence/held-patches/w30k17-vertical-slice-journey-binding-recon-note.check.test.mjs`: red first (patch absent, exit 1), green after the patch was written (2 of 2: the patch exists and is non-empty; it touches only the one note).
- The Critic is suspended by the PO for this repository's candidates and no Full Verify ran: this change is verified by that check alone. No product suite ran.
- The new check file is a plain node:test file and is **not registered** in the Verify suite list.

## Not changed / not proven

- No code, test, template, PRD, Spec, record shape, digest or key byte changed; no stored status, gate or Verify step added.
- Not proven: the step list of a real consumer Verify run; the 30k plan and the queue (briefed context) were not opened; whether the targeted-check record survives retirement of the pending state; whether anything digest-pins the audit index text; Windows behaviour of the queue location. All are named in the note's last section.
- The backlog item of the vertical-slice topic is not edited (the Coordinator's).
