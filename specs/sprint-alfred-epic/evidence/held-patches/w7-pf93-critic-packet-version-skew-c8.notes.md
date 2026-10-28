# PF-93 c8: legacy form narrowed to claimed-packet inspection (CHECKPOINT, NOT RUN, NOT RELEASABLE)

Candidate 28c03b97ffbf1f4c6da61fabb41f2e8616403dc3. The patch (w7-pf93-critic-packet-version-skew-c8.patch, 4 files, +207/-16) is the c7 patch plus the part (A) narrowing in critic-packet-preflight.mjs. It supersedes the c1 to c7 patches and notes. The c1 option (B), a release command for a claimed packet, stays a PO decision in the c1 notes.

## Done (production edit, in the scratch clone only, carried in the patch)
- critic-packet-preflight.mjs: normalizeCoordinatorOnly(value, candidate, { allowLegacyPreAssurance = false }) accepts the pre-assurance key set (old digest, read as assurance null) ONLY when the option is true; default strict path falls through to the closed-key check and refuses with CPP-COORDINATOR-BINDING (the CPP15 pin). validatePacketShape and packetContext take a shapeOptions argument; inspectClaimedCandidatePacket takes allowLegacyPreAssurance (default false); only inspectClaimedSessionAdmission passes true (to inspectClaimedCandidatePacket, packetContext and the returned packet view). prepare, claim and publish paths stay strict.
- No existing case changed.

## NOT done / NOT RUN (budget checkpoint at call 32 of 40)
- No test was run after the narrowing. CPP09 and CPP15 are expected green again (CPP09 most likely failed only because its self-probe child runs the whole file and counted the CPP15 failure; not confirmed). CPP09/CPP15 bodies were read: CPP15 pins the refusal of a binding without the assurance key; CPP09 is a lineage claim case whose self-probe pins 17 cases and counts 16 pass / 1 fail.
- The new case pair (strict path refuses legacy with CPP-COORDINATOR-BINDING; explicit option accepts exactly the old key set and digest, refuses every other drift) is NOT written. Plan: put it in session-critic-finalizer.test.mjs (write scope) rather than critic-packet-preflight.test.mjs, because the preflight self-probe hard-codes 17 declared cases and adding cases there needs a pin update. It requires exporting normalizeCoordinatorOnly or driving it through inspectClaimedSessionAdmission versus claimCandidatePacket on a re-sealed legacy packet.
- Part (B), case (2)+(7) SCF-PRELAUNCH-BINDING at session-critic-finalizer.mjs line 544: clause not yet found. Note: with the strict default, inspectClaimedSessionAdmission is the only legacy-accepting path; if finalizer code at lines 531-544 reads the packet through another preflight function (for example inspectClaimedCandidatePacket without the option, readConsumedSessionAdmission, or claimCriticPacketWithLaunchContext), it will now refuse the legacy form and must pass the option too. Next step: add a per-clause probe in the clone.
- Whole-file runs of the four files in clone and clone2, failing-name set comparison: not run. Known baseline from c7: session-critic-finalizer pass 38 fail 1 (pre-existing "private task snapshot binds uppercase delivered-v3 bytes without exporting record prose"), preflight 17/0, generic-batch 28/0, skip-coverage 48/0.
- Apply check in clone2 and driver cleanup: not run; clones remain under scratch/agent-out/w7cd (untracked).

## Proposed commit message (only after green)
fix(critic): finalize a Critic packet claimed before the binding assurance field and name the hidden admission cause (PF-93)

## Operator flow (only after green)
git apply the patch, git add -u limited to the slice paths, --no-verify commit, stamp, install. Protected-path classification: no file matches TP-1..TP-13. Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.
