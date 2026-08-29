---
schema: pipeline.backlog-item.v1
id: pipeline.an-unparseable-done-when-is-counted-as-undeclared-not-malformed
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/scripts/check-backlog-done-predicate.mjs pipeline.unparseable-declaration-is-malformed
source: "Dispatch NVA-BLDECL-4, 2026-08-29: two of fifteen first-draft predicates contained a comma or brace, were silently dropped by the frontmatter parser, and were reported as UNDECLARED rather than MALFORMED. Confirmed against the source by the dispatcher."
---

# A present-but-unparseable done_when is counted as undeclared, and undeclared is not fatal

## What happened

While declaring predicates across the candidate backlog, two first drafts were
written with a comma or a brace in the value — the natural way to write a
marker that happens to contain one. The checker reported those items as
**UNDECLARED**: no declaration at all.

The line was right there in the file. A human reading the item sees a
`done_when:`; the checker sees nothing. UNDECLARED is reported but not fatal,
so nothing surfaced, and the item silently stopped being measured.

## Where it is

`plugins/pipeline-core/lib/backlog-state.mjs`:

- `parseScalar()` at line 224 rejects any unquoted value matching
  `/['\[\]{},]/u` with `{ ok: false, error: "frontmatter values must be plain
  text or JSON strings" }`.
- `parseBacklogItem()` at line 241 collects that into its `errors` array and
  **skips the key** — so `metadata.done_when` is never set.

`plugins/pipeline-core/scripts/check-backlog-done-predicate.mjs`:

- Line 231 calls `parseBacklogItem`, and the file's own header comment at line
  16 states the pattern in its own words: the
  "ignore-`ok`/`errors`-and-read-the-metadata-fields" reader.
- With `done_when` absent from `metadata`, `doneWhenRaw` is `undefined`, and
  the item falls into the UNDECLARED branch instead of the MALFORMED one at
  line 249.

The parser is not at fault and should not be changed: rejecting an ambiguous
unquoted scalar is correct for a deliberately small one-level dialect, and a
JSON-quoted value is accepted and works. The defect is that the checker
discards the parser's own verdict and then cannot tell "no declaration" from
"a declaration I could not read".

## Why this is worth fixing rather than working around

This is the same defect shape the checker exists to catch, in the checker
itself: a declaration nothing mechanically verifies. Its whole purpose is to
stop an item from claiming a state nobody checks — and a predicate that was
written, is visible in the file, and is silently not evaluated is exactly that
failure, one level up.

It also lands where it costs most. The 0.6.0 candidate assessment rests on
these predicates to distinguish genuinely open work from work that was fixed
and never closed. An item that looks declared and is not measured is worse
than an openly undeclared one, because the undeclared list is at least
reviewed.

The blast radius is bounded but not zero: it only bites a value containing
`'`, `[`, `]`, `{`, `}` or `,`. A `contains` predicate whose needle is a
sentence — the natural form for prose markers — hits it readily.

## Proposal

Have the checker read the parser's verdict instead of only its output.

- When `parseBacklogItem` reports an error for the `done_when` key
  specifically, classify the item **MALFORMED**, with the parser's own error
  text in the finding, so the author is told the value needs JSON quoting
  rather than being told nothing.
- Leave every other frontmatter parse error alone. This checker is not the
  place to enforce the whole item schema, and widening it would make it fail
  on unrelated pre-existing items.
- Keep the UNDECLARED class meaning exactly what it says: no `done_when:` line
  present at all.
- Place a marker `pipeline.unparseable-declaration-is-malformed` at the check.

## Acceptance

- An item whose `done_when` value contains a bare comma or brace is reported
  MALFORMED, not UNDECLARED, and the finding names JSON quoting as the remedy.
- An item with no `done_when:` line at all is still reported UNDECLARED.
- An item with a correctly JSON-quoted value containing a comma is evaluated
  normally and is neither MALFORMED nor UNDECLARED.
- All three cases are covered by fixture tests in
  `check-backlog-done-predicate.test.mjs` that do not depend on the real
  repository's current contents.
- The real repository still passes with `malformed: 0` — or, if this fix
  reveals genuinely broken declarations already in the tree, each is repaired
  in the same change and named in the commit message.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** small, self-contained, and it repairs the measurement
  instrument the rest of the candidate assessment depends on. Found by a
  dispatch hitting it live, not by inspection.
- **Assignment:** `sprint: nova`. Candidate scope: the predicate sweep running
  now is what makes this defect reachable at scale.
- **Date:** 2026-08-29
