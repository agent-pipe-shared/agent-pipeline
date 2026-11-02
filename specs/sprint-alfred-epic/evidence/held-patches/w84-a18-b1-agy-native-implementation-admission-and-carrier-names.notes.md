# w84 — native Antigravity implementation admission under a signed grant, and the carrier names (candidate 18, A18-B1)

Applies on top of the applied chain at c9a73fb80d6f587efb5e3cd595a87fa5ae480e03. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `lib/agy-native-implementation-admission.mjs` (new): `evaluateNativeImplementationAdmission`. Deny by default; a native `invoke_subagent` naming `goldfish-implementor` or `goldfish-mechanic` is admitted only when (a) the hook payload names a session, (b) that session has a descriptor, a live owner and a valid stored v1 session consent, (c) the SIGNED consent scope carries `nativeImplementation: { schema: "pipeline.agy-native-implementation-scope.v1", models: [flash_lite | flash | pro] }`, and (d) every implementation entry's role is in the consent's signed role list and its Model alias is in the grant. A model-family (v2) consent is refused. Each failure is a typed code; nothing is written.
- `hooks/antigravity-pretool-guard.mjs`: wires the module in. The existing denial text and code (`AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE`) are unchanged and pinned; the refusal appends `Native admission check: <code>: <reason>` and the grant schema name.
- `references/antigravity-native-dispatch.md`: a section "Native implementation admission" with the deny order, the consent subject scope example, the read-only carrier names and one example role-dispatch packet with its field list; the implementor table row now points at it.
- Tests: `lib/agy-native-implementation-admission.test.mjs` (13 cases, injected dependencies: every deny reason in order, admit with a grant, v2 refused) and one new guard case (no session, then an unknown session, both still denied with the admission code named).

## Checks

- Unit file: RED 13 of 13 against a stub returning the old unconditional denial, then GREEN 13 of 13.
- Guard suite `antigravity-pretool-guard.test.mjs`: exit 0 (its custom runner prints no per-case count; any failing case sets a non-zero exit). `check-consumer-safe-paths.test.mjs`: 9 of 9. Patch check file: 3 of 3.
- New test file needs registration in the Verify suite list (done later by the Elephant; `harness/verify-suites.json` not edited).

## Not changed / not proven

- UNMEASURED ASSUMPTION: that the Antigravity hook payload's session id identifies the PARENT session has not been measured against a real Antigravity run. Nothing in this slice claims the admission works in a real run.
- No guard-level ADMIT case: it needs a live session owner and a signed stored consent, which the guard fixtures do not build; the admit path is proven only with injected dependencies in the unit file.
- The `DISPATCH-WRITE-CARRIER-REQUIRED` refusal text lives in `hooks/guard-dispatch.mjs`, outside this slice's file scope. It already names the read-only carriers (critic, readiness-reviewer, plan-verifier, consult-advisor) and points at the reference for preparing the call; it does not print the prepare command line. Printing it needs a change to that file (follow-up). The reference now names the carriers and the prepare command.
- Whether a plan approval could serve as consent is not implemented (contradicts the documented design). `lib/agy-session-consent*`, the consent ceremony and every consent store are untouched. Verify suite list and capability inventory are untouched.
- The full Verify run was not made.
