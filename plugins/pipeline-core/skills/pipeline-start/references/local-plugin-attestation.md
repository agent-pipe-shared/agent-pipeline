# Local plugin-attestation recovery

`plugin-attestation-required` protects a copied or cached local plugin when
the runner cannot prove which clean source checkout produced it. A missing
`nextAction` is deliberate in that case: do not treat the marketplace copy as
its own provenance authority and do not infer a source path from a prompt,
shell history, or a neighbouring checkout.

For Claude, an exact directory marketplace registration whose selected plugin
root is also the loaded root is a direct local-development source, not a copy.
It needs no receipt. If that direct-root case reports this status, the
registry/root identity is malformed or mismatched and must be repaired by the
installer or marketplace owner.

For a Claude cache or copied marketplace tree, the source-checkout owner must
run the source-bound host attestation command before bootstrap. Rerun the same
preflight afterward and continue only on `status: "ready"`. The command must
name a known clean source checkout and the actual installed root; never guess
either value. A gitless Claude cache or copied marketplace tree cannot recover
its clean Git source from the registry, so it returns
`plugin-attestation-required` with `nextAction: null`.

For Antigravity, the repository installer writes the receipt before it
registers a copied marketplace tree. Every gitless loaded Antigravity root
needs one exact path-registry binding plus the verified receipt. A missing,
ambiguous, or mismatched binding, or a legacy copied registration with no
installer locator, returns `plugin-attestation-required` with
`nextAction: null`. Run `install-agy.mjs` from the clean source checkout and
restart the runner as instructed by the installer. The source path cannot be
recovered safely from Antigravity's path-only registry and must not be guessed.

Agy also keeps a managed plugin directory and an import manifest; keep a single
source per scope. Refresh with `install-agy.mjs --refresh` (plan printed first,
confirmation required, `--yes` only together with `--refresh`), then restart
and read the session lock. `agy plugin list` and `plugins.json` are not proof
of what is loaded.

## After a plugin reload or update

Happy path: the person installs or updates the plugin for the marketplace, the
session is restarted (after a reload alone the host registry can still list
the previous version), and the same preflight reports `status: "ready"`. When a
step refuses instead, each refusal names its recovery; `<plugin-root>` is the
plugin root the bootstrap printed and `<root>` the repository root:

- `IPA-HOST-REGISTRY-BINDING-UNAVAILABLE` (`plugin-attestation-required`,
  `nextAction: null`): `installedPluginAttestation.repair` prints the loaded
  version and the versions the host registry lists (`none` when it lists none).
  A person completes the host install or update so the registry lists the
  loaded version, restarts the session and reruns the same preflight. Nothing
  is guessed and nothing is attested by hand.
- `HOOK-SNAPSHOT-STALE`: `node <plugin-root>/scripts/refresh-mandatory-hooks.mjs --root <root>`
  rebinds every mandatory git hook to the loaded plugin; run it once, then
  repeat the refused command. Never bypass the hook.
- `SDC-AUTHORITY-CAS` with reason `windows-native-identity-drift` (a record
  changed while it was read), or `SDC-AUTHORITY-UNAVAILABLE` with reason
  `catalogue-source-closure` (a catalogue another plugin version wrote): once no
  Goldfish or other authority operation runs,
  `node <plugin-root>/scripts/session-authority-repair.mjs heal --root <root>`,
  then repeat the refused command. For any other reason,
  `... session-authority-repair.mjs inspect --root <root>` names the next command.
- `SDC-AUTHORITY-HELD`: `... session-authority-repair.mjs inspect --root <root>`
  names the exact next command or none; when the registry holds records but no
  catalogue (`legacy-partial-registry`, `legacy-retained-registry`), once no
  Goldfish runs: `... session-authority-repair.mjs move-aside --root <root> --no-goldfish-running --reason "<why>"`.
- `SDC-LOCK-HELD`: wait with `... session-authority-repair.mjs wait --root <root> --timeout 120`; when the owner
  cannot be confirmed alive and no Pipeline process runs for this repository,
  `... session-authority-repair.mjs release-lock --root <root> --no-pipeline-running --reason "<why>"`.
