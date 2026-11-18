# w311 - recon note: why docs/adr stays empty in a consumer run and where an ADR draft can be derived (candidate 31, lane L4, slice C31-R1)

Required order: apply the base clone of candidate 31 (the already delivered held patch on the integrated 30k tree) first, then this patch. The patch is a delta on that tree. Observed: `git apply --check` against the base clone returned exit 0; against the real checkout an exit 1 is expected before the base is applied. The check test does not run `git apply` for that reason.

## What it adds

- One new document, `specs/sprint-alfred-epic/plans/recon-l4-adr-draft-2026-11-18.md` (60 lines): read-only, PROVEN/INFERRED labels with `path:line`. It states
  - how an ADR is created today (`create-adr` -> `bind-adr-proposals` -> `materialize-architecture`) and that nothing in the happy path triggers it (every step is optional prose, "Neither blocks");
  - five soft spots that leave `docs/adr` empty: the design skeleton ships `adrReferences: []`, the `record-decisions` step needs that same list as its input, the readiness reviewer only asks a question, the close row reads `not-applicable` for a quiet impact value, and the seeded `docs/adr/README.txt` describes a hand-written route that contradicts `create-adr`;
  - the one marker the design has (`adrReferences`, paths only, no title or trigger field) and that a derived list is possible for declared decisions only (no stored field needed), not for undeclared ones;
  - a four-stage smallest build with a failing-first case each, the neighbour suites, and six open decisions D1 to D6 with defaults. A key finding for the order: a draft created after the design approval cannot be bound and would block the next feature's `submit-plan` (`ADR-DRAFT-UNBOUND`), so generation belongs before design promotion and the close only shows.
- Recommendation: stage 1 (derive and show at close, runnable remedy, slug match) plus the README/reference text now; stages 2 and 3 only after the PO answers D2 and D3.

## Why

Both consumer runs ended without a bound ADR although the seeded README demands one. The lane premise ("the design marks decisions as expensive") holds only for the `adrReferences` list; the recon says exactly where it holds and where it does not. The criterion binding AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Checks

- `node --test specs/sprint-alfred-epic/evidence/held-patches/w311-recon-adr-draft-at-design-close.check.test.mjs`: 2 of 2 (the patch exists and is non-empty; it touches only the one note).
- Test-first does not apply to a note without production code. The Critic is suspended by the PO for this repository's candidates and no Full Verify ran: this change is verified by that check alone. No product suite ran.
- The new check file is a plain node:test file and is **not registered** in the Verify suite list.

## Not changed / not proven

- No code, test, template, PRD, Spec, record shape, digest or key byte changed; no stored status, gate or signature added.
- Not proven: how the two consumer runs actually read (only the plan summary and the code were available); `materialize-architecture` and the guard command catalogue were not read; no neighbour suite was run; whether anything pins the README seed bytes beyond `lib/architecture-map-scaffold.test.mjs` is open.
