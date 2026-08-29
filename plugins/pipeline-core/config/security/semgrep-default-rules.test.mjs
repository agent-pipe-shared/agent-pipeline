#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * semgrep-default-rules.test.mjs -- validity smoke test for the plugin-shipped default
 * semgrep ruleset (NVA-B-SCANNER), separate from security-scan.test.mjs on purpose: that
 * file's own header states "NO real scanner binaries anywhere in this file" (determinism
 * across machines without semgrep installed) -- this file is the one place that DOES invoke
 * the real `semgrep` binary, because the only way to prove a ruleset YAML is actually valid
 * semgrep syntax is to hand it to semgrep itself. When semgrep is not on PATH, every case
 * below is skipped (counted as a pass, not a failure) rather than faked -- the goldfish
 * protocol's "not verifiable" contract, not a fabricated result.
 *
 * Run:   node plugins/pipeline-core/config/security/semgrep-default-rules.test.mjs
 * Exit:  0 = every case passed or was honestly skipped, 1 = a real semgrep run disagreed.
 */
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// NVA-R18-SCANBOOT (2026-08-29): the shipped ruleset itself now lives at
// security/semgrep/pipeline.yml (matching the backlog item's own done_when path);
// this test file stays put and just points at the relocated file.
const RULES_PATH = fileURLToPath(new URL("../../security/semgrep/pipeline.yml", import.meta.url));

let pass = 0;
const failures = [];
function record(id, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${id}`); }
  else { failures.push(`${id}: ${detail}`); console.log(`FAIL  ${id} -- ${detail}`); }
}

function findSemgrep() {
  const probe = spawnSync("semgrep", ["--version"], { encoding: "utf8", shell: false });
  return probe.error ? null : "semgrep";
}

const binary = findSemgrep();
record("semgrep-default-rules.yml exists on disk", existsSync(RULES_PATH), RULES_PATH);

if (!binary) {
  console.log("SKIP  no real semgrep binary on PATH -- ruleset syntax is not independently verifiable in this environment (not verifiable, not faked)");
} else {
  const scratch = mkdtempSync(join(tmpdir(), "pipeline-semgrep-default-rules-test-"));
  const env = { ...process.env, SEMGREP_SEND_METRICS: "off" };

  // Case 1: a fixture containing a PEM private-key block -- the ERROR-severity rule must fire.
  const dirtyDir = join(scratch, "dirty");
  mkdirSync(dirtyDir, { recursive: true });
  writeFileSync(
    join(dirtyDir, "leaked-key.txt"),
    "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK...\n-----END RSA PRIVATE KEY-----\n",
  );
  const dirtyRun = spawnSync(binary, ["scan", "--json", "--config", RULES_PATH, dirtyDir], { encoding: "utf8", env, shell: false });
  record("real semgrep run against the shipped ruleset exits without a hard crash (dirty fixture)", dirtyRun.status === 0 || dirtyRun.status === 1, `exit ${dirtyRun.status}: ${(dirtyRun.stderr || "").slice(0, 300)}`);
  let dirtyParsed = null;
  try { dirtyParsed = JSON.parse(dirtyRun.stdout ?? ""); } catch { /* asserted below */ }
  record("shipped ruleset produces parseable JSON (dirty fixture)", dirtyParsed !== null, dirtyRun.stdout?.slice(0, 300));
  record(
    "shipped ruleset's private-key rule actually fires on a real PEM block",
    Array.isArray(dirtyParsed?.results) && dirtyParsed.results.some((r) => r.check_id?.includes("hardcoded-private-key")),
    JSON.stringify(dirtyParsed?.results?.map((r) => r.check_id)),
  );

  // Case 1b: a PKCS#8 header (openssl genpkey default output / GCP service-account JSON key
  // format) has no key-type token for $KEYTYPE to bind to -- a separate no-metavariable
  // alternative in the rule's pattern-either must still catch it.
  const pkcs8Dir = join(scratch, "pkcs8");
  mkdirSync(pkcs8Dir, { recursive: true });
  writeFileSync(
    join(pkcs8Dir, "leaked-key.txt"),
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQ...\n-----END PRIVATE KEY-----\n",
  );
  const pkcs8Run = spawnSync(binary, ["scan", "--json", "--config", RULES_PATH, pkcs8Dir], { encoding: "utf8", env, shell: false });
  let pkcs8Parsed = null;
  try { pkcs8Parsed = JSON.parse(pkcs8Run.stdout ?? ""); } catch { /* asserted below */ }
  record("shipped ruleset produces parseable JSON (PKCS#8 fixture)", pkcs8Parsed !== null, pkcs8Run.stdout?.slice(0, 300));
  record(
    "shipped ruleset's private-key rule fires on a bare PKCS#8 header (no metavariable to bind)",
    Array.isArray(pkcs8Parsed?.results) && pkcs8Parsed.results.some((r) => r.check_id?.includes("hardcoded-private-key")),
    JSON.stringify(pkcs8Parsed?.results?.map((r) => r.check_id)),
  );

  // Case 2: a clean fixture -- no findings, and no error payload.
  const cleanDir = join(scratch, "clean");
  mkdirSync(cleanDir, { recursive: true });
  writeFileSync(join(cleanDir, "clean.txt"), "nothing suspicious here\n");
  const cleanRun = spawnSync(binary, ["scan", "--json", "--config", RULES_PATH, cleanDir], { encoding: "utf8", env, shell: false });
  let cleanParsed = null;
  try { cleanParsed = JSON.parse(cleanRun.stdout ?? ""); } catch { /* asserted below */ }
  record("shipped ruleset produces parseable JSON (clean fixture)", cleanParsed !== null, cleanRun.stdout?.slice(0, 300));
  record("shipped ruleset reports zero findings on a clean fixture", Array.isArray(cleanParsed?.results) && cleanParsed.results.length === 0, JSON.stringify(cleanParsed?.results));
  record("shipped ruleset carries no error payload on a clean fixture", !Array.isArray(cleanParsed?.errors) || cleanParsed.errors.length === 0, JSON.stringify(cleanParsed?.errors));

  try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
}

const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
