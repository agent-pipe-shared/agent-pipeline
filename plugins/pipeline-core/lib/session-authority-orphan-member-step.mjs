// SPDX-License-Identifier: SUL-1.0
//
// D73 (E) / AC-203: the registry member step of the ordinary orphan release. The private cleanup binding of a session
// whose descriptor was retired may only be deleted together with the onboarding-continuity registry member that names
// it, otherwise the next bound start finds a producer namespace that drifted (`onboarding-continuity:namespace-drift`).
//
// The sequence is the one `releaseBindingInBoundary` (session-cleanup-lost-binding.mjs) runs, in one registry boundary:
// re-check the caller's preconditions, release the registry member FIRST, delete the private binding second (the
// caller's `releaseBinding`), then heal the registry and read it back strictly. A registry that does not exist yet
// (D44) has no member to release: the member step is skipped and the heal's `absent` read-back is accepted.
//
// Import direction: onboarding-continuity -> this module -> the registry. This module never imports
// onboarding-continuity (the registry already imports it, and a second edge back would close a cycle).
//
// Lock order: the step runs after the apply's State lock is released, because the continuity snapshot refuses a foreign
// State lock. The boundary takes the State lock only inside, around the delete (boundary first, as
// `releaseBindingInBoundary` does). Neither lock waits: `acquireRegistryLock` refuses at once on a live owner
// (`SDC-LOCK-HELD`) and the State `acquireLock` refuses at once (`KICKOFF-LOCKED`). An overlap therefore ends in a typed
// refusal with a repair, never in a hang.

import { fileURLToPath } from "node:url";

import {
  healSessionAuthorityDrift,
  inspectSessionAuthorityRegistryRead,
  releaseLostSessionAuthorityMember,
  withSessionAuthorityBoundary,
} from "./session-authority-registry.mjs";

const REPAIR_SCRIPT = fileURLToPath(new URL("../scripts/session-authority-repair.mjs", import.meta.url));
const PRODUCER_ID = "onboarding-continuity";

export class OrphanMemberStepError extends Error {
  constructor(code, message, repair) {
    super(message);
    this.name = "OrphanMemberStepError";
    this.code = code;
    this.repair = repair;
  }
}

const describe = (error) => `${error?.code ?? "error"}: ${error?.reason ?? error?.message ?? "unreadable"}`;

/**
 * Runs the member step around the caller's binding delete. `repository` is the continuity-authority repository or a
 * function that returns it (evaluated inside the guarded phase, so its refusal carries a repair). `recheck` runs first
 * under the boundary; `releaseBinding` runs after the member release and before the heal. Every refusal of the registry
 * is raised as an `OrphanMemberStepError` carrying a runnable `repair`; an error thrown by `recheck` or `releaseBinding`
 * passes through unchanged. `boundary` reuses a token the caller already holds instead of opening one.
 */
export function runOrphanSessionAuthorityMemberStep({
  repository,
  boundary = null,
  target,
  recheck = () => {},
  releaseBinding = () => {},
  codePrefix = "SESSION-CLEANUP-ORPHAN-RELEASE",
  deps = {},
} = {}) {
  const api = {
    withBoundary: withSessionAuthorityBoundary,
    inspectRead: inspectSessionAuthorityRegistryRead,
    releaseMember: releaseLostSessionAuthorityMember,
    heal: healSessionAuthorityDrift,
    ...deps,
  };
  if (typeof releaseBinding !== "function" || typeof recheck !== "function" || target === null || typeof target !== "object") {
    throw new OrphanMemberStepError(`${codePrefix}-REQUEST`, "the orphan member step request is invalid",
      `node ${REPAIR_SCRIPT} inspect --root <repository root>, then rerun the same orphan release`);
  }
  let root = "<repository root>";
  let stage = boundary === null ? "open" : "inside";
  const repairFor = (error) => (typeof error?.repair === "string" ? error.repair
    : `node ${REPAIR_SCRIPT} inspect --root ${root}, then rerun the same orphan release (it is replay-safe once its receipt exists)`);
  const refuse = (suffix, message, error) => {
    throw new OrphanMemberStepError(`${codePrefix}-${suffix}`, message, repairFor(error));
  };
  try {
    const repo = typeof repository === "function" ? repository() : repository;
    root = repo?.primaryRoot ?? root;
    const body = (token) => {
      stage = "inside";
      recheck();
      // D44: under the boundary lock the catalogue cannot appear, so `absent` means no member can name the session.
      const registryAbsent = api.inspectRead({ repository: repo }).status === "absent";
      let member = "skipped";
      if (!registryAbsent) {
        try {
          member = api.releaseMember({ boundary: token, producerId: PRODUCER_ID, target })?.status ?? "none";
        } catch (error) {
          if (error?.code === "SDC-AUTHORITY-CAS" && error?.reason === "lost-binding-members-ambiguous") {
            refuse("MEMBER", "more than one in-flight registry member names the orphaned session", error);
          }
          refuse("REGISTRY", `the registry refused to release the orphaned session's member (${describe(error)})`, error);
        }
      }
      releaseBinding();
      let registry;
      try {
        registry = api.heal({ boundary: token });
      } catch (error) {
        refuse("REGISTRY-READBACK", `the registry could not be healed after the binding release (${describe(error)})`, error);
      }
      // A registry that was present at the member step and reads back `absent` (or anything but `readable`) is refused.
      if (registry.status !== "readable" && !(registryAbsent && registry.status === "absent")) {
        refuse("REGISTRY-READBACK",
          `the session-authority registry did not read back strictly after the release (${registry.code ?? "refused"}: ${registry.reason ?? "unreadable"})`, registry);
      }
      stage = "exit";
      return { member, registry: registry.status };
    };
    return boundary === null ? api.withBoundary({ repository: repo }, body) : body(boundary);
  } catch (error) {
    if (error instanceof OrphanMemberStepError || stage === "inside") throw error;
    return refuse("REGISTRY", `the session-authority registry refused the orphan release (${describe(error)})`, error);
  }
}
