// SPDX-License-Identifier: SUL-1.0
// Regression pin ALF-C-P21-05 / AC-166: pipeline.domain-scanner-findings-need-reproduction-before-remedy.
// Acceptance points (original item): (A) an unknown/unavailable historical match stays explicit and no
// false-positive PASS is invented; (B) credential-shaped positive controls still fail while an exact
// reviewed domain value is the only thing suppressed; (C) no secret-prefix whitelist, automatic ignore
// generation, blanket suppression or lexical concealment; (D) scanner verdict and push authority are
// bound separately; (E) the value-identity repair keeps its scope (no duplicate ignore repair).
// Real module, documented spawnFn seam only. Fixtures live under the repository scratch/ directory.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitleaksContentAuthorityLine, resolveGitleaksConfigPath, run } from "../../scripts/security-adapters/gitleaks.mjs";
import { repairStaleIgnoreEntry } from "../../scripts/gitleaks-repair-ignore.mjs";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const adapterSource = readFileSync(new URL("../../scripts/security-adapters/gitleaks.mjs", import.meta.url), "utf8");
const scanSource = readFileSync(new URL("../../scripts/security-scan.mjs", import.meta.url), "utf8");
const scratchBase = join(repoRoot, "scratch", `dsf-pin-${process.pid}`);
const BIN = "unused-fake-gitleaks";
const REL = "src/game.js";
const DOMAIN = { RuleID: "generic-api-key", StartLine: 4, StartColumn: 9, Secret: "playgame.example-studio.example", Description: "Generic API Key" };
const CRED = { RuleID: "aws-access-token", StartLine: 6, StartColumn: 12, Secret: "AKIAIOSFODNN7EXAMPLE", Description: "AWS Access Key" };

function fixture(ignoreLines) {
  mkdirSync(scratchBase, { recursive: true });
  const rootDir = mkdtempSync(join(scratchBase, "case-"));
  mkdirSync(join(rootDir, "src"), { recursive: true });
  writeFileSync(join(rootDir, REL), "fixture\n");
  if (ignoreLines !== undefined) writeFileSync(join(rootDir, ".gitleaksignore"), ignoreLines.join("\n") + "\n");
  return rootDir;
}
const live = (rootDir, f) => ({ ...f, File: join(rootDir, REL) });
const rel = (f) => ({ ...f, File: REL });
const spyFor = (report, calls = []) => (cmd, args) => {
  calls.push(args);
  writeFileSync(args[args.indexOf("--report-path") + 1], typeof report === "string" ? report : JSON.stringify(report));
  return { status: 0, stdout: "", stderr: "", error: null };
};
const scan = (rootDir, report, extra = {}) =>
  run({ rootDir, config: { binaryPath: join(rootDir, BIN), ...(extra.config ?? {}) }, spawnFn: spyFor(report, extra.calls), timeoutMs: 5000, env: extra.env ?? process.env });
const cleanup = () => rmSync(scratchBase, { recursive: true, force: true });

test("A: an unverified domain-shaped finding stays FINDINGS with its location, never a PASS or an invented false-positive verdict", async () => {
  const rootDir = fixture();
  try {
    const r = await scan(rootDir, [live(rootDir, DOMAIN)]);
    assert.equal(r.status, "FINDINGS");
    assert.equal(r.classification, "findings");
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].rule, "generic-api-key");
    assert.equal(r.findings[0].line, 4);
    assert.equal(r.findings[0].severity, "high");
    assert.doesNotMatch(r.findings[0].msg, /false[- ]positive|verified|benign|safe/i);
    assert.ok(typeof r.raw === "string" && r.raw.includes("generic-api-key"), "raw report retained for reproduction");
  } finally { cleanup(); }
});

test("A: scanner crash, unparseable report and a missing binary are never PASS or success-classified", async () => {
  const rootDir = fixture();
  try {
    const crash = await run({ rootDir, config: { binaryPath: join(rootDir, BIN) }, spawnFn: () => ({ status: 1, stdout: "", stderr: "boom", error: null }), timeoutMs: 5000 });
    assert.equal(crash.status, "ERROR");
    const bad = await scan(rootDir, "not-json");
    assert.equal(bad.status, "ERROR");
    const nonArray = await scan(rootDir, "{}");
    assert.equal(nonArray.status, "ERROR");
    const missing = await run({ rootDir, env: { PIPELINE_GITLEAKS_PATH: join(rootDir, "does-not-exist") } });
    assert.equal(missing.status, "SKIPPED");
    assert.equal(missing.classification, "binary_missing");
  } finally { cleanup(); }
});

test("B: only the exact reviewed domain value is suppressed; a credential at the same file still fails", async () => {
  const rootDir = fixture([gitleaksContentAuthorityLine(rel(DOMAIN))]);
  try {
    const r = await scan(rootDir, [live(rootDir, DOMAIN), live(rootDir, CRED)]);
    assert.equal(r.status, "FINDINGS");
    assert.equal(r.ignored.findingCount, 1);
    assert.deepEqual(r.findings.map((f) => f.rule), ["aws-access-token"]);
    const credOnly = await scan(rootDir, [live(rootDir, CRED)]);
    assert.equal(credOnly.status, "FINDINGS", "credential positive control must fail");
  } finally { cleanup(); }
});

test("C: suppression is not blanket: moved line, changed value and legacy/wildcard lines all stay findings", async () => {
  const rootDir = fixture(["*", REL, `${DOMAIN.RuleID}`, "src/**", gitleaksContentAuthorityLine(rel(DOMAIN))]);
  try {
    const exact = await scan(rootDir, [live(rootDir, DOMAIN)]);
    assert.equal(exact.status, "PASS", "the exact content-v1 entry suppresses");
    assert.equal(exact.ignored.findingCount, 1);
    const moved = await scan(rootDir, [live(rootDir, { ...DOMAIN, StartLine: 40 })]);
    assert.equal(moved.status, "FINDINGS");
    const changed = await scan(rootDir, [live(rootDir, { ...DOMAIN, Secret: "other.example-studio.example" })]);
    assert.equal(changed.status, "FINDINGS");
    const otherRule = await scan(rootDir, [live(rootDir, { ...DOMAIN, RuleID: "other-rule" })]);
    assert.equal(otherRule.status, "FINDINGS");
  } finally { cleanup(); }
});

test("C: RED mirror: a blanket path-only predicate would hide the credential, the real adapter does not", async () => {
  const blanket = (entries, f) => entries.some((e) => e.endsWith(`:${f.File}`) || e.includes(f.File));
  const entries = [gitleaksContentAuthorityLine(rel(DOMAIN))];
  assert.equal(blanket(entries, rel(CRED)), true, "mirror proves the check can fail");
  const rootDir = fixture(entries);
  try {
    assert.equal((await scan(rootDir, [live(rootDir, CRED)])).status, "FINDINGS");
  } finally { cleanup(); }
});

test("C: a scan never generates or edits ignore files and cannot take scanner config from the candidate", async () => {
  const rootDir = fixture();
  try {
    writeFileSync(join(rootDir, ".gitleaks.toml"), "[allowlist]\nregexes=['.*']\n");
    const before = readdirSync(rootDir).sort().join(",");
    const calls = [];
    const r = await scan(rootDir, [live(rootDir, DOMAIN)], { calls });
    assert.equal(r.status, "FINDINGS");
    assert.equal(existsSync(join(rootDir, ".gitleaksignore")), false, "no automatic ignore generation");
    assert.equal(readdirSync(rootDir).sort().join(","), before);
    assert.equal(calls[0][calls[0].indexOf("--config") + 1], resolveGitleaksConfigPath());
    assert.doesNotMatch(adapterSource.match(/from "node:fs";/u) ? adapterSource.split("\n").find((l) => l.includes('from "node:fs"')) : "", /writeFileSync/u);
  } finally { cleanup(); }
});

test("C: shipped scanner config has no secret-prefix whitelist, stopwords, global or regex allowlist", () => {
  for (const p of [resolveGitleaksConfigPath(), join(repoRoot, "plugins/pipeline-core/config/security/gitleaks-default.toml")]) {
    const text = readFileSync(p, "utf8");
    assert.doesNotMatch(text, /^\s*(regexes|stopwords|entropy|tags|commits)\s*=/mu);
    assert.doesNotMatch(text, /^\s*\[(\[?)allowlists?\]/mu);
    assert.deepEqual([...text.matchAll(/^id = "([^"]+)"/gmu)].map((m) => m[1]), ["sentry-access-token", "generic-api-key"]);
    const paths = [...text.matchAll(/'''(.*?)'''/gu)].map((m) => m[1]);
    assert.ok(paths.length > 0);
    for (const x of paths) assert.match(x, /^\.\*\/backlog\/transitions[a-z\\.-]*\\\.ndjson\$$/u, `ledger-only path allowlist: ${x}`);
    assert.match(text, /useDefault = true/u);
  }
});

test("D: scanner verdict is independent of any override or push-authority input", async () => {
  const rootDir = fixture();
  try {
    const env = { ...process.env, PIPELINE_PUSH_OVERRIDE: "1", PIPELINE_GITLEAKS_EXEMPT: "1" };
    const r = await scan(rootDir, [live(rootDir, CRED)], { env, config: { override: true, pushApproval: "approved", exempt: true } });
    assert.equal(r.status, "FINDINGS");
    for (const src of [adapterSource, scanSource]) assert.doesNotMatch(src, /human-guard|approve-push|push_approval|pushApproval/u);
  } finally { cleanup(); }
});

test("E: value-identity repair keeps its scope: same value re-binds, a different value is refused", async () => {
  const rootDir = fixture();
  try {
    const stale = { ...rel(DOMAIN), StartLine: 2 };
    writeFileSync(join(rootDir, ".gitleaksignore"), gitleaksContentAuthorityLine(stale) + "\n");
    const movedHint = await scan(rootDir, [live(rootDir, DOMAIN)]);
    assert.equal(movedHint.status, "FINDINGS");
    assert.match(movedHint.findings[0].msg, /gitleaks-repair-ignore\.mjs/u);
    const other = await repairStaleIgnoreEntry({ rootDir, path: REL, rule: DOMAIN.RuleID, column: DOMAIN.StartColumn, oldLine: 2, spawnFn: spyFor([live(rootDir, { ...DOMAIN, Secret: "different.example" })]), binaryPath: join(rootDir, BIN) });
    assert.equal(other.ok, false);
    assert.match(other.reason, /^value-binding-mismatch/u);
    const same = await repairStaleIgnoreEntry({ rootDir, path: REL, rule: DOMAIN.RuleID, column: DOMAIN.StartColumn, oldLine: 2, spawnFn: spyFor([live(rootDir, DOMAIN)]), binaryPath: join(rootDir, BIN) });
    assert.equal(same.ok, true, same.reason);
    assert.equal((await scan(rootDir, [live(rootDir, DOMAIN)])).status, "PASS");
    assert.doesNotMatch(adapterSource, /function repairStaleIgnoreEntry/u, "no duplicate repair implementation in the adapter");
  } finally { cleanup(); }
});
