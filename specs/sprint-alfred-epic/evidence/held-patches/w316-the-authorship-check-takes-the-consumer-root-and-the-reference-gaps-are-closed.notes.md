# w316: the authorship check takes the consumer root and the reference gaps are closed

Slice C31-M6 (candidate 31, lanes L20 point 4 and L10b). Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

Apply order: this patch is a delta on the base clone of candidate 31 (`35560870d..HEAD` of the clone chain). It applies only after that base patch is applied; it does not apply to the current checkout alone.

## What

- `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs`: new `--root <project>` option. Without it the project is the git top level of the working directory, never the plugin install path. `--range` now runs `git rev-list` in that project. The plugin root is still used only for the plugin's own files. A missing `--root` value or a working directory outside a git repository ends with exit 3 and a message naming `--root <project>`.
- `dispatch-authorship-verify.test.mjs`: failing-first case (a fixture repository outside the plugin tree, checked with `--root`, with the working-directory default and with the missing-value refusal) plus four documentation-contract cases. All five were RED before the production and text edits.
- `skills/critic-review/SKILL.md`: a verdict JSON example (every required key, `severity` per finding) and one paragraph naming the existing producing command `dispatch-record-strip-for-critic.mjs --record ... --out ...` for the prose-free projection and the `--root` form of the authorship check. A producing command exists, so nothing was invented.
- `references/antigravity-native-dispatch.md`: `Model` in the prepare request example; the package field names as a copy-paste block (`paths`, `context`, `targeted`, not `ownedPaths`, from `dispatch-briefing.mjs --help`).
- `references/design-course.md`: a numbered-style "Before `create`" step: `export-report`, then `create`, then commit.
- `references/onboarding-recovery.md`: after `onboarding-init` the next shell call is blocked until the `pipeline-start` skill is read; expected, repeat the call.

## Why

A consumer project could not run the authorship check (`not a git repository`), and four reference gaps cost loops in the consumer greenfield runs.

## Not changed

- No behaviour change beyond `--root`; text only for L10b. No stored status, record shape, digest, gate, signature, approval, Critic evidence semantics, security scan or audit bundle. The exported `DEFAULT_EVIDENCE_DIR` and `gitDeps` defaults are untouched.
- `happy-path.md` is on the write list but was not edited.

## Not proven

- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: tests only (`dispatch-authorship-verify.test.mjs`, 79 tests, 0 failures).
- Ambiguity: the briefing says "finalize must run before `design-review-receipt create`", but no design-side finalize command exists in the plugin (`finalize` exists only for the Critic session and Antigravity host observation). The closest real prerequisite, `export-report`, was documented instead. The Coordinator should confirm or restate which command the run-B refusal row meant.
- The `Model` example uses `inherit` (read-only roles inherit); the host behaviour was not re-measured.
