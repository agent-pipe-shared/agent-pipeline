#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Criterion-bound regression pin: a quoted redirect target must never hide a protected path
// (PO decision 2026-10-17, "Quoted redirect target bypasses the protected-path write check",
// G24-LIVE; slice ALF-C-QUOTED-REDIRECT2 of item
// pipeline.protected-baseline-rejects-canonical-discarded-idle-state, AC-234).
//
// Original defect: `printf x > 'plugins/pipeline-core/hooks/guard-testpath.mjs'` (and the
// double-quoted, partly quoted, empty-quoted and ANSI-C spellings) opens the protected file, yet
// protectedTestPathShellHit() returned null. The parsed redirect lane (>, 1>, 2>, 3>) pushed the
// raw target, quotes included; the unparsed fallback (>>, >|, 2>>, &>, &>>, >&) tokenized with
// PATH_TOKEN, which splits at a quote character, so a partly quoted word never appeared whole.
//
// Acceptance, each through the real module and its own rule loader (no mocks):
//   Q1  every quoted spelling of a protected target hits, for every redirect operator, on both
//       platform grammars (the matrix of ten operators x eleven spellings x linux/win32);
//   Q2  the lane stays honest: a parsed target is classified by the "redirect" lane, an unparsed
//       one by the conservative "unparsed-command" lane;
//   Q3  no over-block: quoted non-protected targets and the protected name plus ".bak" stay null;
//   Q4  heredoc body text stays data (the AC-254 behaviour), while a real quoted redirect target
//       in front of a heredoc still hits.
//
// Seam: PIPELINE_QUOTED_REDIRECT_CODE_ROOT names a directory that holds
// plugins/pipeline-core/lib/protected-test-paths.mjs (default: this repository root). The rules are
// always loaded by the loaded module's own loader against the REAL repository root. Without the
// seam this pin is RED by design until the signature-bound patch for protected-test-paths.mjs
// lands; with the seam pointing at a patched mirror it is GREEN.
//
// Out of scope, deliberately not asserted: a backslash-escaped ordinary character inside a name
// (guard\-testpath.mjs) misses even when unquoted; the PowerShell lane does not see ">" redirects.

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

const P = "plugins/pipeline-core/hooks/guard-testpath.mjs";
const PLATFORMS = ["linux", "win32"];
// Parsed lane: >, 1>, 2>, 3>. Unparsed fallback lane: >>, >|, 2>>, &>, &>>, >&.
const OPERATORS = [">", ">>", ">|", "1>", "2>", "2>>", "&>", "&>>", ">&", "3>"];

const SPELLINGS = {
  single: `'${P}'`,
  double: `"${P}"`,
  partial_head: `'plugins/'pipeline-core/hooks/guard-testpath.mjs`,
  partial_mid: `plugins/"pipeline-core"/hooks/guard-testpath.mjs`,
  partial_tail: `plugins/pipeline-core/hooks/guard-testpath.m'js'`,
  empty_suffix: `${P}''`,
  empty_prefix: `""${P}`,
  ansi_c: `$'${P}'`,
  single_mixed_sep: `'plugins\\\\pipeline-core//hooks/guard-testpath.mjs'`,
  double_backslash: `"plugins\\pipeline-core\\hooks\\guard-testpath.mjs"`,
};

const hitOf = (command, platform) => mod.protectedTestPathShellHit({ command, rules, root: ROOT, platform });

/** Every operator on both platforms; returns the cells that did NOT classify as a protected write. */
function missesFor(spelling) {
  const misses = [];
  for (const platform of PLATFORMS) {
    for (const operator of OPERATORS) {
      const command = `printf x ${operator} ${spelling}`;
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

test("control: the unquoted spelling hits for every operator on both platforms (the matrix is live)", () => {
  assert.deepEqual(missesFor(P), []);
});

for (const [name, spelling] of Object.entries(SPELLINGS)) {
  test(`Q1: quoted spelling ${name} hits for every redirect operator on both platforms`, () => {
    assert.deepEqual(missesFor(spelling), [], `spelling ${spelling}`);
  });
}

test("Q2: a quoted target of > is classified by the parsed redirect lane", () => {
  for (const platform of PLATFORMS) {
    for (const spelling of [SPELLINGS.single, SPELLINGS.double]) {
      const hit = hitOf(`printf x > ${spelling}`, platform);
      assert.ok(hit, `${platform} ${spelling}`);
      assert.equal(hit.lane, "redirect");
      assert.equal(hit.classification, undefined, "a parsed redirect is a positive write target, not a conservative guess");
    }
  }
});

test("Q2: a partly quoted target of >> is classified by the conservative unparsed lane", () => {
  for (const platform of PLATFORMS) {
    const hit = hitOf(`printf x >> ${SPELLINGS.partial_mid}`, platform);
    assert.ok(hit, platform);
    assert.equal(hit.lane, "unparsed-command");
    assert.equal(hit.classification, "conservative-possible-write");
  }
});

const NON_PROTECTED = [
  "'scratch/qredirect-note.txt'",
  `"scratch/qredirect-note.txt"`,
  `scratch/"qredirect"-note.txt`,
  `'${P}.bak'`,
  `"${P}.bak"`,
  `plugins/"pipeline-core"/hooks/guard-testpath.mjs.bak`,
  `$'${P}.bak'`,
];

test("Q3: quoted non-protected targets (a scratch note, the protected name plus .bak) stay unclassified", () => {
  const hits = [];
  for (const platform of PLATFORMS) {
    for (const operator of OPERATORS) {
      for (const spelling of NON_PROTECTED) {
        const command = `printf x ${operator} ${spelling}`;
        const hit = hitOf(command, platform);
        if (hit !== null) hits.push(`${platform} ${command} -> ${hit.rule.id}/${hit.lane}/${hit.candidate}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});

const heredoc = (opener, body) => `${opener}\n${body}\nEOF`;

test("Q4: heredoc body text naming a quoted or partly quoted protected path stays data", () => {
  const bodies = [
    `the suite ${P} is protected`,
    `write to ${SPELLINGS.partial_mid} and ${SPELLINGS.single} later`,
    `${SPELLINGS.double}`,
  ];
  const openers = ["cat >> scratch/notes.md <<'EOF'", `cat >> scratch/notes.md <<"EOF"`, "cat > scratch/notes.md <<'EOF'"];
  for (const platform of PLATFORMS) {
    for (const opener of openers) {
      for (const body of bodies) {
        const command = heredoc(opener, body);
        assert.equal(hitOf(command, platform), null, `${platform}: ${command}`);
      }
    }
  }
});

test("Q4 retained: a protected redirect target in front of a heredoc opener still hits, quoted or not", () => {
  for (const platform of PLATFORMS) {
    for (const target of [P, SPELLINGS.single, SPELLINGS.double]) {
      const hit = hitOf(heredoc(`cat > ${target} <<'EOF'`, "data"), platform);
      assert.ok(hit, `${platform} ${target}`);
    }
  }
});
