# w30j14 - the guard command catalogue admits one trailing --feature selector (C30J-J14)

## What

`sanctionedRegisterFeaturePackageArgs` in `plugins/pipeline-core/lib/guard/command-catalogue.mjs` now admits ONE trailing `--feature <feature id>` on the two forms the registrar's refusals name after J13: `--add-review-lineage --packet <hex>` and `--add-delta-request <path> [--confirm-full-round]`, also followed by `--stage`. The id must match the registrar's own shape (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, lowercase, no path, no leading dash). The selector is peeled off first and the remaining arguments are judged by the unchanged rules, so every previously refused spelling stays refused.

Cases added to `plugins/pipeline-core/lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs` (both the catalogue and the real guard are asserted by `bothAdmit`/`bothRefuse`): admitted forms with the selector (lineage, lineage + stage, delta, delta + confirm, delta + confirm + stage); refused: uppercase id, path-like id, `..`, dash id, missing id, repeated selector, selector before the packet or the path or the confirm flag, unknown extra flag after the selector, selector on the review-unit and diagnostic verbs. No existing case was changed or weakened (no QG-04 restatement needed).

Test first: the new cases were run RED against the original catalogue (`lineage with the feature selector: catalogue actual false, expected true`; 2 failed of 33), then GREEN after the change (33 of 33, exit 0).

## Order of application

The patch is a delta on the integrated 30i tree (the clone `base9`), not on the real HEAD: apply that tree first (`apply --check` on it exits 0). `command-catalogue.test.mjs` does not exist in the tree and is not touched.

## Why

J13 made the registrar accept and name `--feature <id>`, but the catalogue admitted only the bare spellings, so an agent could not run the spelling the refusal named.

## Not changed

No other guard rule, no stored status, record shape, digest or key bytes, no gate, signature, approval or security semantics. The selector is not admitted on any other verb. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and Spec are unchanged.

## Not proven

The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only (the pin suite above, one file, run alone). Integrated Verify and PO acceptance are pending. The selector value is not checked against the existing features (the registrar does that).
