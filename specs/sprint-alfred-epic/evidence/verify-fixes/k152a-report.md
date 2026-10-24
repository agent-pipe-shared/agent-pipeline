# K152A / AC-109 native file-tool proposal

## Later approved integration

The PO explicitly approved application and ordinary checks/commit of K152A with K152B and G23. Source committed as `43e04b207` through active hooks. The evidence test's explicit integrated phase checks the copied K152A blobs against the exact patch's postimage IDs, then retains all original behavior controls: 3/3 passed against combined main source (local capture `k152a-native/integrated-test.txt`). The evidence-test change committed as `20c07bde6`. The required generated enforcement table refresh committed as `925224574`; documentation contracts returned to 76/76 after the initial expected stale-generation finding. Native Antigravity qualification, integrated Verify, independent review and PO acceptance remain open. The initial proposal history below does not assert a native host commit.

Targeted delivery: **green as an inert proposal**. Nothing committed — host commits the three proposal artifacts. No production source was changed in this checkout.

## Source base and scope

- Base commit: `fd233705e6f4c892206a1246fca8ac1590249d00`; base tree: `f78e5b2f9c3d51c32d27bf6e69c50dbdb09ed80a`.
- Patch: `k152a-native-tools.diff`. Proposed source paths: `plugins/pipeline-core/hooks.json`, `plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs`, `plugins/pipeline-core/lib/tool-write-target.mjs`.
- Base SHA-256 values in the same path order: `3df5fc3e6d6aba4d31aee208cef31fcbfeadeae4a860a7832c06fba973e83d96`, `30b6bc5903102c5bf64824d9a7b01018a687a2cc7738626eb971e334b51a9237`, `8e75b857d2c7e8a9f82557448065b5f0e5191e10bf9bde4bf6b53395e14bd932`.
- The matcher adds `write_file`, `edit_file`, and `read_file`. The adapter maps native `Path`/`Content`, `Path`/`Target`/`Replacement`, and `Path` to the existing canonical Write, Edit, and Read lanes. The shared write-target helper recognizes native `Path`. Existing IDE names remain in the matcher and normalization.
- Installer inspection: `install-agy.mjs` has no separate file-tool matcher list. The topology refresh host reads the plugin's `hooks.json` as its hook template and rewrites owned command locations, so the proposed matcher source stays the relevant published template. No installed hook or user-level configuration was changed or tested.

## Test-first evidence

1. Before constructing the source patch, `K152A_PROPOSAL_PHASE=red node --test specs/sprint-alfred-epic/evidence/verify-fixes/k152a-proposal.test.mjs` ran against untouched source at the host-authorized WSL boundary: **tests 3, pass 0, fail 3**. Native write normalized as `write_file` instead of `Write`; native read was not classified as read-only; the matcher missed `write_file`.
2. The first GREEN attempt returned success from `git apply` but the scratch postimage hash was unchanged. The proposal check now initializes its own scratch Git fixture before applying the patch, and asserts changed postimage hashes. No main source file changed.
3. The next GREEN attempts exposed synthetic fixture setup and guard ordering, not a source implementation failure: the fixture needed its own governed Git root; then the adapter correctly refused incomplete lifecycle before `guard-testpath`. The case was adjusted after implementation for this criterion-bound reason: it now asserts native/IDE decision and reason parity at the adapter boundary and runs `guard-testpath` directly on the same canonical payload under a synthetic protected-path rule. This preserves the protected-target negative control without claiming a completed lifecycle.
4. `node --test specs/sprint-alfred-epic/evidence/verify-fixes/k152a-proposal.test.mjs` on the scratch-applied postimage, at the host-authorized WSL boundary: **tests 3, pass 3, fail 0**, duration 34.2 seconds on the final run. Cases cover native and IDE Write/Edit normalization, shared target extraction, adapter denial parity, protected-target guard refusal, positive admission of a safe native read, native/IDE passive read parity, credential and missing read-target refusals, and all retained matcher names.
5. `git apply --check specs/sprint-alfred-epic/evidence/verify-fixes/k152a-native-tools.diff`: **exit 0** against the declared source base. Patch review found no machine-specific paths or credentials.

## Limits and recovery

Coordinator readback after the actual worker return: the official `inspectNativeGoldfishItemDelivery` reader returned `status:observed` with no matching item for this dispatch, and Git HEAD remained unchanged. Thus no native host admission, host commit or native authorship receipt is established in this runtime. The earlier "host commits" text records the requested route, not an observed result. Preserve the actual worker output and tested artifacts as a methodological proposal; use an honest local artifact-custody commit or the later sanctioned integration route, never manufacture the missing host record.

The proposal check is a new file and is **not registered in Verify**. The full adapter suite, full Verify, native Antigravity re-test, independent Critic and PO acceptance were not run here. No native host preparation or receipt was observed. The host/operator must commit these artifacts, arrange protected source application in the later authorized terminal window, register or otherwise retain this proposal check as appropriate, then run integrated checks and review. The patch must be rechecked if its source base changes.
