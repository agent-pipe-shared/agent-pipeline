// SPDX-License-Identifier: SUL-1.0
// Guard module "sanctioned-args-scripts" (layer 2), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { isPhysicalScratchTarget } from "../physical-scratch-boundary.mjs";
import { existsSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { classifyVerifyCommand } from "../../scripts/pipeline-state.mjs";
import { USER_SOURCE_PATH, readHumanApprovalMode } from "../critical-human-proof-policy.mjs";
import { HEX, START_PREFLIGHT_SCRIPT, VALID_RUNNERS } from "./constants.mjs";
import { isRealpathedWithinBoundary, pathInside } from "./path-containment.mjs";
import { exactRoot, matchFlagSpec, simpleWords } from "./shell-grammar.mjs";

export function sanctionedSessionCriticFinalizerArgs(args, root) {
  const exactProjectRoot = exactRoot(args, root, 1)
    || (args[1] === "--root" && args[2] === "."
      && resolve(root, args[2]) === resolve(root)
      && isRealpathedWithinBoundary(resolve(root, args[2]), root));
  if (!(["admit", "finalize"].includes(args[0])) || !exactProjectRoot
    || args[3] !== "--request" || args.length !== 5) return false;
  const request = args[4];
  if (typeof request !== "string" || request.length === 0 || request.length > 256
    || request.includes("\\") || request.includes("\0") || isAbsolute(request)
    || !request.endsWith(".json")) return false;
  const components = request.split("/");
  if (components[0] !== "scratch" || components.some((part) => part === "" || part === "." || part === "..")) return false;
  return isRealpathedWithinBoundary(resolve(root, request), root);
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
  if (args[0] === "approve-plan") {
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
  return { script, args };
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
