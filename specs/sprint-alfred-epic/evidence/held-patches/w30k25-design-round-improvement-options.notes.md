# w30k25 - analysis: how the one-turn design question round can improve without a second round (candidate 30k, lane K25)

Required order: apply the integrated 30j tree (the held patches w30j01 to w30j28 chained on the 30i chain, plus the 30k wave 1 lanes) first, then this patch. The patch is a delta on that tree. Observed: `git apply --check` against the integrated 30j clone returned exit 0; the real checkout was not checked (an exit 1 there is expected before the 30j tree is applied). The check test does not run `git apply` for that reason.

## What it adds

- One new document, `specs/sprint-alfred-epic/plans/design-round-improvement-options-2026-11-18.md` (109 lines), analysis only, PROVEN/INFERRED labels with `path:line`:
  - (a) the round today: the intake design-question round (`intake-design-questions-apply`, "exactly ONE bundled round", the guidance at `project-onboarding-v3.mjs` line 3306 carries no question list, shape or default) and five cited observations (the open one is E2E-ONB F6 of `po-list-2026-10-08.md` lines 29 to 34: no question list, the agent invents questions; the others are closed backlog items);
  - (b) eight improvements inside one turn (a minimal question set derived from the stored profile, a recommended default and a consequence line per question, ordering, the batching self-check carried over from the bootstrap questions, recording the answers once), each text-only or one derived reader, none adding a stored status, record field or digest;
  - (c) what would need a second round and is not proposed;
  - (d) a smallest first stage (guidance string plus one reference paragraph) with five failing-first cases and the neighbour suites;
  - (e) five open decisions D1 to D5 with defaults.

## Why

The queue and the 30k plan name "design-round improvement inside the existing one-turn question round (no second round)" without a specification. The document fixes the reading (D1: the intake question round, not the design review rounds already capped by C30-6) and states what could be built before any code. The criterion binding AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Checks

- `node --test specs/sprint-alfred-epic/evidence/held-patches/w30k25-design-round-improvement-options.check.test.mjs`: red first (patch absent, exit 1, 2 of 2 failed), green after the patch was written (2 of 2: the patch exists and is non-empty; it touches only the one document).
- The Critic is suspended by the PO for this repository's candidates and no Full Verify ran: this change is verified by that check alone. No product suite ran.
- The new check file is a plain node:test file and is **not registered** in the Verify suite list.

## Not changed / not proven

- No code, test, template, PRD, Spec, record shape, digest or key byte changed; no stored status, gate, signature or approval added.
- Not proven: that the live agent ignores today's guidance as the 2026-10-09 walk reports; that `values.profile` is always set when the round is reached (stage 1 must handle a null profile); that the neighbour suites are green at this tree; whether row E5 of the candidate-19 plan covers more than the e-mail projection found in code. Plugin and test line numbers were re-read in the clone of the integrated tree; plan and backlog files were read in the repository checkout only. All are named in the document's last section.
- The backlog and queue entries of this topic are not edited (the Coordinator's).
