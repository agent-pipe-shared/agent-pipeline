#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-git.test.mjs — versioned test suite for the git-guard union (guard-git.mjs).
 *
 * Canon: GIT-04 / SEC-02 ("one test case per deny rule"), tooling-policy W3
 * ("je Deny-Regel existiert ein Testfall"), ADR-0013. Closes the Phase-3 review
 * finding P3-05 (evidence lived only in a review, not in the repo).
 *
 * Coverage contract:
 *   - Every UNION deny rule: at least 1 BLOCK case (exit 2) + 1 ALLOW counter-case (exit 0).
 *   - Quote-stripping (<PROJECT_A> incident A2): a commit MESSAGE that merely mentions
 *     "git push --force" is allowed.
 *   - Segment scoping ([hardened]): deny patterns never match across |, & or ;
 *     boundaries — but still fire inside a later segment.
 *   - Documented honesty gaps are asserted as ALLOW on purpose (they document the
 *     guard header's "WHAT THIS GUARD DOES NOT BLOCK" section — changing them to
 *     BLOCK requires updating the header, and vice versa).
 *   - Project guard-config (E11, config instead of fork): extra deny blocks with the
 *     "project guard-config" origin line; broken JSON exits 1 with a WARN while the
 *     union stays active; missing file is silent union-only.
 *   - Global-git-options normalization (P4-02): a recognized global option interposed
 *     between `git` and the subcommand (`-C`, `-c`, `--git-dir`, …) still blocks —
 *     one `-C` case per git-subcommand rule family, `-c`/`--git-dir` variants,
 *     multi-option, quoted-value, guard-config (AR-2), and override-interaction (AR-3)
 *     cases below.
 *
 * Run:   node plugins/pipeline-core/hooks/guard-git.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Hermetics: every spawn sets CLAUDE_PROJECT_DIR to a temp dir so a real project
 * guard-config on the machine can never leak into union expectations.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { criticalActionSha256, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { createPoApprovalIntent } from "../lib/po-approval-proof.mjs";

const GUARD = fileURLToPath(new URL("./guard-git.mjs", import.meta.url));

/**
 * Run the guard exactly like Claude Code does: tool-input JSON on stdin.
 *
 * Hermetics (P4-01): the base env is stripped of PIPELINE_GUARD_OVERRIDE before
 * spreading, so a machine/session-level arming can never leak into a case that
 * didn't ask for it. `envOverride` lets an override-mechanism case opt back into a
 * session-level arming deliberately (AC-1 env-fallback path).
 */
function runGuard(command, projectDir, envOverride = {}) {
  const { PIPELINE_GUARD_OVERRIDE: _dropInherited, ...baseEnv } = process.env;
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
    cwd: projectDir,
    env: { ...baseEnv, CLAUDE_PROJECT_DIR: projectDir, ...envOverride },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

// Hermetic default project dir (no guard-config → pure union).
const EMPTY_DIR = mkdtempSync(join(tmpdir(), "guard-test-empty-"));

let pass = 0;
const failures = [];
function check(id, command, expectExit, { projectDir = EMPTY_DIR, stderrIncludes, stderrEmpty, env = {} } = {}) {
  const { code, stderr } = runGuard(command, projectDir, env);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit})`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 120)}`);
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")} — cmd: ${command}`);
    console.log(`FAIL  ${id} — ${problems.join("; ")}`);
  }
}
function checkLedger(id, projectDir, predicate) {
  let entry = null;
  let problem = null;
  try {
    const lines = readFileSync(join(projectDir, ".claude", "guard-override.log.jsonl"), "utf8").trim().split("\n");
    entry = JSON.parse(lines.at(-1));
    if (!predicate(entry)) problem = "ledger entry did not satisfy its target-binding contract";
  } catch {
    problem = "ledger entry could not be read";
  }
  if (problem === null) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problem}`);
    console.log(`FAIL  ${id} — ${problem}`);
  }
}
function checkNoLedgerToken(id, projectDir, rule, token) {
  let problem = null;
  try {
    const entries = readFileSync(join(projectDir, ".claude", "guard-override.log.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
    if (entries.some((entry) => entry?.rule === rule && entry?.token === token)) {
      problem = "rejected cross-target selector was recorded in the coordinator ledger";
    }
  } catch (error) {
    problem = `ledger could not be read (${error.message})`;
  }
  if (problem === null) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problem}`);
    console.log(`FAIL  ${id} — ${problem}`);
  }
}
const BLOCK = 2, ALLOW = 0, WARN = 1;

// ---- Rule 1: force-push (common core) ------------------------------------------------
check("R01 block  --force", "git push --force origin main", BLOCK);
check("R01 block  -f", "git push -f origin main", BLOCK);
check("R01 block  --force-with-lease", "git push --force-with-lease origin main", BLOCK);
check("R01 allow  plain push", "git push origin main", ALLOW);
check("R01 allow  push -u feature", "git push -u origin feature/login", ALLOW);

// ---- Rule 2: +refspec hidden force-push (<PROJECT_A>+<PROJECT_C>) -----------------------------
check("R02 block  +refspec", "git push origin +feature/login", BLOCK);
check("R02 allow  same refspec without +", "git push origin feature/login", ALLOW);

// ---- Rule 3: remote deletion/overwrite of main|master (core; -d <PROJECT_B>; master <PROJECT_B>+<PROJECT_C>) -
check("R03 block  --delete main", "git push origin --delete main", BLOCK);
check("R03 block  -d master", "git push origin -d master", BLOCK);
check("R03 block  :main refspec", "git push origin :main", BLOCK);
check("R03 block  dev:main overwrite", "git push origin dev:main", BLOCK);
check("R03 allow  --delete feature branch", "git push origin --delete feature/old-login", ALLOW);
check("R03 allow  dev:staging refspec", "git push origin dev:staging", ALLOW);

// ---- Rule 4: remote archive/ tag deletion (<PROJECT_A>) -----------------------------------
check("R04 block  --delete archive tag", "git push origin --delete archive/2024-05-block7", BLOCK);
check("R04 block  bare :archive refspec", "git push origin :archive/2024-05-block7", BLOCK);
check("R04 allow  pushing an archive tag", "git push origin archive/2026-07-block1", ALLOW);

// ---- Rule 5: local archive/ tag deletion (<PROJECT_A>) -------------------------------------
check("R05 block  tag -d archive/", "git tag -d archive/2024-05-block7", BLOCK);
check("R05 allow  tag -d other tag", "git tag -d tmp-release-check", ALLOW);

// ---- Rule 6: local main/master branch deletion (<PROJECT_B>+<PROJECT_C>) -----------------------------
check("R06 block  branch -D main", "git branch -D main", BLOCK);
check("R06 block  branch --delete master", "git branch --delete master", BLOCK);
check("R06 allow  branch -d feature", "git branch -d feature/cleanup", ALLOW);
check("R06 block  branch -delete main (inert word form, GG-06)", "git branch -delete main", BLOCK);
check("R06 allow  branch -delete feature", "git branch -delete feature/cleanup", ALLOW);

// ---- Rule 7: reset --hard (common core; [hardened] flags in between) --------------------
check("R07 block  reset --hard", "git reset --hard HEAD~1", BLOCK);
check("R07 block  reset -q --hard (hardened)", "git reset -q --hard origin/main", BLOCK);
check("R07 allow  reset --soft", "git reset --soft HEAD~1", ALLOW);
check("R07 allow  unstage file", "git reset HEAD README.md", ALLOW);

// ---- Rule 8: clean with force flag (common core) ----------------------------------------
check("R08 block  clean -fd", "git clean -fd", BLOCK);
check("R08 block  clean --force (long flag)", "git clean --force", BLOCK);
check("R08 allow  clean dry-run", "git clean -n", ALLOW);

// ---- Rule 9: blanket discard with -- (<PROJECT_B> + <PROJECT_C> restore) -------------------------------
check("R09 block  checkout -- .", "git checkout -- .", BLOCK);
check("R09 block  restore -- *", "git restore -- *", BLOCK);
check("R09 allow  checkout -- single file", "git checkout -- src/app.js", ALLOW);

// ---- Rule 10: bare checkout/restore dot (<PROJECT_C> + <PROJECT_B>) -------------------------------------
check("R10 block  bare checkout .", "git checkout .", BLOCK);
check("R10 block  bare restore .", "git restore .", BLOCK);
check("R10 allow  checkout branch", "git checkout main", ALLOW);
check("R10 allow  restore single file", "git restore src/app.js", ALLOW);
check("R10 allow  checkout ./subpath (anchor)", "git checkout ./src", ALLOW);

// ---- Rule 21: destructive branch adoption -------------------------------------------------
check("R21 block  checkout --force branch", "git checkout --force origin/feat/remote-adoption", BLOCK, { stderrIncludes: ["GG-21"] });
check("R21 block  switch -f branch", "git switch -f origin/feat/remote-adoption", BLOCK, { stderrIncludes: ["GG-21"] });
check("R21 allow  ordinary fetch", "git fetch origin refs/heads/main:refs/remotes/origin/main", ALLOW);

// ---- Rule 11: secret/state staging block (.env all three; secrets.yaml <PROJECT_B>; <PROJECT_C> SSH keys) ----------
check("R11 block  add .env", "git add .env", BLOCK);
check("R11 block  add .env.production", "git add .env.production", BLOCK);
check("R11 block  add secrets.yaml", "git add config/secrets.yaml", BLOCK);
check("R11 allow  add fakesecrets.yaml (unrelated file matched only by substring before the GG-11 fix)", "git add homeassistant/fakesecrets.yaml", ALLOW);
check("R11 allow  add .storage (project-specific entry removed from the generic denylist)", "git add .storage", ALLOW);
check("R11 allow  add app-state.db (project-specific entry removed from the generic denylist)", "git add app-state.db", ALLOW);
check("R11 block  add id_rsa", "git add id_rsa", BLOCK);
check("R11 block  add id_ed25519", "git add .ssh/id_ed25519", BLOCK);
check("R11 block  add .pem", "git add certs/server.pem", BLOCK);
check("R11 block  add .key", "git add certs/private.key", BLOCK);
check("R11 allow  add normal files", "git add README.md src/app.js", ALLOW);
check("R11 block  add .env.example (documented errs-safe overblock)", "git add .env.example", BLOCK);

// ---- Rule 12: recursive rm on .git / /config (<PROJECT_B> + <PROJECT_C>) ---------------------------------
check("R12 block  rm -rf .git", "rm -rf .git", BLOCK);
check("R12 block  rm .git -rf (flag after path)", "rm .git -rf", BLOCK);
check("R12 block  rm -rf /config", "rm -rf /config", BLOCK);
check("R12 allow  rm -rf build/config (path-start anchor)", "rm -rf build/config", ALLOW);
check("R12 allow  rm -rf node_modules", "rm -rf node_modules", ALLOW);
check("R12 allow  rm -rf .github (word boundary)", "rm -rf .github/workflows", ALLOW);

// ---- Rule 12 (cont'd): GNU long-form hardening (AP sprint 2026-07-04, <PROJECT_B>-M3-C F1) -----------
check("R12 block  rm --recursive .git (long form)", "rm --recursive .git", BLOCK);
check("R12 block  rm --recursive --force app/.git (long forms combined)", "rm --recursive --force app/.git", BLOCK);
check("R12 block  rm /config --recursive (target-first, long form)", "rm /config --recursive", BLOCK);
check("R12 allow  rm --recursive node_modules (long form, harmless target)", "rm --recursive node_modules", ALLOW);

// ---- Rule 13: recursive Remove-Item on .git/.storage/secrets.yaml (<PROJECT_B> + <PROJECT_C>) -------------
check("R13 block  Remove-Item -Recurse .git", "Remove-Item -Recurse -Force .git", BLOCK);
check("R13 block  Remove-Item target-first -r", "Remove-Item .storage -r", BLOCK);
check("R13 block  Remove-Item secrets.yaml -Recurse", "Remove-Item secrets.yaml -Recurse", BLOCK);
check("R13 allow  Remove-Item -Recurse other dir", "Remove-Item -Recurse node_modules", ALLOW);

// ---- Rule 13 (cont'd): abbreviation hardening (AP-P1-G1 rework R1, 2026-07-04, <PROJECT_B>-M3-C F1) ---
// "block Remove-Item -rec .git" is covered by the converted case just below (was "GAP allow",
// now "R13 block ... (AP-P1-G1 rework R1)") — not duplicated here.
check("R13 block  Remove-Item .storage -recu -Force (abbreviation)", "Remove-Item .storage -recu -Force", BLOCK);
check("R13 allow  Remove-Item -recu temp (abbreviation, harmless target)", "Remove-Item -recu temp", ALLOW);

// ---- Documented honesty gaps (guard header "does not block" — asserted deliberately) --------
// GG-13 abbreviation gap CLOSED (AP-P1-G1 rework R1, 2026-07-04) — was "GAP allow" (ALLOW); the
// hardened abbreviation lookahead now blocks it. Converted under explicit Elephant authorization
// (E5 exception — this case codified a documented gap, not a protection contract).
check("R13 block  Remove-Item -rec abbreviation now covered (AP-P1-G1 rework R1)", "Remove-Item -rec .git", BLOCK);
check("GAP allow  non-recursive secret deletion (parity gap)", "rm secrets.yaml", ALLOW);

// ---- Quote-stripping (<PROJECT_A> incident, review case A2) --------------------------------------
check("QS  allow  commit message mentions git push --force", 'git commit -m "docs: explain why git push --force is blocked"', ALLOW);
check("QS  allow  single-quoted mention of reset --hard", "git commit -m 'chore: never run git reset --hard here'", ALLOW);
check("QS  block  force flag OUTSIDE quotes still fires", 'git push --force origin main -m "harmless text"', BLOCK);

// ---- Segment scoping (hardened [^|&;]* instead of .*) -----------------------------------------
check("SEG allow  flag in later segment does not bleed back", "git push origin main; echo --force", ALLOW);
check("SEG allow  chained with && (no cross-segment match)", "git fetch && echo not --force at all", ALLOW);
check("SEG block  deny still fires inside a later segment", "git fetch; git reset --hard HEAD", BLOCK);

// ---- Config case 1: extra deny from project guard-config blocks, with origin line -------------
const CFG_DIR = mkdtempSync(join(tmpdir(), "guard-test-cfg-"));
mkdirSync(join(CFG_DIR, ".claude"), { recursive: true });
writeFileSync(
  join(CFG_DIR, ".claude", "guard-config.json"),
  JSON.stringify({
    extraDenyPatterns: [
      { pattern: "\\brm\\s+-[a-z]*rf?[a-z]*\\b[^|&;]*acme", reason: "rm -rf on the acme repo folder is blocked." },
    ],
  }),
);
check("CFG block  extraDenyPattern fires with origin line", "rm -rf acme/", BLOCK, {
  projectDir: CFG_DIR,
  stderrIncludes: ["project guard-config", "acme repo folder"],
});
check("CFG allow  harmless command with valid config", "git status", ALLOW, { projectDir: CFG_DIR, stderrEmpty: true });

// ---- Config case 2: broken JSON → exit 1 WARN, union stays active ------------------------------
const BROKEN_DIR = mkdtempSync(join(tmpdir(), "guard-test-broken-"));
mkdirSync(join(BROKEN_DIR, ".claude"), { recursive: true });
writeFileSync(join(BROKEN_DIR, ".claude", "guard-config.json"), '{ "extraDenyPatterns": [ THIS IS NOT JSON');
check("CFG warn   broken JSON surfaces as exit 1 WARN", "git status", WARN, {
  projectDir: BROKEN_DIR,
  stderrIncludes: ["WARN", "unparseable JSON"],
});
check("CFG block  union still active despite broken config", "git push --force origin main", BLOCK, {
  projectDir: BROKEN_DIR,
});

// ---- Config case 3: missing file → silent, union only ------------------------------------------
check("CFG allow  missing config is silent (no warning)", "git status", ALLOW, {
  projectDir: EMPTY_DIR,
  stderrEmpty: true,
});
check("CFG block  union active without any config", "git add secrets.yaml", BLOCK, { projectDir: EMPTY_DIR });

// ---- P4-01: guard override mechanism (double-confirmation, one-time) --------------------------
// Ledger-bearing dir: .claude/ pre-created so appendFileSync into guard-override.log.jsonl succeeds.
const OV_DIR = mkdtempSync(join(tmpdir(), "guard-test-override-"));
mkdirSync(join(OV_DIR, ".claude"), { recursive: true });
mkdirSync(join(OV_DIR, "nested-target"), { recursive: true });
const OV_ABSOLUTE_TARGET = mkdtempSync(join(tmpdir(), "guard-test-override-absolute-target-"));
// Deliberately WITHOUT .claude/ — simulates an unwritable/missing ledger directory (AC-5).
const OV_NOLEDGER_DIR = mkdtempSync(join(tmpdir(), "guard-test-override-noledger-"));

// AC-1: valid override (inline prefix) for the matching rule -> allow via the guard's existing
// "exit 1 = allow + loud non-blocking notice" semantics (spec AC-1: "exit 1"), ledgered.
check(
  "OV-AC1 warn   valid inline override for the matching rule (GG-07 reset --hard) allows (exit 1)",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-1|hotfix needs a hard reset, the PO approved' git reset --hard HEAD~1",
  WARN,
  {
    projectDir: OV_DIR,
    stderrIncludes: ["GG-07", "20260704-1", "hotfix needs a hard reset, the PO approved", "OVERRIDE APPLIED"],
  },
);

// AC-1: valid override via the process.env fallback (no inline prefix) -> same allow contract.
check(
  "OV-AC1 warn   valid env-fallback override for the matching rule (fresh token) allows (exit 1)",
  "git reset --hard HEAD~1",
  WARN,
  {
    projectDir: OV_DIR,
    env: { PIPELINE_GUARD_OVERRIDE: "GG-07|20260704-2|env fallback arming set by the PO" },
    stderrIncludes: ["GG-07", "20260704-2", "OVERRIDE APPLIED"],
  },
);

// AC-2: the SAME rule|token pair presented again after consumption -> blocked, names the reuse.
check(
  "OV-AC2 block  reusing an already-consumed rule|token pair",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-1|trying to reuse the same token' git reset --hard HEAD~1",
  BLOCK,
  { projectDir: OV_DIR, stderrIncludes: ["GG-07", "already consumed"] },
);

// AC-3: malformed override (empty reason segment) on a matching command -> still blocks (exit 2),
// with an explicit "override malformed" warning alongside the normal block.
check(
  "OV-AC3 block  malformed override (empty reason) — matching rule still blocks",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-3|' git reset --hard HEAD~1",
  BLOCK,
  { projectDir: OV_DIR, stderrIncludes: ["GG-07", "override malformed"] },
);

// AC-3: malformed override (rule id unknown to union+config) on a harmless command -> nothing to
// block, but the malformed arming must not pass silently: exit 1 warning.
check(
  "OV-AC3 warn   malformed override (unknown rule id), no rule matches -> exit-1 warning only",
  "PIPELINE_GUARD_OVERRIDE='GG-99|20260704-4|rule id does not exist' git status",
  WARN,
  { projectDir: OV_DIR, stderrIncludes: ["override malformed"] },
);

// AC-4: override armed for GG-07 but the command ALSO matches a different rule (GG-01, chained via
// `;`) -> blocks via GG-01, and consumes/ledgers nothing (proven by the follow-up case below).
check(
  "OV-AC4 block  override armed for GG-07 does not cover an additional matching rule (GG-01)",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-5|only meant to cover the reset' git reset --hard HEAD~1; git push --force origin main",
  BLOCK,
  { projectDir: OV_DIR, stderrIncludes: ["GG-01"] },
);
check(
  "OV-AC4 warn   same rule|token still fresh afterward (AC-4 attempt consumed nothing), allows (exit 1)",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-5|only meant to cover the reset' git reset --hard HEAD~1",
  WARN,
  { projectDir: OV_DIR, stderrIncludes: ["GG-07", "20260704-5", "OVERRIDE APPLIED"] },
);

// AC-5: ledger cannot be appended (.claude/ missing) -> override NOT applied, fail-closed block.
check(
  "OV-AC5 block  ledger not appendable (.claude missing) -> override not applied, fail-closed",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-6|reset needed for rollback' git reset --hard HEAD~1",
  BLOCK,
  { projectDir: OV_NOLEDGER_DIR, stderrIncludes: ["GG-07", "ledger"] },
);

// AC-6: with no arming present at all, behavior is exactly as before this change (the 71
// pre-existing cases already assert this throughout and remain textually untouched).
check("OV-AC6 block  no arming present -> unchanged block behavior", "git push --force origin main", BLOCK, {
  projectDir: OV_DIR,
  stderrIncludes: ["GG-01"],
});
check("OV-AC6 allow  no arming present -> unchanged allow behavior", "git push origin main", ALLOW, {
  projectDir: OV_DIR,
});

// AC-7: the stable rule id is printed in every block message — union rule and project
// guard-config rule alike.
check("OV-AC7 block  union rule prints its stable id", "git branch -D main", BLOCK, {
  projectDir: OV_DIR,
  stderrIncludes: ["GG-06"],
});
check("OV-AC7 block  project guard-config rule prints its PX id", "rm -rf acme/", BLOCK, {
  projectDir: CFG_DIR,
  stderrIncludes: ["PX-1"],
});

// Bonus (spec §2, both shell forms): PowerShell arming syntax parses and applies identically.
check(
  "OV-bonus warn   PowerShell arming form parses and applies, allows (exit 1)",
  "$env:PIPELINE_GUARD_OVERRIDE='GG-01|20260704-9|deploy hotfix approved by the PO'; git push --force origin main",
  WARN,
  { projectDir: OV_DIR, stderrIncludes: ["GG-01", "20260704-9", "OVERRIDE APPLIED"] },
);

// Bonus (spec §2, arming precedence): inline prefix wins over a simultaneously-armed env var;
// the ignored env arming is noted on stderr.
check(
  "OV-bonus warn   inline prefix wins over a conflicting env arming (env ignored, noted), allows (exit 1)",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-7|inline should win' git reset --hard HEAD~1",
  WARN,
  {
    projectDir: OV_DIR,
    env: { PIPELINE_GUARD_OVERRIDE: "GG-01|20260704-8|env value should be ignored" },
    stderrIncludes: ["GG-07", "20260704-7", "ignored"],
  },
);

// ---- P4-02: global-git-options bypass normalization (`git -C ...` etc.) -----------------------
// AR-1: a recognized global git option interposed between `git` and the subcommand normalizes
// away before matching. One `-C`-interposed block case per git-subcommand rule family
// (GG-01...GG-11 only — GG-12/13 are rm/Remove-Item, no git-option surface).
check("GO-GG01 block  -C interposed force-push", "git -C sub push --force origin main", BLOCK, {
  stderrIncludes: ["GG-01"],
});
check("GO-GG02 block  -C interposed +refspec", "git -C sub push origin +feature/login", BLOCK, {
  stderrIncludes: ["GG-02"],
});
check("GO-GG03 block  -C interposed remote main delete", "git -C sub push origin --delete main", BLOCK, {
  stderrIncludes: ["GG-03"],
});
check(
  "GO-GG04 block  -C interposed remote archive tag delete",
  "git -C sub push origin --delete archive/2024-05-block7",
  BLOCK,
  { stderrIncludes: ["GG-04"] },
);
check(
  "GO-GG05 block  -C interposed local archive tag delete",
  "git -C sub tag -d archive/2024-05-block7",
  BLOCK,
  { stderrIncludes: ["GG-05"] },
);
check("GO-GG06 block  -C interposed local main branch delete", "git -C sub branch -D main", BLOCK, {
  stderrIncludes: ["GG-06"],
});
check("GO-GG07 block  -C interposed reset --hard", "git -C sub reset --hard HEAD~1", BLOCK, {
  stderrIncludes: ["GG-07"],
});
check("GO-GG08 block  -C interposed clean -fd", "git -C sub clean -fd", BLOCK, { stderrIncludes: ["GG-08"] });
check("GO-GG09 block  -C interposed blanket discard --", "git -C sub checkout -- .", BLOCK, {
  stderrIncludes: ["GG-09"],
});
check("GO-GG10 block  -C interposed bare checkout .", "git -C sub checkout .", BLOCK, {
  stderrIncludes: ["GG-10"],
});
check("GO-GG11 block  -C interposed secret staging", "git -C sub add secrets.yaml", BLOCK, {
  stderrIncludes: ["GG-11"],
});

// -c / --git-dir variants (at least push, reset, add).
check(
  "GO-push -c   -c interposed force-push",
  "git -c http.sslVerify=false push --force origin main",
  BLOCK,
  { stderrIncludes: ["GG-01"] },
);
check(
  "GO-push --git-dir  --git-dir= interposed force-push",
  "git --git-dir=/tmp/x.git push --force origin main",
  BLOCK,
  { stderrIncludes: ["GG-01"] },
);
check("GO-reset -c   -c interposed reset --hard", "git -c core.editor=vim reset --hard HEAD~1", BLOCK, {
  stderrIncludes: ["GG-07"],
});
check(
  "GO-reset --git-dir  --git-dir <arg> (space form) interposed reset --hard",
  "git --git-dir /tmp/x.git reset --hard HEAD~1",
  BLOCK,
  { stderrIncludes: ["GG-07"] },
);
check("GO-add -c   -c interposed secret staging", "git -c core.autocrlf=false add secrets.yaml", BLOCK, {
  stderrIncludes: ["GG-11"],
});
check(
  "GO-add --git-dir  --git-dir= interposed secret staging",
  "git --git-dir=/tmp/x.git add secrets.yaml",
  BLOCK,
  { stderrIncludes: ["GG-11"] },
);

// Multi-option case: several recognized global options stacked before the subcommand.
check(
  "GO-multi block  -C + -c combined before push --force",
  "git -C sub -c a=b push --force origin main",
  BLOCK,
  { stderrIncludes: ["GG-01"] },
);

// Quoted-value case: pins the interaction between quote-stripping (runs first) and
// global-option normalization (runs second) — a quoted `-c` config value must not
// shield the subcommand from matching.
check(
  "GO-quote block  -c with quoted value before push --force (quote-stripping interaction)",
  'git -c core.editor="vim" push --force origin main',
  BLOCK,
  { stderrIncludes: ["GG-01"] },
);

// Allow counter-cases: a recognized global option on an otherwise harmless command stays allowed.
check("GO-allow  -C interposed harmless status", "git -C sub status", ALLOW);
check("GO-allow  -c interposed harmless commit", 'git -c user.name=x commit -m "chore: msg"', ALLOW);

// AR-2: the same normalization feeds guard-config extraDenyPatterns matching.
const CFG_GITOPT_DIR = mkdtempSync(join(tmpdir(), "guard-test-cfg-gitopt-"));
mkdirSync(join(CFG_GITOPT_DIR, ".claude"), { recursive: true });
writeFileSync(
  join(CFG_GITOPT_DIR, ".claude", "guard-config.json"),
  JSON.stringify({
    extraDenyPatterns: [
      {
        pattern: "\\bgit\\s+push\\b[^|&;]*--delete\\s+custom-protected\\b",
        reason: "custom-protected is a project-protected branch.",
      },
    ],
  }),
);
check(
  "GO-CFG block  extraDenyPattern normalizes -C before matching (AR-2)",
  "git -C sub push origin --delete custom-protected",
  BLOCK,
  { projectDir: CFG_GITOPT_DIR, stderrIncludes: ["project guard-config", "custom-protected"] },
);
check("GO-CFG allow  -C interposed harmless command with the same config loaded", "git -C sub status", ALLOW, {
  projectDir: CFG_GITOPT_DIR,
  stderrEmpty: true,
});

// CYB-5c: an override may not consume a coordinator ledger through another -C target.
check(
  "GO-OV block  override armed for GG-07 rejects a cross-target -C command",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-10|override through -C interposition, the PO approved' git -C sub reset --hard HEAD~1",
  BLOCK,
  { projectDir: OV_DIR, stderrIncludes: ["GG-07", "command target and ledger target"] },
);
check(
  "GO-OV warn   override accepts an explicit same-root relative -C target",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-12|same physical target, the PO approved' git -C . reset --hard HEAD~1",
  WARN,
  { projectDir: OV_DIR, stderrIncludes: ["GG-07", "OVERRIDE APPLIED"] },
);
checkLedger(
  "GO-OV ledger target binding stores only an opaque physical-target digest",
  OV_DIR,
  (entry) => entry.targetSha256 === createHash("sha256").update(OV_DIR).digest("hex")
    && !Object.values(entry).some((value) => typeof value === "string" && value.includes(OV_ABSOLUTE_TARGET)),
);
check(
  "GO-OV block  override rejects a relative cross-target -C target",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-13|relative cross target, the PO approved' git -C nested-target reset --hard HEAD~1",
  BLOCK,
  { projectDir: OV_DIR, stderrIncludes: ["GG-07", "command target and ledger target"] },
);
check(
  "GO-OV block  override rejects an absolute cross-target -C target",
  `PIPELINE_GUARD_OVERRIDE='GG-07|20260704-14|absolute cross target, the PO approved' git -C ${OV_ABSOLUTE_TARGET} reset --hard HEAD~1`,
  BLOCK,
  { projectDir: OV_DIR, stderrIncludes: ["GG-07", "command target and ledger target"] },
);
// Target selectors that cannot be physically proven to be the coordinator root
// must fail closed. A rejected selector never consumes or records its token,
// proved by the ordinary same-token retry immediately after each rejection.
for (const [label, selector, token] of [
  ["--git-dir=", `--git-dir=${OV_ABSOLUTE_TARGET}`, "20260704-15"],
  ["--git-dir space", `--git-dir ${OV_ABSOLUTE_TARGET}`, "20260704-16"],
  ["--work-tree=", `--work-tree=${OV_ABSOLUTE_TARGET}`, "20260704-17"],
  ["--work-tree space", `--work-tree ${OV_ABSOLUTE_TARGET}`, "20260704-18"],
]) {
  check(
    `GO-OV block  override rejects a cross-target ${label} selector`,
    `PIPELINE_GUARD_OVERRIDE='GG-07|${token}|selector target is intentionally separate' git ${selector} reset --hard HEAD~1`,
    BLOCK,
    { projectDir: OV_DIR, stderrIncludes: ["GG-07", "command target and ledger target"] },
  );
  checkNoLedgerToken(`GO-OV ledger ${label} rejection records no coordinator token`, OV_DIR, "GG-07", token);
  check(
    `GO-OV warn   ${label} rejection leaves token unconsumed`,
    `PIPELINE_GUARD_OVERRIDE='GG-07|${token}|ordinary same-root reset is intentionally approved' git reset --hard HEAD~1`,
    WARN,
    { projectDir: OV_DIR, stderrIncludes: ["GG-07", token, "OVERRIDE APPLIED"] },
  );
}
for (const [label, assignment, token] of [
  ["GIT_DIR environment", `GIT_DIR=${OV_ABSOLUTE_TARGET}`, "20260704-19"],
  ["GIT_WORK_TREE environment", `GIT_WORK_TREE=${OV_ABSOLUTE_TARGET}`, "20260704-20"],
  ["PowerShell GIT_DIR environment", `$env:GIT_DIR = '${OV_ABSOLUTE_TARGET}'`, "20260704-21"],
  ["PowerShell GIT_WORK_TREE environment", `$env:GIT_WORK_TREE = '${OV_ABSOLUTE_TARGET}'`, "20260704-22"],
]) {
  check(
    `GO-OV block  override rejects a cross-target ${label} selector`,
    label.startsWith("PowerShell")
      ? `$env:PIPELINE_GUARD_OVERRIDE = 'GG-07|${token}|environment target is intentionally separate'; ${assignment}; git reset --hard HEAD~1`
      : `PIPELINE_GUARD_OVERRIDE='GG-07|${token}|environment target is intentionally separate' ${assignment} git reset --hard HEAD~1`,
    BLOCK,
    { projectDir: OV_DIR, stderrIncludes: ["GG-07", "command target and ledger target"] },
  );
  checkNoLedgerToken(`GO-OV ledger ${label} rejection records no coordinator token`, OV_DIR, "GG-07", token);
  check(
    `GO-OV warn   ${label} rejection leaves token unconsumed`,
    label.startsWith("PowerShell")
      ? `$env:PIPELINE_GUARD_OVERRIDE = 'GG-07|${token}|ordinary same-root reset is intentionally approved'; git reset --hard HEAD~1`
      : `PIPELINE_GUARD_OVERRIDE='GG-07|${token}|ordinary same-root reset is intentionally approved' git reset --hard HEAD~1`,
    WARN,
    { projectDir: OV_DIR, stderrIncludes: ["GG-07", token, "OVERRIDE APPLIED"] },
  );
}

// ---- Rule 14: interpreter/remote wrapper with quoted destructive payload (raw-string rule,
// <PROJECT_B>-M4-C F1, AP sprint 2026-07-04) -----------------------------------------------------------
// Matched on the RAW (non-quote-stripped) command — a deliberate, narrow exception to the
// QUOTE-STRIPPING invariant (QS section above), which otherwise remains the general trade-off.
check("R14 block  ssh with quoted rm -rf /config", 'ssh prod-host "rm -rf /config"', BLOCK);
check("R14 block  bash -c with quoted git reset --hard", 'bash -c "git reset --hard"', BLOCK);
check("R14 block  pwsh -Command with quoted git push --force", 'pwsh -Command "git push --force origin main"', BLOCK);
check(
  "R14 allow  commit message mentions bash -c (prose, no wrapper)",
  'git commit -m "docs: bash -c usage explained"',
  ALLOW,
);
check("R14 allow  echo mentions rm -rf /config (no wrapper)", 'echo "rm -rf /config is blocked"', ALLOW);
check("R14 allow  ssh with quoted harmless command", 'ssh prod-host "ls -la /config"', ALLOW);

// ---- Rule 15: git add with quoted protected target (raw-string rule, <PROJECT_B>-M4-C F1) -------------
check("R15 block  git add quoted secrets.yaml", 'git add "secrets.yaml"', BLOCK);
check("R15 block  git add single-quoted .env", "git add '.env'", BLOCK);
check(
  "R15 allow  commit message mentions git add secrets.yaml (prose, no inner quotes)",
  'git commit -m "docs: why git add secrets.yaml is blocked"',
  ALLOW,
);

// ---- Rule 16: recursive rm/Remove-Item with quoted protected target (raw-string rule,
// <PROJECT_B>-M4-C F1) ------------------------------------------------------------------------------------
check("R16 block  rm -rf quoted .git", 'rm -rf ".git"', BLOCK);
check("R16 block  Remove-Item -Recurse quoted .storage", 'Remove-Item -Recurse ".storage"', BLOCK);
check("R16 allow  rm -rf quoted harmless target", 'rm -rf "build"', ALLOW);

// ---- Raw-string rules x override mechanism interaction (GG-14/15/16, AP sprint 2026-07-04) ----
// A valid override for GG-15 (matched via the raw-string path) allows exactly like a union-rule
// override — reuses the OV_DIR ledger from the P4-01 cases above, fresh token.
check(
  "RAW-OV warn   valid inline override for a raw-string rule (GG-15 quoted git add) allows (exit 1)",
  "PIPELINE_GUARD_OVERRIDE='GG-15|20260704-11|fresh token, the PO approved, secrets.yaml add is intentional' git add \"secrets.yaml\"",
  WARN,
  { projectDir: OV_DIR, stderrIncludes: ["GG-15", "20260704-11", "OVERRIDE APPLIED"] },
);
// Arming-REASON immunity: parseInlineArming's `remainder` excludes the arming prefix (rule|token|
// reason) from what RAW_BLOCKERS see — a reason text that itself mentions a destructive raw
// pattern must never trip a raw-string rule on its own, on an otherwise harmless command.
check(
  "RAW-OV allow  arming reason mentioning `rm -rf /config` does not trip GG-14/16 on a harmless command",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-12|context mentions rm -rf /config' git status",
  ALLOW,
  { stderrEmpty: true },
);

// ---- Rule 17: --no-verify, any subcommand (hook-bypass enforcement,
// 2026-07-09) --- no subcommand adjacency required, immune to unrecognized-global-option
// breaks. ---------------------------------------------------------------------------------------
check("R17 block  commit --no-verify", "git commit --no-verify", BLOCK, { stderrIncludes: ["GG-17"] });
check("R17 block  push --no-verify", "git push --no-verify", BLOCK, { stderrIncludes: ["GG-17"] });
check("R17 block  merge --no-verify", "git merge --no-verify", BLOCK, { stderrIncludes: ["GG-17"] });
check(
  "R17 allow  merge --no-verify-signatures (real flag, NOT a hook-skip)",
  "git merge --no-verify-signatures",
  ALLOW,
);
check(
  "R17 allow  commit message quotes --no-verify (prose, no actual flag)",
  'git commit -m "chore: avoid --no-verify"',
  ALLOW,
);

// ---- Rule 18: `git commit -n` short flag (hook-bypass enforcement, 2026-07-09) --- scoped to
// `git commit` so `push -n` (=--dry-run) and `merge -n` (=--no-stat) are NOT hook-skips and stay
// allowed. -------------------------------------------------------------------------------------
check("R18 block  commit -n", "git commit -n", BLOCK, { stderrIncludes: ["GG-18"] });
check("R18 block  commit -nm (bundled)", 'git commit -nm "x"', BLOCK, { stderrIncludes: ["GG-18"] });
check("R18 block  commit -an (bundled, n at end)", "git commit -an", BLOCK, { stderrIncludes: ["GG-18"] });
check("R18 allow  push -n origin main (=--dry-run, not a hook-skip)", "git push -n origin main", ALLOW);
check("R18 allow  push --dry-run", "git push --dry-run", ALLOW);
check("R18 allow  merge -n (=--no-stat, not a hook-skip)", "git merge -n", ALLOW);
check("R18 allow  commit --no-edit (long flag, double-dash excluded)", "git commit --no-edit", ALLOW);
check("R18 allow  commit -m normal message", 'git commit -m "chore: normal message"', ALLOW);

// ---- Rule 19: -c / --config-env core.hooksPath transient rebind (hook-bypass enforcement,
// 2026-07-09) --- the ONLY rule matched against the pre-normalization bucket `c` (PRENORM_BLOCKERS);
// see that array's header comment in guard-git.mjs for why UNION_BLOCKERS/RAW_BLOCKERS are both
// wrong here. ------------------------------------------------------------------------------------
check(
  "R19 block  -c core.hooksPath=/dev/null commit",
  "git -c core.hooksPath=/dev/null commit",
  BLOCK,
  { stderrIncludes: ["GG-19"] },
);
check("R19 block  -c core.hooksPath commit (no value, boolean true)", "git -c core.hooksPath commit", BLOCK, {
  stderrIncludes: ["GG-19"],
});
check(
  "R19 block  --config-env=core.hooksPath=X commit",
  "git --config-env=core.hooksPath=X commit",
  BLOCK,
  { stderrIncludes: ["GG-19"] },
);
check(
  "R19 allow  commit message quotes core.hooksPath (prose, no actual -c)",
  'git commit -m "chore: set core.hooksPath here"',
  ALLOW,
);
// Documented NOT-BLOCKED trade-off (guard header): quote-stripping empties the -c VALUE
// before GG-19 ever sees it, same as the general quote-stripping trade-off everywhere else
// in this guard --- not a gap unique to this rule.
check(
  "R19 allow  -c with quoted value (documented quote-stripping trade-off, NOT a regression)",
  'git -c "core.hooksPath=/dev/null" commit',
  ALLOW,
);
check(
  "R19 block  --config-env core.hooksPath=X commit (space form, critic L1)",
  "git --config-env core.hooksPath=X commit",
  BLOCK,
  { stderrIncludes: ["GG-19"] },
);
check("R19 allow  grep -c core.hooksPath (non-git command, git-anchored, critic L1)", "grep -c core.hooksPath README.md", ALLOW);
// ---- Rule 20: `git config [set] core.hooksPath` persistent rebind (hook-bypass enforcement,
// 2026-07-09). ------------------------------------------------------------------------------------
check("R20 block  config core.hooksPath /tmp/x", "git config core.hooksPath /tmp/x", BLOCK, {
  stderrIncludes: ["GG-20"],
});
check("R20 block  config set core.hooksPath /tmp/x (git >= 2.46 form)", "git config set core.hooksPath /tmp/x", BLOCK, {
  stderrIncludes: ["GG-20"],
});
check(
  "R20 allow  commit message quotes git config core.hooksPath (prose, no actual git config)",
  'git commit -m "chore: run git config core.hooksPath"',
  ALLOW,
);

// ---- GIT-03: correlation data in commit metadata (2026-08-06) ------------------------------------
//
// The rule is older than this suite and had no enforcement anywhere until now. What it
// costs to leave unenforced is not hypothetical: 74 commits in one session carried a
// provider co-author trailer and a session URL, and 53 were public before a human noticed.
// GIT03-1 is that message.
const GIT03_DIR = mkdtempSync(join(tmpdir(), "guard-test-git03-"));
writeFileSync(join(GIT03_DIR, "dirty.txt"),
  "feat(x): a thing\n\nAI-Assisted: true\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Fx\n");
writeFileSync(join(GIT03_DIR, "clean.txt"), "feat(x): a thing\n\nWhy it matters.\n\nAI-Assisted: true\n");
// GIT03_OUTSIDE_DIR is a sibling of the project root, the shape of an agent's own scratch
// directory -- the ordinary place a commit message gets composed, and the exact path class
// that made this rule's "no override" claim untrue before F3.
const GIT03_OUTSIDE_DIR = mkdtempSync(join(tmpdir(), "guard-test-git03-outside-"));
writeFileSync(join(GIT03_OUTSIDE_DIR, "clean.txt"), "feat(x): a thing\n\nWhy it matters.\n\nAI-Assisted: true\n");

check("GIT03-1 block  provider co-author and session URL via -F", "git commit -F dirty.txt", BLOCK, {
  projectDir: GIT03_DIR,
  stderrIncludes: ["GIT-03-PROVIDER-COAUTHOR", "GIT-03-SESSION-URL", "no override for this rule"],
});
check("GIT03-2 allow  a clean message via -F", "git commit -F clean.txt", ALLOW, { projectDir: GIT03_DIR });
check("GIT03-3 block  an inline session trailer", 'git commit -m "fix: y" -m "Session-Id: 01Fx"', BLOCK, {
  projectDir: GIT03_DIR,
  stderrIncludes: ["GIT-03-CORRELATION-TRAILER"],
});
// A human co-author is legitimate; a rule that refused all co-authorship would be turned
// off by the people it is meant to protect.
check("GIT03-4 allow  a human co-author", 'git commit -m "feat: pair work" -m "Co-Authored-By: Jane Roe <jane@example.org>"', ALLOW, {
  projectDir: GIT03_DIR,
});
// The correlation half is not overridable. The override mechanism exists for rules whose
// violation is recoverable, and published history is not.
check("GIT03-5 block  an armed override does not open the correlation rule",
  'PIPELINE_GUARD_OVERRIDE=\'GIT-03|tok|because\' git commit -F dirty.txt', BLOCK, {
    projectDir: GIT03_DIR,
    stderrIncludes: ["GIT-03-PROVIDER-COAUTHOR"],
  });
// The marker half is a convention, so it stays off unless the project asks for it --
// otherwise every ordinary commit in every consumer project would start failing.
check("GIT03-6 allow  a missing marker is not enforced by default", 'git commit -m "chore: bump"', ALLOW, {
  projectDir: GIT03_DIR,
});
// GIT03-7 -- F3, 2026-08-06 Critic round. Before this fix, a -F path outside projectDir made
// commitMessageFindings' readFile throw, the throw was swallowed, and the commit went
// uninspected -- allowed, message content notwithstanding. The content here is clean on
// purpose: the point is that an UNVERIFIABLE message must block on its own, not that this
// particular file happens to carry a violation.
check("GIT03-7 block  a -F file outside the project root, even with clean content",
  `git commit -F ${join(GIT03_OUTSIDE_DIR, "clean.txt")}`, BLOCK, {
    projectDir: GIT03_DIR,
    stderrIncludes: ["GIT-03-UNREADABLE-MESSAGE-FILE", "no override for this rule"],
  });

// ---- GIT-01: commit subject must start with an admitted Conventional Commit type ----------
//
// commitTypeFindings() itself is exhaustively unit-tested in commit-message-policy.test.mjs
// (CMT1-CMT11) -- these cases only prove guard-git.mjs's wiring actually calls it.
check("GIT01-1 block  inadmissible type", 'git commit -m "wip: something"', BLOCK, {
  stderrIncludes: ["GIT-01"],
});
check("GIT01-2 allow  admitted type", 'git commit -m "feat: add x"', ALLOW);
check("GIT01-3 allow  editor commit (no -m/-F) is never false-blocked by GIT-01", "git commit", ALLOW);
check("GIT01-4 allow  a non-commit git command is untouched by GIT-01", "git status", ALLOW);

// ---- Change 1 (design R1, ADR-0061 Decision 0): a verified push signature IS the GG-03
// confirmation --------------------------------------------------------------------------
//
// Every fixture below builds a REAL Ed25519 keypair, a REAL detached signature and a REAL
// git repository. The property under test is that the guard VERIFIES a recorded approval
// rather than believing it, and a stubbed signature or a faked candidate would prove
// nothing about that (same reason lib/critical-action-authorization.test.mjs states).
const SIGNED_ROOTS = [];
const THREAT_MODEL_REL_PATH = "specs/demo/threat-model.md";
const SIGNED_PLAN_SHA = "c".repeat(64);
const SIGNED_SPEC_SHA = "d".repeat(64);
const SIGNED_EXPIRES = "2099-01-01T00:00:00.000Z"; // the guard checks expiry against the real clock
const SIGNED_REMOTE = "origin";
const SIGNED_DESTINATION = "refs/heads/main";
const SIGNED_KEY_REFERENCE = "po-key-1";

/** Generic pass/fail recorder for the facts below that are not a guard invocation. */
function checkThat(id, predicate) {
  let problem = null;
  try {
    if (!predicate()) problem = "the asserted fact did not hold";
  } catch (error) {
    problem = `the assertion threw (${error.message})`;
  }
  if (problem === null) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problem}`);
    console.log(`FAIL  ${id} — ${problem}`);
  }
}
function ledgerEntries(projectDir) {
  try {
    return readFileSync(join(projectDir, ".claude", "guard-override.log.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
function gitIn(root) {
  return (...args) => spawnSync(
    "git",
    ["-C", root, "-c", "user.email=guard-test@example.invalid", "-c", "user.name=Guard Test", "-c", "commit.gpgsign=false", ...args],
    { encoding: "utf8" },
  );
}
function gitRepoFixture(prefix) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  SIGNED_ROOTS.push(root);
  gitIn(root)("init", "--quiet");
  return root;
}
function commitFile(root, name, body) {
  writeFileSync(join(root, name), body);
  gitIn(root)("add", "--", name);
  gitIn(root)("commit", "--quiet", "-m", `seed ${name}`);
}
function candidateOf(root) {
  const git = gitIn(root);
  return {
    commit: String(git("rev-parse", "HEAD").stdout ?? "").trim(),
    tree: String(git("rev-parse", "HEAD^{tree}").stdout ?? "").trim(),
  };
}
function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privateKey, publicKeySha256: createHash("sha256").update(publicPem).digest("hex") };
}
const canonicalJson = (value) => Array.isArray(value)
  ? `[${value.map(canonicalJson).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`
    : JSON.stringify(value);

/** The exact chain approve-push writes: subject -> action -> intent -> detached proof. */
function pushApprovalRecord({ key, threatModel, candidate, remote = SIGNED_REMOTE, destination = SIGNED_DESTINATION }) {
  const action = {
    kind: "push",
    subjectSha256: criticalActionSubjectSha256({
      kind: "push",
      candidate,
      subject: { sourceCommit: candidate.commit, remote, destination, threatModel },
    }),
    expiresAt: SIGNED_EXPIRES,
  };
  const intent = createPoApprovalIntent({
    kind: "critical-action",
    featureId: "demo-feature",
    planSha256: SIGNED_PLAN_SHA,
    specSha256: SIGNED_SPEC_SHA,
    candidate,
    policyRevision: "critical-human-proof-v1",
    subjectSha256: criticalActionSha256(action),
    decision: "approved",
  });
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: intent.sha256,
    keyReference: SIGNED_KEY_REFERENCE,
    publicKey: key.publicPem,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), key.privateKey).toString("base64"),
  };
  return {
    approvedBy: "Human",
    approvedAt: "2026-08-07T00:00:00.000Z",
    forCommit: candidate.commit,
    criticalProof: {
      proofSha256: createHash("sha256").update(canonicalJson(proof)).digest("hex"),
      intentSha256: intent.sha256,
      action,
      proof,
    },
    remote,
    destination,
    threatModel,
  };
}

/**
 * A governed project whose committed policy carries the trust anchor, whose neutral State
 * carries one verifying push approval for the repository's actual HEAD, and whose threat
 * model exists with the bytes the subject digest binds.
 */
function signedPushFixture({
  foreignSigner = false, ledgerDir = true, anchor = true, destination = SIGNED_DESTINATION,
  remote = SIGNED_REMOTE, tamper = null,
} = {}) {
  const root = gitRepoFixture("guard-test-signed-push-");
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, "specs", "demo"), { recursive: true });
  if (ledgerDir) mkdirSync(join(root, ".claude"), { recursive: true });
  const threatBody = "# threat model\n";
  writeFileSync(join(root, THREAT_MODEL_REL_PATH), threatBody);
  const threatModel = { path: THREAT_MODEL_REL_PATH, sha256: createHash("sha256").update(threatBody).digest("hex") };
  commitFile(root, "seed.txt", "seed\n");
  const candidate = candidateOf(root);
  const operator = keypair();
  const policy = {
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push", "deploy", "publication"],
    trustAnchor: { keyReference: SIGNED_KEY_REFERENCE, publicKeySha256: operator.publicKeySha256 },
  };
  if (!anchor) delete policy.trustAnchor;
  writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify(policy, null, 2)}\n`);
  const record = pushApprovalRecord({ key: foreignSigner ? keypair() : operator, threatModel, candidate, remote, destination });
  if (tamper) tamper(record);
  writeFileSync(
    join(root, "project", "pipeline-state.json"),
    `${JSON.stringify({
      activeFeature: { id: "demo-feature" },
      planApproval: { poGateAuthority: { planSha256: SIGNED_PLAN_SHA, specSha256: SIGNED_SPEC_SHA } },
      pushApproval: { lastApproved: record },
      criticalProofConsumption: [{ proofSha256: record.criticalProof.proofSha256, kind: "push", consumedAt: "2026-08-07T00:00:00.000Z" }],
    }, null, 2)}\n`,
  );
  return { root, candidate };
}

// SIG-1: the whole point. A push whose only matching rule is GG-03, no arming anywhere, and
// a recorded approval that VERIFIES for this candidate, remote and destination ref: allowed,
// with an audit entry naming the authorization the guard relied on. No token, no phrase.
const SIG_OK = signedPushFixture();
check(
  "SIG-1 allow   GG-03 push with a verifying push approval and no arming at all",
  "git push origin HEAD:refs/heads/main",
  ALLOW,
  { projectDir: SIG_OK.root },
);
checkLedger(
  "SIG-1 ledger  the admission records the authorization it relied on (key, forCommit, destination) and no token",
  SIG_OK.root,
  (entry) => entry.route === "signed-push-approval"
    && entry.rule === "GG-03"
    && entry.status === "authorized"
    && entry.keyReference === SIGNED_KEY_REFERENCE
    && entry.forCommit === SIG_OK.candidate.commit
    && entry.destination === SIGNED_DESTINATION
    && entry.candidateCommit === SIG_OK.candidate.commit
    && entry.token === undefined
    && entry.command === undefined // the remote operand can be a credential-bearing URL (SEC-01)
    && entry.commandSha256 === createHash("sha256").update("git push origin HEAD:refs/heads/main").digest("hex"),
);

// SIG-2: the attack the committed anchor exists for. The signature is perfectly valid, it is
// simply not the operator's key — so the record is a claim, not a proof.
check(
  "SIG-2 block   a valid signature from a key the committed anchor does not name",
  "git push origin HEAD:refs/heads/main",
  BLOCK,
  { projectDir: signedPushFixture({ foreignSigner: true }).root, stderrIncludes: ["GG-03", "PUSH-PROOF-TRUST-MISMATCH"] },
);

// SIG-3: an approval names a ref. Redirecting the same approval at a different destination
// is a different act.
check(
  "SIG-3 block   a push whose destination differs from the approved one",
  "git push origin HEAD:refs/heads/master",
  BLOCK,
  { projectDir: signedPushFixture().root, stderrIncludes: ["GG-03", "PUSH-PROOF-BINDING-MISMATCH"] },
);

// SIG-4: an approval names a commit. One commit later it is an approval for something else.
const SIG_MOVED = signedPushFixture();
commitFile(SIG_MOVED.root, "later.txt", "moved on\n");
check(
  "SIG-4 block   a push at a commit that is not the approval's forCommit",
  "git push origin HEAD:refs/heads/main",
  BLOCK,
  { projectDir: SIG_MOVED.root, stderrIncludes: ["GG-03", "PUSH-PROOF-COMMIT-MISMATCH"] },
);

// SIG-5: THE case. A valid approval covers the push it names; it does not widen to the OTHER
// rule the command trips. The "every matching rule must be the single admitted rule"
// invariant is what stands between "the human approved a push to main" and "the human
// approved rewriting main's history" — and the admission must record nothing either.
const SIG_FORCE = signedPushFixture();
check(
  "SIG-5 block   --force carrying a VALID approval still blocks on GG-01 (single-match invariant)",
  "git push --force origin HEAD:refs/heads/main",
  BLOCK,
  { projectDir: SIG_FORCE.root, stderrIncludes: ["GG-01"] },
);
checkThat(
  "SIG-5 ledger  the refused force-push wrote no authorization record",
  () => ledgerEntries(SIG_FORCE.root).every((entry) => entry?.route !== "signed-push-approval"),
);

// SIG-6: with no approval and no arming, GG-03 is exactly the rule it always was — the
// unattended-agent case it was built for, with today's block message intact.
check(
  "SIG-6 block   a GG-03 push with no approval and no arming blocks with today's message",
  "git push origin HEAD:refs/heads/main",
  BLOCK,
  {
    projectDir: EMPTY_DIR,
    stderrIncludes: [
      "BLOCKED (git-guard, plugin pipeline-core)",
      "Rule ID: GG-03",
      "Rule origin:",
      "Override: if this is genuinely intended",
      'PIPELINE_GUARD_OVERRIDE="GG-03|<token>|<reason>"',
    ],
  },
);

// SIG-7: a DELETION carrying a valid push approval. An approval names a ref to write; a
// command that names none cannot be matched against one, and guessing is how a verifier
// becomes a rubber stamp. The denial now says so instead of leaving it to be inferred.
const SIG_DELETE = signedPushFixture();
check(
  "SIG-7 block   `push origin --delete main` under a valid approval is never attested",
  "git push origin --delete main",
  BLOCK,
  { projectDir: SIG_DELETE.root, stderrIncludes: ["GG-03", "Signed-approval route: not applicable", "HEAD:refs/heads/<branch>"] },
);
checkThat(
  "SIG-7 ledger  the refused deletion wrote no authorization record",
  () => ledgerEntries(SIG_DELETE.root).every((entry) => entry?.route !== "signed-push-approval"),
);

// SIG-8: fail-closed, identical to the override mechanism's own rule — an authorization the
// guard cannot write an audit record for is not acted on.
check(
  "SIG-8 block   a verified approval is NOT applied when the audit ledger cannot be written",
  "git push origin HEAD:refs/heads/main",
  BLOCK,
  {
    projectDir: signedPushFixture({ ledgerDir: false }).root,
    stderrIncludes: ["GG-03", "audit ledger", "fail-closed"],
  },
);

// SIG-9: the candidate is observed in ONE physical project. A `-C` pointing elsewhere is not
// that project, so there is nothing to observe and nothing to attest.
check(
  "SIG-9 block   a cross-target -C push under a valid approval is refused before any attestation",
  `git -C ${OV_ABSOLUTE_TARGET} push origin HEAD:refs/heads/main`,
  BLOCK,
  { projectDir: signedPushFixture().root, stderrIncludes: ["GG-03", "not one confirmed physical project"] },
);

// SIG-10: the two mechanisms never interleave. With an arming present the token route runs
// exactly as it did before this change, signature or no signature.
check(
  "SIG-10 warn   an armed GG-03 override still takes the unchanged token route",
  "PIPELINE_GUARD_OVERRIDE='GG-03|nova-sig-10|the PO armed this deliberately' git push origin HEAD:refs/heads/main",
  WARN,
  { projectDir: signedPushFixture().root, stderrIncludes: ["GG-03", "nova-sig-10", "OVERRIDE APPLIED"] },
);

// SIG-11: "no anchor" must never read as "no check needed". Without a committed key
// identity there is nothing to verify against, and an unverifiable proof is not a proof.
check(
  "SIG-11 block  a project with no committed trust anchor cannot attest anything",
  "git push origin HEAD:refs/heads/main",
  BLOCK,
  { projectDir: signedPushFixture({ anchor: false }).root, stderrIncludes: ["GG-03", "PUSH-PROOF-TRUST-ANCHOR-MISSING"] },
);

// SIG-12: the threat model is inside the signed subject, so editing it after the approval
// revokes the authorization — the human signed a decision about THOSE bytes.
const SIG_THREAT = signedPushFixture();
writeFileSync(join(SIG_THREAT.root, THREAT_MODEL_REL_PATH), "# threat model, edited after the approval\n");
check(
  "SIG-12 block  a threat model edited after the approval revokes it",
  "git push origin HEAD:refs/heads/main",
  BLOCK,
  { projectDir: SIG_THREAT.root, stderrIncludes: ["GG-03", "PUSH-PROOF-THREAT-MODEL"] },
);

// SIG-13: the record is a mutable working-tree file, so the guard-visible fields agreeing
// proves nothing. Here they were rewritten to agree while the SIGNED subject says the
// approval was for another ref — the exact edit a helpful agent would make.
check(
  "SIG-13 block  a record whose stated binding contradicts the signed subject",
  "git push origin HEAD:refs/heads/main",
  BLOCK,
  {
    projectDir: signedPushFixture({
      destination: "refs/heads/other",
      tamper: (record) => { record.destination = SIGNED_DESTINATION; },
    }).root,
    stderrIncludes: ["GG-03", "PUSH-PROOF-SUBJECT-MISMATCH"],
  },
);

// ---- Change 2 (design R2): an armed token survives an attempt that never ran -------------
//
// The v0.5.3 release burned two tokens on commands that never executed: one refused by the
// harness classifier AFTER the guard had consumed it, one rejected by the remote's ruleset.
// The arming is now bound to the command and the candidate, and lives for a bounded time.
const RTY_DIR = gitRepoFixture("guard-test-retry-");
mkdirSync(join(RTY_DIR, ".claude"), { recursive: true });
commitFile(RTY_DIR, "seed.txt", "seed\n");
const RTY_COMMAND = "PIPELINE_GUARD_OVERRIDE='GG-07|nova-r2-1|the PO approved this exact reset' git reset --hard HEAD~1";
check(
  "RTY-1 warn    first admission of an armed token allows and ledgers it",
  RTY_COMMAND,
  WARN,
  { projectDir: RTY_DIR, stderrIncludes: ["GG-07", "nova-r2-1", "OVERRIDE APPLIED"] },
);
checkLedger(
  "RTY-1 ledger  the entry binds command + candidate and carries a 3600s default lifetime",
  RTY_DIR,
  (entry) => entry.status === "armed"
    && entry.rule === "GG-07"
    && entry.token === "nova-r2-1"
    && entry.command === RTY_COMMAND
    && entry.commandSha256 === createHash("sha256").update(RTY_COMMAND).digest("hex")
    && entry.candidateCommit === candidateOf(RTY_DIR).commit
    && entry.targetSha256 === createHash("sha256").update(RTY_DIR).digest("hex")
    && Date.parse(entry.expiresAt) - Date.parse(entry.ts) === 3600 * 1000,
);
const RTY_ARMED_EXPIRES_AT = ledgerEntries(RTY_DIR).at(-1)?.expiresAt;
check(
  "RTY-2 warn    the SAME token, byte-identical command, same HEAD, inside the TTL is admitted again",
  RTY_COMMAND,
  WARN,
  { projectDir: RTY_DIR, stderrIncludes: ["GG-07", "nova-r2-1", "OVERRIDE APPLIED", "retry of the same arming"] },
);
checkLedger(
  "RTY-2 ledger  the re-presentation is appended as a retry and does NOT extend the lifetime",
  RTY_DIR,
  (entry) => entry.status === "retry"
    && entry.token === "nova-r2-1"
    && entry.commandSha256 === createHash("sha256").update(RTY_COMMAND).digest("hex")
    && entry.candidateCommit === candidateOf(RTY_DIR).commit
    && entry.targetSha256 === createHash("sha256").update(RTY_DIR).digest("hex")
    && entry.expiresAt === RTY_ARMED_EXPIRES_AT,
);
check(
  "RTY-3 block   the same token against a DIFFERENT command is consumed exactly as before",
  "PIPELINE_GUARD_OVERRIDE='GG-07|nova-r2-1|a different reason is a different command' git reset --hard HEAD~1",
  BLOCK,
  { projectDir: RTY_DIR, stderrIncludes: ["GG-07", "already consumed"] },
);
check(
  "RTY-4 block   a cross-target -C re-presentation of an admitted arming is refused (target binding)",
  `PIPELINE_GUARD_OVERRIDE='GG-07|nova-r2-1|the PO approved this exact reset' git -C ${OV_ABSOLUTE_TARGET} reset --hard HEAD~1`,
  BLOCK,
  { projectDir: RTY_DIR, stderrIncludes: ["GG-07", "command target and ledger target"] },
);
commitFile(RTY_DIR, "later.txt", "HEAD moves on\n");
check(
  "RTY-5 block   the identical command after HEAD moved is a different act and stays consumed",
  RTY_COMMAND,
  BLOCK,
  { projectDir: RTY_DIR, stderrIncludes: ["GG-07", "already consumed"] },
);

// RTY-6/7: the lifetime is real and configurable. `overrideArmingTtlSeconds` is read from
// the loaded guard-config; an arming that has outlived it is not a retry window.
const TTL_DIR = gitRepoFixture("guard-test-retry-ttl-");
mkdirSync(join(TTL_DIR, ".claude"), { recursive: true });
writeFileSync(join(TTL_DIR, ".claude", "guard-config.json"), JSON.stringify({ overrideArmingTtlSeconds: 0.001 }));
commitFile(TTL_DIR, "seed.txt", "seed\n");
const TTL_COMMAND = "PIPELINE_GUARD_OVERRIDE='GG-07|nova-r2-ttl|the PO approved this exact reset' git reset --hard HEAD~1";
check(
  "RTY-6 warn    first admission under a configured lifetime allows",
  TTL_COMMAND,
  WARN,
  { projectDir: TTL_DIR, stderrIncludes: ["GG-07", "nova-r2-ttl", "OVERRIDE APPLIED"] },
);
checkLedger(
  "RTY-6 ledger  overrideArmingTtlSeconds from the guard-config is what bounds the arming",
  TTL_DIR,
  (entry) => entry.status === "armed" && Date.parse(entry.expiresAt) - Date.parse(entry.ts) === 1,
);
check(
  "RTY-7 block   the identical command after the arming expired stays consumed",
  TTL_COMMAND,
  BLOCK,
  { projectDir: TTL_DIR, stderrIncludes: ["GG-07", "already consumed"] },
);

// RTY-8: a ledger written before this change carries no `commandSha256`, so it can never
// satisfy the retry test. A pre-existing ledger does not become re-usable.
const OLD_DIR = gitRepoFixture("guard-test-retry-oldshape-");
mkdirSync(join(OLD_DIR, ".claude"), { recursive: true });
commitFile(OLD_DIR, "seed.txt", "seed\n");
const OLD_COMMAND = "PIPELINE_GUARD_OVERRIDE='GG-07|nova-r2-legacy|armed before this change' git reset --hard HEAD~1";
appendFileSync(
  join(OLD_DIR, ".claude", "guard-override.log.jsonl"),
  `${JSON.stringify({
    ts: new Date().toISOString(),
    rule: "GG-07",
    token: "nova-r2-legacy",
    reason: "armed before this change",
    command: OLD_COMMAND,
    targetSha256: createHash("sha256").update(OLD_DIR).digest("hex"),
  })}\n`,
);
check(
  "RTY-8 block   an OLD-shape ledger entry (no commandSha256) stays fully consumed",
  OLD_COMMAND,
  BLOCK,
  { projectDir: OLD_DIR, stderrIncludes: ["GG-07", "already consumed"] },
);

// ---- GG-22: a commit must not leave an earlier backlog status-flip unreconciled since -----
// the last backlog/transitions.ndjson touch -------------------------------------------------
//
// Builds on the already-established real-git-repo primitives above (gitRepoFixture/gitIn/
// commitFile, used unmodified for the SIG-* cases) rather than a second git-repo mechanism.
// New, additive helpers used only by the GG22-* cases below -- the plain-temp-dir fixtures
// elsewhere in this file (EMPTY_DIR and friends) are untouched.
function gg22ItemBody(status, triage = "Demo triage text.") {
  return `---\nid: demo-item\nstatus: ${status}\ntitle: demo backlog item\n---\n\nTriage: ${triage}\n`;
}
function gg22CommitItem(root, name, status, message, triage) {
  mkdirSync(join(root, "backlog", "items"), { recursive: true });
  writeFileSync(join(root, "backlog", "items", name), gg22ItemBody(status, triage));
  gitIn(root)("add", "--", `backlog/items/${name}`);
  gitIn(root)("commit", "--quiet", "-m", message);
}
function gg22CommitLedgerTouch(root, message = "chore: reconcile backlog ledger", seq = 1) {
  mkdirSync(join(root, "backlog"), { recursive: true });
  writeFileSync(join(root, "backlog", "transitions.ndjson"), `{"seq":${seq}}\n`);
  gitIn(root)("add", "--", "backlog/transitions.ndjson");
  gitIn(root)("commit", "--quiet", "-m", message);
}
function gg22StageFile(root, relPath, body) {
  const segments = relPath.split("/").slice(0, -1);
  if (segments.length > 0) mkdirSync(join(root, ...segments), { recursive: true });
  writeFileSync(join(root, relPath), body);
  gitIn(root)("add", "--", relPath);
}

// GG22-1: bootstrap/no-op -- backlog/transitions.ndjson never existed in this repo's history.
const GG22_BOOT_DIR = gitRepoFixture("guard-test-gg22-bootstrap-");
commitFile(GG22_BOOT_DIR, "seed.txt", "seed\n");
gg22StageFile(GG22_BOOT_DIR, "notes.txt", "hello\n");
check(
  "GG22-1 allow  bootstrap: backlog/transitions.ndjson never existed in history",
  'git commit -m "chore: add notes"',
  ALLOW,
  { projectDir: GG22_BOOT_DIR },
);

// GG22-2: clean -- the status flip is reconciled by a LATER ledger touch, nothing outstanding.
const GG22_CLEAN_DIR = gitRepoFixture("guard-test-gg22-clean-");
commitFile(GG22_CLEAN_DIR, "seed.txt", "seed\n");
gg22CommitItem(GG22_CLEAN_DIR, "demo.md", "open", "chore: add demo item (open)");
gg22CommitItem(GG22_CLEAN_DIR, "demo.md", "in_progress", "chore: flip demo item to in_progress");
gg22CommitLedgerTouch(GG22_CLEAN_DIR);
gg22StageFile(GG22_CLEAN_DIR, "src/app.mjs", "export const x = 1;\n");
check(
  "GG22-2 allow  clean: status flip reconciled by a later ledger touch, nothing outstanding",
  'git commit -m "feat: add app"',
  ALLOW,
  { projectDir: GG22_CLEAN_DIR },
);

// GG22-3: debt -- the status flip happened AFTER the last ledger touch, disallowed path staged.
const GG22_DEBT_DIR = gitRepoFixture("guard-test-gg22-debt-");
commitFile(GG22_DEBT_DIR, "seed.txt", "seed\n");
gg22CommitItem(GG22_DEBT_DIR, "demo.md", "open", "chore: add demo item (open)");
gg22CommitLedgerTouch(GG22_DEBT_DIR);
gg22CommitItem(GG22_DEBT_DIR, "demo.md", "in_progress", "chore: flip demo item to in_progress");
gg22StageFile(GG22_DEBT_DIR, "src/app.mjs", "export const x = 1;\n");
check(
  "GG22-3 block  debt: status flip after the last ledger touch, disallowed path staged",
  'git commit -m "feat: add app"',
  BLOCK,
  { projectDir: GG22_DEBT_DIR, stderrIncludes: ["GG-22", "backlog/items/demo.md", "reconcile-backlog-ledger.mjs --activate"] },
);

// GG22-4: the reconciliation commit itself -- only backlog/items/**+ledger paths staged, debt
// exists but this IS the fixing commit and must not be blocked from happening.
const GG22_FIX_DIR = gitRepoFixture("guard-test-gg22-fixcommit-");
commitFile(GG22_FIX_DIR, "seed.txt", "seed\n");
gg22CommitItem(GG22_FIX_DIR, "demo.md", "open", "chore: add demo item (open)");
gg22CommitLedgerTouch(GG22_FIX_DIR);
gg22CommitItem(GG22_FIX_DIR, "demo.md", "in_progress", "chore: flip demo item to in_progress");
gg22StageFile(GG22_FIX_DIR, "backlog/transitions.ndjson", `{"seq":2}\n`);
check(
  "GG22-4 allow  reconciliation commit: staged commit touches only backlog/items+ledger paths",
  'git commit -m "chore: reconcile backlog ledger"',
  ALLOW,
  { projectDir: GG22_FIX_DIR },
);

// GG22-5: item touched since reconcile, but its status: line did not change (Triage-only edit).
const GG22_TRIAGE_DIR = gitRepoFixture("guard-test-gg22-triage-only-");
commitFile(GG22_TRIAGE_DIR, "seed.txt", "seed\n");
gg22CommitItem(GG22_TRIAGE_DIR, "demo.md", "open", "chore: add demo item (open)");
gg22CommitLedgerTouch(GG22_TRIAGE_DIR);
gg22CommitItem(GG22_TRIAGE_DIR, "demo.md", "open", "chore: update demo item triage prose", "Updated triage prose, no status change.");
gg22StageFile(GG22_TRIAGE_DIR, "src/app.mjs", "export const x = 1;\n");
check(
  "GG22-5 allow  non-status edit: item touched since reconcile but its status: line did not change",
  'git commit -m "feat: add app"',
  ALLOW,
  { projectDir: GG22_TRIAGE_DIR },
);

// GG22-6: fail-open -- a spawnSync git failure (PATH broken for the guard's own child process)
// must never block, even against the exact same debt state that GG22-3 proves DOES block.
check(
  "GG22-6 allow  fail-open: a spawnSync git failure never blocks (same debt state as GG22-3)",
  'git commit -m "feat: add app"',
  ALLOW,
  { projectDir: GG22_DEBT_DIR, env: { PATH: "/nonexistent-guard-test-bin" } },
);

// GG22-7: the corrected remediation order (item edits committed FIRST, reconciler run ONCE, ledger
// commit LAST) drains debt cleanly -- this is the exact sequence that trapped an agent following the
// OLD (reconcile-first) printed order live on 2026-08-29
// (backlog/items/2026-08-29-gg-22s-own-remediation-order-creates-unclearable-ledger-debt.md). Batches
// two item closures into one commit (the guard's own code comment: "batched multi-item closures ...
// before one shared reconciliation commit are an established, legitimate pattern").
const GG22_FIXED_ORDER_DIR = gitRepoFixture("guard-test-gg22-fixed-order-");
commitFile(GG22_FIXED_ORDER_DIR, "seed.txt", "seed\n");
gg22CommitItem(GG22_FIXED_ORDER_DIR, "one.md", "open", "chore: add item one (open)");
gg22CommitItem(GG22_FIXED_ORDER_DIR, "two.md", "open", "chore: add item two (open)");
gg22CommitLedgerTouch(GG22_FIXED_ORDER_DIR, "chore: reconcile backlog ledger", 1);
// Batch-close both items in one commit -- item edits committed FIRST, per the corrected order.
mkdirSync(join(GG22_FIXED_ORDER_DIR, "backlog", "items"), { recursive: true });
writeFileSync(join(GG22_FIXED_ORDER_DIR, "backlog", "items", "one.md"), gg22ItemBody("closed"));
writeFileSync(join(GG22_FIXED_ORDER_DIR, "backlog", "items", "two.md"), gg22ItemBody("closed"));
gitIn(GG22_FIXED_ORDER_DIR)("add", "--", "backlog/items/one.md", "backlog/items/two.md");
gitIn(GG22_FIXED_ORDER_DIR)("commit", "--quiet", "-m", "chore: close items one and two");
// Reconcile ONCE, ledger commit LAST -- after the item commit, not before it.
gg22CommitLedgerTouch(GG22_FIXED_ORDER_DIR, "chore: reconcile backlog ledger", 2);
gg22StageFile(GG22_FIXED_ORDER_DIR, "src/app.mjs", "export const x = 1;\n");
check(
  "GG22-7 allow  fixed order: item edits committed first, reconciler run once, ledger commit last -- no debt",
  'git commit -m "feat: add app"',
  ALLOW,
  { projectDir: GG22_FIXED_ORDER_DIR },
);

// GG22-8: the remediation guidance TEXT itself states the corrected order -- item edits first,
// reconciler once, ledger commit last -- and reuses GG22-3's own debt fixture (same BLOCK case) to
// prove the printed message no longer tells an agent to commit the ledger "before any other commit"
// (the phrasing that forced the inverted, debt-trapping order) and instead names the item-edits-first,
// ledger-last sequence.
check(
  "GG22-8 block  remediation text states the corrected reconcile-last order, not reconcile-first",
  'git commit -m "feat: add app"',
  BLOCK,
  {
    projectDir: GG22_DEBT_DIR,
    stderrIncludes: [
      "GG-22",
      "Commit any pending backlog/items/ status edits first",
      "then commit the resulting backlog/STATUS.md / backlog/index.json / backlog/transitions.ndjson changes last.",
    ],
  },
);

// ---- Summary -------------------------------------------------------------------------------------
for (const dir of [EMPTY_DIR, CFG_DIR, BROKEN_DIR, OV_DIR, OV_NOLEDGER_DIR, CFG_GITOPT_DIR, ...SIGNED_ROOTS]) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
