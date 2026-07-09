#!/usr/bin/env node
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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

// ---- Rule 11: secret/state staging block (.env all three; secrets.yaml <PROJECT_B>; <PROJECT_C> SSH keys) ----------
check("R11 block  add .env", "git add .env", BLOCK);
check("R11 block  add .env.production", "git add .env.production", BLOCK);
check("R11 block  add secrets.yaml", "git add config/secrets.yaml", BLOCK);
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
check("QS  allow  single-quoted mention of reset --hard", "git commit -m 'never run git reset --hard here'", ALLOW);
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
check("GO-allow  -c interposed harmless commit", 'git -c user.name=x commit -m "msg"', ALLOW);

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

// AR-3: an override armed for a rule applies identically when the command is normalized
// through a `-C`-interposed form (fresh token, reusing the OV_DIR ledger from the P4-01 cases).
check(
  "GO-OV warn   override armed for GG-07 applies through a -C-interposed command (AR-3)",
  "PIPELINE_GUARD_OVERRIDE='GG-07|20260704-10|override through -C interposition, the PO approved' git -C sub reset --hard HEAD~1",
  WARN,
  { projectDir: OV_DIR, stderrIncludes: ["GG-07", "20260704-10", "OVERRIDE APPLIED"] },
);

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
  'git commit -m "avoid --no-verify"',
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
check("R18 allow  commit -m normal message", 'git commit -m "normal message"', ALLOW);

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
  'git commit -m "set core.hooksPath here"',
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
  'git commit -m "run git config core.hooksPath"',
  ALLOW,
);

// ---- Summary -------------------------------------------------------------------------------------
for (const dir of [EMPTY_DIR, CFG_DIR, BROKEN_DIR, OV_DIR, OV_NOLEDGER_DIR, CFG_GITOPT_DIR]) {
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
