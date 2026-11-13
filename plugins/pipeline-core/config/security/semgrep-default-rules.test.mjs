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
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// C28 (AC-108): the default web/Node rule pack. Positive and negative fixtures per rule; secret-shaped values are assembled here.
const AWS_KEY = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
const GH_TOKEN = `ghp_${"a1B2c3D4e5".repeat(3)}a1B2c3`;
const CREDENTIAL = ["Tr0ub4dor", "Xk29qLm"].join("");
const NEW_RULES = [
  "pipeline-default-dom-injection-sink", "pipeline-default-eval-like-call", "pipeline-default-unsafe-url-scheme", "pipeline-default-unvalidated-redirect",
  "pipeline-default-postmessage-no-origin-check", "pipeline-default-prototype-pollution", "pipeline-default-child-process-shell-string",
  "pipeline-default-hardcoded-secret", "pipeline-default-hardcoded-credential-assignment",
];
const FIXTURES = [
  { rule: "pipeline-default-dom-injection-sink", name: "innerHTML from a variable", fires: true, code: "el.innerHTML = userInput;" },
  { rule: "pipeline-default-dom-injection-sink", name: "outerHTML from a variable", fires: true, code: "el.outerHTML = userInput;" },
  { rule: "pipeline-default-dom-injection-sink", name: "insertAdjacentHTML from a variable", fires: true, code: "el.insertAdjacentHTML('beforeend', userInput);" },
  { rule: "pipeline-default-dom-injection-sink", name: "document.write from a variable", fires: true, code: "document.write(userInput);" },
  { rule: "pipeline-default-dom-injection-sink", name: "textContent and literal HTML", fires: false, code: "el.textContent = userInput;\nel.innerHTML = '<b>static</b>';\nel.insertAdjacentHTML('beforeend', '<i>x</i>');" },
  { rule: "pipeline-default-eval-like-call", name: "new Function", fires: true, code: "const f = new Function('a', body);" },
  { rule: "pipeline-default-eval-like-call", name: "string timer", fires: true, code: "setTimeout('tick()', 100);" },
  { rule: "pipeline-default-eval-like-call", name: "window.eval", fires: true, code: "window.eval(src);" },
  { rule: "pipeline-default-eval-like-call", name: "function timer", fires: false, code: "setTimeout(() => tick(), 100);\nsetInterval(tick, 100);" },
  { rule: "pipeline-default-unsafe-url-scheme", name: "javascript: href", fires: true, code: "link.href = 'javascript:alert(1)';" },
  { rule: "pipeline-default-unsafe-url-scheme", name: "javascript: location", fires: true, code: "window.location.href = \"javascript:void(0)\";" },
  { rule: "pipeline-default-unsafe-url-scheme", name: "https href", fires: false, code: "link.href = 'https://example.com/';" },
  { rule: "pipeline-default-unvalidated-redirect", name: "location from a variable", fires: true, code: "window.location.href = target;" },
  { rule: "pipeline-default-unvalidated-redirect", name: "location.assign from a variable", fires: true, code: "location.assign(target);" },
  { rule: "pipeline-default-unvalidated-redirect", name: "res.redirect from the query", fires: true, code: "res.redirect(req.query.next);" },
  { rule: "pipeline-default-unvalidated-redirect", name: "literal targets", fires: false, code: "window.location.href = '/home';\nres.redirect('/login');" },
  { rule: "pipeline-default-postmessage-no-origin-check", name: "arrow handler without an origin check", fires: true, code: "window.addEventListener('message', (e) => { render(e.data); });" },
  { rule: "pipeline-default-postmessage-no-origin-check", name: "function handler without an origin check", fires: true, code: "window.addEventListener('message', function (e) { render(e.data); });" },
  { rule: "pipeline-default-postmessage-no-origin-check", name: "handler that checks the origin", fires: false, code: "window.addEventListener('message', (e) => {\n  if (e.origin !== 'https://app.example') return;\n  render(e.data);\n});" },
  { rule: "pipeline-default-prototype-pollution", name: "__proto__ assignment", fires: true, code: "target.__proto__ = payload;" },
  { rule: "pipeline-default-prototype-pollution", name: "constructor.prototype write", fires: true, code: "target.constructor.prototype.admin = true;" },
  { rule: "pipeline-default-prototype-pollution", name: "nested dynamic write inside for-in", fires: true, code: "function merge(t, s) { for (const k in s) { t[k][s[k]] = s; } }" },
  { rule: "pipeline-default-prototype-pollution", name: "plain property writes and a numeric grid loop", fires: false, code: "target.name = source.name;\nfor (let i = 0; i < n; i++) { grid[i][i] = 0; }" },
  { rule: "pipeline-default-child-process-shell-string", name: "exec with a built string", fires: true, code: "const cp = require('child_process');\ncp.exec('ls ' + dir);" },
  { rule: "pipeline-default-child-process-shell-string", name: "imported execSync with a variable", fires: true, code: "import { execSync } from 'child_process';\nexecSync(cmd);" },
  { rule: "pipeline-default-child-process-shell-string", name: "spawn with shell true", fires: true, code: "const cp = require('child_process');\ncp.spawn(cmd, args, { shell: true });" },
  { rule: "pipeline-default-child-process-shell-string", name: "execFile, a literal command and a regex exec", fires: false, code: "const cp = require('child_process');\ncp.execFile('ls', [dir]);\ncp.exec('ls -la');\n/a+/.exec(text);" },
  { rule: "pipeline-default-hardcoded-secret", name: "an AWS-shaped access key id", fires: true, code: `const id = "${AWS_KEY}";` },
  { rule: "pipeline-default-hardcoded-secret", name: "a GitHub-token-shaped value", fires: true, code: `const t = "${GH_TOKEN}";` },
  { rule: "pipeline-default-hardcoded-secret", name: "values read from the environment", fires: false, code: "const id = process.env.AWS_ACCESS_KEY_ID;" },
  { rule: "pipeline-default-hardcoded-credential-assignment", name: "a literal password", fires: true, code: `const password = "${CREDENTIAL}";` },
  { rule: "pipeline-default-hardcoded-credential-assignment", name: "an api key property", fires: true, code: `const cfg = { apiKey: "${CREDENTIAL}" };` },
  { rule: "pipeline-default-hardcoded-credential-assignment", name: "environment reads and placeholders", fires: false, code: "const password = process.env.DB_PASSWORD;\nconst apiKey = '<your-api-key>';\nconst token = '';" },
];

// C28e (ADR-0094): the per-language pack. Its ids are read from the YAML, never listed twice; the expected inventory below is the class table of
// ADR-0094 (Go has no deserialization or XXE rule, JS/TS keeps its command rule in the web/Node pack). The fixtures live in semgrep-pack-fixtures/
// as <lang>/hits.<ext> (every rule of the language fires) and <lang>/quiet.<ext> (one look-alike per class, nothing fires); they are copied into
// a temporary directory before the scan so the repository path never meets a rule's test-path exclude.
const FIXTURE_DIR = fileURLToPath(new URL("./semgrep-pack-fixtures/", import.meta.url));
const LANG_EXT = { java: "java", csharp: "cs", kotlin: "kt", python: "py", go: "go", js: "ts", php: "php", ruby: "rb" };
const PACK_CLASSES = ["sql-injection", "command-injection", "insecure-deserialization", "tls-verification-disabled", "xxe", "path-traversal", "ssrf", "weak-crypto"];
const NOT_SHIPPED = { go: ["insecure-deserialization", "xxe"], js: ["command-injection"] };
const WARNING_CLASSES = new Set(["weak-crypto"]);
const LANG_ID = /^pipeline-(java|csharp|kotlin|python|go|js|php|ruby)-(.+)$/u;
const expectedLangIds = Object.keys(LANG_EXT)
  .flatMap((lang) => PACK_CLASSES.filter((cls) => !(NOT_SHIPPED[lang] ?? []).includes(cls)).map((cls) => `pipeline-${lang}-${cls}`));

const binary = findSemgrep();
record("semgrep-default-rules.yml exists on disk", existsSync(RULES_PATH), RULES_PATH);
const rulesText = existsSync(RULES_PATH) ? readFileSync(RULES_PATH, "utf8") : "";
const langIds = [...rulesText.matchAll(/^\s*-\s+id:\s*(\S+)/gmu)].map((m) => m[1]).filter((id) => LANG_ID.test(id));
{
  const listed = new Set([...rulesText.matchAll(/^\s*-\s+id:\s*(\S+)/gmu)].map((m) => m[1]));
  record("default pack lists both original rules and every new rule id (no semgrep binary needed)", ["pipeline-default-hardcoded-private-key", "pipeline-default-dynamic-code-eval", ...NEW_RULES].every((id) => listed.has(id)), `missing: ${JSON.stringify(["pipeline-default-hardcoded-private-key", "pipeline-default-dynamic-code-eval", ...NEW_RULES].filter((id) => !listed.has(id)))}`);
  record("default pack: every new rule has at least one positive and one negative fixture", NEW_RULES.every((id) => FIXTURES.some((f) => f.rule === id && f.fires) && FIXTURES.some((f) => f.rule === id && !f.fires)), "fixture table incomplete");
  record("language pack: the YAML carries exactly the class table of ADR-0094 (no semgrep binary needed)", JSON.stringify([...langIds].sort()) === JSON.stringify([...expectedLangIds].sort()), `missing ${JSON.stringify(expectedLangIds.filter((id) => !langIds.includes(id)))}, extra ${JSON.stringify(langIds.filter((id) => !expectedLangIds.includes(id)))}`);
  const missingFixtures = Object.entries(LANG_EXT).flatMap(([lang, ext]) => [`${lang}/hits.${ext}`, `${lang}/quiet.${ext}`]).filter((rel) => !existsSync(join(FIXTURE_DIR, rel)));
  record("language pack: every language has a firing and a quiet fixture file", missingFixtures.length === 0, `missing: ${JSON.stringify(missingFixtures)}`);
}

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

  // Case 3 (C28, AC-108): the default web/Node pack. Every new rule has at least one positive and one negative fixture; all fixtures are
  // scanned in ONE semgrep spawn and read back per file. Secret-shaped values are assembled at run time, so no literal token is committed.
  const packDir = join(scratch, "pack");
  mkdirSync(packDir, { recursive: true });
  FIXTURES.forEach((fixture, index) => writeFileSync(join(packDir, `f${index}.js`), `${fixture.code}\n`));
  const packRun = spawnSync(binary, ["scan", "--json", "--config", RULES_PATH, packDir], { encoding: "utf8", env, shell: false });
  let packParsed = null;
  try { packParsed = JSON.parse(packRun.stdout ?? ""); } catch { /* asserted below */ }
  record("default pack: the whole fixture directory scans to parseable JSON with no error payload", packParsed !== null && (packParsed.errors ?? []).length === 0, `${packRun.stderr?.slice(0, 300)} ${JSON.stringify(packParsed?.errors)?.slice(0, 300)}`);
  const firedIn = (index) => new Set((packParsed?.results ?? []).filter((r) => r.path.endsWith(`f${index}.js`)).map((r) => r.check_id.split(".").pop()));
  FIXTURES.forEach((fixture, index) => {
    const fired = firedIn(index).has(fixture.rule);
    record(`default pack: ${fixture.rule} ${fixture.fires ? "fires on" : "stays quiet on"} ${fixture.name}`, fired === fixture.fires, `fired: ${JSON.stringify([...firedIn(index)])}`);
  });

  // Case 4 (C28e, ADR-0094): the per-language pack. All 16 fixture files in ONE semgrep spawn. Every rule fires in its language's hits file with the
  // severity of the class table (weak-crypto WARNING, every other class ERROR), and no language rule fires in any quiet file.
  const langDir = join(scratch, "lang");
  for (const [lang, ext] of Object.entries(LANG_EXT)) {
    mkdirSync(join(langDir, lang), { recursive: true });
    for (const kind of ["hits", "quiet"]) copyFileSync(join(FIXTURE_DIR, lang, `${kind}.${ext}`), join(langDir, lang, `${kind}.${ext}`));
  }
  const langRun = spawnSync(binary, ["scan", "--json", "--config", RULES_PATH, langDir], { encoding: "utf8", env, shell: false, maxBuffer: 64 * 1024 * 1024 });
  let langParsed = null;
  try { langParsed = JSON.parse(langRun.stdout ?? ""); } catch { /* asserted below */ }
  record("language pack: the fixture directory scans to parseable JSON with no error payload", langParsed !== null && (langParsed.errors ?? []).length === 0, `${langRun.stderr?.slice(0, 300)} ${JSON.stringify(langParsed?.errors)?.slice(0, 300)}`);
  const langResults = (langParsed?.results ?? []).map((r) => ({ rule: r.check_id.split(".").pop(), file: r.path.split(/[\\/]/u).slice(-2).join("/"), severity: r.extra?.severity }));
  for (const id of langIds) {
    const [, lang, cls] = LANG_ID.exec(id);
    const hitsFile = `${lang}/hits.${LANG_EXT[lang]}`;
    const fired = langResults.filter((r) => r.rule === id && r.file === hitsFile);
    const expectedSeverity = WARNING_CLASSES.has(cls) ? "WARNING" : "ERROR";
    record(`language pack: ${id} fires on ${hitsFile} as ${expectedSeverity}`, fired.length > 0 && fired.every((r) => r.severity === expectedSeverity), JSON.stringify(fired));
    const quiet = langResults.filter((r) => r.rule === id && r.file.endsWith(`/quiet.${LANG_EXT[lang]}`));
    record(`language pack: ${id} stays quiet on ${lang}/quiet.${LANG_EXT[lang]}`, quiet.length === 0, JSON.stringify(quiet));
  }
  const quietAny = langResults.filter((r) => LANG_ID.test(r.rule) && /\/quiet\./u.test(`/${r.file}`));
  record("language pack: no language rule fires on any quiet file", quietAny.length === 0, JSON.stringify(quietAny));

  // Case 5 (C28e): test code is excluded from the ERROR rules. The same firing fixtures under test-shaped names produce no ERROR finding of the
  // language pack. weak-crypto (WARNING, no exclude) is the positive control: it must still fire in every copy, which proves the copy was scanned
  // at all. Semgrep's own built-in ignore list already skips test/, tests/ and *_test.go entirely (measured 2026-11-12), so the copies use the
  // names only the pack's own excludes cover, and Go (whose only convention is *_test.go) is not among them.
  const exclDir = join(scratch, "excluded");
  const exclCopies = [
    ["java", "hits.java", join("src", "main", "OrderServiceTest.java")],
    ["csharp", "hits.cs", join("Orders.Tests", "OrdersControllerTests.cs")],
    ["python", "hits.py", join("app", "test_orders.py")],
    ["js", "hits.ts", join("web", "orders.spec.ts")],
    ["ruby", "hits.rb", join("spec", "orders_spec.rb")],
    ["php", "hits.php", join("app", "OrdersTest.php")],
    ["kotlin", "hits.kt", join("src", "main", "OrderServiceTest.kt")],
  ];
  for (const [lang, file, target] of exclCopies) {
    mkdirSync(dirname(join(exclDir, target)), { recursive: true });
    copyFileSync(join(FIXTURE_DIR, lang, file), join(exclDir, target));
  }
  const exclRun = spawnSync(binary, ["scan", "--json", "--config", RULES_PATH, exclDir], { encoding: "utf8", env, shell: false, maxBuffer: 64 * 1024 * 1024 });
  let exclParsed = null;
  try { exclParsed = JSON.parse(exclRun.stdout ?? ""); } catch { /* asserted below */ }
  const exclErrors = (exclParsed?.results ?? []).filter((r) => LANG_ID.test(r.check_id.split(".").pop()) && r.extra?.severity === "ERROR");
  record("language pack: test-shaped paths carry no ERROR finding of the language pack", exclParsed !== null && exclErrors.length === 0, JSON.stringify(exclErrors.map((r) => `${r.path}:${r.start?.line} ${r.check_id.split(".").pop()}`)));
  for (const [lang, , target] of exclCopies) {
    const control = (exclParsed?.results ?? []).filter((r) => r.check_id.endsWith(`pipeline-${lang}-weak-crypto`) && r.path.replaceAll("\\", "/").endsWith(target.replaceAll("\\", "/")));
    record(`language pack: ${target} was scanned (its weak-crypto WARNING fires), so its missing ERROR findings are the exclude`, control.length > 0, "the copy was not scanned at all");
  }

  // Case 6 (C28e): the excludes anchor to the scanned root, not to a directory above it. A project that itself lives under a directory named
  // tests/ keeps its blocking rules (the adapter scans the absolute root with the root as cwd, as here).
  const anchoredRoot = join(scratch, "tests", "proj");
  mkdirSync(join(anchoredRoot, "src", "main", "java"), { recursive: true });
  copyFileSync(join(FIXTURE_DIR, "java", "hits.java"), join(anchoredRoot, "src", "main", "java", "App.java"));
  const anchoredRun = spawnSync(binary, ["scan", "--json", "--config", RULES_PATH, anchoredRoot], { cwd: anchoredRoot, encoding: "utf8", env, shell: false, maxBuffer: 64 * 1024 * 1024 });
  let anchoredParsed = null;
  try { anchoredParsed = JSON.parse(anchoredRun.stdout ?? ""); } catch { /* asserted below */ }
  const anchoredErrors = (anchoredParsed?.results ?? []).filter((r) => /pipeline-java-/u.test(r.check_id) && r.extra?.severity === "ERROR");
  record("language pack: a project under a directory named tests/ keeps every Java ERROR rule", new Set(anchoredErrors.map((r) => r.check_id.split(".").pop())).size === langIds.filter((id) => id.startsWith("pipeline-java-") && !id.endsWith("weak-crypto")).length, JSON.stringify(anchoredErrors.map((r) => r.check_id.split(".").pop())));

  try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
}

const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
