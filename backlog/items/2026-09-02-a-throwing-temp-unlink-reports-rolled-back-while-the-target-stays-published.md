---
schema: pipeline.backlog-item.v1
id: pipeline.a-throwing-temp-unlink-reports-rolled-back-while-the-target-stays-published
type: defect
owner: pipeline
status: open
created: 2026-09-02
sprint: nova-b
done_when: manual
source: "Reported by the NVA-B-ROUNDN-FIX dispatch while binding the adjacent delete sites to content; seen in plugins/pipeline-core/lib/project-onboarding-v3.mjs's V3 manifest-repair transaction, not measured."
---

# A throwing temp unlink reports `rolled-back` while the target stays published

## The defect

In `applyProjectOnboardingManifestRepair`'s publication step, the target is
linked and the temporary is then removed on the same line:

```js
fs.linkSync(temp, target); fs.unlinkSync(temp); temp = null; published = target;
```

If `unlinkSync(temp)` throws, `published` is never assigned. The catch block
therefore has nothing to roll back, and the function returns
`status: "rolled-back"` while the manifest is, in fact, published and live at
its target path.

The caller is told the transaction did not happen. It did.

## What this is not

This is **not** a delete-ownership defect, and it is not what the round-L and
round-N reviews were about. Every rollback and cleanup delete in that file now
binds its decision to the bytes it wrote. This is an ordering defect in the
success path: two effects that must be attributed together are separated by an
assignment that only the second one reaches.

It is also unmeasured. `linkSync` succeeding and `unlinkSync` then failing on
the same directory is a narrow window — it needs the temporary to become
unremovable between two adjacent calls. The claim here is about what the code
does if it happens, not that it has been observed.

## Direction

Assign `published` before the unlink, or record the publication and the
temporary's removal as separate steps so the catch can act on each. Prefer
whichever keeps the invariant readable at the call site rather than one that
relies on the reader tracking assignment order across a semicolon.

## Acceptance

- A test injects a throwing `unlinkSync` for the temporary, immediately after
  a successful `linkSync`, and asserts the reported status matches what is
  actually on disk — either the target is rolled back, or the result does not
  claim it was.
- The test is confirmed RED against the current code before the fix.
- The ordinary publication path and the existing rollback paths stay green.
