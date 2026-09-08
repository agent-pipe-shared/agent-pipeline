# ALFRED-C1-SUITE-REGISTRATION-ROUTE

## Sanctioned route

The C1 plan requires new suites to use the sanctioned registration route before
integration and forbids hiding them in unrelated tests, exclusions, or treating
direct execution as Verify coverage (`specs/sprint-alfred-epic/plans/c1-emission.md:220-252`).
The authoritative runtime registration is the suite arrays in
`harness/scripts/verify.mjs`; the existing preflight suite is already registered
as `critic-dispatch-preflight-tests` at `harness/scripts/verify.mjs:456`.

The read-only checker is
`plugins/pipeline-core/scripts/check-suite-registration.mjs`. It enumerates all
`*.test.mjs` files below `plugins/pipeline-core` and `harness`, parses the three
registration arrays folded by Verify, and reports unregistered files. Its own
contract says it is standalone and deliberately not wired into Verify because
`verify.mjs` is TP-3 protected (`check-suite-registration.mjs:5-18,49-62`).
It exits 0 when every enumerated suite is registered or has a reasoned opt-out,
1 for unregistered/stale opt-out findings, and 3 for usage/environment failure
(`:79-86`). Opt-outs do not authorize hiding a new C1 suite; the list is empty
and a silent exclusion is explicitly invalid (`:99-130`).

Registration itself is an owner-managed protected edit: adding a new suite to
`harness/scripts/verify.mjs` is TP-3 and requires a signed maintenance-window
ceremony, as stated directly by the checker (`check-suite-registration.mjs:72-75,
105-111`) and the obligations contract (`templates/prompts/agent-obligations.md:74-92`).
Therefore the implementing owner can prepare the exact suite entry and run
standalone checks. An authorized owner may perform the protected registration
and read it back while a valid active TP-3 window is installed, subject to the
external human proof prerequisite. No in-session generic examiner edit or new
exclusion is a sanctioned route.

## Minimum metadata and exact entries

The two planned test files are:

```text
plugins/pipeline-core/lib/interruption-receipt-store.test.mjs
plugins/pipeline-core/lib/critic-preflight-observer.test.mjs
```

The plan also permits extending the already registered
`plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs` for actual
observed CLI parity, or adding separately registered observed-controller/report
suites (`../plans/c1-store-controller.md:576-587`). The minimum
registration metadata for each new entry is the existing Verify object shape:
`{ name: "<stable-suite-id>", file: join(libDir, "<basename>.test.mjs") }`.
The stable name must be unique across `TEST_SUITES`, `SCOPED_VERIFY_SUITES`,
`WINDOWS_ASSURANCE_VERIFY_SUITES`, and phase-derived entries. The direct
`libDir` join form is required by the checker’s closed parser
(`check-suite-registration.mjs:27-45,391-445`). No `surfaceIds` field belongs in
the suite object; capability-inventory coupling is a separate required update
when the protected registration change is authorized.

Recommended exact names for the planned files are
`interruption-receipt-store-tests` and `critic-preflight-observer-tests`, with
the corresponding `join(libDir, ...)` paths. If the controller/report receives
its own test file, it needs its own unique name and path; direct execution can
validate behavior but cannot replace registration. Extending
`critic-dispatch-preflight.test.mjs` is permissible for producer/CLI parity
because that suite is already registered, but it cannot make the distinct
observer/store suites disappear from the inventory or Verify gate.

## Ownership and evidence sequence

The implementation owner should first provide focused tests and exact paths,
run each suite standalone, then run the standalone registration checker and
read back the protected Verify registration after the authorized maintenance
act. The checker proves enumeration/registration only; it does not prove a
registered suite passes (`check-suite-registration.mjs:62-63`). Full Verify and
candidate-bound evidence remain required by the C1 plan. A direct focused green
result is therefore behavior evidence, not integrated Verify qualification.

The C1 plan’s source-projection slice explicitly calls for focused pure join
behavior in the existing registered C1 receipt suite (`c1-emission.md:220-228`),
while store and observer behavior are listed as new paths (`:576-587` in the
composition contract). New store and observer tests therefore still require
their explicit registration route; the existing receipt suite does not absorb
store behavior.

Unknowns: the bounded inspection did not identify a separate writable registry
API or an ordinary local command that edits `verify.mjs`; the authoritative
workflow is the protected file edit plus signed maintenance-window ceremony.
The exact capability-inventory `surfaceIds` for these new suites must be chosen
by the owning integration change from the actual Verify entries; inventing
those IDs in this read-only task would overclaim.

## §12/B2-ii correction and current ceremony shape

The explicit sprint specification changes the long-term route: §12 requires
registration through the B2-ii declarative registration file
(`specs/sprint-alfred-epic/spec.md:755-766`), and B2-ii describes the planned
`harness/verify-suites.json` schema-validated append-only file and a single
block-level ceremony (`spec.md:296-310`). No `harness/verify-suites.json` exists
in this checkout, so that future route is not currently executable. Until it
lands, §12 explicitly retains the legacy TP-3 ceremony for registration blocks
(`spec.md:755-766`).

The current protected mechanism is Guard Maintenance Window, not a generic
"apply registration" command. Its documented CLI shape is:

```text
guard-maintenance-window.mjs prepare --repo-root ROOT --scope TP-3 \
  --ttl-seconds N --reason REASON --authorship-mode goldfish-dispatch \
  [--feature-id ID --plan PLAN --spec SPEC]
po-human-approval.mjs sign-intent --repo-root ROOT --request REQUEST
guard-maintenance-window.mjs install --repo-root ROOT --request REQUEST \
  --proof EXTERNAL-PROOF --plan PLAN --spec SPEC
# authorized owner edits verify.mjs and reads back exact registration
guard-maintenance-window.mjs close --repo-root ROOT
```

The exact prepare/install flags and requirement that the proof be external are
documented in `plugins/pipeline-core/scripts/guard-maintenance-window.mjs:6-30`
and implemented at `:306-360`; the prior observed ceremony records the sequence
as prepare → PO `sign-intent` outside the session → install → edit/commit → close
(`specs/sprint-nova-epic/evidence/nova-hgosig/claims-evidence.json:43-48`).
`sign-intent` is the human signing act; the protected edit may be performed by
the authorized operator while the window is active. This report therefore
does not assert that the PO personally must type the edit, only that a valid
current authorization and active TP-3 window are prerequisites. Whether an
existing authorization can be reused is unmeasured here: it depends on its
candidate, scope and expiry, and no private state/proof was read.
