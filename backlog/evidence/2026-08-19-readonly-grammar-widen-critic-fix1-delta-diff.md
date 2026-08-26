# Delta diff — PHX-WP-READONLY-GRAMMAR-WIDEN-CRITIC-FIX1

Isolated diff for the two touched files only, base commit `b3153385`
(the commit Critic round 1 reviewed) to current HEAD (`73d2e1c2`), computed via:

```
git diff b3153385 HEAD -- plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
```

Archived because the actual commit carrying this diff (`329ac49c`) also
carries unrelated backlog-closure changes (a documented commit-attribution
defect — see `docs/state.md` checkpoint 66) — this snapshot isolates
exactly the F1/F2/F3 rework content for review.

```diff
diff --git a/plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs b/plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs
index 3735c685..2bd95061 100644
--- a/plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs
+++ b/plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs
@@ -515,9 +515,13 @@ const MAX_AND_CHAIN_SEGMENTS = 6;
  * split entirely (returns null): admitting an `&&`-chain must never become a side door
  * for a DIFFERENT, still-unapproved operator riding along inside it -- in particular, a
  * chain ending in a pipe (e.g. `git log | head`) is deliberately NOT admitted by this
- * function; that shape is a separate, unbriefed concern. Each returned part is
- * re-validated independently through parseGuardCommand by the caller -- this function
- * only locates boundaries, it grants no authority on its own.
+ * function. This is NOT an unbriefed shape: backlog/items/2026-08-19-closed-shell-
+ * grammar-still-rejects-common-readonly-composition.md Proposal point 1 explicitly names
+ * "the existing grep-to-grep/grep-to-head pipeline shape as a trailing stage" as accepted
+ * scope, and the PO accepted it -- it is simply NOT YET implemented here, deliberately
+ * deferred to a dedicated follow-up tracked separately from this dispatch. Each returned
+ * part is re-validated independently through parseGuardCommand by the caller -- this
+ * function only locates boundaries, it grants no authority on its own.
  */
 function splitTopLevelAndChain(command) {
   if (typeof command !== "string" || command.trim() === "" || /[\0`]/u.test(command)) return null;
@@ -599,18 +603,49 @@ function isChainEligibleGitLogArgs(argv) {
   return true;
 }
 
+// The backlog item's exact "restricted to paths already permitted for agent writes --
+// scratch/, scratchpad, `.claude/worktrees/**`" scope, minus `scratchpad`: `scratchpad`
+// names an OS-external path (this session's own scratchpad directory, outside the repo),
+// never reachable from this in-repo-only classifier -- a path outside `root` can never
+// pass the `isProjectWritePath` containment check below, so admitting it here would be a
+// silent no-op at best. Deliberately NOT the general `isProjectWritePath` predicate (that
+// admits ANY in-repo path, which is exactly the bug this narrowing fixes): a governed but
+// not-yet-onboarding-ready session must not be able to create a directory anywhere in the
+// repo merely by riding the `&&`-chain family, bypassing the onboarding-readiness gate
+// evaluateAfterGrammarAdmission() enforces below. `.claude/worktrees` is repo-relative
+// from `root`, matching this file's own path-join convention (`join`, not a raw string).
+const CHAIN_ELIGIBLE_MKDIR_PREFIXES = [
+  "scratch",
+  join(".claude", "worktrees"),
+];
+
+/**
+ * `mkdir -p` chain eligibility: `isProjectWritePath` is still required (containment / no
+ * symlink-escape through an existing ancestor), but it is now an ADDITIONAL check, never
+ * the only gate -- the actual restriction is the prefix allowlist above. A target must
+ * resolve, relative to `root`, to exactly `scratch/...` or `.claude/worktrees/...`.
+ */
+function isChainEligibleMkdirTarget(target, root) {
+  if (!isProjectWritePath(target, root)) return false;
+  const rel = relative(root, resolve(root, target));
+  return CHAIN_ELIGIBLE_MKDIR_PREFIXES.some(
+    (prefix) => rel === prefix || rel.startsWith(`${prefix}${sep}`),
+  );
+}
+
 /**
  * The exact small set the backlog item names: git rev-parse, git log (restricted
- * flags), git status, echo, ls, mkdir -p (restricted to an already project-write-path).
- * `git rev-parse`/`git status`/`ls` are admitted with any argv here because
- * isReadOnlySimpleWords below already admits them unconditionally as single commands --
- * chaining grants no new authority over what each already does alone. `echo` is
- * admitted with any argv: it has no side effects (no redirect can ride along, since
- * every chain segment below is independently required to parse with zero redirects of
- * its own). Deliberately no `-C`/`-c` support here (unlike the single-command git rule's
- * `-C` handling): keeping the chain family free of the cross-repository-reaching `-C`
- * shape is a deliberate narrowing, not an oversight -- an argv beginning with `-C` or
- * `-c` simply fails every subcommand match below and is refused.
+ * flags), git status, echo, ls, mkdir -p (restricted to scratch/ or .claude/worktrees/,
+ * see isChainEligibleMkdirTarget above). `git rev-parse`/`git status`/`ls` are admitted
+ * with any argv here because isReadOnlySimpleWords below already admits them
+ * unconditionally as single commands -- chaining grants no new authority over what each
+ * already does alone. `echo` is admitted with any argv: it has no side effects (no
+ * redirect can ride along, since every chain segment below is independently required to
+ * parse with zero redirects of its own). Deliberately no `-C`/`-c` support here (unlike
+ * the single-command git rule's `-C` handling): keeping the chain family free of the
+ * cross-repository-reaching `-C` shape is a deliberate narrowing, not an oversight -- an
+ * argv beginning with `-C` or `-c` simply fails every subcommand match below and is
+ * refused.
  */
 function isChainEligibleSegment(segment, root) {
   const executable = basename(segment.executable).toLowerCase();
@@ -618,7 +653,7 @@ function isChainEligibleSegment(segment, root) {
   if (executable === "echo") return true;
   if (executable === "ls") return true;
   if (executable === "mkdir") {
-    return argv.length === 2 && argv[0] === "-p" && isProjectWritePath(argv[1], root);
+    return argv.length === 2 && argv[0] === "-p" && isChainEligibleMkdirTarget(argv[1], root);
   }
   if (executable !== "git") return false;
   const subcommand = argv[0];
diff --git a/plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs b/plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
index 68b19368..151ff840 100644
--- a/plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
+++ b/plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
@@ -725,6 +725,76 @@ test("the small named &&-chain allowlist and trailing 2>/dev/null admit exactly
   }
 });
 
+// backlog/items/2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md
+// Critic finding F2 (rework round against commit b3153385): the test above uses an
+// UNGOVERNED root (root() writes no BASE_GOVERNANCE_MARKERS file), so
+// evaluateLifecycleReadyGuard's own `if (!governed) return verdict(0);` short-circuits
+// before ever reaching the mkdir-chain admission logic the test above claims to prove --
+// the requireProjectOnboardingReadyFn mock it injects at line ~699 is dead code, and F1's
+// bug (isChainEligibleSegment admitting ANY in-repo mkdir -p target) shipped underneath a
+// passing suite. This test uses a genuinely GOVERNED root (a real marker file on disk) with
+// requireProjectOnboardingReadyFn mocked not-ready, and proves both directions of the
+// narrowed mkdir predicate (F1): the scratch/ target stays admitted; an arbitrary in-repo
+// path outside scratch/ or .claude/worktrees/ (guardrails/, the Critic's own live-proved
+// bypass target) is now refused.
+//
+// Neither direction ever calls requireProjectOnboardingReadyFn, and both assert that
+// explicitly rather than leaving it unobserved: the admitted scratch/ chain is classified
+// read-only-diagnostic and short-circuits to verdict(0) BEFORE evaluateAfterGrammarAdmission
+// (the onboarding-readiness check) is reached -- the same early-exit shape the "non-ready
+// governed roots retain a narrow simple-command read-only diagnostic lane" test above
+// already establishes for other read-only shapes. The refused guardrails/ chain is refused
+// at the closed-grammar layer itself: guard-command-grammar.mjs's tokenizer unconditionally
+// rejects any top-level `&&` as a CONTROL operator (parseStatus "denied"), so a chain that
+// isReadOnlyDiagnosticCommand no longer admits is refused as GUARD-PARSE-UNSUPPORTED before
+// onboarding-readiness is ever consulted either -- refused unconditionally, which is at
+// least as strong a guarantee as "refused only while not yet onboarding-ready" would have
+// been. Documented here rather than assumed: this is a stronger, not weaker, proof than a
+// literal onboarding-readiness-mock-invocation would have given.
+test("the narrowed mkdir chain predicate (F1) still admits scratch/ and refuses an arbitrary in-repo path on a genuinely governed, not-yet-ready root", () => {
+  const path = root();
+  try {
+    writeFileSync(join(path, "pipeline.user.yaml"), "marker\n");
+
+    const admitted = "mkdir -p scratch/probe && ls -la scratch/probe";
+    assert.equal(isReadOnlyDiagnosticCommand(admitted, path), true, admitted);
+    let admittedCalls = 0;
+    assert.deepEqual(evaluateLifecycleReadyGuard(bash(admitted), {
+      projectDir: path,
+      requireProjectOnboardingReadyFn() { admittedCalls += 1; deny("partial"); },
+    }), { exitCode: 0, stderr: "" });
+    assert.equal(admittedCalls, 0,
+      "scratch/ chain must short-circuit before onboarding-readiness is ever consulted");
+
+    const worktree = "mkdir -p .claude/worktrees/probe && ls -la .claude/worktrees/probe";
+    assert.equal(isReadOnlyDiagnosticCommand(worktree, path), true, worktree);
+
+    const refused = "mkdir -p guardrails/critic-probe && ls -la guardrails/critic-probe";
+    assert.equal(isReadOnlyDiagnosticCommand(refused, path), false, refused);
+    let refusedCalls = 0;
+    const result = evaluateLifecycleReadyGuard(bash(refused), {
+      projectDir: path,
+      requireProjectOnboardingReadyFn() { refusedCalls += 1; deny("partial"); },
+    });
+    assert.equal(result.exitCode, 2, refused);
+    assert.match(result.stderr, /GUARD-PARSE-UNSUPPORTED/u, refused);
+    assert.equal(refusedCalls, 0,
+      "the arbitrary in-repo path must be refused at the closed-grammar layer, "
+        + "never reaching onboarding-readiness");
+
+    // The Critic's own live reproduction shape, DoD check 1: refused end to end.
+    const reproduction = "git rev-parse HEAD && mkdir -p guardrails/critic-probe";
+    assert.equal(isReadOnlyDiagnosticCommand(reproduction, path), false, reproduction);
+    const reproductionResult = evaluateLifecycleReadyGuard(bash(reproduction), {
+      projectDir: path,
+      requireProjectOnboardingReadyFn() { deny("partial"); },
+    });
+    assert.equal(reproductionResult.exitCode, 2, reproduction);
+  } finally {
+    rmSync(path, { recursive: true, force: true });
+  }
+});
+
 test("redirect-looking quoted data stays argv while hostile composition is typed and denied", () => {
   const path = root();
   try {
```
