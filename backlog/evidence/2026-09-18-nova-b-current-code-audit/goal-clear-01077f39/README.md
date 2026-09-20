# Goal-Clear evidence correction

This directory preserves the evidence associated with source commit
`01077f397080cdc0cac0857a7a8c88f21cff9165` after the mistakenly tracked root
evidence files were removed from the Git index. The original committed
in-progress record is preserved byte-for-byte as `original-dispatch-record.json`.

The current local record corrects three demonstrated evidence defects: the actual
dispatch used `agentType: "default"`; the self-declared `modelOverride` has no
trusted override receipt and is absent; and `resultSha256` now binds the current
`report.text` UTF-8 bytes (`2fe2b3ebf078c564803d52ba115d4d4b181a0c567d8e9d4377e252c921a0e76a`).
Candidate commit, changed-path binding, `criticRequired`, and the recorded log
counts are retained. The counts are non-monotonic and are disclosed rather than
replaced with invented values.

Each copied capture has the same SHA-256 as its corresponding local root capture;
`correction-readback.json` records those readbacks. The current RED capture hashes
to `82f57549fb48b355853959e1f39f4209ef350f8128ca7bd21fe601dfcd110b54`.
It is not the historical `031e3ab...` value cited in scratch material, so this
package does not claim to preserve unavailable historical bytes.

These are synthetic and root-suite captures only. They do not establish a full
qualification, native execution, a provider attestation, a trusted override
receipt, tool counts beyond their recorded values, or independent review.
Independent review remains pending.
