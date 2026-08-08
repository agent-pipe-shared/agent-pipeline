// GF-057 / C2 — AC-3 and AC-5 test content, ready to paste into
// plugins/pipeline-core/hooks/guard-gate-strength.test.mjs, GST33 onward.
//
// NOT APPLIED, and not appliable by an agent. `project/guard-config.json` TP-6
// protects exactly this file (`guard-gate-strength\.test\.mjs$`), because the
// suite gates GS-1..GS-7 — the rules that stop an agent weakening the gate that
// authorizes it. Every Edit/Write against it is refused by `guard-testpath.mjs`.
//
// The override does not help either, and the reason is worth stating precisely
// rather than as "plugin source is unwritable": the target is Pipeline plugin
// source in a source checkout, so `recordHumanGuardDenial()` takes the
// `eligible.authorCandidate` branch (`lib/human-guard-override.mjs:1466`) and
// returns `status: "author-repair-required"` instead of `status: "planned"`.
// Author repair needs an explicit author source root, which a guard will not
// select on a human's behalf. So there is no in-session route — briefed or not.
//
// This is NOT a blanket rule about `plugins/pipeline-core/**`: the same block
// wrote and committed changes to `guard-lifecycle-ready.test.mjs`,
// `project-onboarding-v3.test.mjs` and a new
// `guard-lifecycle-recovery-contract.test.mjs` without trouble. It is TP-6's
// named pattern, and only that.
//
// VALIDATED, not merely drafted. The identical check logic was run standalone
// against the real committed guard (`ce1a741`) and passed 4/4 — see the block's
// evidence. What is missing is the paste, not the proof.
//
// The human step: apply sections 1–4 below to
// `plugins/pipeline-core/hooks/guard-gate-strength.test.mjs`, then run
// `node plugins/pipeline-core/hooks/guard-gate-strength.test.mjs` and confirm
// 36 passed / 0 failed. A human editing their own repository's file needs no
// ceremony.
//
// ============================================================================
// 1. Import-line addition (top of guard-gate-strength.test.mjs, alongside the existing
//    node:path import and the guard-gate-strength.mjs import):
// ----------------------------------------------------------------------------
//   import { dirname, join, relative, resolve } from "node:path";
//   ...
//   import { GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS } from "./guard-lifecycle-ready.mjs";
//
// ============================================================================
// 2. New consts, placed beside `const LIFECYCLE_GUARD = join(HOOKS, "guard-lifecycle-
//    ready.mjs");`:
// ----------------------------------------------------------------------------
/*
  // Self-application (ADR-0015): this repo's own checkout is a real governed root
  // (has project/pipeline.json, GOVERNANCE_MARKERS), and its own
  // plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs is a real file at the
  // path the exemption's PLUGIN_ROOT resolves to when THIS test file's own sibling
  // guard-lifecycle-ready.mjs is loaded in-process. That is exactly the shape AC-5
  // needs: the same real command from scratch/c2-repro.mjs, not a synthetic tmpdir
  // fixture the exempt script cannot physically live inside.
  const PROJECT_ROOT = join(PLUGIN_ROOT, "..", "..");

  const FORBIDDEN_WRITE_APIS = [
    "writeFileSync", "appendFileSync", "mkdirSync", "rmSync", "renameSync", "unlinkSync",
    "openSync", "createWriteStream", "cpSync", "copyFileSync", "symlinkSync", "truncateSync",
    "chmodSync", "utimesSync",
  ];
  const FORBIDDEN_PROMISE_WRITE_APIS = FORBIDDEN_WRITE_APIS
    .filter((name) => name !== "createWriteStream")
    .map((name) => name.replace(/Sync$/u, ""));

  function importsFsPromises(source) {
    return /from\s+["']node:fs\/promises["']/u.test(source) || /from\s+["']fs\/promises["']/u.test(source);
  }

  function relativeImportSpecifiers(source) {
    const specifiers = new Set();
    const staticRe = /\bfrom\s+["'](\.\.?\/[^"']+)["']/gu;
    const dynamicRe = /\bimport\(\s*["'](\.\.?\/[^"']+)["']\s*\)/gu;
    for (const re of [staticRe, dynamicRe]) {
      let match;
      while ((match = re.exec(source)) !== null) specifiers.add(match[1]);
    }
    return [...specifiers];
  }

  // Walks a script's source and its transitive PLUGIN-LOCAL relative imports only (bare
  // specifiers like "node:fs" are never followed). AC-3's honesty check: this is what
  // turns "provably write-free" in guard-lifecycle-ready.mjs's comment from a claim into
  // something verified on every run.
  function walkPluginLocalSource(entryAbsolutePath, pluginRoot, visited = new Set()) {
    if (visited.has(entryAbsolutePath)) return [];
    visited.add(entryAbsolutePath);
    const source = readFileSync(entryAbsolutePath, "utf8");
    const files = [{ path: entryAbsolutePath, source }];
    for (const specifier of relativeImportSpecifiers(source)) {
      const resolved = resolve(dirname(entryAbsolutePath), specifier);
      const rel = relative(pluginRoot, resolved);
      if (rel === "" || rel.startsWith("..")) continue; // plugin-local only
      files.push(...walkPluginLocalSource(resolved, pluginRoot, visited));
    }
    return files;
  }
*/
//
// ============================================================================
// 3. New checks, inserted after GST32 (before the final
//    `console.log(`\nguard-gate-strength: ${passed} passed, ${failed} failed`);`):
// ----------------------------------------------------------------------------
/*
  check("GST33 every GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS entry, and its transitive plugin-local imports, carry no filesystem-write API", () => {
    assert.ok(GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS.length > 0, "the exempt set must not be empty for this test to mean anything");
    for (const entry of GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS) {
      const entryPath = join(PLUGIN_ROOT, entry.path);
      const visited = walkPluginLocalSource(entryPath, PLUGIN_ROOT);
      assert.ok(visited.length > 0, `no source found for ${entry.path}`);
      for (const { path: filePath, source } of visited) {
        for (const api of FORBIDDEN_WRITE_APIS) {
          assert.doesNotMatch(source, new RegExp(`\\b${api}\\b`, "u"), `${filePath} calls forbidden write API ${api}`);
        }
        if (importsFsPromises(source)) {
          for (const api of FORBIDDEN_PROMISE_WRITE_APIS) {
            assert.doesNotMatch(source, new RegExp(`\\b${api}\\s*\\(`, "u"), `${filePath} calls forbidden fs/promises write API ${api}() (imports node:fs/promises)`);
          }
        }
      }
    }
  });

  check("GST34 the exact preflight command from scratch/c2-repro.mjs is admitted for every declared gate-strength path", () => {
    for (const rule of GATE_STRENGTH_PATHS) {
      const command = `node plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs --root . --base HEAD~1 --candidate HEAD --spec specs/x/spec.md --guardrail ${rule.path} --evidence evidence/e.json`;
      const { stderr } = shell(PROJECT_ROOT, command);
      assert.doesNotMatch(stderr, /GUARD-GATE-STRENGTH-SHELL/u, `${rule.id} (${rule.path}) still refused by the shell lane: ${stderr}`);
    }
  });

  check("GST35 a lookalike script, a same-basename script elsewhere, and the same relative path under a DIFFERENT root are never exempt", () => {
    const guardrail = "--guardrail pipeline.user.yaml --evidence evidence/e.json";
    // (a) different second word: same basename, wrong directory under the real project root.
    {
      const command = `node scripts/critic-dispatch-preflight.mjs --root . --base HEAD~1 --candidate HEAD --spec specs/x/spec.md ${guardrail}`;
      const { stderr } = shell(PROJECT_ROOT, command);
      assert.match(stderr, /GUARD-GATE-STRENGTH-SHELL/u, "a same-basename script outside the exact declared relative path must stay refused");
    }
    // (b) different second word: outside the plugin root entirely.
    {
      const command = `node /tmp/evil/critic-dispatch-preflight.mjs --root . --base HEAD~1 --candidate HEAD --spec specs/x/spec.md ${guardrail}`;
      const { stderr } = shell(PROJECT_ROOT, command);
      assert.match(stderr, /GUARD-GATE-STRENGTH-SHELL/u, "a lookalike path outside the plugin root must stay refused");
    }
    // (c) the identical relative path, but resolved against a DIFFERENT root than this
    // module's own PLUGIN_ROOT. The exemption trusts only the copy actually enforcing
    // (this module's own resolved location), never a vendored copy some other governed
    // project happens to keep at the same relative path.
    {
      const otherRoot = governed();
      mkdirSync(join(otherRoot, "plugins", "pipeline-core", "scripts"), { recursive: true });
      writeFileSync(
        join(otherRoot, "plugins", "pipeline-core", "scripts", "critic-dispatch-preflight.mjs"),
        readFileSync(join(PLUGIN_ROOT, "scripts", "critic-dispatch-preflight.mjs"), "utf8"),
      );
      const command = `node plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs --root . --base HEAD~1 --candidate HEAD --spec specs/x/spec.md ${guardrail}`;
      const { stderr } = shell(otherRoot, command);
      assert.match(stderr, /GUARD-GATE-STRENGTH-SHELL/u, "the identical relative path under a different (non-enforcing) root must stay refused");
    }
  });

  check("GST36 naming the exempt script inside a write command does not exempt the write", () => {
    const root = governed();
    const command = "node -e 'require(\"fs\").writeFileSync(\"pipeline.user.yaml\", \"gates:\\n  push_approval: chat\\n\"); require(\"./plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs\")'";
    const { blocked, stderr } = shell(root, command);
    assert.equal(blocked, true, "a write smuggled alongside a mention of the exempt script must still be refused");
    assert.match(stderr, /GUARD-GATE-STRENGTH-SHELL/u);
  });
*/
//
// ============================================================================
// 4. GST14 repair: rename in place -- the check only ever exercised cat-shaped reads
//    (cat, sha256sum, git diff, rg, head), never the new script-identity exemption
//    shape, so its old name over-claimed "never claimed by this rule" as if it covered
//    every read shape. GST34 above is what actually covers the script-shaped read.
//    Chosen: RENAME (not widen) -- GST14's existing five commands are a deliberately
//    narrow, well-understood regression set for the ORIGINAL classifier; folding the
//    new exemption's very different admission logic into the same check would blur
//    what each failure means.
// ----------------------------------------------------------------------------
//   OLD: check("GST14 reading a gate-strength file from the shell is never claimed by this rule", () => {
//   NEW: check("GST14 the cat-shaped reads (cat, sha256sum, git diff, rg, head) of a gate-strength file are never claimed by this rule -- GST34 covers the script-identity exemption shape", () => {
// ============================================================================
