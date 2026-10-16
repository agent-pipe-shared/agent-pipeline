// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.model-role-bootstrap-is-always-unavailable-on-native-windows (AC-213).
// Acceptance points covered:
//   P1 directoryPathChain starts at the platform root and ends at its input (win32 drive, UNC, POSIX).
//   P2 the check is meaningful: a mirror of the defective POSIX-style chain fails the same assertions.
//   P3 a native bootstrap observation reports inactive / the real activation, never
//      MODEL-FAMILY-GIT-COMMON-DIR-UNAVAILABLE (module level and CLI level).
//   P4 no other POSIX-only path assumption: realpathSync casing in safeExistingPath / resolvePhysicalRoot.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Import order matters (see the todo case "runtime-host cannot be entered first"): the invocation
// module must be evaluated first, exactly as scripts/model-role-bootstrap.mjs does, because a
// runtime-host-first entry hits a TDZ import cycle in the current source.
import "../model-family-invocation.mjs";
import { canonicalizeJson } from "../governance-event.mjs";
import { createModelFamilyRuntimeHost, observeModelFamilyActivation,
  modelFamilyRuntimeHostModulePath } from "../model-family-runtime-host.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");
const scratchBase = path.join(repoRoot, "scratch");
const OLD_CODE = "MODEL-FAMILY-GIT-COMMON-DIR-UNAVAILABLE";

function makeScratch(label) {
  mkdirSync(scratchBase, { recursive: true });
  return realpathSync.native(mkdtempSync(path.join(scratchBase, `${label}-`)));
}

function makeRealRepo(label) {
  const root = makeScratch(label);
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  writeFileSync(path.join(root, "f.txt"), "fixture\n");
  git("add", "f.txt");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "-q", "-m", "fixture");
  return root;
}

// The REAL production function, extracted from the module source and bound to an injected path flavour.
const moduleSource = readFileSync(modelFamilyRuntimeHostModulePath, "utf8");
const chainMatch = /function directoryPathChain\(path\) \{[\s\S]*?\n\}\n/u.exec(moduleSource);
function bindChain(source, flavour) {
  const factory = new Function("isAbsolute", "resolve", "parse", "join", "sep",
    `${source}\nreturn directoryPathChain;`);
  return factory(flavour.isAbsolute, flavour.resolve, flavour.parse, flavour.join, flavour.sep);
}
function assertChain(chain, input, expectedRoot) {
  assert.ok(Array.isArray(chain), "chain must be computed");
  assert.equal(chain[0], expectedRoot, "chain starts at the platform root");
  assert.equal(chain.at(-1), input, "chain ends at the input");
  for (let i = 1; i < chain.length; i += 1) {
    assert.ok(chain[i].startsWith(chain[i - 1]), "each element extends its predecessor");
  }
}

test("P1 production source of directoryPathChain is locatable and root-derived", () => {
  assert.ok(chainMatch, "directoryPathChain definition must be present in the module source");
  assert.match(chainMatch[0], /parse\(path\)\.root/u);
});

test("P1 win32 drive-letter path: chain starts at drive root and ends at the input", () => {
  const chain = bindChain(chainMatch[0], path.win32);
  const input = "D:\\Dev\\agent-pipeline-share\\.git";
  assertChain(chain(input), input, "D:\\");
  assert.deepEqual(chain(input), ["D:\\", "D:\\Dev", "D:\\Dev\\agent-pipeline-share", input]);
  assert.deepEqual(chain("D:\\"), ["D:\\"]);
});

test("P1 win32 UNC path: chain starts at the share root and ends at the input", () => {
  const chain = bindChain(chainMatch[0], path.win32);
  const input = "\\\\host\\share\\repo\\.git";
  assertChain(chain(input), input, "\\\\host\\share\\");
});

test("P1 POSIX path is unchanged", () => {
  const chain = bindChain(chainMatch[0], path.posix);
  const input = "/home/u/repo/.git";
  assert.deepEqual(chain(input), ["/", "/home", "/home/u", "/home/u/repo", input]);
  assert.deepEqual(chain("/"), ["/"]);
});

test("P1 non-absolute or non-normalized input is refused (null)", () => {
  const winChain = bindChain(chainMatch[0], path.win32);
  const posixChain = bindChain(chainMatch[0], path.posix);
  assert.equal(winChain("repo\\.git"), null);
  assert.equal(winChain("D:\\Dev\\..\\x"), null);
  assert.equal(posixChain("repo/.git"), null);
  assert.equal(posixChain(42), null);
});

test("P2 RED mirror: the defective POSIX-style chain fails the win32 assertions", () => {
  // Scratch mirror of the defect described in the item (start at sep, drop first char, rejoin).
  const defective = `function directoryPathChain(path) {
    if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) return null;
    const segments = path.slice(1).split(sep).filter(Boolean);
    const result = [sep];
    let current = sep;
    for (const segment of segments) { current = join(current, segment); result.push(current); }
    return result;
  }\n`;
  const chain = bindChain(defective, path.win32);
  const input = "D:\\Dev\\agent-pipeline-share\\.git";
  assert.throws(() => assertChain(chain(input), input, "D:\\"), assert.AssertionError);
  assert.notEqual(chain(input)?.at(-1), input);
});

test("P3 real git repository: activation observation reports inactive, not the git-common-dir code", () => {
  const root = makeRealRepo("alfp501-real");
  try {
    const result = observeModelFamilyActivation({ cwd: root });
    assert.notEqual(result.code, OLD_CODE);
    assert.equal(result.ok, true, result.code);
    assert.equal(result.status, "inactive");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("P3 platform drive-rooted common dir with a real activation marker reports active", (t) => {
  const commonDir = makeScratch("alfp501-active");
  try {
    const authoritySha256 = "a".repeat(64);
    const familyDir = path.join(commonDir, "agent-pipeline", "model-family-host");
    mkdirSync(path.join(familyDir, "receipts"), { recursive: true });
    const marker = { schema: "pipeline.model-family-host-activation.v1", activationId: "b".repeat(64),
      authoritySha256, createdAt: "2026-10-01T12:00:00.000Z" };
    const state = { schema: "pipeline.model-family-host-state.v1", generation: 0, activation: "family-active",
      authoritySha256, pinStates: [], watermarks: [], invocationIndex: [] };
    const stateSha256 = createHash("sha256").update(canonicalizeJson(state)).digest("hex");
    const stateFile = `generation-0-${stateSha256}.json`;
    const pointer = { schema: "pipeline.model-family-host-state-pointer.v1", generation: 0, stateFile, stateSha256 };
    writeFileSync(path.join(familyDir, "activation.json"), JSON.stringify(marker));
    writeFileSync(path.join(familyDir, stateFile), JSON.stringify(state));
    writeFileSync(path.join(familyDir, "current.json"), JSON.stringify(pointer));
    const host = createModelFamilyRuntimeHost({ cwd: commonDir, resolveCommonDir: () => commonDir,
      trustedSources: { readAuthorityInputs: () => ({ ok: false }), readPinInputs: () => [],
        readFreshDiscovery: () => ({ ok: false }), readCurrentCandidate: () => ({ ok: false }),
        launchDriver: () => ({ ok: false }) } });
    const result = host.observeActivation();
    assert.notEqual(result.code, OLD_CODE);
    // The marker was reached and accepted through the full directory chain on every platform.
    assert.notEqual(result.code, "MODEL-FAMILY-ACTIVATION-LOST");
    assert.notEqual(result.code, "MODEL-FAMILY-ACTIVATION-UNCERTAIN");
    if (process.platform === "win32") {
      // model-family-host-store.mjs (lines ~186-197) requires (mode & 0o077) === 0, which native
      // Windows cannot satisfy, so the state read after the marker is uncertain here.
      t.diagnostic("host-limitation: full 'active' assertion needs POSIX mode bits; owner Coordinator, "
        + "due 2026-10-19 for the Linux/WSL run (PO decision K7)");
      assert.equal(result.code, "MODEL-FAMILY-STATE-UNCERTAIN");
      return;
    }
    assert.equal(result.ok, true, result.code);
    assert.equal(result.status, "active");
    assert.equal(result.authoritySha256, authoritySha256);
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

test("P3 CLI: bootstrap on a real repository never returns the git-common-dir-unavailable code", () => {
  const root = makeRealRepo("alfp501-cli");
  try {
    const script = path.join(repoRoot, "plugins", "pipeline-core", "scripts", "model-role-bootstrap.mjs");
    const run = spawnSync(process.execPath, [script, "--repo-root", root, "--runner", "claude"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
    const line = run.stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1) ?? "";
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(line); }, `CLI stdout must be JSON, got: ${line.slice(0, 200)}`);
    assert.notEqual(parsed.code, OLD_CODE);
    // Activation resolved to inactive, so the forbidden-fallback branch (reserved for family
    // activation failures) must not be taken.
    assert.notEqual(parsed.fallbackForbidden, true, `unexpected fallbackForbidden with ${parsed.code}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("P4 realpath casing: a differently-cased spelling of an existing win32 repo does not break observation", (t) => {
  if (process.platform !== "win32") { t.skip("win32-only casing case"); return; }
  const root = makeRealRepo("alfp501-case");
  try {
    const flipped = root.replace(/^[A-Za-z]/u, (c) => c.toLowerCase())
      .replace(/alfp501-case-/u, "ALFP501-CASE-");
    assert.notEqual(flipped, root);
    const result = observeModelFamilyActivation({ cwd: flipped });
    assert.notEqual(result.code, OLD_CODE);
    // Either outcome is fail-closed-or-correct; the Windows-only defect was an unconditional failure.
    assert.equal(result.ok, true, result.code);
    assert.equal(result.status, "inactive");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("P4 clause 4 (POSIX-only path assumptions): module source has no hard-coded separator or slice(1) path handling", () => {
  const stripped = moduleSource.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
  assert.doesNotMatch(stripped, /\.slice\(1\)/u, "no first-character drop on a path");
  assert.doesNotMatch(stripped, /split\(["']\/["']\)/u, "no hard-coded POSIX separator split");
  assert.doesNotMatch(stripped, /\b(?:startsWith|indexOf)\(["']\/["']\)/u, "no POSIX-root test");
  assert.match(stripped, /isAbsolute\(/u, "absoluteness is decided by the platform flavour");
});

test("P4 clause 4 realpath casing via resolvePhysicalRoot/safeExistingPath: a differently-cased injected common dir is accepted or fails closed, never throws", (t) => {
  if (process.platform !== "win32") { t.skip("win32-only casing case"); return; }
  const root = makeRealRepo("alfp501-case2");
  try {
    const commonDir = path.join(root, ".git");
    const flipped = commonDir.replace(/^[A-Za-z]/u, (c) => c.toLowerCase())
      .replace(/alfp501-case2-/u, "ALFP501-CASE2-");
    assert.notEqual(flipped, commonDir);
    const host = createModelFamilyRuntimeHost({ cwd: root, resolveCommonDir: () => flipped });
    let result;
    assert.doesNotThrow(() => { result = host.observeActivation(); });
    // Any outcome must be a typed, fail-closed-or-correct observation; inactive is the correct one here.
    assert.equal(typeof result.ok, "boolean");
    if (result.ok) assert.equal(result.status, "inactive");
    else assert.match(result.code, /^MODEL-FAMILY-/u);
    // The same spelling in canonical native casing must be inactive (the correct observation).
    const canonical = createModelFamilyRuntimeHost({ cwd: root, resolveCommonDir: () => realpathSync.native(commonDir) })
      .observeActivation();
    assert.equal(canonical.ok, true, canonical.code);
    assert.equal(canonical.status, "inactive");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("model-family-runtime-host.mjs can be entered first (no import-cycle TDZ)",
  () => {
    const url = new URL("../model-family-runtime-host.mjs", import.meta.url).href;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(url)})`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
    assert.equal(run.status, 0, run.stderr.split(/\r?\n/u).find((l) => /Error/u.test(l)));
  });

test("P4 host limitation: directory mode bits and directory symlinks are unavailable on native Windows", (t) => {
  if (process.platform === "win32") {
    t.skip("host-limitation: directory mode bits / directory symlinks unavailable on native Windows; "
      + "owner Coordinator, due 2026-10-19 for the Linux/WSL run (PO decision K7)");
  }
});
