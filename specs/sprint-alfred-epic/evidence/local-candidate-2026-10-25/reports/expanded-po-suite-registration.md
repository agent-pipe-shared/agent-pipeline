# Expanded PO suite registration handoff

Targeted metadata overlay is ready in `scratch/agent-out/expanded-po-suite-registration/overlay.patch`.
It adds exactly two required suites: `signing-help-delegation-qualification-tests`
with SHDQ001–SHDQ007, and `po-only-discard-boundary-tests` with PODB001–PODB008.
Each uses the existing 65536-byte per-case completion policy. Prior registrations
and policies remain present. Capability surface and test-evidence associations are
in the deterministic-verification inventory entry.

The source owner’s retained evidence binds SHDQ source SHA256
`dc8846ec583cbe651c28ea42adc2c08f87aaa81219e53e7bc64c5af05e3bcf45` and FD stream
SHA256 `e911695ec1ceae1c8a42046c9b79f7f24d10017583953f750caa406dcf4b97d1`;
PODB source SHA256 `4a35f138dfcd3fe479fb0f17daf677dafac0d96fb2f83c8074ea3264a981b09d`
and FD stream SHA256 `ecdc1343fcffae9f156020fe8ccf8d483433dd98df6d4e285eba3a050dae2a3a`.
The retained declarations contain 7/7 and 8/8 pass dispositions. The source
owner’s finalizer report states it checked all 34 real FD dispositions and exact
final test-source hashes. I consumed those retained bindings without rerunning
the transports or independently rehashing raw FD stream files.

## Checks

- `node harness/scripts/check-verify-suite-registration.mjs` — exit 0;
  machine output: `scratch/agent-out/expanded-po-suite-registration/registration.json`.
- `node harness/scripts/check-verify-suite-append.mjs` — exit 0;
  machine output: `scratch/agent-out/expanded-po-suite-registration/append-final.json`.
- `node harness/scripts/check-verify-case-completion.mjs` — final exit 0;
  machine output: `scratch/agent-out/expanded-po-suite-registration/completion-final.json`.
  An earlier run caught the unsorted policy insertion; it was corrected before this pass.
- `node harness/scripts/check-product-capability-inventory.mjs` — exit 1;
  final output: `scratch/agent-out/expanded-po-suite-registration/inventory-final2.json`.
  It reports missing surfaces against committed inventory baseline `8052bdc…`;
  this is the briefing’s pending inventory rebaseline until the actual Source
  commit. The final output has no sorted-array or duplicate finding.
- `git apply --check scratch/agent-out/expanded-po-suite-registration/overlay.patch`
  from Main — exit 0. `git apply --reverse --check` from the clone — exit 0.

## Exact overlay binding

Base clone: `5f3bec25bbe5d4ac5ee0df51dee20d9446272047`. Imported Source candidate
patch: SHA256 `315632af97652b137917ecc28845e97f799cbaad058a080a2e07a510731cd8d1`.
Overlay patch SHA256: `3bd35503edf174c205c2b491a3b50cdc96b798d4d75fe60860a52c41640b78b8`.

Main preimage → clone postimage SHA256:

- `docs/product-capability-inventory.json`: `306e80d6e2c1c6fda8573f0734b31a22ad5311f25465917deb9025490a8de37c` → `c995588cf08b754198e7682e50f2a0e246ab42aeb4a5e75808f273ab8690e710`
- `harness/config/verify-case-completion.v1.json`: `b2fddc4f0f807ddd2b2149c0288ff66c5763f168fe67eece004b54ab6fffb67f` → `77870e36f551db6bbdf9a437f556d39d008c7af81efa28865a02254a8a6eebfb`
- `harness/verify-suites.json`: `18b4f7782b61b3dae214585876c861cb3ead3c79b8d74d59ab9eb5f4d7af912f` → `985e3bfaeceade792e9ce0c21be26c67564680b532c96d7e669fba16cee69c3d`

## Scope and open items

Only the three metadata files differ from Main’s prepared Source candidate in
this overlay. Source, test bodies, specs, PRD, ADRs, and Main were not edited by
this task. No commit was created. Project resource headroom remains unknown.
Whole Verify, security, batch review, and PO acceptance remain parent-owned and
pending. Inventory rebaseline remains pending until the actual Source commit.

Guard refusals were retained honestly: two attempts used an incorrect
`plugins/pipeline-core/scripts/apply-diff.mjs` path (missing target); two
read-only `node -e` summaries were refused under TP-13 opaque-interpreter
fallback; an attempted `git diff --output` spelling was refused, and a piped
`nl` diagnostic was denied by the closed shell grammar. The sanctioned root
`scripts/apply-diff.mjs` then imported the exact patch; supported `cat`/`rg`/Git
reads and reverse/forward patch checks completed the overlay. No bypass was used.
