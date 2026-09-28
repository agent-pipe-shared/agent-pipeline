// Edits only the two expressly assigned backlog items, preserving the handover proposal.
import {readFileSync,writeFileSync} from 'node:fs';
const path='backlog/items/2026-09-28-agy-imported-plugin-snapshot-shadows-registered-plugin.md';
let text=readFileSync(path,'utf8');
const heading=text.indexOf('# Agy runs'),affected=text.indexOf('## Affected artifact');
if(heading<0||affected<heading)throw Error('handover anchors');
const prefix=text.slice(0,heading).replace(/^source: .*$/m,'source: "PO Claude handover and independent read-only verification, 2026-09-28; backlog/evidence/agy-imported-snapshot-20260928-readback.json and -verification.md. Physical stale copy/current registry and one stale-version fixture lock confirmed; exact load precedence remains pending."');
const front=`# Imported Agy snapshot conflicts with the registered Pipeline source

This active item supersedes [pipeline.agy-greenfield-run-used-stale-plugin](2026-09-27-agy-greenfield-run-used-stale-plugin.md), per PO decision on 2026-09-28. The predecessor is closed for deduplication, not fixed. Its historical evidence and requirement for a version-correct 0.7 run remain part of this item.

## Description and independent verification

Read-only physical readback confirms a managed/imported Pipeline copy at
\`~/.gemini/config/plugins/agent-pipeline-core\` with version
\`0.6.2+antigravity.20260913103423.c1e799c\`. The import manifest records
source \`antigravity\`, importedAt \`2026-09-15T20:18:50Z\`, and components
\`skills\`, \`agents\`, \`hooks\`. At the same time the user-global path registry
names \`~/agent-pipeline-local-marketplace/plugins/pipeline-core\`, whose three
runner manifests carry \`0.7.0+…20260927174722.15c963ef\`.

The current installer updates the selected registry, optional settings and
attestation; it has no imported-copy lifecycle or discovery. A marketplace-only
refresh likewise leaves the separate managed copy untouched. Thus duplicate/stale
topology is confirmed, and registry-only repair cannot retire that copy. Actual
CLI precedence and which sources a new session loads still require the spike.

| Independently read fact | Result |
| --- | --- |
| Global registry | One Pipeline entry, current marketplace directory |
| Managed/imported copy | 0.6.2; three runner manifests physically present |
| Marketplace manifests | 0.7.0; mtime 2026-09-27T17:47:22.624Z |
| Global hook wiring | Two absolute marketplace commands; authoring origin unverified |
| Snapshot hooks.json | Relative Antigravity start/pretool/stop/slicing commands |
| Fixture .agents/plugins.json | Absent |
| Fixture session-47742919-… lock | locked=true, version=0.6.2; current mtime 2026-09-27T19:27:27.928Z |
| Fixture session-dummy lock | version=0.7.0, missing locked; current mtime 2026-09-27T18:43:03.346Z |

Evidence: [sanitized physical readback](../evidence/agy-imported-snapshot-20260928-readback.json)
and [verification scope](../evidence/agy-imported-snapshot-20260928-verification.md).
Only Pipeline metadata, file hashes and lock version/shape were projected; no
full Claude/Codex settings, credentials or transcripts were read or published.

## What the facts do and do not establish

The start hint writes its own plugin-root manifest version into the lock. The
0.6.2 lock is therefore strong evidence consistent with a stale-root hook write.
The lock is mutable metadata, not an executed-path attestation. Its mtime/body do
not prove the exact writer, manual origin of the dummy lock, CLI precedence,
daemon state, hook overwrite order, effective pretool guard, or every historical
session since import. Those assertions in the original handover are not accepted
as proven. Snapshot shadowing remains the leading explanation to test.

The historical greenfield report describes name-only approval under signature
mode, but lacks per-command provenance. Preserve it as a regression observation;
it cannot prove a 0.7 bypass or count as 0.7 acceptance. Before acceptance, record
the actual loaded root, version, content identity and policy, then demonstrate
unsigned refusal and signed approval on the intended version with receipt/state
readback. A stale managed copy is a governance-version risk because old code may
enforce old rules; direct causation of the reported approval is not established.

The three observed configuration locations are user-global. The installer itself
describes global registration as applying to all projects. Actual discovery or
hook firing in ~/src or every other directory was not measured here. Loading and
governing are separate: the current start hint intentionally avoids bootstrap
locks in ungoverned/uninitialized directories. The PO's requested repo-local
scope should be validated explicitly rather than inferred from registry names.

### Cross-runner follow-up: unverified handover claims

Claude/Codex user-global enablement, an archived Claude debug hook, and each
runner's supported project-only enablement remain unverified in this item. No
global settings were independently inspected. Retain these as scoped follow-up
questions; do not treat them as confirmed activation in every directory or an
authorized global cleanup.

### CLI behaviour: handover references, pending reproduction

The handover cites CLI 1.2.12 changelog claims: managed global installation
(1.0.2), whole-directory import (1.0.14), config enablement (1.1.11), configured
path precedence (1.1.21), exact install/uninstall replacement (1.1.28), version
pruning (1.2.7), and direct-child directory loading (1.2.10). It also reports
plugin list/help and validate success. None was independently rerun here. In
particular, the observed duplicate topology does not by itself contradict the
documented precedence. Verify these behaviours and command syntax in S1–S6 before
fixing the installer topology or running remediation.

`;
text=prefix+front+text.slice(affected);
function change(a,b){if(!text.includes(a))throw Error('missing correction anchor '+a.slice(0,50));text=text.replace(a,b);}
change('only `plugins.json`. It is blind','the path registry, optional settings and attestation. It is blind');
change('When 0.7 code is loaded from a\n    snapshot, it returns `plugin-attestation-required` with the recovery\n    "rerun `install-agy.mjs`". **That recovery does not converge**, because the\n    installer never touches the snapshot.','For a loaded root differing from the\n    registry entry it returns null; it does not discover managed copies or diagnose\n    duplicate-source precedence. The current installer cannot retire an imported\n    copy. The exact proposed recovery/action should be verified before replacement.');
change('The actual cause is a different plugin build and\n    goes undiagnosed.','A differing recorded build goes undiagnosed; the scan does not prove\n    the exact runtime cause. Its fail-closed freshness refusal must be preserved.');
change('**throwaway HOME** (for example `HOME="$(mktemp -d)" agy plugin …`, or a\nfixture HOME under `scratch/`), never against the PO\'s real `~/.gemini`:','disposable isolated account/container with no PO credentials or real config,\nor a documented CLI configuration-root override. Do not repurpose HOME or run\nthese mutation spikes against the PO\'s real `~/.gemini`:');
change('which is the runtime proof used above.','along with independent loaded-source observations; a mutable lock alone is not\n  executed-path proof.');
change('### 5. Tests (fake `agy` executable + fixture HOME, no real agy)','### 5. Tests (fake `agy` executable + injected fixture configuration root, no real agy)');
change('- **Decision:**\n- **Rationale:**\n- **Assignment (if accepted):**\n- **Date:**','- **Decision:** Accepted for Alfred triage; active successor of the closed stale-run item, per PO on 2026-09-28.\n- **Rationale:** Physical duplicate/stale topology and installer/diagnostic blind spots are confirmed. Actual precedence, activation scope and supported remediation commands remain spike requirements, not confirmed outcomes. No installation fix or version-correct acceptance run has been completed.\n- **Assignment (if accepted):** First bounded S1–S6 validation, then source-backed topology diagnostics and convergent host-owned refresh, preserving unrelated configuration; version-correct acceptance evidence remains required.\n- **Date:** 2026-09-28');
writeFileSync(path,text);
console.log(JSON.stringify({path,preservedProposalFrom:'Affected artifact onward, with explicit verification/isolated-test corrections',mutation:'only assigned backlog markdown'}));
