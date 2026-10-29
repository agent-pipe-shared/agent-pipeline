---
schema: pipeline.backlog-item.v1
id: pipeline.a-new-item-course-is-refused-with-cac-registration-invalid-and-no-reason
type: defect
owner: pipeline
status: open
created: 2026-10-29
priority: P1
release: 0.7.0
sprint: alfred
source: "Toolbox consumer finding N14 (PO relay, 2026-10-29, from the consumer's handover list of 2026-10-27); not yet reproduced here"
done_when: manual
---

# A new item course is refused with CAC-REGISTRATION-INVALID and the refusal names no reason

## Evidence

A Toolbox consumer registered a new item course and was refused with `CAC-REGISTRATION-INVALID`, while `inspect` showed the plan approval as valid. The refusal does not say which part of the registration is invalid, so the Elephant cannot repair it.

Code facts (read, not run): `CAC-REGISTRATION-INVALID` is the envelope reader's code for a registration it will not accept (`lib/feature-package-registration.mjs` re-reads the amended manifest after each registration verb and turns it into `FPR-REGISTRATION-NOT-RESOLVED` with only `readerCode` as detail, lines 299, 383, 473, 578, 679). The approval shown by `inspect` and the registration the envelope reader checks are two separate readings, so one can be valid while the other is not.

## Wanted

- The refusal carries the failing check: which registration field, which digest or binding disagrees, and what to change, in the same answer (typed detail, not only `readerCode`).
- `inspect` and the registration reader agree: if the reader will refuse the registration, `inspect` shows that before the verb is run.

## Acceptance

- A reproduction on the consumer's repository state (owed: the consumer's handover list holds the exact steps) turns into a test that fails today and names the invalid part once fixed.
- Every `CAC-REGISTRATION-INVALID` and `FPR-REGISTRATION-NOT-RESOLVED` refusal carries a typed reason and a repair line.
- Kernel paths are likely involved (`lib/feature-package-registration.mjs`, the envelope reader): held patch under the Guard Maintenance Window.
