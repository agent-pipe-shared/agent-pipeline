# W7-REPORT-05 (part 1) -- notes (state: HELD, built by the Elephant in a scratch clone under the D192 exception)

Candidate `12f83a44e` (the patch also applies on later docs-only commits). Patch: `w7-report-05-find-or-root-and-collision-teaching.patch` (6 paths, `git apply --check` exit 0 on a plain clone of the candidate).

## What it delivers

- **PF-60, `find`:** `plugins/pipeline-core/lib/guard/shell-grammar.mjs` admits `-o`, `-or`, `-a` and `-and` between the closed `find` predicates (`-name`, `-iname`, `-type`, `-maxdepth`, `-mindepth`, `-print`). An operator must sit between two predicates; a leading, trailing or doubled operator is refused. `-delete`, `-exec`, `-ok`, `-fprint`, roots outside the project and redirects stay refused, also behind an operator. A route-group path such as `src/(app)/x` is admitted when quoted or backslash-escaped (already true before this patch, now pinned); an unquoted parenthesis stays refused because the shell itself would fail. New file `lib/guard/find-or-operator-read.test.mjs` (FOR01, FOR02).
- **PF-66, `--root`:** every `slice-queue.mjs` verb takes `--root <dir>` (the repository the queue and its governed course live in); a relative `--queue` is resolved against it; a missing directory or a repeated flag is `SQ-USAGE`. Without the flag the current directory is the root as before. The session-owner entry of the direct invocation follows the same root. Case SC20 in `scripts/slice-queue.test.mjs` (corpus 19 to 20).
- **PF-66, collision teaching:** `item-delivery-criterion-owner-collision` now carries a repair that says a criterion has one owner at a time, also for slices with disjoint write scopes, and names the two ways out (serialise with a dependency, or give each slice its own criterion), followed by the existing holder/cancel repair. The collision itself is unchanged and deliberate. Pinned in `native-goldfish-host-state.test.mjs`.

## Checks (scratch clone, committed candidate)

- `find-or-operator-read.test.mjs`: RED before the grammar edit (both cases failed), GREEN after.
- Green after the change: `read-option-operands`, `diagnostic-toil-cross-runner`, `read-command-diagnosis`, `pins/read-only-guard-admits-execution-and-output-options`, `pins/shell-grammar-file-is-a-kernel-path-without-capability-placement`, `scripts/slice-queue.test.mjs` (20 cases), `lib/native-goldfish-host-state.test.mjs`.

## NOT in this patch / not verified

- **PF-70** (which record the Critic batch precheck needs after a background launch) is not built; it needs a reading of the batch precheck first. The backlog item `2026-10-29-the-elephant-can-attest-its-own-document-work-for-critic-admission` overlaps with it.
- **PF-65** estimate calibration is not touched.
- Full Verify, other consumers of `slice-queue.mjs` (`dispatch-briefing`, `push-prepare`, `checkpoint-commit` suites) were not rerun; batch Critic and PO acceptance remain pending. The files are kernel paths: the PO applies the patch under a Guard Maintenance Window.
