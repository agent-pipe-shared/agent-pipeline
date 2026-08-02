# Organization policy packs

Organization policy packs impose governance floors and document-publication
rules without creating a second authority system. Multiple packs resolve only
when their shared document classes have the same mode; conflicting modes fail
rather than following last-write-wins. Approval requirements combine
conservatively, so an additional pack can only require more review.

Inspect packs or create a named activation plan:

```bash
node plugins/pipeline-core/scripts/organization-policy.mjs inspect \
  --core-version <core-version> --pack-file <pack.json>
```

`plan` additionally needs `--repo` and `--activation-id`. Applying such a plan
uses the separate transaction service and must receive a matching human
authority readback; a policy file, plan, local record, or Git commit is never
human proof.
