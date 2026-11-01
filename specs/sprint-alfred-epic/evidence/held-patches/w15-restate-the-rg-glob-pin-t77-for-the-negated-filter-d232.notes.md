# Held patch notes — restate the TR-B T77 pin for the negated rg glob filter (candidate 15c, follows D232)

Patch: `w15-restate-the-rg-glob-pin-t77-for-the-negated-filter-d232.patch` (test only; apply AFTER `w11-rg-negated-glob-filters-are-read-only-d232`).

## Why

Rehearsing the 15c script in a clean clone and running `guard-lifecycle-ready.test.mjs` showed ONE red case that the D232 patch causes:
TR-B T77 pinned `rg -g "!*.md"` as refused. D232 admits a bounded negated filter on purpose (PO tile D232), so the pin was stale, not the code.
The earlier D232 evidence ran the g23 and in-repo-read pin suites but not this 12k-line suite; that gap is closed here.

## What

`plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` T77, restated with named intent (QG-04): admitted `-g "!*.md"` and `-g "!*.patch"`;
still refused `**/*.md`, `scratch/*.md`, `!scratch/*.md`, `!.git`, `!../*.md`, `!*` with GUARD-READ-COMMAND-UNSUPPORTED. No code change.

## Evidence

Scratch clone with the D232 patch applied: T77 group 6/6 pass; the rest of the suite was green in the 15c rehearsal clone except this case.
Pending: Full Verify, batch Critic, native runs, PO acceptance.
