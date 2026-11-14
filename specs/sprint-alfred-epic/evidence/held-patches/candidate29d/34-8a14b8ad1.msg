feat(approval): add the replace-verify-command kind and its one subject builder

ADR-0100: one PO signature covers both verify-command mirrors.
- lib/verify-replacement.mjs runs the new command once on a tree with
  no tracked change (shell, project root, 30 min timeout), refuses a
  red, timed-out or tree-changing run and keeps a private receipt only
  when it passed; buildVerifyReplacementSubject binds feature, previous
  and new command, the receipt digest and both post-images at the clean
  HEAD; the confirmation lines show the PO the same facts.
- critical-action-approval-request: VERIFY_REPLACEMENT_KIND joins
  CRITICAL_ACTION_KINDS; critical-action-authorization gets its slot.
- po-human-approval: prepare-/authorize-critical take the kind without
  --subject and derive the subject through the same builder.
- The new module joins NEVER_LIFTABLE_KERNEL_PATHS (GMWKC01) and the
  threat model names it (GMWKC03).
- The closed kind lists in the request and po-human-approval tests
  restate the new member (QG-04).

AI-Assisted: true
Dispatch: stage-0 (elephant)
