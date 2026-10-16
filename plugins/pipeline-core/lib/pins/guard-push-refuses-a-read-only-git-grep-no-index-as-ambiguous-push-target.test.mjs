// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin (ALF-C-P7-02, AC-194) for backlog item
 * pipeline.guard-push-refuses-a-read-only-git-grep-no-index-as-ambiguous-push-target.
 *
 * Original defect: a read-only `git grep --no-index <pattern> -- <scratch json file>` was refused by
 * guard-push with "push target is not unambiguous". Acceptance (item Proposal): `git grep` in every
 * flag combination is non-push; a regression test carries the exact refused shape.
 *
 * Every case drives the real hooks/guard-push.mjs as a child process (the hook's own stdin contract),
 * against an ACTIVE push gate (manifest + verify evidence) so an allow is not vacuous. Fixtures live under
 * the repository's scratch/ (native Windows host fact), never the OS temp dir.
 *
 * Host limitation: no case here needs directory mode bits or directory symlinks, so none is skipped.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyEvidenceFixture } from "../verify-selection-fixture.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";

const GUARD = fileURLToPath(new URL("../../hooks/guard-push.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SCRATCH = join(REPO_ROOT, "scratch");
const REFUSAL = "push target is not unambiguous";

mkdirSync(SCRATCH, { recursive: true });
const fixtureDir = mkdtempSync(join(SCRATCH, "pin-grep-no-index-"));
after(() => rmSync(fixtureDir, { recursive: true, force: true }));

const git = (...args) => spawnSync("git", args, { cwd: fixtureDir, encoding: "utf8" });
assert.equal(git("init", "-q", "-b", "main").status, 0, "fixture git init");
{
  const controller = createGovernanceScopeController({ hostStateRoot: join(fixtureDir, ".git", "fixture-hoststate") });
  const plan = controller.planDecision({ rootDir: fixtureDir, decision: "enroll", by: "disposable-pin-fixture" });
  const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  assert.ok(active.state === "active" && active.requiresEnforcement, "fixture governance active");
}
git("config", "user.email", "goldfish@example.invalid");
git("config", "user.name", "Goldfish");
writeFileSync(join(fixtureDir, "README.md"), "fixture\n");
writeFileSync(join(fixtureDir, "probe.json"), '{"alpha":1,"beta":2}\n');
git("add", "README.md");
git("commit", "-q", "-m", "init");
const head = git("rev-parse", "HEAD").stdout.trim();
mkdirSync(join(fixtureDir, ".claude"), { recursive: true });
writeFileSync(
  join(fixtureDir, ".claude", "pipeline.yaml"),
  "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: required\n",
);
mkdirSync(join(fixtureDir, "evidence"), { recursive: true });
writeFileSync(join(fixtureDir, "evidence", "verify-latest.json"), JSON.stringify(verifyEvidenceFixture(head)));
mkdirSync(join(fixtureDir, "scratch"), { recursive: true });
writeFileSync(join(fixtureDir, "scratch", "diag.json"), '{"k":"needle"}\n');

function runGuard(command) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: fixtureDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: fixtureDir },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 15000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

function assertAllowed(command) {
  const { code, stderr } = runGuard(command);
  assert.equal(code, 0, `expected allow for: ${command} -- stderr: ${stderr.slice(0, 300)}`);
  assert.ok(!stderr.includes(REFUSAL), `refusal text leaked for: ${command}`);
  assert.equal(stderr.trim(), "", `stderr must be empty for: ${command}`);
}

function assertRefused(command) {
  const { code, stderr } = runGuard(command);
  assert.equal(code, 2, `expected block for: ${command} -- stderr: ${stderr.slice(0, 300)}`);
  assert.ok(stderr.includes(REFUSAL), `expected the ambiguous-target refusal for: ${command}`);
}

test("AC-194 control: the fixture gate is active (an ambiguous git word is refused here)", () => {
  // Without an active gate the hook exits 0 before any classification and every allow below would be vacuous.
  assertRefused("git grep needle -- README.md $( )");
});

test("AC-194 exact refused shape: git grep --no-index <pattern> -- <scratch json file> is allowed", () => {
  assertAllowed("git grep --no-index needle -- scratch/diag.json");
  assertAllowed("git grep --no-index needle -- probe.json");
});

test("AC-194 --no-index is not the discriminator: a marker-bearing pattern is classified identically with and without it", () => {
  // A quoted parenthesised pattern is the separate fail-closed marker rule (Ruling 81 option B; Ruling 157's
  // exemption was rejected), not the --no-index defect. Pin only that the flag does not change the verdict,
  // so this stays valid whichever way the marker policy is later decided.
  for (const pattern of ['"(alpha|beta)"', "'(alpha|beta)'"]) {
    const plain = runGuard(`git grep -n ${pattern} -- probe.json`).code;
    const noIndex = runGuard(`git grep --no-index -n ${pattern} -- probe.json`).code;
    assert.equal(noIndex, plain, `--no-index changed the verdict for pattern ${pattern}`);
  }
});

const FLAGS = [
  "--no-index", "-n", "--line-number", "-i", "--ignore-case", "-F", "--fixed-strings", "-E", "--extended-regexp",
  "-G", "--basic-regexp", "-P", "--perl-regexp", "-w", "--word-regexp", "-v", "--invert-match", "-c", "--count",
  "-l", "--files-with-matches", "-L", "--files-without-match",
];

for (const flag of FLAGS) {
  test(`AC-194 flag combination: git grep ${flag} <pattern> -- <path> is non-push`, () => {
    assertAllowed(`git grep ${flag} needle -- README.md`);
    assertAllowed(`git grep --no-index ${flag === "--no-index" ? "-n" : flag} needle -- scratch/diag.json`);
  });
}

test("AC-194 flag combination: several flags together and the -e/--regexp pattern forms", () => {
  assertAllowed("git grep --no-index -n -i -w needle -- scratch/diag.json");
  assertAllowed("git grep --no-index -F -c needle -- probe.json");
  assertAllowed('git grep --no-index -e "needle" -- probe.json');
  assertAllowed('git grep --no-index --regexp "needle" -- probe.json');
  assertAllowed("git grep -n needle -- README.md probe.json");
});

test("AC-194 no regression: the read-only classification does not open a hidden push", () => {
  // A push buried in the pattern's command substitution, a BRE backslash alternation (Ruling 81 option B),
  // a nested shell, and a plain push all stay refused.
  assertRefused('git grep --no-index "$(git push origin main:refs/heads/x)" -- probe.json');
  assertRefused('git grep --no-index -n -e "\\(alpha\\|beta\\)" -- probe.json');
  assertRefused("git grep --no-index needle -- probe.json $(git push origin main:refs/heads/x)");
  assertRefused('sh -c "git grep --no-index needle -- probe.json; git push origin main:refs/heads/x"');
});
