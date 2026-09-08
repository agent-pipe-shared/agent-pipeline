# Source release reader binding

Verification ran `node --test plugins/pipeline-core/scripts/release-preflight-cli.test.mjs` with exit code 0: 35 cases passed and none failed. The machine capture is retained at `scratch/NVA-B-READER-RELEASE-WIRING-1/focused-release-preflight-capture.md`.

The producer tests cover generic-consumer compatibility; committed source activation; required-member loss; stale, malformed, and mismatched checker responses; malformed calibration; bounded local-checker containment; dirty document/member behavior; and refusal before output creation.

The suite uses a committed typed checker stub only to exercise the release producer's subprocess boundary and closed result validation. It does not validate reader-review evidence semantics. Those semantics belong to the real `harness/scripts/check-doc-reader-binding.mjs` domain suite. A preflight pass therefore remains limited to committed-state equality and evidence presence; it does not prove reader identity, freshness, provenance, or judgment quality.
