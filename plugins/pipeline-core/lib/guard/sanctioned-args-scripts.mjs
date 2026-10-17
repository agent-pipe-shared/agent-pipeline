import { createHash } from "node:crypto";
// SPDX-License-Identifier: SUL-1.0
// Guard module "sanctioned-args-scripts" (layer 2), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { isPhysicalScratchTarget } from "../physical-scratch-boundary.mjs";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { classifyVerifyCommand } from "../../scripts/pipeline-state.mjs";
import { observeReaderPlanScope } from "../doc-reader-plan-scope.mjs";
import { USER_SOURCE_PATH, readHumanApprovalMode } from "../critical-human-proof-policy.mjs";
import { GOVERNANCE_SCOPE_DIAGNOSE_SCRIPT, HEX, START_PREFLIGHT_SCRIPT, VALID_RUNNERS } from "./constants.mjs";
import { isRealpathedWithinBoundary, pathInside } from "./path-containment.mjs";
import * as SANCTIONED_CONSTANTS from "./constants.mjs";
import { exactRoot, matchFlagSpec, simpleWords } from "./shell-grammar.mjs";

export function sanctionedSessionCriticFinalizerArgs(args, root) {
  const exactProjectRoot = exactRoot(args, root, 1)
    || (args[1] === "--root" && args[2] === "."
      && resolve(root, args[2]) === resolve(root)
      && isRealpathedWithinBoundary(resolve(root, args[2]), root));
  if (!(["admit", "finalize", "register-batch", "append-correction"].includes(args[0])) || !exactProjectRoot
    || args[3] !== "--request" || args.length !== 5) return false;
  const request = args[4];
  if (typeof request !== "string" || request.length === 0 || request.length > 256
    || request.includes("\\") || request.includes("\0") || isAbsolute(request)
    || !request.endsWith(".json")) return false;
  const components = request.split("/");
  if (components[0] !== "scratch" || components.some((part) => part === "" || part === "." || part === "..")) return false;
  return isRealpathedWithinBoundary(resolve(root, request), root)
    && isPhysicalScratchTarget(request, { rootDir: root });
}

/**
 * NVA-K-DRIVERREACH: the guided driver's own exact argv surface (`parseArgs()` in
 * scripts/onboarding-init.mjs). The ordinary driving shape keeps `--root <root>` required,
 * with `--runner <claude|codex|antigravity>` and `--step-cap <positive integer>` optional.
 * A second, closed shape is the attended first-anchor bootstrap published by the driver's
 * own collect-input contract: it requires an explicit runner plus all four setup answers,
 * permits no step cap, pins the destination/key paths outside this repository, and enforces
 * the mode-dependent `absolute existing path` versus literal `none` choice here as well as
 * in the driver. Raw po-human-approval setup remains denied by isHumanPoSigningCommand().
 * order-insensitive via matchFlagSpec() like every sibling admission above. Deliberately
 * NOT admitting `--help`/`-h` here (unlike GF-093's ONBOARDING_SCRIPT admission just above):
 * the acceptance criteria this closes name only the three chaining flags, so this stays the
 * narrower of the two shapes the driver's own parser would accept rather than the widest.
 * `--step-cap`'s validator mirrors parseArgs()'s own `Number(raw)` / `Number.isInteger` /
 * `>= 1` check exactly, so this can never admit a value the driver's own parser would itself
 * refuse.
 */
export function sanctionedDriverArgs(args, root) {
  const ordinary = matchFlagSpec(args, {
    requiredValue: { "--root": (value) => value === root },
    optionalValue: {
      "--runner": (value) => VALID_RUNNERS.has(value),
      "--step-cap": (value) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= 1;
      },
    },
  });
  if (ordinary) return true;

  const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0 && !value.startsWith("--");
  const externalAbsolute = (value) => isAbsolute(value) && !pathInside(root, resolve(value));
  const initialAnswers = matchFlagSpec(args, {
    requiredValue: {
      "--root": (value) => value === root,
      "--runner": (value) => VALID_RUNNERS.has(value),
      "--language": (value) => value === "de" || value === "en",
      "--advisor-export-consent": (value) => value === "approved" || value === "declined",
    },
    // The public driver emits --human-approval. --push-approval remains a
    // read-compatible spelling for previously copied commands, but an action
    // must never be refused merely because the driver and this guard chose
    // different names for the same one-of policy field.
    requiredValueOneOf: {
      "--human-approval": (value) => value === "signature" || value === "chat",
      "--push-approval": (value) => value === "signature" || value === "chat",
    },
    optionalValue: {
      "--git-author-name": (value) => nonEmpty(value) && value.length <= 320,
      "--git-author-email": (value) => nonEmpty(value) && value.length <= 320,
      "--trust-anchor-mode": (value) => value === "existing" || value === "new",
      "--trust-anchor-directory": externalAbsolute,
      "--trust-anchor-human-name": (value) => nonEmpty(value) && value.length <= 512,
      "--trust-anchor-existing-key": (value) => value === "none" || externalAbsolute(value),
    },
  });
  if (initialAnswers) {
    const has = (flag) => args.includes(flag);
    const identityComplete = has("--git-author-name") === has("--git-author-email");
    const trustFlags = ["--trust-anchor-mode", "--trust-anchor-directory", "--trust-anchor-human-name", "--trust-anchor-existing-key"];
    const trustCount = trustFlags.filter(has).length;
    return identityComplete && trustCount === 0;
  }
  const bootstrap = matchFlagSpec(args, {
    requiredValue: {
      "--root": (value) => value === root,
      "--runner": (value) => VALID_RUNNERS.has(value),
      "--trust-anchor-mode": (value) => value === "existing" || value === "new",
      "--trust-anchor-directory": externalAbsolute,
      "--trust-anchor-human-name": (value) => nonEmpty(value) && value.length <= 512,
      "--trust-anchor-existing-key": (value) => value === "none" || externalAbsolute(value),
    },
  });
  if (!bootstrap) return false;
  const valueAfter = (flag) => args[args.indexOf(flag) + 1];
  const mode = valueAfter("--trust-anchor-mode");
  const existingKey = valueAfter("--trust-anchor-existing-key");
  return mode === "new" ? existingKey === "none" : existingKey !== "none";
}

/**
 * NVA-V4-PUSHDRIVER: push-init.mjs's own exact argv surface (`parseArgs()` in
 * scripts/push-init.mjs) and nothing wider than it -- `--root <root>` required and pinned to
 * the observed root (same discipline as sanctionedDriverArgs() above), `--by`/`--remote`/
 * `--destination` required, `--base` optional. Validators mirror the target script's OWN
 * argv handling exactly rather than being invented here: `--destination` matches push-
 * prepare.mjs's `DESTINATION_RE` (`^refs\/heads\/[A-Za-z0-9._/-]{1,200}$`), `--remote`
 * matches its `REMOTE_RE` (`^[A-Za-z0-9._-]{1,80}$`) -- push-init.mjs forwards both
 * unchanged into `pushPrepareReport()`, so a value this guard admitted but that script would
 * refuse could never actually happen. `--by` and `--base` accept any non-empty, non-flag
 * string: `--by` is free-form attribution text (push-prepare.mjs itself does not further
 * constrain it beyond non-blank), and `--base` is any git revision expression check-doc-
 * reconciliation.mjs's own `--base <ref>` accepts (a branch name, a SHA, `HEAD~N`, a tag --
 * never just hex, so this deliberately does NOT reuse isHexDigest).
 */
export function sanctionedPushInitArgs(args, root) {
  const isDestinationValue = (value) => typeof value === "string" && /^refs\/heads\/[A-Za-z0-9._/-]{1,200}$/u.test(value);
  const isRemoteValue = (value) => typeof value === "string" && /^[A-Za-z0-9._-]{1,80}$/u.test(value);
  const nonEmptyNotFlagValue = (value) => typeof value === "string" && value.trim() !== "" && !value.startsWith("--");
  return matchFlagSpec(args, {
    requiredValue: {
      "--root": (value) => value === root,
      "--by": nonEmptyNotFlagValue,
      "--remote": isRemoteValue,
      "--destination": isDestinationValue,
    },
    optionalValue: { "--base": nonEmptyNotFlagValue },
  });
}

export function sanctionedTranscriptRecoveryArgs(args, root) {
  // Explicit metadata-only current-session action; grants no path/content read.
  if (args[0] === "audit-current") {
    return matchFlagSpec(args.slice(1), { requiredValue: {
      "--root": (value) => value === root,
      "--runner": (value) => value === "codex",
      "--metadata-consent": (value) => value === "approved",
    } });
  }
  const sessionId = (value) => typeof value === "string"
    && value.trim() !== "" && !value.startsWith("-") && Buffer.byteLength(value, "utf8") <= 500;
  const base = {
    requiredValue: {
      "--root": (value) => value === root,
      "--runner": (value) => value === "codex",
      "--exclude-session": sessionId,
    },
  };
  // Preserve the original flag-only reader for compatibility.  `list` and
  // `read` are the only operation prefixes: their exact flag sets keep this
  // hook from becoming a general runner-session directory read capability.
  if (args[0] === "list") return matchFlagSpec(args.slice(1), base);
  if (args[0] === "read") {
    return matchFlagSpec(args.slice(1), {
      ...base,
      requiredValue: { ...base.requiredValue, "--session-id": sessionId },
    });
  }
  // ALF-C-N1-02C: `export` takes the read flag set but admits all three runners, because the Claude and
  // Antigravity usage is part of the export (their storage adapters are the script's own business).
  if (args[0] === "export") {
    return matchFlagSpec(args.slice(1), {
      requiredValue: {
        ...base.requiredValue,
        "--runner": (value) => ["codex", "claude", "antigravity"].includes(value),
        "--session-id": sessionId,
      },
    });
  }
  return matchFlagSpec(args, base);
}

export function sanctionedMigrationArgs(args, root) {
  // NVA-BOOTADMIT-2: both branches route through matchFlagSpec() so the flag SET stays exact
  // while its ORDER no longer matters, same rationale as sanctionedOnboardingArgs() above.
  if (["inspect", "plan"].includes(args[0])
    && matchFlagSpec(args.slice(1), { requiredValue: { "--root": (value) => value === root } })) return true;
  if (args[0] !== "apply") return false;
  return matchFlagSpec(args.slice(1), {
    requiredValue: { "--root": (value) => value === root },
    required: { "--activate": true },
    optional: { "--initialize-missing-runtime": true },
  });
}

// GF-060 (backlog: 2026-08-09-guard-lifecycle-ready-runner-allowlist-incomplete.md;
// originally GF-059's finding (a), never merged -- HEAD carried none of this widening,
// for any subcommand). session-cleanup.mjs's own USAGE text and arg-parsing table
// document and accept an optional `--runner claude|codex` pair on every one of its
// subcommands (ADR-0051's runner threading). Same optional-tail style as
// sanctionedHumanOverrideArgs()'s exactAuthorRoot(...): a fixed base shape, plus an
// exact optional suffix -- never a loosened match on the base shape itself, so a wrong
// runner value, extra/misordered args, or a duplicate --runner still falls through to
// exact rejection.
export function sanctionedSessionCleanupArgs(args, root) {
  const exactRunnerTail = (index) => args[index] === "--runner"
    && (args[index + 1] === "claude" || args[index + 1] === "codex");
  if (["start", "status", "release-binding", "plan-recovery", "plan-human-recovery", "plan-privatization", "plan-archive-orphan"].includes(args[0])) {
    const base = args[1] === "--repo" && args[2] === root;
    return base && (args.length === 3 || (exactRunnerTail(3) && args.length === 5));
  }
  if (args[0] === "release-orphan-binding") {
    const validBy = (value) => typeof value === "string"
      && value.trim() !== "" && Buffer.byteLength(value, "utf8") <= 500;
    const validReason = (value) => typeof value === "string"
      && value.trim() !== "" && Buffer.byteLength(value, "utf8") <= 2000;
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--by" && validBy(args[4])
      && args[5] === "--reason" && validReason(args[6]);
    return base && (args.length === 7 || (exactRunnerTail(7) && args.length === 9));
  }
  // ALFRED-QP3: archive-orphan (scripts/session-cleanup.mjs, commit 7fa9c77cf) -- a zero-authority archive of ONE foreign
  // orphan descriptor. Exact closed argv exactly like release-orphan-binding above plus the cleanup branch's descriptor
  // id and digest pair; --owner-nonce-file is deliberately NOT admitted (a plain archive of a zero-authority orphan needs
  // no owner secret, and the guard must not become a route for a nonce file).
  if (args[0] === "archive-orphan") {
    const validBy = (value) => typeof value === "string"
      && value.trim() !== "" && Buffer.byteLength(value, "utf8") <= 500;
    const validReason = (value) => typeof value === "string"
      && value.trim() !== "" && Buffer.byteLength(value, "utf8") <= 2000;
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--session-descriptor"
      && /^[A-Za-z0-9._-]{1,80}$/u.test(args[4] ?? "") && !/^\.{1,2}$/u.test(args[4])
      && args[5] === "--expected-descriptor-sha256" && HEX.test(args[6] ?? "")
      && args[7] === "--by" && validBy(args[8])
      && args[9] === "--reason" && validReason(args[10]);
    return base && (args.length === 11 || (exactRunnerTail(11) && args.length === 13));
  }
  if (args[0] === "confirm-privatization") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--accept";
    return base && (args.length === 6 || (exactRunnerTail(6) && args.length === 8));
  }
  if (["apply-recovery", "apply-privatization"].includes(args[0])) {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--activate";
    return base && (args.length === 6 || (exactRunnerTail(6) && args.length === 8));
  }
  const base = args[0] === "cleanup"
    && args[1] === "--repo" && args[2] === root
    && args[3] === "--session-descriptor"
    && /^[A-Za-z0-9._-]{1,80}$/u.test(args[4] ?? "")
    && args[5] === "--expected-descriptor-sha256"
    && HEX.test(args[6] ?? "");
  return base && (args.length === 7 || (exactRunnerTail(7) && args.length === 9));
}

/**
 * A partially initialized lifecycle must not strand Git's own reversible
 * operation state. This admits only the exact local abort; ordinary status,
 * diff and rev-parse readback already use the read-only diagnostic path.
 */
export function isNarrowRepositoryRecoveryCommand(command, root) {
  const words = simpleWords(command, root);
  if (!words) return false;
  let index = 0;
  if (basename(words[index]).toLowerCase() !== "git") return false;
  index += 1;
  if (words[index] === "-C") {
    const target = words[index + 1];
    if (typeof target !== "string" || resolve(root, target) !== root) return false;
    index += 2;
  }
  return words[index] === "rebase"
    && words[index + 1] === "--abort"
    && index + 2 === words.length;
}

function sanctionedPoAuthorityRebindArgs(args, root) {
  const exactRunnerTail = (index) => args[index] === "--runner"
    && VALID_RUNNERS.has(args[index + 1]);
  if (args[0] === "po-authority-decision-plan" && args.length === 1) return true;
  if (args[0] === "po-authority-decision-select") {
    const base = args[1] === "--plan-sha256" && HEX.test(args[2] ?? "")
      && args[3] === "--planned-at"
      && typeof args[4] === "string" && Number.isFinite(Date.parse(args[4]))
      && new Date(args[4]).toISOString() === args[4]
      && args[5] === "--selection" && new Set(["prd", "spec"]).has(args[6]);
    return base && (args.length === 7 || (exactRunnerTail(7) && args.length === 9));
  }
  if (args[0] === "po-authority-decision-apply") {
    const base = args[1] === "--plan-sha256" && HEX.test(args[2] ?? "")
      && args[3] === "--selection-digest" && HEX.test(args[4] ?? "")
      && args[5] === "--planned-at"
      && typeof args[6] === "string" && Number.isFinite(Date.parse(args[6]))
      && new Date(args[6]).toISOString() === args[6]
      && args[7] === "--selection" && args[8] === "spec"
      && args[9] === "--activate";
    return base && (args.length === 10 || (exactRunnerTail(10) && args.length === 12));
  }
  const nonBlankValue = (value) => typeof value === "string"
    && value.trim().length > 0;
  const targetValue = (value) => nonBlankValue(value) && !value.startsWith("--");
  const canonicalIsoValue = (value) => typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
  // POACKROOT: the writer now publishes an explicit project root in both the
  // plan invocation and its nested apply argv. Admit only that exact root-
  // bound flag set, with duplicate/unknown flags rejected by matchFlagSpec().
  // The historical cwd-relative apply spelling below remains byte-for-byte
  // admitted; the historical root-less plan remains unavailable as before.
  if (args[0] === "po-authority-acknowledge-plan") {
    const matched = matchFlagSpec(args.slice(1), {
      requiredValue: {
        "--root": (value) => value === root,
        "--by": targetValue,
        "--runner": (value) => VALID_RUNNERS.has(value),
      },
      optionalValue: {
        "--profile": (value) => ["epic", "feature", "mini"].includes(value),
        "--reason": (value) => nonBlankValue(value) && !/[\x00-\x1f\x7f]/u.test(value)
          && Buffer.byteLength(value, "utf8") <= 2048,
      },
    });
    return matched && args.includes("--profile") === args.includes("--reason");
  }
  if (args[0] === "po-authority-acknowledge-apply") {
    const historicalCwdShape = args[1] === "--plan-sha256" && HEX.test(args[2] ?? "")
      && args[3] === "--updated-at"
      && canonicalIsoValue(args[4])
      && args[5] === "--by" && nonBlankValue(args[6])
      && args[7] === "--activate" && args.length === 8;
    if (historicalCwdShape) return true;
    return matchFlagSpec(args.slice(1), {
      requiredValue: {
        "--root": (value) => value === root,
        "--plan-sha256": (value) => HEX.test(value ?? ""),
        "--updated-at": canonicalIsoValue,
        "--by": targetValue,
      },
      required: { "--activate": true },
      optionalValue: { "--runner": (value) => VALID_RUNNERS.has(value) },
    });
  }
  const rebindApply = args[0] === "po-authority-rebind-apply"
    && args[1] === "--plan-sha256"
    && HEX.test(args[2] ?? "")
    && args[3] === "--updated-at"
    && typeof args[4] === "string"
    && Number.isFinite(Date.parse(args[4]))
    && new Date(args[4]).toISOString() === args[4]
    && args[5] === "--activate";
  return rebindApply && (args.length === 6 || (exactRunnerTail(6) && args.length === 8));
}

// Review receipts must be existing regular files reached without physical aliases.
function designReviewReceiptPath(value, root) {
  if (typeof value !== "string" || value.length === 0
    || Buffer.byteLength(value, "utf8") > 500 || isAbsolute(value)
    || /[\\:\x00-\x1f\x7f]/u.test(value) || !value.endsWith(".json")) return false;
  const parts = value.split("/");
  if (parts.some(part => part === "" || part === "." || part === "..")) return false;
  try {
    let current = realpathSync(root);
    if (!lstatSync(current).isDirectory()) return false;
    for (let index = 0; index < parts.length; index += 1) {
      current = join(current, parts[index]);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || realpathSync(current) !== current
        || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) return false;
    }
    return true;
  } catch { return false; }
}

export function sanctionedPipelineStateArgs(args, root) {
  // `inspect` is a pure read of the current working tree and intentionally has no
  // `--root` override; the caller must run it from the repository it is inspecting.
  if (args[0] === "inspect") return args.length === 1;
  // Closed canonical enrollment routes; the writer owns all CAS, consent and lock checks.
  if (args[0] === "inspect-enrollment-retirement") {
    return exactRoot(args, root, 1) && args.length === 3;
  }
  if (args[0] === "retire-enrollment" || args[0] === "activate-enrollment") {
    return matchFlagSpec(args.slice(1), {
      requiredValue: {
        "--root": (value) => value === root,
        "--scope-key": (value) => /^[a-f0-9]{64}$/u.test(value ?? ""),
        "--barrier-sha256": (value) => /^[a-f0-9]{64}$/u.test(value ?? ""),
        "--by": (value) => typeof value === "string" && value.trim() !== ""
          && value.length <= 256 && !/[\x00-\x1f]/u.test(value),
      },
    });
  }
  if (args[0] === "materialize-architecture") return args.length === 1;
  const validBy = (value) => typeof value === "string"
    && value.trim() !== "" && Buffer.byteLength(value, "utf8") <= 500;
  if (args[0] === "plan-legacy-v2-revocation-recovery") {
    return args[1] === "--by" && validBy(args[2]) && args.length === 3;
  }
  // The plan is a safe diagnostic.  Applying recovery in a non-ready legacy
  // state deliberately remains denied so the central adapter can consume its
  // exact, one-time attended Human-override capability.  Merely spelling a
  // valid digest-bound argv is never Human authority.
  if (args[0] === "apply-legacy-v2-revocation-recovery") return false;
  if (args[0] === "reopen-design") {
    return args[1] === "--by" && validBy(args[2]) && args.length === 3;
  }
  if (args[0] === "cancel-submitted-plan") {
    return args[1] === "--by" && validBy(args[2])
      && args[3] === "--submission-sha256" && /^[a-f0-9]{64}$/u.test(args[4] ?? "")
      && args.length === 5;
  }
  if (args[0] === "cancel-mixed-plan-state") {
    return args[1] === "--by" && validBy(args[2])
      && args[3] === "--reason" && validBy(args[4])
      && args[5] === "--submission-sha256" && /^[a-f0-9]{64}$/u.test(args[6] ?? "")
      && args[7] === "--approval-sha256" && /^[a-f0-9]{64}$/u.test(args[8] ?? "")
      && args[9] === "--invalidation-sha256" && /^[a-f0-9]{64}$/u.test(args[10] ?? "")
      && args.length === 11;
  }
  if (args[0] === "submit-plan") {
    return args[1] === "--by" && validBy(args[2])
      && args[3] === "--profile" && new Set(["epic", "feature", "mini"]).has(args[4])
      && args.length === 5;
  }
  if (args[0] === "present-plan") {
    if (args[1] !== "--by" || !validBy(args[2]) || args[2].startsWith("--")
      || ![3, 5, 7].includes(args.length)) return false;
    const receipts = new Set();
    for (let index = 3; index < args.length; index += 2) {
      if (args[index] !== "--review-receipt" || receipts.has(args[index + 1])
        || !designReviewReceiptPath(args[index + 1], root)) return false;
      receipts.add(args[index + 1]);
    }
    return true;
  }
  if (args[0] === "approve-plan") {
    // Signature-mode inspect offers the producer's exact request without --by.
    // Admit its closed transport only; the writer still verifies current
    // presentation, submission, policy and PO proof and derives the signer.
    if (args[1] === "--design-approval-request") {
      const requestPath = args[2];
      if (args.length !== 3
        || !/^scratch\/design-approval-request-[a-f0-9]{64}\.json$/u.test(requestPath ?? "")) return false;
      try {
        return isPhysicalScratchTarget(requestPath, { rootDir: root })
          && lstatSync(resolve(root, requestPath)).isFile();
      } catch { return false; }
    }
    if (args[3] === "--design-approval-request") {
      const requestPath = args[4];
      if (args.length !== 5 || args[1] !== "--by" || !validBy(args[2])
        || args[2].startsWith("--")
        || !/^scratch\/design-approval-request-[a-f0-9]{64}\.json$/u.test(requestPath ?? "")) return false;
      try {
        return isPhysicalScratchTarget(requestPath, { rootDir: root })
          && lstatSync(resolve(root, requestPath)).isFile();
      } catch { return false; }
    }
    const attributedLegacy = args[1] === "--by" && validBy(args[2]) && args.length === 3;
    const bootstrapReceipt = args[1] === "--bootstrap-acknowledgement-receipt"
      && /^scratch\/bootstrap-plan-acknowledgement-receipt-[a-f0-9]{64}\.json$/u.test(args[2] ?? "")
      && args.length === 3;
    // The inspection producer's feature-package route carries the exact request
    // generated by present-plan. This admits only its closed argv shape and a
    // physically contained request file; pipeline-state.mjs still verifies the
    // package, PO proof/confirmation, and lifecycle CAS before writing approval.
    const requestPath = args[4];
    const featureRequest = args[1] === "--by" && validBy(args[2])
      && args[3] === "--design-workflow-approval-request"
      && /^scratch\/design-workflow-approval-request-[a-f0-9]{64}\.json$/u.test(requestPath ?? "")
      && existsSync(resolve(root, requestPath))
      && isPhysicalScratchTarget(requestPath, { rootDir: root })
      && args.length === 5;
    return attributedLegacy || bootstrapReceipt || featureRequest;
  }
  if (args[0] === "approve-push") {
    // ADR-0076's committed global chat choice already permits attribution by
    // the agent. Classify only this existing writer's closed argv; the writer
    // still owns candidate, destination and approval-record validation.
    if (!matchFlagSpec(args.slice(1), {
      requiredValue: {
        "--by": (value) => validBy(value) && !value.startsWith("--"),
        "--remote": (value) => typeof value === "string" && !value.startsWith("--")
          && /^[A-Za-z0-9._-]{1,80}$/u.test(value),
        "--destination": (value) => typeof value === "string" && /^refs\/heads\/[A-Za-z0-9._/-]{1,200}$/u.test(value),
      },
    })) return false;
    try {
      const approval = readHumanApprovalMode(root, { legacyKind: "push" });
      return approval?.mode === "chat"
        && approval?.scope === "global"
        && approval?.source === USER_SOURCE_PATH;
    } catch {
      return false;
    }
  }
  // AC-207 (PO decision 2026-10-16 #10 A): the continuity writer verbs in the exact grammar
  // `<verb> --expected-revision <absent|int> --request-file scratch/<name>.json --lock-token <token>`,
  // each flag exactly once in any order; the writer still owns every CAS and lock check.
  if (args[0] === "continuity-cas" || args[0] === "continuity-integrate-final") {
    return matchFlagSpec(args.slice(1), {
      requiredValue: {
        "--expected-revision": (value) => value === "absent" || /^[0-9]+$/u.test(value ?? ""),
        "--request-file": (value) => /^scratch\/[A-Za-z0-9._-]+\.json$/u.test(value ?? ""),
        "--lock-token": (value) => /^[A-Za-z0-9._-]{1,128}$/u.test(value ?? ""),
      },
    });
  }
  if (args[0] === "set-phase") {
    const bareTransition = args[1] === "--phase"
      && new Set(["design", "implementation"]).has(args[2])
      && args.length === 3;
    const greenfieldVerifyTransition = args[1] === "--phase" && args[2] === "implementation"
      && args[3] === "--verify-command"
      && classifyVerifyCommand(args[4]) === "configured"
      && args.length === 5;
    return bareTransition || greenfieldVerifyTransition;
  }
  return sanctionedPoAuthorityRebindArgs(args, root);
}

/**
 * The closed value set of the repair script's own parser (`SUPPORTED_LANGUAGES`), which
 * is also the set the gate prints as `<de|en>`. Kept as a literal rather than imported:
 * this hook stays self-contained, and the suite pins it against the script's source so
 * the two cannot drift apart silently.
 */
const PO_PROFILE_REPAIR_LANGUAGES = new Set(["de", "en"]);

/**
 * `--human-facing <de|en>` is the language route the repair script writes into the apply
 * argv it emits itself (`buildPlan`'s `action.argv`) and the gate names as the operator's
 * next step ("add --human-facing <de|en>"). Until this branch existed, every clause below
 * refused that exact argv, so the printed route dead-ended in precisely the state it
 * exists for -- a freshly onboarded or half-configured project whose lifecycle is not
 * ready.
 *
 * Admission stays as narrow as its siblings. The flag is accepted POSITIONALLY, in the
 * single position the script emits it -- directly after `--root <root>`, ahead of the
 * digest -- against the closed set above, with an exact total `args.length` per shape and
 * the digest and `--activate` still checked by position. A reordered, duplicated,
 * out-of-set or padded variant matches no branch; no length range and no wildcard word is
 * introduced.
 */
export function sanctionedPoProfileRepairArgs(args, root) {
  const languageAt = (index) => args[index] === "--human-facing"
    && PO_PROFILE_REPAIR_LANGUAGES.has(args[index + 1]);
  const digestActivateAt = (index) => args[index] === "--plan-sha256"
    && HEX.test(args[index + 1] ?? "")
    && args[index + 2] === "--activate";
  if (args[0] === "plan") {
    return exactRoot(args, root, 1)
      && (args.length === 3 || (languageAt(3) && args.length === 5));
  }
  return args[0] === "apply"
    && exactRoot(args, root, 1)
    && ((digestActivateAt(3) && args.length === 6)
      || (languageAt(3) && digestActivateAt(5) && args.length === 8));
}

export function sanctionedProjectAuthorityMigrationArgs(args, root) {
  if (["inspect", "plan"].includes(args[0])) {
    return exactRoot(args, root, 1) && args.length === 3;
  }
  // "vendor-sync" mirrors "recover": both admit a bare read-only 3-arg shape AND a
  // --plan-sha256/--activate 6-arg mutation shape, so neither can use the unconditional
  // "inspect"/"plan" branch above (that branch returns on length alone, before a longer
  // apply-shaped vendor-sync/recover invocation ever reaches the mutation check below).
  if (["recover", "vendor-sync"].includes(args[0]) && exactRoot(args, root, 1) && args.length === 3) return true;
  return ["apply", "recover", "vendor-sync"].includes(args[0])
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6;
}

/**
 * `--proof` carries a filesystem path, not a digest, so HEX cannot bound it -- and an
 * unbounded word is exactly what the rest of this function refuses to admit. The bound
 * is therefore structural, and deliberately narrower than "any string": an absolute
 * `.json` path, no control characters, no `.`/`..` segment, a bounded byte length, and
 * -- mirroring the CLI's own `externalJson()` discipline (ADR-0059 Decision 1) -- a
 * location OUTSIDE the repository root, so this gate never admits a command the CLI
 * would refuse anyway. Host `isAbsolute`/`resolve`/`pathInside` are used deliberately:
 * a Windows path is absolute on the Windows host and is not a path at all on POSIX,
 * which is the correct answer on each.
 *
 * The residual is a single external path word, and it stays a data argument: the closed
 * shell grammar has already tokenized it, so it can never re-enter the shell, and the
 * only thing the CLI does with it is JSON.parse a file whose contents must still carry a
 * valid signature under the project's committed trust anchor.
 */
function externalProofPathArgument(value, root) {
  if (typeof value !== "string" || value === "" || Buffer.byteLength(value, "utf8") > 500) return false;
  if (/[\u0000-\u001f\u007f]/u.test(value) || !/\.json$/iu.test(value)) return false;
  if (value.split(/[\\/]/u).some((segment) => segment === "." || segment === "..")) return false;
  return isAbsolute(value) && !pathInside(root, resolve(value));
}

export function sanctionedHumanOverrideArgs(args, root) {
  const exactAuthorRoot = (index) => args[index] === "--author-source-root"
    && args[index + 1] === join(root, "plugins", "pipeline-core");
  if (args[0] === "plan") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
    return base && (args.length === 5 || (exactAuthorRoot(5) && args.length === 7));
  }
  if (args[0] === "prepare-for-signature") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "");
    return base && (args.length === 5 || (exactAuthorRoot(5) && args.length === 7));
  }
  if (args[0] === "prepare-authorization") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--plan-sha256" && HEX.test(args[6] ?? "")
      && args[7] === "--reason" && typeof args[8] === "string"
      && args[8].trim() !== "" && Buffer.byteLength(args[8], "utf8") <= 500;
    return base && (args.length === 9 || (exactAuthorRoot(9) && args.length === 11));
  }
  if (args[0] === "verify-audit") {
    return args[1] === "--repo" && args[2] === root && args.length === 3;
  }
  // ADR-0059 Decision 4: `signature` mode's own decisive final step -- and, until this
  // branch existed, the one command in the family that every guard PRINTED as the next
  // step while the base check below refused it, because `args[0] === "authorize"` is a
  // strict equality that `authorize-by-signature` does not satisfy. `signature` is this
  // repository's committed mode, so the offered route dead-ended at its last step in
  // exactly the session state (GUARD-LIFECYCLE-NOT-READY) where an override matters.
  //
  // Same exactness discipline as its siblings: pinned flag order, pinned `--repo`, HEX on
  // every digest, an exact total `args.length`, and the optional `--author-source-root`
  // tail handled identically. The shape is derived from the CLI's own argument parsing
  // (scripts/guard-human-override.mjs's `authorize-by-signature` branch), not from the
  // guidance strings: there is no `--activate` here (a verified signature IS the
  // authorization) and no `--authority` at all (the committed trust anchor is the only
  // trust source, ADR-0059 Decision 1).
  if (args[0] === "authorize-by-signature") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--plan-sha256" && HEX.test(args[6] ?? "")
      && args[7] === "--proof" && externalProofPathArgument(args[8], root);
    return base && (args.length === 9 || (exactAuthorRoot(9) && args.length === 11));
  }
  const base = args[0] === "authorize"
    && args[1] === "--repo" && args[2] === root
    && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--plan-sha256" && HEX.test(args[6] ?? "")
    && args[7] === "--selection-sha256" && HEX.test(args[8] ?? "")
    && args[9] === "--reason" && typeof args[10] === "string"
    && args[10].trim() !== "" && Buffer.byteLength(args[10], "utf8") <= 500
    && args[11] === "--reason-sha256" && HEX.test(args[12] ?? "");
  return base && ((args[13] === "--activate" && args.length === 14)
    || (exactAuthorRoot(13) && args[15] === "--activate" && args.length === 16));
}

/**
 * NVA-BOOTRECEIPT-1: the `node <script> <args...>` shape every branch of
 * `isSanctionedLifecycleCommand` below decides against, factored out so the bootstrap-
 * receipt feature can recognise ONE specific script (START_PREFLIGHT_SCRIPT) without
 * duplicating -- and risking drifting from -- this admission preamble. Returns `null` for
 * anything that is not a trusted-node invocation of a script at all; otherwise the
 * identified `script` path and its `args`, exactly as `isSanctionedLifecycleCommand`
 * itself used to compute them inline.
 */
export function resolveSanctionedScriptInvocation(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  const platform = options.platform ?? process.platform;
  const directNode = platform === "win32" ? ["node", "node.exe"] : ["node"];
  const trustedNode = options.processExecPath ?? process.execPath;
  if (!words || words.length < 2 || ![...directNode, trustedNode].includes(words[0])) return null;
  const [script, ...args] = words.slice(1);
  // Windows accepts either separator spelling of this one trusted script identity.
  // Keep every other script lexical and preserve case, roots, segments and argv.
  // ALF-C-P20-04B: every sanctioned script constant (plus the project's own F6 checker) is
  // matched by physical identity, so forward-slash, backslash, MSYS (/d/...) and
  // repository-relative spellings of the SAME file resolve to the canonical spelling
  // (case-folded on win32). A different file, or any spelling with a "." / ".." segment, stays lexical.
  return { script: literalPluginRootPreflight(script, platform, options) ?? canonicalSanctionedScript(script, root, platform) ?? script, args };
}

/**
 * ALF-C-P8-02B (AC-167): `pipeline-start/SKILL.md` prescribes the preflight with the placeholder spelling
 * `${PIPELINE_PLUGIN_ROOT}/scripts/pipeline-start-preflight.mjs`. The guard sees that text, not the expansion,
 * so it used to classify it as an unknown opaque script. Exactly this one word resolves to the physical
 * START_PREFLIGHT_SCRIPT (so every argv/extra-argument rule that already governs that script still applies);
 * on win32 the comparison is case-folded, the same physical-identity rule the canonical constants use. A
 * different variable, script, separator or trailing text stays lexical and therefore refused. When the guard
 * process itself can see a non-empty PIPELINE_PLUGIN_ROOT it must designate THIS plugin's preflight, so the
 * placeholder can never name a foreign script; an unset variable expands to nothing and cannot name one.
 */
function literalPluginRootPreflight(script, platform, options) {
  const literal = "${PIPELINE_PLUGIN_ROOT}/scripts/pipeline-start-preflight.mjs";
  if (typeof script !== "string") return null;
  const win = platform === "win32";
  if (win ? script.toLowerCase() !== literal.toLowerCase() : script !== literal) return null;
  const declared = (options.env ?? process.env).PIPELINE_PLUGIN_ROOT;
  if (declared === undefined || declared === "") return START_PREFLIGHT_SCRIPT;
  if (typeof declared !== "string" || /[\x00-\x1f\x7f]/u.test(declared)) return null;
  const physical = (value) => {
    let real;
    try { real = realpathSync(value); } catch { return null; }
    return win ? real.replace(/\\/gu, "/").toLowerCase() : real;
  };
  const target = physical(resolve(declared, "scripts/pipeline-start-preflight.mjs"));
  return target !== null && target === physical(START_PREFLIGHT_SCRIPT) ? START_PREFLIGHT_SCRIPT : null;
}

function canonicalSanctionedScript(script, root, platform) {
  if (typeof script !== "string" || script === "" || /[\x00-\x1f\x7f]/u.test(script)) return null;
  const win = platform === "win32";
  let text = script;
  if (win) {
    text = text.replace(/^\/([A-Za-z])\/(?=.)/u, (_m, d) => `${d.toUpperCase()}:/`).replace(/\\/gu, "/");
  }
  if (text.split("/").some(part => part === "." || part === "..")) return null;
  const absolute = win ? /^[A-Za-z]:\//u.test(text) : text.startsWith("/");
  if (!absolute && typeof root !== "string") return null;
  const flat = value => (win ? value.replace(/\\/gu, "/").toLowerCase() : value);
  const key = flat(absolute ? text : `${String(root).replace(/[\\/]+$/u, "")}/${text}`);
  const candidates = Object.entries(SANCTIONED_CONSTANTS)
    .filter(([name, value]) => name.endsWith("_SCRIPT") && typeof value === "string");
  const canonical = candidates.map(([, value]) => value);
  if (typeof root === "string") canonical.push(resolve(root, "harness/scripts/check-observation-governance.mjs"));
  return canonical.find(value => flat(value) === key) ?? null;
}

/**
 * NVA-BOOTRECEIPT-1: the receipt trigger for the bootstrap-obligation gate below -- the
 * exact same recognition `isSanctionedLifecycleCommand` already applies for
 * START_PREFLIGHT_SCRIPT (`args.length === 0`), reached through the identical shared
 * preamble above rather than a second, looser matcher. A command carrying extra
 * arguments, a different script, or no `node <script>` shape at all is NOT this
 * invocation -- it is a near miss, not a match.
 */
export function isSanctionedStartPreflightInvocation(command, root, options = {}) {
  const resolved = resolveSanctionedScriptInvocation(command, root, options);
  return resolved !== null && resolved.script === START_PREFLIGHT_SCRIPT && resolved.args.length === 0;
}

// Only the immutable physical endpoint and exact selected root reach this lane.
export function sanctionedGovernanceScopeDiagnosticArgs(args,root,options={}){
  if(!Array.isArray(args)||args.length!==2||args[0]!=='--root'||args[1]!==root||typeof root!=='string'||!isAbsolute(root)||resolve(root)!==root||/[\x00-\x1f\x7f]/u.test(root))return false;
  try{const st=(options.lstatSyncFn??lstatSync)(root);return st.isDirectory()&&!st.isSymbolicLink()&&(options.realpathSyncFn??realpathSync)(root)===root;}catch{return false;}
}
export function isSanctionedGovernanceScopeDiagnosticInvocation(command,root,options={}){
  const invocation=resolveSanctionedScriptInvocation(command,root,options);
  if(!invocation)return false;
  const platform=options.platform??process.platform;
  const script=platform==='win32'&&invocation.script.replace(/\//gu,'\\')===GOVERNANCE_SCOPE_DIAGNOSE_SCRIPT.replace(/\//gu,'\\')?GOVERNANCE_SCOPE_DIAGNOSE_SCRIPT:invocation.script;
  if(script!==GOVERNANCE_SCOPE_DIAGNOSE_SCRIPT||!sanctionedGovernanceScopeDiagnosticArgs(invocation.args,root,options))return false;
  try{const st=(options.lstatSyncFn??lstatSync)(script);return st.isFile()&&!st.isSymbolicLink()&&(options.realpathSyncFn??realpathSync)(script)===script;}catch{return false;}
}
export function sanctionedOnboardingConsentMarkArgs(args, root) {
  if (args[0] !== "record") return false;
  const matchesRoot = exactRoot(args, root, 1)
    || (args[1] === "--root" && args[2] === "."
      && resolve(root, args[2]) === resolve(root)
      && isRealpathedWithinBoundary(resolve(root, args[2]), root));
  if (!matchesRoot) return false;
  if (args[3] !== "--session-id" || typeof args[4] !== "string" || args[4].trim() === "") return false;
  if (args[5] !== "--answer" || (args[6] !== "yes" && args[6] !== "no")) return false;
  return args.length === 7;
}

// Reader admission preserves the existing readiness gate; observations are method seams.
export function sanctionedDocReaderCourseArgs(args,root,options={}){
 try{
  if(!Array.isArray(args)||typeof root!=="string"||!isAbsolute(root)||resolve(root)!==root||realpathSync(root)!==root||!lstatSync(root).isDirectory())return false;
  const ops=new Set(["create","reserve-stage","observe-attempt","recover","complete-stage","begin-batch","record-correction","close-batch","justify-third","close-course"]);
  const relative=p=>typeof p==="string"&&p.length<=240&&!/[\\:\x00-\x1f\x7f]/u.test(p)&&p.split("/").every(x=>x&&x!=="."&&x!==".."&&!x.startsWith("."));
  const physical=(p,missing=false)=>{if(!relative(p))return false;let at=root;const bits=p.split("/");for(let i=0;i<bits.length;i++){at=resolve(at,bits[i]);let st;try{st=lstatSync(at);}catch(e){if(e.code==="ENOENT"&&missing)return true;return false;}if(st.isSymbolicLink()||realpathSync(at)!==at||(i<bits.length-1?!st.isDirectory():!st.isFile()))return false;}return true;};
  if(args[1]!=="--repo"||args[2]!==root||args[3]!=="--store"||!relative(args[4])||!args[4].endsWith("/course-state.json")||!physical(args[4],true))return false;
  let request,scope;
  if(args[0]==="inspect"){if(args.length!==7||args[5]!=="--course-id"||!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(args[6]))return false;const state=JSON.parse(readFileSync(resolve(root,args[4]),"utf8"));scope=state.courses?.find(c=>c.courseId===args[6])?.scope;}
  else{if(!ops.has(args[0])||args.length!==9||args[5]!=="--request"||args[7]!=="--request-sha256"||!HEX.test(args[8]??""))return false;const requestPath=args[6];if(typeof requestPath!=="string"||!requestPath.startsWith(root+sep)||resolve(requestPath)!==requestPath)return false;const relativeRequest=requestPath.slice(root.length+1).split(sep).join("/");if(!physical(relativeRequest))return false;const bytes=readFileSync(requestPath);if(bytes.length>262144||createHash("sha256").update(bytes).digest("hex")!==args[8])return false;request=JSON.parse(bytes.toString("utf8"));scope=request.scope;if(!scope&&physical(args[4]))scope=JSON.parse(readFileSync(resolve(root,args[4]),"utf8")).courses?.find(c=>c.courseId===request.courseId)?.scope;}
  const observed=(options.observePlanScope??observeReaderPlanScope)({root,storePath:args[4],scope});
  return observed!==null&&typeof observed==="object"&&!Array.isArray(observed)&&Object.keys(observed).length===1&&Object.keys(observed)[0]==="scope"&&typeof observed.scope?.evidenceRoot==="string"&&relative(observed.scope.evidenceRoot)&&args[4]===observed.scope.evidenceRoot+"/course-state.json"&&(!scope||JSON.stringify(observed.scope)===JSON.stringify(scope));
 }catch{return false;}
}
