# w8-family-authority-admits-the-native-tier (held patch, not applied)

Cause of the red `model-family-approval-request` cases MFA001 and MFA008: commit dc8204a28 gave Antigravity rows of the registered model-family route source an extra
`nativeTier` key (`pro` or `flash`). `sourceProjection` in `plugins/pipeline-core/lib/model-family-authority.mjs` demands an exact key set per task route, so
`verifyModelFamilyAuthority` refused the real route source with `MODEL-FAMILY-AUTHORITY-ASSIGNMENTS`. This is a product defect, not fixture drift: the verifier is also
used by `model-family-host-store` and `agy-session-authority`.

Change: `sourceProjection` admits the `nativeTier` key only on `antigravity` rows and only with a closed value (`pro`, `flash`, or an explicitly undefined entry as the
route source emits for profile routes without a tier). Any other runner carrying it, or any other value, is still refused. The digest of the route source is unchanged
by this patch.

Evidence (clean clone): `model-family-approval-request` 10/10, `model-family-authority` 10/10, `agy-session-authority` 6/6, the version-upgrade pin 30 of 31 (one
pre-existing skip) and `model-family-host-store` exit 0. Applies to the repository HEAD.
