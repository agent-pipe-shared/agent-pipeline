#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Criterion-bound regression pin: neither a backslash-escaped Bash redirect target nor a
// PowerShell `>` redirect may hide a write to a protected path (PO decision 2026-10-17, the two
// further gaps of the protected-path write check, same class as the quoted-redirect fix; slice
// ALF-C-REDIRECT-GAPS of item pipeline.protected-baseline-rejects-canonical-discarded-idle-state,
// AC-234).
//
// Original defects, both measured on the HEAD of protected-test-paths.mjs:
//   GAP 1  `printf x > plugins/pipeline-core/hooks/gu\ard-testpath.mjs` opens the protected file
//          (a POSIX shell removes the backslash escape before it opens the target), yet
//          protectedTestPathShellHit() compared the escaped text. The same holds for a backslash
//          before any ordinary character of the path, for the parsed redirect lane (>, 1>, 2>, 3>)
//          and for the unparsed PATH_TOKEN fallback (>>, >|, 2>>, &>, &>>, >&).
//   GAP 2  powershellWriteTargets() only recognised a leading write cmdlet, so `'x' > <path>`,
//          `>>`, `n>` and `*>` in a PowerShell command were never classified as writes. A
//          PowerShell backtick is the analogue of the POSIX backslash escape.
//
// Acceptance, each through the real module and its own rule loader (no mocks):
//   E1  every backslash-escaped spelling of a protected target hits, for every redirect operator,
//       on both platform grammars (also for a second protected family, lib/guard/*.mjs);
//   E2  the lane stays honest: a parsed target is classified by the "redirect" lane, an unparsed
//       one by the conservative "unparsed-command" lane;
//   E3  no over-block: an escaped unprotected path and the protected name plus ".bak" stay null,
//       and heredoc body text naming an escaped protected path stays data (AC-254);
//   P1  every PowerShell redirect operator (>, >>, n>, n>>, *>, *>>) to a protected target hits,
//       bare, quoted, partly quoted, with Windows separators and with backtick escapes;
//   P2  the PowerShell redirect has its own lane name, "powershell-redirect", a positive write
//       target (no conservative classification), and the write-cmdlet lane keeps its own name;
//   P3  no over-block: an unprotected redirect target, a stream merge (2>&1), a discarded stream
//       ($null) and a PowerShell READ of a protected path all stay null.
//
// Seam: PIPELINE_QUOTED_REDIRECT_CODE_ROOT (the same seam the quoted-redirect pin uses) names a
// directory that holds plugins/pipeline-core/lib/protected-test-paths.mjs (default: this
// repository root). The rules are always loaded by the loaded module's own loader against the REAL
// repository root. protected-test-paths.mjs is signature-bound and patch-only: without the seam
// this pin is RED by design until the signature-bound patch (scratch/patches/ALF-C-REDIRECT-GAPS.patch,
// which carries the quoted-redirect hunks as well) lands; with the seam pointing at a mirror built
// from the patched LF blob it is GREEN, and a mirror of the unpatched HEAD blob reproduces the RED.
// Build such a mirror from `git show HEAD:plugins/pipeline-core/lib/protected-test-paths.mjs`
// (core.autocrlf is true on the Windows host, so never copy the working-tree bytes), with the
// relative imports rewritten to absolute file URLs of the real lib directory.
//
// Deliberately not asserted: an escape inside single quotes (a shell keeps the backslash there, so
// the escape-stripped candidate is a fail-closed over-approximation, not a claim about the shell);
// a PowerShell backtick before a letter that PowerShell turns into a control character (`a, `n):
// the stripped candidate is again a fail-closed over-approximation; a ">" inside a PowerShell
// string literal (the PowerShell scan does not track strings, so such text is tested like any other,
// fail-closed); and a computed PowerShell target such as `> (Join-Path $dir 'x')` (unresolved).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..");
const MODULE_REL = "plugins/pipeline-core/lib/protected-test-paths.mjs";
const CODE_ROOT = resolve(process.env.PIPELINE_QUOTED_REDIRECT_CODE_ROOT || ROOT);
const MODULE_PATH = resolve(CODE_ROOT, MODULE_REL);

assert.ok(existsSync(MODULE_PATH), `no protected-test-paths.mjs under the code root: ${MODULE_PATH}`);
const mod = await import(pathToFileURL(MODULE_PATH).href);
const { rules } = mod.loadProtectedTestPathRules({ rootDir: ROOT });

const BT = "`"; // the PowerShell escape character, spelled out so no template literal needs it
const P = "plugins/pipeline-core/hooks/guard-testpath.mjs";
const PLATFORMS = ["linux", "win32"];
// Bash, parsed lane: >, 1>, 2>, 3>. Unparsed fallback lane: >>, >|, 2>>, &>, &>>, >&.
const BASH_OPERATORS = [">", ">>", ">|", "1>", "2>", "2>>", "&>", "&>>", ">&", "3>"];
// PowerShell redirection operators: success/error/other streams by number, and all streams.
const PS_OPERATORS = [">", ">>", "1>", "2>", "2>>", "3>", "4>>", "5>", "6>", "*>", "*>>"];

const hitOf = (command, platform, toolName = "Bash") =>
  mod.protectedTestPathShellHit({ command, rules, root: ROOT, platform, toolName });

// ---------------------------------------------------------------------------------------------
// Bash: backslash-escaped redirect targets (GAP 1)
// ---------------------------------------------------------------------------------------------

// Each spelling is what the SHELL resolves to the protected path: a backslash outside quotes yields
// the next character. String.raw keeps every backslash literal.
const ESCAPED = {
  inside_name: String.raw`plugins/pipeline-core/hooks/gu\ard-testpath.mjs`,
  before_hyphen: String.raw`plugins/pipeline-core/hooks/guard\-testpath.mjs`,
  before_dot: String.raw`plugins/pipeline-core/hooks/guard-testpath\.mjs`,
  tail_char: String.raw`plugins/pipeline-core/hooks/guard-testpath.m\js`,
  dir_segment: String.raw`plugins/pipe\line-core/hooks/guard-testpath.mjs`,
  leading_char: String.raw`\plugins/pipeline-core/hooks/guard-testpath.mjs`,
  every_char: String.raw`p\lugins/p\ipeline-core/h\ooks/g\uard-testpath.mjs`,
  partly_quoted: String.raw`plugins/"pipeline-core"/hooks/gu\ard-testpath.mjs`,
};

// A second protected family (PB-GUARD-HOOKS covers lib/guard/*.mjs): the briefed example.
const ESCAPED_GUARD_LIB = String.raw`plugins/pipeline-core/lib/gu\ard/x.mjs`;
const GUARD_LIB = "plugins/pipeline-core/lib/guard/x.mjs";

/** Every operator on both platforms; returns the cells that did NOT classify as a protected write. */
function bashMissesFor(target, operators = BASH_OPERATORS) {
  const misses = [];
  for (const platform of PLATFORMS) {
    for (const operator of operators) {
      const command = `printf x ${operator} ${target}`;
      let hit;
      try { hit = hitOf(command, platform); } catch (error) { misses.push(`${platform} ${operator} THROW ${error.message}`); continue; }
      if (hit === null) misses.push(`${platform} ${operator}`);
    }
  }
  return misses;
}

test(`control: module under test resolves and its own loader yields live rules (${CODE_ROOT === ROOT ? "repository code" : "seam code root"})`, () => {
  for (const name of ["extractShellWriteTargets", "loadProtectedTestPathRules", "protectedTestPathShellHit"]) {
    assert.equal(typeof mod[name], "function", name);
  }
  assert.ok(Array.isArray(rules) && rules.length > 0, "a rule set that is empty would make every null assertion below vacuous");
});

test("control: the unescaped spelling hits for every Bash operator on both platforms (the matrix is live)", () => {
  assert.deepEqual(bashMissesFor(P), []);
  assert.deepEqual(bashMissesFor(GUARD_LIB), []);
});

for (const [name, spelling] of Object.entries(ESCAPED)) {
  test(`E1: backslash-escaped spelling ${name} hits for every Bash redirect operator on both platforms`, () => {
    assert.deepEqual(bashMissesFor(spelling), [], `spelling ${spelling}`);
  });
}

test("E1: the briefed example, an escaped lib/guard directory, hits for the parsed and the unparsed operator", () => {
  assert.deepEqual(bashMissesFor(ESCAPED_GUARD_LIB, [">", ">>"]), []);
});

test("E2: an escaped target of > is classified by the parsed redirect lane", () => {
  for (const platform of PLATFORMS) {
    for (const spelling of [ESCAPED.inside_name, ESCAPED_GUARD_LIB]) {
      const hit = hitOf(`printf x > ${spelling}`, platform);
      assert.ok(hit, `${platform} ${spelling}`);
      assert.equal(hit.lane, "redirect");
      assert.equal(hit.classification, undefined, "a parsed redirect is a positive write target, not a conservative guess");
    }
  }
});

test("E2: an escaped target of >> is classified by the conservative unparsed lane", () => {
  for (const platform of PLATFORMS) {
    const hit = hitOf(`printf x >> ${ESCAPED.inside_name}`, platform);
    assert.ok(hit, platform);
    assert.equal(hit.lane, "unparsed-command");
    assert.equal(hit.classification, "conservative-possible-write");
  }
});

// Not under scratch/ on purpose: scratch targets are admitted before any rule is consulted, so a
// scratch path would make the null assertion vacuous.
const BASH_NON_PROTECTED = [
  "docs/redirect-gaps-note.txt",
  String.raw`docs/redirect\-gaps\-note.txt`,
  String.raw`plugins/pipeline-core/lib/gu\ard-note.txt`,
  String.raw`plugins/pipeline-core/hooks/gu\ard-testpath.mjs.bak`,
  String.raw`plugins/pipeline-core/hooks/guard-testpath.mjs\.bak`,
  String.raw`plugins/pipeline-core/hooks/guard-testpath\.mjs.bak`,
  `${P}.bak`,
];

test("E3: escaped non-protected targets (an ordinary note, the protected name plus .bak) stay unclassified", () => {
  const hits = [];
  for (const platform of PLATFORMS) {
    for (const operator of BASH_OPERATORS) {
      for (const spelling of BASH_NON_PROTECTED) {
        const command = `printf x ${operator} ${spelling}`;
        const hit = hitOf(command, platform);
        if (hit !== null) hits.push(`${platform} ${command} -> ${hit.rule.id}/${hit.lane}/${hit.candidate}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});

const heredoc = (opener, body) => `${opener}\n${body}\nEOF`;

test("E3: heredoc body text naming an escaped protected path stays data", () => {
  const bodies = [
    `the suite ${ESCAPED.inside_name} is protected`,
    `write to ${ESCAPED.partly_quoted} and ${ESCAPED.before_hyphen} later`,
    ESCAPED.every_char,
  ];
  const openers = ["cat >> docs/redirect-gaps-notes.md <<'EOF'", `cat >> docs/redirect-gaps-notes.md <<"EOF"`, "cat > docs/redirect-gaps-notes.md <<'EOF'"];
  for (const platform of PLATFORMS) {
    for (const opener of openers) {
      for (const body of bodies) {
        const command = heredoc(opener, body);
        assert.equal(hitOf(command, platform), null, `${platform}: ${command}`);
      }
    }
  }
});

test("E3 retained: an escaped protected redirect target in front of a heredoc opener still hits", () => {
  for (const platform of PLATFORMS) {
    for (const target of [ESCAPED.inside_name, ESCAPED.before_hyphen, ESCAPED.partly_quoted]) {
      const hit = hitOf(heredoc(`cat > ${target} <<'EOF'`, "data"), platform);
      assert.ok(hit, `${platform} ${target}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// PowerShell: redirect operators (GAP 2)
// ---------------------------------------------------------------------------------------------

// PowerShell has no backslash escape (a backslash is a path separator there); its escape is the
// backtick. The backticks below precede characters PowerShell treats as themselves.
const PS_TARGETS = {
  bare: P,
  single_quoted: `'${P}'`,
  double_quoted: `"${P}"`,
  partly_quoted: `plugins/"pipeline-core"/hooks/guard-testpath.mjs`,
  backslashes: "plugins\\pipeline-core\\hooks\\guard-testpath.mjs",
  dot_backslash: ".\\plugins\\pipeline-core\\hooks\\guard-testpath.mjs",
  backtick_in_name: `plugins/pipeline-core/hooks/guar${BT}d-testpath.mjs`,
  backtick_before_hyphen: `plugins/pipeline-core/hooks/guard${BT}-testpath.mjs`,
  backtick_before_dot: `plugins/pipeline-core/hooks/guard-testpath${BT}.mjs`,
  backtick_in_dir: `plugins/pipeline${BT}-core/hooks/guard-testpath.mjs`,
  backtick_with_backslashes: `plugins\\pipeline-core\\hooks\\guar${BT}d-testpath.mjs`,
  backtick_partly_quoted: `plugins/"pipeline-core"/hooks/guar${BT}d-testpath.mjs`,
  guard_lib_backtick: `plugins/pipeline-core/lib/gua${BT}rd/x.mjs`,
};
const PS_PREFIXES = ["'x'", "Write-Output x", "Get-Content docs/a.txt | Out-String", "Write-Output a; 'x'"];

/** Both operator layouts (a space after the operator, and none) on both platforms; returns the misses. */
function powershellMissesFor(target, { prefixes = ["'x'"], operators = PS_OPERATORS } = {}) {
  const misses = [];
  for (const platform of PLATFORMS) {
    for (const prefix of prefixes) {
      for (const operator of operators) {
        for (const command of [`${prefix} ${operator} ${target}`, `${prefix} ${operator}${target}`]) {
          let hit;
          try { hit = hitOf(command, platform, "PowerShell"); } catch (error) { misses.push(`${platform} ${command} THROW ${error.message}`); continue; }
          if (hit === null) misses.push(`${platform} ${command}`);
        }
      }
    }
  }
  return misses;
}

test("control: a PowerShell write cmdlet naming the protected path hits on its own lane (the matrix is live)", () => {
  for (const platform of PLATFORMS) {
    for (const command of [`Set-Content ${P} "x"`, `Out-File ${P}`, `Remove-Item '${P}'`]) {
      const hit = hitOf(command, platform, "PowerShell");
      assert.ok(hit, `${platform} ${command}`);
      assert.equal(hit.lane, "powershell-write-cmdlet", command);
    }
  }
});

for (const [name, target] of Object.entries(PS_TARGETS)) {
  test(`P1: PowerShell target ${name} hits for every redirect operator and both layouts on both platforms`, () => {
    assert.deepEqual(powershellMissesFor(target), [], `target ${target}`);
  });
}

test("P1: the redirect hits whatever PowerShell command text precedes it (string, cmdlet, pipeline, statement list)", () => {
  assert.deepEqual(powershellMissesFor(P, { prefixes: PS_PREFIXES, operators: [">", ">>", "*>", "2>"] }), []);
});

test("P2: a PowerShell redirect is a positive write target on the powershell-redirect lane", () => {
  for (const platform of PLATFORMS) {
    for (const target of [P, PS_TARGETS.single_quoted, PS_TARGETS.backtick_in_name]) {
      const hit = hitOf(`'x' > ${target}`, platform, "PowerShell");
      assert.ok(hit, `${platform} ${target}`);
      assert.equal(hit.lane, "powershell-redirect");
      assert.equal(hit.classification, undefined, "a parsed redirect is a positive write target, not a conservative guess");
    }
  }
});

test("P2: extractShellWriteTargets yields the quote- and backtick-stripped target on the powershell-redirect lane", () => {
  const targets = mod.extractShellWriteTargets({ command: `'x' >> '${PS_TARGETS.backtick_in_name}'`, toolName: "PowerShell" });
  assert.ok(targets.some((t) => t.lane === "powershell-redirect" && t.candidate === P), JSON.stringify(targets));
});

test("P2: a write cmdlet keeps its own lane, and a command with no write yields nothing", () => {
  const cmdlet = mod.extractShellWriteTargets({ command: `Set-Content ${P} "x"`, toolName: "PowerShell" });
  assert.ok(cmdlet.some((t) => t.candidate === P && t.lane === "powershell-write-cmdlet"));
  assert.ok(!cmdlet.some((t) => t.lane === "powershell-redirect"), "no redirect in the command, no redirect candidate");
  assert.deepEqual(mod.extractShellWriteTargets({ command: `Get-Content ${P}`, toolName: "PowerShell" }), []);
});

const PS_NON_PROTECTED_COMMANDS = [
  // unprotected redirect targets (not under scratch/ on purpose: see BASH_NON_PROTECTED)
  "'x' > docs/redirect-gaps-note.txt",
  `'x' >> "docs/redirect-gaps-note.txt"`,
  "'x' 2> docs/redirect-gaps-note.txt",
  "Get-ChildItem *> docs/redirect-gaps-log.txt",
  `'x' > ${P}.bak`,
  `'x' > '${P}.bak'`,
  `'x' > plugins/pipeline-core/hooks/guar${BT}d-testpath.mjs.bak`,
  `'x' > plugins/pipeline-core/lib/gua${BT}rd-note.txt`,
  // discarded streams and stream merges name no file
  "'x' 2> $null",
  "Get-Item docs/a.txt 2>&1",
  "Get-Item docs/a.txt *>&1",
  "Get-Item docs/a.txt > $null",
  // reading a protected path is not a write, with or without a redirect elsewhere
  `Get-Content ${P}`,
  `Get-Content '${P}' | Select-String x`,
  `Select-String -Path ${P} -Pattern x`,
  `Test-Path ${P}`,
  `Get-Content ${P} | Out-String`,
  `Get-Content ${P} > docs/redirect-gaps-copy.txt`,
];

test("P3: unprotected targets, stream merges, string-literal text and PowerShell reads stay unclassified", () => {
  const hits = [];
  for (const platform of PLATFORMS) {
    for (const command of PS_NON_PROTECTED_COMMANDS) {
      const hit = hitOf(command, platform, "PowerShell");
      if (hit !== null) hits.push(`${platform} ${command} -> ${hit.rule.id}/${hit.lane}/${hit.candidate}`);
    }
  }
  assert.deepEqual(hits, []);
});
