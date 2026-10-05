// SPDX-License-Identifier: SUL-1.0
// Guard module "rebase-lane" (layer 4), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { basename } from "node:path";
import { resolveActiveRebaseAuthority } from "../guard-devplan-policy.mjs";
import { rebaseAuthorityPermitsCommand } from "../rebase-authority.mjs";
import { parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { CLAUDE_BASH_SHELL_DIALECT_PLATFORM } from "./constants.mjs";
import { isReadOnlyDiagnosticCommand } from "./shell-grammar.mjs";
import { verdict } from "./verdict.mjs";
import { isNarrowRepositoryRecoveryCommand } from "./sanctioned-args-scripts.mjs";

// ---- rebase authority (NVA-B-REBWIRE-1) -------------------------------------------------
// backlog: 2026-09-01-an-authorized-rebase-demands-a-fresh-po-signature-after-every-conflict.md
//
// Three things, and deliberately not a fourth. (1) One memoized resolution per guard
// invocation, so the shell lane and the denial disclosure below never pay for the same six
// read-only git calls twice. (2) A relief that clears ONLY the dev-plan objection, expressed as
// a LIFT rather than a `verdict(0)` return: the gate-strength lane and the protected-test-path
// lane are evaluated before it and are unreachable from it, and every later check -- the
// cross-repository refusal, the closed shell grammar, the readiness kernel -- still runs against
// the lifted command exactly as NOVA-LCR-HGO-2 established for the grammar lift. (3) A refusal,
// because Requirement 4's prohibitions have to be enforced somewhere and this is the layer that
// sees the command: while an authorized rebase is in progress, a `git rebase` invocation the
// resolved authority does not list, and any global git option other than the exact
// `-c core.editor=true`, are refused outright rather than left to the pre-existing lanes.
//
// The fourth thing, stated so its absence is legible: no push lane. This guard has never
// refused `git push` -- `guard-push.mjs` owns that gate -- and nothing here grants, implies or
// represents push authority. `pushAuthority`/`remoteAuthority` are printed as false in every
// disclosure, and the resolver's own predicate refuses every push shape.

const REBASE_SHAPE_DENIAL_CODE = "GUARD-REBASE-AUTHORITY-SHAPE";

/**
 * The resolved rebase authority for this evaluation, at most once per guard invocation.
 * `dependencies.rebaseAuthorityMemo` is created by the exported entry point; a caller that
 * reaches an inner function without one still gets a correct (merely unmemoized) answer.
 */
export function activeRebaseAuthority(root, dependencies = {}) {
  const memo = dependencies.rebaseAuthorityMemo;
  if (memo === undefined || memo === null) return resolveActiveRebaseAuthority(root, dependencies);
  if (memo.resolved !== true) {
    memo.value = resolveActiveRebaseAuthority(root, dependencies);
    memo.resolved = true;
  }
  return memo.value;
}

/**
 * The one line THIS guard prints when IT admits something it would otherwise have blocked --
 * this file's own twin of `lib/guard-devplan-policy.mjs`'s `rebaseAuthorityAdmissionNotice()`.
 * Deliberately NOT reused: that text hardcodes "dev-plan gate suspended", which is correct for
 * its own two callers (the dev-plan gate's Edit|Write and shell lanes) and would be a FALSE
 * audit line here -- the writer-owned-State refusal and the onboarding-readiness kernel are
 * two different gates this file owns itself, and guard-devplan-policy.mjs is out of scope for
 * this change (NVA-REBDEAD-1). Kept as loud as the refusal it replaces, for the identical
 * reason that module states: a lifecycle gate that suspends itself silently is
 * indistinguishable, in an audit, from a gate that was never armed.
 */
export function lifecycleRebaseAdmissionNotice(result, gate, subject) {
  const authority = result.authority;
  return `[rebase-authority] ${gate} is suspended for this ${subject}: it lies inside the `
    + `current conflict surface of the active rebase of ${authority.headName} onto `
    + `${authority.onto}, whose orig-head ${authority.origHead} is validly approved and in `
    + "implementation. Nothing else is lifted, and no push authority is granted.";
}

/**
 * Requirement 4 at the command layer: what an active, genuinely authorized rebase still refuses.
 *
 * Scoped to an ACTIVE authority on purpose -- with no rebase resolved this returns null and
 * nothing about the guard's behaviour changes, so this can never become a new general refusal.
 * The two pre-existing lanes it must not disturb are excluded first and by name: the narrow
 * `git rebase --abort` recovery command keeps its own admission (positive case 5, independent of
 * this authority), and anything the read-only diagnostic classifier already admits stays
 * admitted -- refusing a read would be a regression, not a protection.
 *
 * The `git rebase` decision defers entirely to `rebaseAuthorityPermitsCommand()`, so `--skip`,
 * `--edit-todo` and `--exec` are refused because they are absent from the resolver's admitted
 * table, never because a second list here names them. A list here would be the copy that drifts.
 *
 * @returns {null|{element: string, why: string}}
 */
export function rebaseAuthorityShapeRefusal(command, root, authority) {
  if (authority === null || typeof command !== "string" || command === "") return null;
  if (isNarrowRepositoryRecoveryCommand(command, root)) return null;
  if (isReadOnlyDiagnosticCommand(command, root)) return null;
  const parsed = parseGuardCommand(command, root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
  if (parsed.parseStatus !== "accepted" || !Array.isArray(parsed.segments) || parsed.segments.length !== 1) {
    return null; // the closed-grammar lane below owns every unparsed or composed command
  }
  const segment = parsed.segments[0];
  const executable = basename(String(segment.executable ?? "").replace(/\\/gu, "/"))
    .toLowerCase().replace(/\.exe$/u, "");
  if (executable !== "git") return null;
  const argv = Array.isArray(segment.argv) ? segment.argv : [];
  let index = 0;
  while (index < argv.length && String(argv[index]).startsWith("-")) {
    if (argv[index] === "-c" && argv[index + 1] === "core.editor=true") {
      index += 2;
      continue;
    }
    // Requirement 4's prohibition is "no arbitrary -c", and it is exactly that -- not "no
    // global options". Every OTHER leading option (`--no-pager`, `-p`, `--git-dir=…`) is left
    // to the lanes that already judge it: refusing them here would invent a mid-rebase
    // refusal the spec never asked for, and would silently take away reads that were admitted
    // a moment before the rebase started.
    if (argv[index] !== "-c" && !/^-c./u.test(String(argv[index]))) return null;
    return {
      element: `the global git config option "${argv[index]}"`,
      why: "Requirement 4 admits no arbitrary -c while this authority is active. The only "
        + "admitted spelling is \"-c core.editor=true\" as two separate tokens, and only "
        + "directly in front of \"rebase --continue\".",
    };
  }
  if (argv[index] !== "rebase") return null;
  if (rebaseAuthorityPermitsCommand(authority, command)) return null;
  return {
    element: `"git ${argv.slice(index).join(" ")}"`,
    why: "Only the exact continuations the resolved authority lists are admitted while a rebase "
      + "is in progress. --skip, --edit-todo and --exec are absent from that table by "
      + "construction rather than filtered out of it, and \"git rebase --abort\" keeps its own "
      + "separate recovery lane.",
  };
}

/**
 * No override route is offered for this code, and that is the decision rather than an omission:
 * Requirement 4 forbids a general exception, and a signable lift for exactly the shapes it
 * prohibits would be that exception wearing a ceremony. The route forward is the disclosure
 * block every mid-rebase denial carries.
 */
export function rebaseAuthorityShapeBlocked(refusal) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${REBASE_SHAPE_DENIAL_CODE}: ${refusal.element} is not admitted while an authorized `
      + "rebase is in progress.\n"
      + `Why: ${refusal.why}\n`
      + "This refusal stands on the shape of the command alone. It is not a report that the "
      + "rebase lacks authority -- it has one, described just below -- and no human signature "
      + "lifts it.\n",
  );
}
