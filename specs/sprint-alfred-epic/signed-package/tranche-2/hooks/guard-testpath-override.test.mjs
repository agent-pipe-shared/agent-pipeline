#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * The audited escape hatch for guard-testpath, and the setting that decides whether it
 * counts at all.
 *
 * First shape of this feature was a blocker, found by the T1 Critic on 511d7d7: the v2
 * override's activation step (`guard-human-override.mjs authorize … --activate`) is an
 * ordinary command, and a ready session may run ordinary commands, so the agent the guard
 * constrains could arm its own capability. An override that its subject can arm is not an
 * override.
 *
 * PO decision: bind it to the same setting that decides how a human clears the push gate
 * (ADR-0056). `signature` -- the value in this repository and the fail-closed default for
 * anything absent, unreadable or unrecognised -- admits no in-session clearance at all.
 * Only an explicit `chat` admits the audited capability, and then the refusal says on its
 * face that it is attribution rather than proof.
 *
 * The setting lives in `pipeline.user.yaml`. This header used to claim that GS-1 refuses
 * that file "through both the write lane and the shell lane", so an agent could not reach
 * `chat` by writing it. That was the T2 Critic's C1 blocker and it is false: the shell lane
 * matches the literal filename in the command text, so a name assembled at runtime walks
 * past it, and no string matching fixes that. The correction landed in guard-testpath.mjs
 * but this copy of the claim survived, which the T3 Critic then found as K2 -- the same
 * sentence, still asserting the wrong mechanism, in the very suite that tests it.
 *
 * What actually makes this a gate: `readPushApprovalMode` refuses to trust a working-tree
 * copy that differs from the blob committed at that file's own path, and returns the
 * strongest mode instead. An in-session write therefore cannot weaken this gate -- though a
 * write FOLLOWED BY A COMMIT can, which is recorded rather than papered over. OT15..OT18
 * below exercise exactly that boundary.
 *
 * Lives in its own file because `guard-testpath.test.mjs` is TP-2 protected.
 *
 * TR-L / T84 (specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md section 2 row T84,
 * section 5 row 9; tranche-2 post-image, new cases OT20-OT23): "one protection decision per file
 * across hunks; `git restore -- <file>` to its committed bytes admitted, since a revert only
 * reduces risk [C: bound to HEAD bytes, never an arbitrary ref]". Invariant I4: TR-L makes the
 * decision consistent, never weaker.
 *   - OT20 pins the write-lane half at the override layer: a one-time capability spent on one
 *     hunk leaves every other hunk, and the revert of the admitted hunk, under the SAME refusal
 *     (same rule, same clearance text, and a route offered again). Expected GREEN today.
 *   - OT21-OT23 pin the restore half. It is a SHELL-lane decision, so it is driven through the
 *     library classifier `protectedTestPathShellHit({ command, rules, root })` that
 *     guard-lifecycle-ready.mjs calls; "admitted" means it returns null. Every case first runs the
 *     real git command in the fixture, to prove the pinned command really yields the committed
 *     bytes (otherwise the pin would describe nothing). OT21 and OT23 are RED today (the
 *     classifier treats every `git restore` of a protected path as a write); OT22 is the
 *     never-weaker half and is GREEN today. A RED case makes this file exit 1 -- that is the
 *     evidence for it, not a regression in the other cases, which are judged by their own PASS lines.
 *   - Assumptions this text does not fix, named instead of invented:
 *       1. The admitted spellings are the two that provably yield HEAD's bytes: a plain
 *          `git restore -- <file>` whose index equals HEAD (OT21), and the explicit
 *          `git restore --source=HEAD --staged --worktree -- <file>` (OT23, the only spelling that
 *          takes a STAGED file back to committed bytes).
 *       2. NOT pinned either way: a plain `git restore -- <file>` while the index differs from HEAD
 *          (it restores the INDEX bytes, which are not committed bytes), `git checkout -- <file>`,
 *          `--staged` or `--worktree` alone, `--source=<sha of HEAD>`, several pathspecs at once.
 *       3. "Never an arbitrary ref" is pinned as: `--source=HEAD~1`, `--source HEAD~1`, `-s HEAD~1`,
 *          `git checkout HEAD~1 -- <file>` stay refused, as does every non-git writer (OT22).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
function enrollFixtureGovernance(root) {
  const initialized = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  if (initialized.status !== 0) throw new Error("fixture git init failed: " + initialized.stderr);
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-hoststate") });
  const inactive = controller.observe({ rootDir: root });
  if (inactive.state !== "inactive" || inactive.requiresEnforcement) throw new Error("fixture scope was not initially inactive");
  const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-hook-fixture" });
  const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  if (active.state !== "active" || !active.requiresEnforcement) throw new Error("fixture enrollment did not activate enforcement");
}
import { criticalProofWaiverFor, readPushApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import {
  HumanGuardOverrideError,
  authorizeHumanGuardOverride,
  consumeHumanGuardOverride,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { protectedTestPathShellHit } from "../lib/protected-test-paths.mjs";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HOOKS, "guard-testpath.mjs");
const PLUGIN_ROOT = join(HOOKS, "..");
const OVERRIDE_SCRIPT = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
const PROTECTED = "harness/scripts/verify.mjs";
/** Exactly the denial string guard-testpath builds from the fixture config: `<id>: <reason>`. */
const TP3_DENIAL = "TP-3: the single verify-gate script";
const roots = [];

/** `mode: null` writes no pipeline.user.yaml at all -- the fail-closed default path. */
function fixture({ git = true, mode = null } = {}) {
  const base = mkdtempSync(join(tmpdir(), "testpath-override-"));
  roots.push(base);
  mkdirSync(join(base, "project"), { recursive: true });
  writeFileSync(join(base, "project", "guard-config.json"), JSON.stringify({
    protectedTestPaths: [{ id: "TP-3", pattern: "harness/scripts/verify\\.mjs$", reason: "the single verify-gate script" }],
  }));
  writeFileSync(join(base, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  if (mode !== null) {
    writeFileSync(join(base, "pipeline.user.yaml"), `schema: "pipeline.user.v3"\ngates:\n  push_approval: "${mode}"\n`);
  }
  if (git) {
    // A bare `git init` is NOT enough: the override's repository observation needs a real
    // HEAD, and without one it degrades to "no route offered". Found by probing, after an
    // earlier version of this fixture made the route check pass vacuously.
    const initialized = spawnSync("git", ["init", "-q", base], { encoding: "utf8" });
    if (initialized.status !== 0) throw new Error("fixture git init failed: " + initialized.stderr);
    spawnSync("git", ["-C", base, "config", "user.email", "fixture@example.invalid"]);
    spawnSync("git", ["-C", base, "config", "user.name", "fixture"]);
    spawnSync("git", ["-C", base, "add", "-A"]);
    spawnSync("git", ["-C", base, "commit", "-qm", "fixture"]);
    enrollFixtureGovernance(base);
  }
  return base;
}

function makeUnusableOverrideStore(root) {
  const agentPipelineDir = join(root, ".git", "agent-pipeline");
  const overrideStore = join(agentPipelineDir, "human-guard-overrides");
  const target = join(root, "unusable-override-store-target");
  mkdirSync(agentPipelineDir, { recursive: true });
  mkdirSync(target);
  // HGO requires a physical private directory at the Git common-dir path.
  // This disposable symlink reaches its typed HGO-STORAGE refusal before any
  // route record can be created.
  symlinkSync(target, overrideStore, "dir");
  return target;
}

function ask(root, filePath) {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: filePath }, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { blocked: result.status !== 0, status: result.status, stderr: result.stderr ?? "" };
}

/**
 * Like ask(), but the tool call carries a HUNK, so the capability's tool-input digest is
 * hunk-specific (T84: the log saw one hunk admitted and the next refused).
 */
function askHunk(root, filePath, hunk) {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: filePath, ...hunk }, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { blocked: result.status !== 0, status: result.status, stderr: result.stderr ?? "" };
}

/** The lines of a refusal that name the DECISION (rule, clearance, route class); digests and paths are left out. */
const DECISION_LINE = /^(BLOCKED \(guard-testpath|Rule ID:|Briefed test-change route:|Clearance:)/u;
function decisionLines(stderr) {
  return stderr.split("\n").filter((line) => DECISION_LINE.test(line));
}

/**
 * Arm a real one-time capability through the whole v2 chain, exactly as the human would:
 * denial -> plan -> prepare-authorization -> authorize --activate.
 *
 * Driven through the library rather than the CLI so a failure names the step that broke.
 * Every digest below is part of the binding, so anything the guard hashes differently --
 * tool name, tool input, denial string, plugin identity -- yields a capability the guard
 * will not accept, which is the property OT11 exercises.
 */
function arm(root, toolInput, denialReason, { toolName = "Edit" } = {}) {
  const denials = [{ guard: "guard-testpath.mjs", reason: denialReason }];
  const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath: OVERRIDE_SCRIPT };
  const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials });
  assert.equal(recorded.status, "planned", `denial not plannable: ${JSON.stringify(recorded)}`);
  const { requestSha256 } = recorded;
  const planned = planHumanGuardOverride({ ...shared, requestSha256 });
  const reason = "briefed test-change task";
  const prepared = prepareHumanGuardOverrideAuthorization({
    ...shared, requestSha256, planSha256: planned.planSha256, reason,
  });
  const armed = authorizeHumanGuardOverride({
    ...shared,
    requestSha256,
    planSha256: planned.planSha256,
    selectionSha256: prepared.selectionSha256,
    reason,
    reasonSha256: prepared.reasonSha256,
    activate: true,
    dependencies: { isattyFn: () => true, readLineFn: () => `HGO-${prepared.selectionSha256.slice(0, 8).toUpperCase()}` },
  });
  assert.equal(armed.status, "armed");
  return { planSha256: planned.planSha256, requestSha256 };
}

/** One git call in a fixture; a non-zero exit is a fixture defect, not a verdict. */
function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`fixture: git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

/** T84: the protected path as a TP-3-style rule, exactly the shape the shell lane receives. */
const RESTORE_RULES = [{ id: "TP-3", re: /harness\/scripts\/verify\.mjs$/iu, reason: "the single verify-gate script" }];
const shellHit = (root, command) => protectedTestPathShellHit({ command, rules: RESTORE_RULES, root });

/**
 * T84: a repository in which HEAD~1 holds "v0\n" and HEAD holds "v1\n" for the protected file, so
 * both "the committed bytes" and "an arbitrary older ref" exist and differ.
 */
function restoreFixture() {
  const root = fixture({ mode: "chat" });
  mkdirSync(join(root, "harness", "scripts"), { recursive: true });
  writeFileSync(join(root, PROTECTED), "v0\n");
  git(root, "add", "--", PROTECTED);
  git(root, "commit", "-qm", "v0");
  writeFileSync(join(root, PROTECTED), "v1\n");
  git(root, "add", "--", PROTECTED);
  git(root, "commit", "-qm", "v1");
  return root;
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}

try {
  check("OT01 a protected test path is refused with no capability armed", () => {
    const { blocked, stderr } = ask(fixture({ mode: "chat" }), PROTECTED);
    assert.equal(blocked, true);
    assert.match(stderr, /Rule ID: TP-3/u);
  });

  check("OT02 signature mode refuses in-session activation and offers the signed route (ADR-0059 Decision 3/4)", () => {
    // Since ADR-0059 Decision 3, signature mode is no longer a hard wall: the guard always
    // attempts to consume first (harmless here -- nothing is armed), then offers the
    // mode-appropriate next step. What signature mode still refuses is the in-session
    // `activate` continuation; what it now offers instead is the signed route.
    const { blocked, stderr } = ask(fixture({ mode: "signature" }), PROTECTED);
    assert.equal(blocked, true);
    assert.match(stderr, /gates\.push_approval is "signature"/u);
    assert.match(stderr, /in-session activation step is refused/u);
    assert.match(stderr, /A signed override is admitted instead/u);
    assert.match(stderr, /--request-sha256\s+[a-f0-9]{64}\b/u, "signature mode must offer the signed route");
    assert.match(stderr, /authorize-by-signature\b/u);
    assert.doesNotMatch(stderr, /--activate\b/u, "signature mode must not offer the in-session activate step");
    assert.match(stderr, /outside\s+this session/u);
  });

  check("OT03 an absent, unreadable or unrecognised setting falls back to signature and offers the signed route", () => {
    for (const mode of [null, "whatever", ""]) {
      const { blocked, stderr } = ask(fixture({ mode }), PROTECTED);
      assert.equal(blocked, true, `mode=${String(mode)}`);
      assert.match(stderr, /gates\.push_approval is "signature"/u, `mode=${String(mode)}`);
      assert.match(stderr, /in-session activation step is refused/u, `mode=${String(mode)}`);
      assert.match(stderr, /--request-sha256\s+[a-f0-9]{64}\b/u, `mode=${String(mode)} offered no route`);
      assert.match(stderr, /authorize-by-signature\b/u, `mode=${String(mode)}`);
      assert.doesNotMatch(stderr, /--activate\b/u, `mode=${String(mode)} must not offer the in-session activate step`);
    }
  });

  check("OT04 chat mode offers the audited route, with a real request digest", () => {
    const { stderr } = ask(fixture({ mode: "chat" }), PROTECTED);
    assert.notEqual(stderr.match(/--request-sha256\s+([a-f0-9]{64})\b/u), null,
      `no override route was offered:\n${stderr}`);
    assert.match(stderr, /plan --repo/u, "the offered route must be the read-only planner");
  });

  check("OT05 chat mode says on its face that the override is attribution, not proof", () => {
    assert.match(ask(fixture({ mode: "chat" }), PROTECTED).stderr, /attribution, not proof/u);
  });

  check("OT06 an unusable override store leaves the refusal exactly as it was", () => {
    // A canonically active repository reaches HGO's private store, which is
    // deliberately unusable because its physical directory is a symlink.
    const root = fixture({ mode: "chat" });
    const untouchedTarget = makeUnusableOverrideStore(root);
    const { blocked, stderr } = ask(root, PROTECTED);
    assert.equal(blocked, true, "a broken override store must not become an authorization");
    assert.match(stderr, /Rule ID: TP-3/u);
    assert.doesNotMatch(stderr, /--request-sha256\s+\S/u);
    assert.doesNotMatch(stderr, /capability consumed/u);
    assert.doesNotMatch(stderr, /Human override available/u);
    assert.match(stderr, /planning the route failed with code=HGO-STORAGE/u);
    assert.deepEqual(readdirSync(untouchedTarget), [], "unusable storage must not receive route records");
  });

  check("OT07 an unrelated file is untouched by any of this", () => {
    assert.equal(ask(fixture({ mode: "chat" }), "src/app.mjs").blocked, false);
    assert.equal(ask(fixture({ mode: "signature" }), "src/app.mjs").blocked, false);
  });

  check("OT08 the guard consults the override before it refuses, not after", () => {
    // Ordering matters: consuming after emitting would make the capability unusable.
    const source = String(spawnSync(process.execPath, ["-e",
      `process.stdout.write(require("fs").readFileSync(${JSON.stringify(GUARD)}, "utf8"))`],
    { encoding: "utf8" }).stdout);
    const consumeAt = source.indexOf("consumeHumanGuardOverride({");
    const emitAt = source.indexOf("emit(2, [");
    assert.ok(consumeAt > 0 && emitAt > 0, "expected both the consume call and the refusal");
    assert.ok(consumeAt < emitAt, "the capability is consumed after the refusal is emitted");
  });

  check("OT09 the mode is read from pipeline.user.yaml, which GS-1 protects", () => {
    // Exercises the actual gate-approval-mode resolution path for push_approval, rather
    // than grepping source for one implementation's literal property access (c6bd3a6b
    // generalized it to a table-driven lookup, which twice broke a source-grepping
    // version of this check -- first against a literal `gates?.push_approval` pattern,
    // then again against a literal `push: "push_approval"` pattern after the
    // reconcile-approval generalization added a second table entry). Calling the reader
    // directly survives any future source shape, because it pins the CONTRACT
    // (`readPushApprovalMode` resolves `chat` from `pipeline.user.yaml`) rather than one
    // implementation's literal property access.
    const root = fixture({ mode: "chat" });
    const resolved = readPushApprovalMode(root);
    assert.equal(resolved.mode, "chat");
    assert.equal(resolved.source, "pipeline.user.yaml");
  });

  // ---- F3: the allow path, which no test walked until now -------------------------

  check("OT10 an armed capability admits exactly the edit it was bound to", () => {
    const root = fixture({ mode: "chat" });
    assert.equal(ask(root, PROTECTED).blocked, true, "precondition: refused while unarmed");
    arm(root, { file_path: PROTECTED }, TP3_DENIAL);
    const { blocked, status, stderr } = ask(root, PROTECTED);
    assert.equal(blocked, false, `armed capability did not admit the edit (exit ${status}):\n${stderr}`);
    assert.match(stderr, /\[pipeline-human-override\] guard-testpath TP-3/u);
    assert.match(stderr, /capability consumed/u);
  });

  check("OT11 a capability bound to a different edit does not admit this one", () => {
    // The binding is the whole point: arming for file A must not open file B. Both are
    // TP-3 matches here, so only the tool-input digest separates them.
    const root = fixture({ mode: "chat" });
    arm(root, { file_path: PROTECTED }, TP3_DENIAL);
    const other = "nested/harness/scripts/verify.mjs";
    const { blocked, stderr } = ask(root, other);
    assert.equal(blocked, true, "a capability bound elsewhere admitted this edit");
    assert.match(stderr, /Rule ID: TP-3/u);
    assert.doesNotMatch(stderr, /capability consumed/u);
  });

  check("OT12 the capability is single-use: the same edit is refused again", () => {
    const root = fixture({ mode: "chat" });
    arm(root, { file_path: PROTECTED }, TP3_DENIAL);
    assert.equal(ask(root, PROTECTED).blocked, false, "precondition: first use is admitted");
    const { blocked, stderr } = ask(root, PROTECTED);
    assert.equal(blocked, true, "a consumed capability was accepted a second time");
    assert.doesNotMatch(stderr, /capability consumed/u);
  });

  check("OT13 an in-session write drifts the repository an armed capability is bound to, which fails closed with HGO-DRIFT", () => {
    // This case was called "signature mode ignores an armed capability entirely" and its
    // comment said the mode gate must sit in front of the capability. That gate no longer
    // exists: f650164 removed it for ADR-0059 Decision 3, and the guard now attempts to
    // consume in EVERY mode -- harmlessly, because a capability can only have been armed by
    // a clearance matching the committed mode (Decision 1 refuses the in-session activation
    // path outright while that mode is not chat; OT19 below pins it, one step earlier and in
    // the library rather than here). The case nevertheless stayed green, for a reason it did
    // not name: the fixture's own uncommitted writeFileSync perturbs `git status`, which
    // repositoryObservation() digests into `statusSha256`, so consumption answers `replan` on
    // repository DRIFT. That is a real and worthwhile property -- it is just not the one the
    // title claimed, and a bare `blocked === true` would have gone green for any refusal at
    // all, including a loosened drift comparison plus some later check tripping instead.
    // So the code is asserted BY NAME.
    const root = fixture({ mode: "chat" });
    arm(root, { file_path: PROTECTED }, TP3_DENIAL);
    writeFileSync(join(root, "pipeline.user.yaml"),
      'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
    assert.deepEqual(
      consumeHumanGuardOverride({
        rootDir: root,
        pluginRoot: PLUGIN_ROOT,
        toolName: "Edit",
        toolInput: { file_path: PROTECTED },
        denials: [{ guard: "guard-testpath.mjs", reason: TP3_DENIAL }],
      }),
      { status: "replan", code: "HGO-DRIFT" },
      "an armed capability survived a change to the repository state it was bound to",
    );
    const { blocked, stderr } = ask(root, PROTECTED);
    assert.equal(blocked, true, "a drifted capability admitted the edit");
    assert.doesNotMatch(stderr, /capability consumed/u);
    // The resolved mode flips to signature as a CONSEQUENCE of that same write -- the
    // working-tree copy no longer matches the committed blob, so readPushApprovalMode falls
    // back to the strongest mode (OT15/OT17's property). It is not what blocks the edit.
    // Kept because it is Decision 4's next-step property on this path: the refusal names the
    // signed route rather than an in-session one it would now refuse to honour.
    assert.match(stderr, /gates\.push_approval is "signature"/u);
    assert.match(stderr, /in-session activation step is refused/u);
    assert.match(stderr, /authorize-by-signature\b/u);

    // The differential half (OT14/OT16's idiom): a twin fixture in which the SAME file is
    // rewritten BYTE-IDENTICALLY. Same write call, same path, same armed capability -- only
    // the bytes are unchanged, so `git status` stays clean, statusSha256 is unmoved, nothing
    // drifts and the capability is consumed. Without it, the half above would equally be
    // satisfied by a fixture that never admits anything, and the drift claim would be
    // untestable rather than tested.
    const twin = fixture({ mode: "chat" });
    const settings = join(twin, "pipeline.user.yaml");
    const identicalBytes = readFileSync(settings);
    arm(twin, { file_path: PROTECTED }, TP3_DENIAL);
    writeFileSync(settings, identicalBytes);
    const admitted = ask(twin, PROTECTED);
    assert.equal(admitted.blocked, false,
      `a byte-identical rewrite was treated as drift, so the case above pins nothing:\n${admitted.stderr}`);
    assert.match(admitted.stderr, /capability consumed/u);
  });

  check("OT14 a protected test path under plugins/pipeline-core gets no plain route", () => {
    // Not a defect of this guard, but a coverage boundary worth pinning: eligibility treats
    // every `plugins/pipeline-core/**` write as Pipeline-author repair, which needs an
    // explicit source root and so never reaches "planned". In THIS repository that is four
    // of the five TP entries -- TP-1, TP-2, TP-4, TP-5 -- leaving TP-3 the only one the
    // override can serve. If eligibility ever changes, this check is where it surfaces.
    const root = mkdtempSync(join(tmpdir(), "testpath-override-src-"));
    roots.push(root);
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "guard-config.json"), JSON.stringify({
      protectedTestPaths: [
        { id: "TP-2", pattern: "plugins/pipeline-core/hooks/guard-testpath\\.test\\.mjs$", reason: "gates this very guard" },
        { id: "TP-3", pattern: "harness/scripts/verify\\.mjs$", reason: "the single verify-gate script" },
      ],
    }));
    writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
    spawnSync("git", ["init", "-q", root], { encoding: "utf8" });
    spawnSync("git", ["-C", root, "config", "user.email", "fixture@example.invalid"]);
    spawnSync("git", ["-C", root, "config", "user.name", "fixture"]);
    spawnSync("git", ["-C", root, "add", "-A"]);
    spawnSync("git", ["-C", root, "commit", "-qm", "fixture"]);
    enrollFixtureGovernance(root);

    const source = ask(root, "plugins/pipeline-core/hooks/guard-testpath.test.mjs");
    assert.equal(source.blocked, true);
    assert.match(source.stderr, /Rule ID: TP-2/u);
    assert.doesNotMatch(source.stderr, /--request-sha256\s+\S/u,
      "a plain override route was offered for a Pipeline-source path");

    // The differential half: the SAME fixture, same mode, same store -- only the path
    // differs. Without this, "no route" could just as well mean "this fixture never
    // produces one", and the check above would pass for the wrong reason.
    const ordinary = ask(root, PROTECTED);
    assert.equal(ordinary.blocked, true);
    assert.match(ordinary.stderr, /--request-sha256\s+[a-f0-9]{64}\b/u,
      "the fixture produces no route at all, so the assertion above proves nothing");
  });

  // ---- C1: an in-session write to the setting must not weaken this gate ------------

  check("OT15 an uncommitted chat setting does not admit the chat-mode continuation", () => {
    // The T2 Critic's blocker, as a test. The shell lane refuses the literal filename but
    // not a name assembled at runtime, so the write itself is assumed to succeed -- the
    // fixture simply performs it. What must hold is that the write buys nothing: the
    // resolved mode stays signature, so the route offered (if any) is the signed one, not
    // the chat-mode activate continuation the uncommitted write asked for.
    const root = fixture({ mode: "signature" });
    writeFileSync(join(root, "pipeline.user.yaml"),
      'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
    const { blocked, stderr } = ask(root, PROTECTED);
    assert.equal(blocked, true, "an uncommitted flip to chat opened the gate");
    assert.match(stderr, /gates\.push_approval is "signature"/u, "an uncommitted flip to chat must not change the resolved mode");
    assert.match(stderr, /in-session activation step is refused/u);
    assert.match(stderr, /--request-sha256\s+[a-f0-9]{64}\b/u, "the committed (signature) mode still offers its own route");
    assert.match(stderr, /authorize-by-signature\b/u);
    assert.doesNotMatch(stderr, /--activate\b/u, "an uncommitted flip to chat must not offer the in-session activate step");
  });

  check("OT16 the same setting, committed, is honoured", () => {
    // The other half, so OT15 cannot pass by the reader being broken outright: identical
    // content, the only difference being that HEAD carries it.
    const root = fixture({ mode: "chat" });
    assert.match(ask(root, PROTECTED).stderr, /--request-sha256\s+[a-f0-9]{64}\b/u,
      "a committed chat setting was ignored, so OT15 proves nothing");
  });

  check("OT17 modifying a committed chat setting drops it to the strongest mode", () => {
    // The asymmetry, from the only starting point where it can be observed: HEAD says
    // chat, so the gate is open, and ANY in-session modification closes it again. Writing
    // the identical bytes back is deliberately not included -- that is not a modification,
    // and asserting it would pin the wrong property. The resolved mode still falls back to
    // signature, which (since ADR-0059 Decision 3/4) offers its own signed route rather than
    // no route at all -- what must not survive the modification is the chat continuation.
    for (const written of ["signature", "nonsense", ""]) {
      const root = fixture({ mode: "chat" });
      assert.match(ask(root, PROTECTED).stderr, /--request-sha256/u, "precondition: open");
      writeFileSync(join(root, "pipeline.user.yaml"),
        `schema: "pipeline.user.v3"\ngates:\n  push_approval: "${written}"\n`);
      const { blocked, stderr } = ask(root, PROTECTED);
      assert.equal(blocked, true, `written=${written}`);
      assert.match(stderr, /gates\.push_approval is "signature"/u, `written=${written}`);
      assert.match(stderr, /in-session activation step is refused/u, `written=${written}`);
      assert.match(stderr, /--request-sha256\s+[a-f0-9]{64}\b/u, `written=${written} must still offer the signed route`);
      assert.doesNotMatch(stderr, /--activate\b/u, `written=${written} must not offer the in-session activate step`);
    }
  });

  check("OT18 the push proof is not waived by an uncommitted setting either", () => {
    // The write's second and worse consequence: the same file also decides whether `push`
    // demands a detached Ed25519 proof. Checked through the policy reader directly.
    const root = fixture({ mode: "signature" });
    writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"],
    }));
    writeFileSync(join(root, "pipeline.user.yaml"),
      'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
    assert.equal(criticalProofWaiverFor(root, "push").waived, false,
      "an uncommitted flip to chat stood the push proof down");
  });

  // ---- the invariant the old OT13 title gestured at, at the layer where it survives ----

  check("OT19 the in-session activation path itself refuses every committed mode but chat", () => {
    // "An override its subject can arm is not an override" -- this suite's own opening
    // claim. Decision 3 moved WHERE that is enforced: the guards stopped gating on the mode
    // and now always attempt to consume, so nothing in this suite pinned the enforcement any
    // more. It still exists, one step earlier and in the library:
    // authorizeHumanGuardOverride() reads the COMMITTED gates.push_approval itself and fails
    // with HGO-SIGNATURE-MODE-REQUIRED unless it is exactly "chat" (ADR-0059 Decision 1,
    // defense in depth; human-guard-override.mjs, immediately after the `activate` check).
    // Delete that check today and every case in this file stays green while an agent can arm
    // its own capability in signature mode -- which is the whole hole, restored.
    //
    // The three steps BEFORE it must stay reachable in every mode, because Decision 4 has
    // every denial report a next step and the SIGNED route needs the same
    // record -> plan -> prepare chain; so they are asserted, not assumed. The chat-mode twin
    // is OT10's arm(), which walks this identical chain through to `armed`, and is not
    // duplicated here.
    for (const mode of ["signature", null, "nonsense"]) {
      const label = `mode=${String(mode)}`;
      const root = fixture({ mode });
      const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath: OVERRIDE_SCRIPT };
      const denials = [{ guard: "guard-testpath.mjs", reason: TP3_DENIAL }];
      const toolInput = { file_path: PROTECTED };

      const recorded = recordHumanGuardDenial({ ...shared, toolName: "Edit", toolInput, denials });
      assert.equal(recorded.status, "planned", `${label}: the denial must stay routable in every mode`);
      const planned = planHumanGuardOverride({ ...shared, requestSha256: recorded.requestSha256 });
      assert.equal(planned.status, "planned", `${label}: planning must stay mode-independent`);
      const reason = "briefed test-change task";
      const prepared = prepareHumanGuardOverrideAuthorization({
        ...shared, requestSha256: recorded.requestSha256, planSha256: planned.planSha256, reason,
      });
      assert.equal(prepared.status, "prepared", `${label}: preparing must stay mode-independent`);

      assert.throws(
        () => authorizeHumanGuardOverride({
          ...shared,
          requestSha256: recorded.requestSha256,
          planSha256: planned.planSha256,
          selectionSha256: prepared.selectionSha256,
          reason,
          reasonSha256: prepared.reasonSha256,
          activate: true,
        }),
        (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-SIGNATURE-MODE-REQUIRED",
        `${label}: a complete, otherwise-valid in-session activation was accepted`,
      );

      // Unconditional and path-independent: the identical refusal answers a request, plan,
      // selection and reason digest that match nothing at all. So the check precedes every
      // lookup rather than being one branch reachable only for particular inputs -- there is
      // no shape of argument that walks around it.
      assert.throws(
        () => authorizeHumanGuardOverride({
          ...shared,
          requestSha256: "a".repeat(64),
          planSha256: "b".repeat(64),
          selectionSha256: "c".repeat(64),
          reason: "unrelated",
          reasonSha256: "d".repeat(64),
          activate: true,
        }),
        (error) => error instanceof HumanGuardOverrideError && error.code === "HGO-SIGNATURE-MODE-REQUIRED",
        `${label}: the mode check does not precede the request/reason lookups`,
      );

      const { blocked, stderr } = ask(root, PROTECTED);
      assert.equal(blocked, true, `${label}: the guard admitted the edit after a refused arming`);
      assert.doesNotMatch(stderr, /capability consumed/u, `${label}: something was armed anyway`);
    }
  });

  // ---- T84 (TR-L): one protection decision per file across hunks; the committed-bytes restore ----

  check("OT20 T84 a capability spent on one hunk leaves every other hunk, and the revert, under the same refusal and route", () => {
    const root = fixture({ mode: "chat" });
    const hunkA = { old_string: "alpha", new_string: "beta" };
    const hunkB = { old_string: "gamma", new_string: "delta" };
    const revertA = { old_string: "beta", new_string: "alpha" };
    const unarmed = askHunk(root, PROTECTED, hunkA);
    assert.equal(unarmed.blocked, true, "precondition: refused while unarmed");
    assert.match(unarmed.stderr, /--request-sha256\s+[a-f0-9]{64}\b/u,
      "precondition: this fixture offers a route, so 'refused with a route' is observable");
    const reference = decisionLines(unarmed.stderr);
    assert.ok(reference.some((line) => line === "Rule ID: TP-3"), `precondition: ${JSON.stringify(reference)}`);

    arm(root, { file_path: PROTECTED, ...hunkA }, TP3_DENIAL);
    const spent = askHunk(root, PROTECTED, hunkA);
    assert.equal(spent.blocked, false, `the armed hunk was not admitted (exit ${spent.status}):\n${spent.stderr}`);
    assert.match(spent.stderr, /capability consumed/u);

    for (const [label, hunk] of [["another hunk of the same file", hunkB], ["the revert of the admitted hunk", revertA], ["the admitted hunk again", hunkA]]) {
      const after = askHunk(root, PROTECTED, hunk);
      assert.equal(after.blocked, true, `${label}: admitted without a capability of its own`);
      assert.doesNotMatch(after.stderr, /capability consumed/u, label);
      assert.deepEqual(decisionLines(after.stderr), reference, `${label}: the decision for the file moved after one hunk was admitted`);
      assert.match(after.stderr, /--request-sha256\s+[a-f0-9]{64}\b/u, `${label}: refused without the route the first refusal offered`);
    }
  });

  check("OT21 T84 `git restore -- <file>` that puts a protected file back to its committed bytes is admitted by the shell lane", () => {
    const root = restoreFixture();
    writeFileSync(join(root, PROTECTED), "v2 (an in-session edit)\n");
    assert.equal(git(root, "status", "--porcelain", "--", PROTECTED), ` M ${PROTECTED}\n`, "precondition: modified in the tree only, index equals HEAD");
    const hit = shellHit(root, `git restore -- ${PROTECTED}`);
    // The pinned command is real and yields HEAD's bytes, so admitting it admits nothing else.
    git(root, "restore", "--", PROTECTED);
    assert.equal(readFileSync(join(root, PROTECTED), "utf8"), "v1\n", "the restore did not yield HEAD's bytes, so the premise of this pin is false");
    assert.equal(hit, null, `T84: the restore to committed bytes was refused (lane=${hit?.lane}, rule=${hit?.rule?.id})`);
  });

  check("OT22 T84 a restore from any ref but HEAD, and every other writer of the protected path, stays refused", () => {
    const root = restoreFixture();
    writeFileSync(join(root, PROTECTED), "v2 (an in-session edit)\n");
    for (const command of [
      `git restore --source=HEAD~1 -- ${PROTECTED}`,
      `git restore --source HEAD~1 -- ${PROTECTED}`,
      `git restore -s HEAD~1 -- ${PROTECTED}`,
      `git checkout HEAD~1 -- ${PROTECTED}`,
      `git rm -- ${PROTECTED}`,
      `cp scratch/other.mjs ${PROTECTED}`,
    ]) {
      const hit = shellHit(root, command);
      assert.notEqual(hit, null, `an arbitrary-ref restore or a non-restore writer was admitted: ${command}`);
      assert.equal(hit.rule.id, "TP-3", command);
    }
    // The ref used above is genuinely different bytes from HEAD's, so "arbitrary ref" is observable.
    assert.equal(git(root, "show", `HEAD~1:${PROTECTED}`), "v0\n");
    assert.equal(git(root, "show", `HEAD:${PROTECTED}`), "v1\n");
    // Differential: the same fixture admits a restore of an unprotected path, so the refusals above are the rule firing.
    assert.equal(shellHit(root, "git restore -- scratch/notes.txt"), null);
  });

  check("OT23 T84 the committed-bytes restore of a STAGED protected file (explicit --source=HEAD, index and tree) is admitted", () => {
    const root = restoreFixture();
    writeFileSync(join(root, PROTECTED), "v2 (staged)\n");
    git(root, "add", "--", PROTECTED);
    writeFileSync(join(root, PROTECTED), "v3 (staged, then edited again)\n");
    assert.equal(git(root, "status", "--porcelain", "--", PROTECTED), `MM ${PROTECTED}\n`, "precondition: staged and modified again");
    const hit = shellHit(root, `git restore --source=HEAD --staged --worktree -- ${PROTECTED}`);
    git(root, "restore", "--source=HEAD", "--staged", "--worktree", "--", PROTECTED);
    assert.equal(readFileSync(join(root, PROTECTED), "utf8"), "v1\n", "the restore did not yield HEAD's bytes, so the premise of this pin is false");
    assert.equal(git(root, "status", "--porcelain", "--", PROTECTED), "", "the restore left the file staged or modified");
    assert.equal(hit, null, `T84: the committed-bytes restore of a staged file was refused (lane=${hit?.lane}, rule=${hit?.rule?.id})`);
  });

  console.log(`\nguard-testpath-override: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
