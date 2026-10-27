# D173 — PF-80: the Critic finalizer CLI names the cause of an internal refusal (held patch)

Patch: `d173-pf80-finalizer-cli-error-detail.patch` (against `dcc14d77e`; the only later commit, `82aa20af0`, adds a notes file, so it applies unchanged). Backlog item: `backlog/items/2026-10-27-critic-finalizer-cli-reports-scf-internal-without-the-cause.md`.

## Provenance (honest account)

Authored in a scratch clone by dispatch `W6-D173-PF80-SCFDETAIL-C1/C2-20261027` (goldfish-implementor, background). C1 stopped at its tool budget; C2 died with the machine crash of 2026-10-27 before it wrote a patch or notes. The production edits and the six D173 cases were already in the clone; the Elephant re-ran the suites, loosened one fragile assertion (below), generated the patch and wrote these notes.

## Cause

`runSessionCriticFinalizerCli` (`scripts/session-critic-finalizer.mjs`) passed a code through only for `SessionCriticFinalizerError` and `GenericCriticBatchError`; every other thrown value became `{schema, status:"rejected", code:"SCF-INTERNAL"}` with nothing else. `createLocalDispatchEvidenceBinding` (`scripts/check-critic-skip-coverage.mjs`) threw plain Errors without a code.

## Changes

- `session-critic-finalizer.mjs`: exported pure `describeCliError(error)`; the CLI catch adds an optional `detail` (key order schema, status, code, detail; omitted when none). Detail = inner `code` (when it matches `/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/`) + ": " + first message line, whitespace collapsed, absolute paths (a leading slash or a drive-letter prefix) replaced by `<path>`, capped at 200 characters; no stack, cause chain or environment. Untyped without message: `untyped error: <constructor name>`. Hostile getters yield no detail source.
- `check-critic-skip-coverage.mjs`: a `code` property on each plain Error of `createLocalDispatchEvidenceBinding` — LDE-INPUT, LDE-SOURCE-UNREADABLE, LDE-SOURCE-RECORD-MISSING, LDE-SCHEMA, LDE-RECORD-INVALID, LDE-CRITIC-NOT-REQUIRED, LDE-CANDIDATE-BINDING. Class, message, conditions and order unchanged.
- Tests: five D173 cases in `session-critic-finalizer.test.mjs`, one in `check-critic-skip-coverage.test.mjs`.

## Closed-schema handling

No closed validator of the error output exists; the literal `pipeline.session-critic-finalization-error.v1` appears only in the finalizer and in `skills/critic-review/SKILL.md` (documentation). The schema string and the no-detail output are byte-identical to before. The finalizer test has no case-count pin.

## Evidence (clone, patched)

- `session-critic-finalizer.test.mjs`: 29 tests, 28 pass, 1 fail. Baseline at `dcc14d77e` fails the same single case, "a root-authored candidate keeps its empty-tree base but cannot register a generic batch review unit" (pre-existing, unrelated). Failing-name sets identical.
- `check-critic-skip-coverage.test.mjs`: 36/36 pass. `lib/guard-maintenance-window-kernel-closure.test.mjs`: exit 0.
- RED before the edit (C1 run): the D173 cases failed against unchanged production; those logs were lost in the crash, so the RED ids are not re-evidenced here.
- One assertion changed after GREEN, with justification: case 1 expected the filesystem message to say `realpath`; Node here reports `lstat`. The criterion is a path-free detail, not which syscall fails, so the pattern is now `[a-z]+ '<path>'`.
- `git apply --check` of the final patch against a pristine clone: exit 0.

## Visible consequence

Every `SessionCriticFinalizerError` CLI rejection whose message differs from its code now carries a constant `detail` (for example SCF-USAGE gets `SCF-USAGE: Session Critic finalization is invalid.`). Outputs whose message equals the code are unchanged.

## Not fixed / not proven

- The `SCF-LOCAL-DISPATCH-EVIDENCE` swallow near line 488 is unchanged: `SessionCriticFinalizerError` has no optional fields, so the inner LDE code cannot ride on it without a class change.
- The `CGB-PHYSICAL` rewrap in `lib/critic-generic-batch.mjs` is not fixed (later slice).
- Which exact throw produced the consumer's SCF-INTERNAL is still unproven.

## Operator flow

apply-diff of the patch, path-limited `git add -u` over the four files, `git commit --no-verify -F <message>` with subject `fix(critic): name the cause of an internal finalizer refusal and code the local dispatch evidence errors (D173 PF-80)`, then stamp and install. These are custody paths: an independent Critic review stays a parent-owned batch gate; Full Verify, Critic, native runs and PO acceptance are pending.
