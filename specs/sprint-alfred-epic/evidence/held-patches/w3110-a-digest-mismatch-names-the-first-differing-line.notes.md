# w3110 — a digest mismatch of a generated briefing names the first differing line and column (candidate 31, C31-M10, lane L13)

Chained patch: it is the delta on the base clone of candidate 31 (the clone state after the delivered base patch of candidate 31), so it does NOT apply to the real checkout until that base is applied first. Required order: base clone of candidate 31, then this patch. The check test therefore asserts only that the patch is non-empty and touches only the write list; it never runs `git apply` against the repository.

Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. PO tile (2026-11-18): on a digest mismatch the guard names the first differing line and column and orders that exact line to be copied from the generated file; no pointer route, no loosening.

## Recon (what the guard knows at that point)

- The refusal is raised by `verifyGeneratedBriefing` (`lib/dispatch-briefing-build.mjs`), reached through `generatedBriefingAdmission` from `hooks/guard-dispatch.mjs` (the only caller). `lib/briefing-file-reference.mjs` is the pointer route (Claude only, file already on disk) and is not on this path.
- The prompt carries the generator marker line with the digest of the body. The generator (`dispatch-briefing.mjs build --out scratch/<name>.md`) records no path anywhere; it writes the file, and every such file ends in its own marker line.
- So the expected text IS reconstructible without a stored field: scan `scratch/**/*.md` for a file whose marker line equals the prompt's marker line and which itself verifies. No registry, no new field, no record shape change.
- Not reconstructible when the prompt's marker line was retyped wrongly or the file is gone: the refusal then keeps today's text and adds the rerun sentence.

## What it changes

- `findGeneratedBriefingFile(root, digest)` (exported, read-only, bounded): at most 400 `.md` files, at most 3 folder levels under `scratch/`, files up to 256 KiB, never `agent-out`, `clones`, `node_modules`, `.git`, no links, only plain relative path characters (so the quoted path is safe to print).
- `generatedBriefingAdmission(prompt, command, { requireGenerated, root })`: new optional `root`. With a root and a digest mismatch the message reads `... first difference at line N, column M: expected "<60 characters around it>" but the prompt has "<same span>"; copy the briefing from <repo-relative file> verbatim instead of retyping it; repair: ...` (spans are JSON-quoted, so a newline shows as `\n`; each span is at most 60 characters, below the 80 cap). Line numbers are those of the file; the marker line is counted. A trimmed final newline alone is still tolerated; trimmed plus an edit names the edit; an added newline names the end of the file.
- No file found (or no root): the old text, plus (with a root) one sentence: `no generated briefing file under scratch/ carries this marker; rerun \`<generator> build --package <package.json> --out scratch/briefing-<dispatch-id>.md\` and copy that file verbatim instead of retyping it`.
- `hooks/guard-dispatch.mjs`: passes the project root at the one call site.
- Unchanged: the refusal code `DBG-GENERATED-DIGEST-MISMATCH`, every admission decision, the digest and marker bytes, `DBG-REF-CARRIER` and the pointer rules, every record shape. Nothing is stored; the file is found by scanning on each refusal.

## Tests (written first, red against the original code)

- `scripts/dispatch-briefing.test.mjs`, four new cases (`C31-M10`): a one-character edit, a changed line, a trimmed last content line, a trimmed final newline alone (admitted) and with an edit, an added newline, no file found (old text kept plus the rerun sentence, a decoy file with another digest ignored), a matching prompt admitted, a nested file and a 300-character differing line (span capped). Expected line and column are computed by hand from the file text, never by the production function.
- `hooks/guard-dispatch.test.mjs`: GD80b (edited prompt refused with line, column and the file to copy; the unedited prompt admitted) and GD80c (no file: old refusal plus the rerun sentence). The corpus count pin was restated in place (QG-04), 93 to 95, because two cases were added.

## Not changed / not proven

- No pointer route for Antigravity, no loosening of any admission: a mismatch is still a refusal.
- `lib/briefing-file-reference.mjs` is untouched (its file-versus-marker refusal concerns a file edited on disk, not a retyped prompt).
- The scan skips `scratch/agent-out` and `scratch/clones` on purpose (clone trees hold thousands of files); a briefing written there gets the old text plus the rerun sentence.
- Only the Goldfish `generatedBriefingAdmission` path is covered; the route-record refusal `DISPATCH-BRIEFING-DIGEST-MISMATCH` (a different check) is unchanged.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: verified by tests only (targeted suites, see the hand-back).
