#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Direct unit tests for `extractShellWriteTargets()`, the shared write-target-extraction
// helper split out of `protectedTestPathShellHit()` (backlog:
// 2026-08-18-guard-devplan-and-guard-testpath-have-no-bash-write-lane.md, "Design,
// 2026-08-19", step 1). The behavioral proof that this split did not change
// `protectedTestPathShellHit()`'s own outward behavior is the TPSHELL-* suite in
// `guard-lifecycle-ready.test.mjs`, which imports and exercises `protectedTestPathShellHit()`
// end to end (it stays green, unmodified, across this refactor); this file instead exercises
// the NEW shared function directly, covering the same shapes that suite already tests.

import assert from "node:assert/strict";
import test from "node:test";

import { extractShellWriteTargets } from "./protected-test-paths.mjs";

const TARGET = "plugins/pipeline-core/hooks/guard-push.test.mjs";

/** All candidate strings, order-preserved, for readable assertions. */
function candidates(command, opts = {}) {
  return extractShellWriteTargets({ command, root: "/repo", ...opts }).map((t) => t.candidate);
}

function lanes(command, opts = {}) {
  return extractShellWriteTargets({ command, root: "/repo", ...opts }).map((t) => t.lane);
}

test("extractShellWriteTargets: a redirect target is a candidate on the 'redirect' lane", () => {
  const targets = extractShellWriteTargets({ command: `printf x > ${TARGET}`, root: "/repo" });
  assert.deepEqual(targets, [{ candidate: TARGET, lane: "redirect" }]);
});

test("extractShellWriteTargets: an append redirect (>>) is also a candidate", () => {
  assert.ok(candidates(`printf x >> ${TARGET}`).includes(TARGET));
});

test("extractShellWriteTargets: write-capable executables yield their non-flag operands", () => {
  for (const command of [
    `cp scratch/fake.mjs ${TARGET}`,
    `mv scratch/fake.mjs ${TARGET}`,
    `rm ${TARGET}`,
    `truncate -s 0 ${TARGET}`,
    `tee ${TARGET}`,
  ]) {
    assert.ok(candidates(command).includes(TARGET), `no candidate for: ${command}`);
    assert.ok(lanes(command).includes("write-command"), `no write-command lane for: ${command}`);
  }
});

test("extractShellWriteTargets: sed/perl/ruby only contribute a candidate when an in-place flag is present", () => {
  assert.ok(candidates(`sed -i s/a/b/ ${TARGET}`).includes(TARGET));
  assert.deepEqual(candidates(`sed s/a/b/ ${TARGET}`), [], "no in-place flag -> no candidate");
});

test("extractShellWriteTargets: git write verbs yield their operand on the 'git-working-tree-write' lane", () => {
  const targets = extractShellWriteTargets({ command: `git checkout HEAD -- ${TARGET}`, root: "/repo" });
  assert.ok(targets.some((t) => t.candidate === TARGET && t.lane === "git-working-tree-write"));
});

test("extractShellWriteTargets: read-only git subcommands and plain readers contribute nothing", () => {
  for (const command of [
    `cat ${TARGET}`,
    `rg -n describe ${TARGET}`,
    `git add ${TARGET}`,
    `git diff ${TARGET}`,
    `git log ${TARGET}`,
    `node --test ${TARGET}`,
    `node ${TARGET}`,
  ]) {
    assert.deepEqual(candidates(command), [], `unexpected candidate for a read/run command: ${command}`);
  }
});

test("extractShellWriteTargets: opaque interpreter payloads contribute every path-shaped token, on the 'opaque-interpreter-code' lane", () => {
  const command = `node -e "require('fs').writeFileSync('${TARGET}','x')"`;
  const targets = extractShellWriteTargets({ command, root: "/repo" });
  assert.ok(targets.some((t) => t.candidate === TARGET && t.lane === "opaque-interpreter-code"));
});

test("extractShellWriteTargets: an opaque payload naming only a bare basename yields the basename as a candidate (needle-matching happens one layer up)", () => {
  const command = `node -e "writeFileSync(join(dir,'guard-push.test.mjs'),'x')"`;
  const targets = extractShellWriteTargets({ command, root: "/repo" });
  assert.ok(targets.some((t) => t.candidate === "guard-push.test.mjs" && t.lane === "opaque-interpreter-code"));
});

test("extractShellWriteTargets: an unparseable command with a named write executable falls back to path tokens on the 'unparsed-command' lane", () => {
  // A `;`-composed command is refused by the closed shell grammar and therefore unparseable
  // by parseGuardCommand -- the same shape guard-lifecycle-ready.mjs's own grammar tests use.
  const command = `rm ${TARGET}; echo done`;
  const targets = extractShellWriteTargets({ command, root: "/repo" });
  assert.ok(targets.some((t) => t.candidate === TARGET && t.lane === "unparsed-command"));
});

test("extractShellWriteTargets: an unparseable command naming no writer yields nothing", () => {
  const command = `cat ${TARGET}; echo done`;
  assert.deepEqual(candidates(command), []);
});

test("extractShellWriteTargets: PowerShell write cmdlets yield the operand on the 'powershell-write-cmdlet' lane, Get-Content yields nothing", () => {
  const targets = extractShellWriteTargets({ command: `Set-Content ${TARGET} "x"`, toolName: "PowerShell" });
  assert.ok(targets.some((t) => t.candidate === TARGET && t.lane === "powershell-write-cmdlet"));
  assert.deepEqual(
    extractShellWriteTargets({ command: `Get-Content ${TARGET}`, toolName: "PowerShell" }),
    [],
  );
});

test("extractShellWriteTargets: empty/blank command and a caller passing no arguments both yield an empty array", () => {
  assert.deepEqual(extractShellWriteTargets({ command: "", root: "/repo" }), []);
  assert.deepEqual(extractShellWriteTargets({ command: "   ", root: "/repo" }), []);
  assert.deepEqual(extractShellWriteTargets(), []);
});

// NVA-B-GITARGV (backlog:
// 2026-09-01-an-authorized-rebase-demands-a-fresh-po-signature-after-every-conflict.md,
// Requirement 3): git commands are parsed per subcommand rather than by the generic
// `operands(argv)` walk, so a `-c` global option's value and the subcommand itself are never
// mistaken for a path. Positive cases 3, 4, 5 from that item.

test("NVA-B-GITARGV case 3: a global -c KEY=VALUE is never a candidate, even as a separate argv entry", () => {
  assert.deepEqual(candidates("git -c core.editor=true rebase --continue"), []);
  // The glued form was never actually buggy (it already starts with "-"), pinned here so a
  // future change to the global-option skip cannot silently regress it either.
  assert.deepEqual(candidates("git -ccore.editor=true rebase --continue"), []);
});

test("NVA-B-GITARGV: a -c value is excluded independent of the rebase-specific no-pathspec rule", () => {
  // Case 3's own reproduction uses `rebase`, which is unconditionally candidate-free on its
  // own (see the GIT_NO_PATHSPEC_VERBS test below) -- this uses `restore` instead, so the
  // absence of "core.editor=true" here can only be explained by the global-option-value
  // exclusion, not by rebase's separate blanket rule.
  assert.deepEqual(candidates(`git -c core.editor=true restore -- ${TARGET}`), [TARGET]);
});

test("NVA-B-GITARGV case 4: git checkout --ours -- <path> yields only the real pathspec, never checkout/--ours/a revision", () => {
  assert.deepEqual(candidates(`git checkout --ours -- ${TARGET}`), [TARGET]);
  // The same shape with an explicit revision before "--" must drop the revision too.
  assert.deepEqual(candidates(`git checkout HEAD --ours -- ${TARGET}`), [TARGET]);
});

test("NVA-B-GITARGV: without a \"--\" separator, checkout still yields the bare token as a candidate (no narrowing)", () => {
  // git itself resolves this shape as a branch switch OR a restore-from-HEAD depending on
  // repository state; treating it as never a pathspec would stop detecting the genuine
  // "restore a protected file from HEAD without the safety --" bypass.
  assert.deepEqual(candidates(`git checkout ${TARGET}`), [TARGET]);
});

test("NVA-B-GITARGV case 5: git rebase --show-current-patch is a repository-wide mutator with no real pathspec, so it yields no candidates", () => {
  assert.deepEqual(candidates("git rebase --show-current-patch"), []);
  // Every other ordinary rebase invocation is equally candidate-free -- rebase never takes a
  // user-specified working-tree pathspec.
  assert.deepEqual(candidates("git rebase --continue"), []);
  assert.deepEqual(candidates("git rebase main"), []);
});

test("NVA-B-GITARGV: the git subcommand itself is never a candidate for any git write verb", () => {
  assert.ok(!candidates(`git restore ${TARGET}`).includes("restore"));
  assert.ok(candidates(`git restore ${TARGET}`).includes(TARGET));
});

// NVA-B-ROUNDK (round-K review findings F1 and F2 against the NVA-B-GITARGV change above).
// Both are regressions of Requirement 3/4 of the same backlog item, not new requirements.

/**
 * F1. Requirement 3 names `checkout` AND `restore` as the two subcommands whose real pathspecs
 * must be determined; only `checkout` got the `[<tree-ish>] [--] <pathspec>` grammar, so
 * `restore`'s tree-ish -- spelled `--source <rev>`, as a SEPARATE argv entry -- was still
 * extracted as a file candidate. The glued `--source=<rev>` form was never affected (it starts
 * with "-"), which is exactly why the defect survived: the two spellings disagreed.
 */
test("NVA-B-ROUNDK F1: git restore uses the same tree-ish/pathspec grammar as checkout", () => {
  assert.deepEqual(candidates(`git restore --source HEAD -- ${TARGET}`), [TARGET]);
  assert.deepEqual(candidates(`git restore --source=HEAD -- ${TARGET}`), [TARGET]);
  // Both spellings must now agree, which is the property the defect broke.
  assert.deepEqual(
    candidates(`git restore --source HEAD -- ${TARGET}`),
    candidates(`git restore --source=HEAD -- ${TARGET}`),
  );
  // No "--" at all: the bare "restore a protected file from HEAD without the safety --" bypass
  // shape must STILL be detected. Narrowing detection is not an acceptable way to close F1.
  assert.deepEqual(candidates(`git restore ${TARGET}`), [TARGET]);
});

/**
 * F2. `rebase`'s own operands are revisions and must never become file candidates
 * (Requirement 3), but the string argument of `--exec` is an opaque SHELL PAYLOAD, a different
 * token class in the same argv -- and Requirement 4 lists `exec` among the shapes that must
 * stay refused. The blanket `rebase -> []` rule dropped both classes at once. The payload is
 * handled on the established `opaque-interpreter-code` lane, the same lane `node -e`/`python3
 * -c` payloads already use, because it is the same kind of input: one opaque word whose
 * path-shaped runs are the candidates.
 */
test("NVA-B-ROUNDK F2: a git rebase --exec payload contributes its path-shaped tokens", () => {
  for (const command of [
    `git rebase --exec "sed -i s/a/b/ ${TARGET}" main`,
    `git rebase --exec="sed -i s/a/b/ ${TARGET}" main`,
    `git rebase -x "sed -i s/a/b/ ${TARGET}" main`,
    `git rebase --onto upstream --exec "rm ${TARGET}" main`,
  ]) {
    const targets = extractShellWriteTargets({ command, root: "/repo" });
    assert.ok(
      targets.some((t) => t.candidate === TARGET && t.lane === "opaque-interpreter-code"),
      `payload path not extracted: ${command}`,
    );
  }
});

test("NVA-B-ROUNDK F2, other direction: rebase's own revisions stay non-candidates", () => {
  // The whole point of the blanket rule stands: a revision is never a file candidate. Closing
  // F2 must not buy the payload back by reintroducing invented revision candidates.
  const withExec = candidates(`git rebase --exec "sed -i s/a/b/ ${TARGET}" main`);
  assert.ok(!withExec.includes("main"), "reintroduced a revision candidate");
  assert.ok(!withExec.includes("rebase"), "reintroduced the subcommand as a candidate");
  assert.ok(!withExec.includes("--exec"), "reintroduced the flag itself as a candidate");
  assert.deepEqual(candidates("git rebase main"), []);
  assert.deepEqual(candidates("git rebase --continue"), []);
  assert.deepEqual(candidates("git rebase --onto upstream topic"), []);
  assert.deepEqual(candidates("git -c core.editor=true rebase --continue"), []);
  // The payload's own tokens ARE contributed, unfiltered, exactly like every other opaque
  // payload on this lane (a bare word is path-shaped too; the rule set filters, not this list).
  // What must never appear beside them is a token from rebase's own operands -- here, `main`.
  assert.deepEqual(candidates('git rebase --exec "true" main'), ["true"]);
});

test("NVA-B-ROUNDK F2: the exec payload lane is only opened for the verb that has one", () => {
  // `git clean -x` is a real flag that takes NO value; treating "-x" as a payload option for
  // every git write verb would invent candidates out of its neighbours.
  assert.ok(!lanes(`git clean -x -d -f`).includes("opaque-interpreter-code"));
  assert.deepEqual(candidates("git clean -x -d -f"), []);
});

/**
 * F1 (round L). git's `parse-options` resolves any UNAMBIGUOUS prefix of a long option, so a
 * table keyed on the byte-identical spelling `--exec` was a bypass rather than a rule: the
 * abbreviation missed the table, `rebase` yields no operand candidates by design, and the
 * command was admitted with no candidate at all.
 *
 * MEASURED, not inferred -- real git executed in a throwaway fixture repository
 * (`scratch/nva-roundl/measure-f1.mjs`, output `scratch/nva-roundl/evidence/f1-measurement.txt`,
 * git 2.53.0): `git rebase --exe <cmd> main`, `--ex <cmd>`, `--exe=<cmd>` and `--ex=<cmd>` all
 * exited 0 and EXECUTED the payload; `--e` was refused as ambiguous ("could be --empty or
 * --exec"); `--execute` was refused as an unknown option. The finding is confirmed.
 */
test("NVA-B-ROUNDL F1: an abbreviated --exec spelling git actually accepts still yields the payload", () => {
  for (const command of [
    `git rebase --exe "sed -i s/a/b/ ${TARGET}" main`,
    `git rebase --ex "sed -i s/a/b/ ${TARGET}" main`,
    `git rebase --exe="sed -i s/a/b/ ${TARGET}" main`,
    `git rebase --ex="sed -i s/a/b/ ${TARGET}" main`,
    // Ambiguous for git itself, so this exact command never runs. Over-approximating git's
    // ambiguity check is the fail-CLOSED direction and costs only a candidate on a command git
    // already rejects -- the alternative is re-encoding git's ambiguity table here, which is
    // the same enumeration mistake one layer down.
    `git rebase --e "sed -i s/a/b/ ${TARGET}" main`,
  ]) {
    const targets = extractShellWriteTargets({ command, root: "/repo" });
    assert.ok(
      targets.some((t) => t.candidate === TARGET && t.lane === "opaque-interpreter-code"),
      `abbreviated payload option not extracted: ${command}`,
    );
  }
});

test("NVA-B-ROUNDL F1: a rebase long option enumerated in NEITHER table still yields its argument as a payload", () => {
  // The structural half of the finding, and the half a fix that merely adds `--exe` to a list
  // would leave open: behind a verb with no other candidate source, an unrecognised option must
  // fail CLOSED. None of these spellings is in the payload table or the known-option table --
  // including one that is not even a prefix of `--exec`.
  for (const command of [
    `git rebase --frobnicate "rm ${TARGET}" main`,
    `git rebase --run-command="rm ${TARGET}" main`,
    `git rebase --exec-on-each "rm ${TARGET}" main`,
  ]) {
    const targets = extractShellWriteTargets({ command, root: "/repo" });
    assert.ok(
      targets.some((t) => t.candidate === TARGET && t.lane === "opaque-interpreter-code"),
      `an unenumerated option's argument was not treated as a payload: ${command}`,
    );
  }
});

test("NVA-B-ROUNDL F1: closing the abbreviation hole narrows nothing -- ordinary rebase stays candidate-free", () => {
  // The four shapes the finding's own scope names, re-asserted here so a future change to the
  // payload lane cannot buy coverage by inventing revision candidates.
  assert.deepEqual(candidates("git rebase main"), []);
  assert.deepEqual(candidates("git rebase --continue"), []);
  assert.deepEqual(candidates("git rebase --onto upstream topic"), []);
  assert.deepEqual(candidates("git -c core.editor=true rebase --continue"), []);
  // Abbreviations of a KNOWN non-payload option must stay non-payload as well, or every
  // short-hand invocation starts inventing candidates out of its neighbours.
  assert.deepEqual(candidates("git rebase --cont"), []);
  assert.deepEqual(candidates("git rebase --ont upstream topic"), []);
  assert.deepEqual(candidates("git rebase --no-autosquash main"), []);
  // And the payload lane itself still contributes exactly the payload, nothing beside it.
  assert.deepEqual(candidates('git rebase --exe "true" main'), ["true"]);
});
