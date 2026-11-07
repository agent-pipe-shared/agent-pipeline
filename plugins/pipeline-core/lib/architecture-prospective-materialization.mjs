// SPDX-License-Identifier: SUL-1.0
/** Pure prospective content validation. It grants no approval or write authority. */
import { createHash } from 'node:crypto';
import { canonicalizeJson, parseStrictJson } from './governance-event.mjs';
import { validateArchitectureDecisionSidecar } from './architecture-effective-decisions.mjs';
export const PROSPECTIVE_ARCHITECTURE_SCHEMA = 'pipeline.architecture-prospective-materialization.v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const own = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const pathOK = value => typeof value === 'string' && value.length <= 240
  && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value)
  && value.split('/').every(part => part && !part.startsWith('.'));
const refOK = value => own(value, ['path', 'sha256']) && pathOK(value.path) && /^[a-f0-9]{64}$/u.test(value.sha256);
function need(value, code) { if (!value) throw new Error(`DDB-PROSPECTIVE-${code}`); }
export const prospectiveJson = json;
/** A draft that still carries a create-adr template line has not been written yet; signing it would freeze a placeholder. */
export const PLACEHOLDER_LINE = /^REPLACE:/mu;

/** The accepted records one row publishes. The inspector below and the binding generator both call this, so they cannot drift. */
export function deriveAcceptedRecords({ id, proposed, markdownText, choice }) {
  const acceptedMarkdown = `# ADR-${id}: ${proposed.title}\n\nAccepted through the canonical aggregate design approval.\n\n## Approved proposal, preserved verbatim\n\n${markdownText}`;
  const acceptedSidecar = { ...proposed, id, status: 'accepted', digest: hash(acceptedMarkdown) };
  const { origin: _origin, selections: _selections, ...selected } = choice;
  const acceptedChoice = { ...selected, schema: 'pipeline.design-decision-chat-selection.v1', id, decision: 'accepted', markdownSha256: hash(acceptedMarkdown), sidecarSha256: hash(json(acceptedSidecar)) };
  return { acceptedMarkdown, acceptedSidecar, acceptedChoice };
}

/** The superseded predecessor sidecar. `prior` is the predecessor's EXISTING sidecar file ({ bytes, sha256 }) or null.
 * Without one the record is rebuilt from the historic Markdown. With one the record is that sidecar with only its status changed;
 * `preimageSha256` is then the digest of the bytes the signed manifest must pre-bind (null once it is already superseded). */
export function derivePredecessorSidecar({ supersedes, historic, proposed, prior }) {
  if (prior) {
    const base = parseStrictJson(prior.bytes);
    need(validateArchitectureDecisionSidecar(base) && base.id === supersedes && base.digest === historic.sha256
      && ['accepted', 'superseded'].includes(base.status), 'PREDECESSOR-INVALID');
    return { record: { ...base, status: 'superseded' }, preimageSha256: base.status === 'accepted' ? prior.sha256 : null };
  }
  return { preimageSha256: null, record: { schema: 'pipeline.architecture-decision.v1', id: supersedes,
    title: historic.text.split('\n')[0].replace(/^# ADR-\d+: /u, ''), status: 'superseded', digest: historic.sha256,
    scope: proposed.scope, date: proposed.date } };
}

/** All inputs, including the manifest, must be explicit signed Source companions.
 * The reader supplies its normal physical custody checks; this function never
 * accepts a synthetic authority handle or reads an optional caller location. */
export function inspectProspectiveArchitectureManifest({ manifest, sources, read, existing }) {
  need(refOK(manifest) && sources.companions.some(ref => ref.path === manifest.path && ref.sha256 === manifest.sha256), 'COMPANION-REQUIRED');
  const files = [], paths = new Set(), targets = [], decisions = [];
  const get = ref => {
    need(refOK(ref) && sources.companions.some(source => source.path === ref.path && source.sha256 === ref.sha256), 'INPUT-COMPANION-REQUIRED');
    const file = read(ref.path); need(file.sha256 === ref.sha256, 'INPUT-DRIFT'); files.push(file); return file;
  };
  const manifestFile = get(manifest), value = parseStrictJson(manifestFile.bytes);
  need(own(value, ['schema', 'decisions']) && value.schema === PROSPECTIVE_ARCHITECTURE_SCHEMA
    && Array.isArray(value.decisions) && value.decisions.length > 0 && value.decisions.length <= 16, 'MANIFEST-SHAPE');
  // `preimageSha256` (predecessor sidecars only) is the digest of an existing file the SIGNED manifest allows to be replaced by `bytes`.
  const add = (path, bytes, sha256, preimageSha256 = null) => {
    need(pathOK(path) && !paths.has(path.toLowerCase()) && !sources.companions.some(ref => ref.path.toLowerCase() === path.toLowerCase())
      && path !== sources.prd.path && path !== sources.spec.path, 'TARGET-COLLISION');
    need(hash(bytes) === sha256, 'TARGET-DIGEST'); paths.add(path.toLowerCase());
    const present = existing(path);
    const replaceable = !!present && preimageSha256 !== null && present.sha256 === preimageSha256;
    need(!present || replaceable || present.bytes.equals(Buffer.from(bytes)), 'TARGET-DRIFT');
    targets.push({ path, bytes, sha256, present: !!present && !replaceable, ...(replaceable ? { preimageSha256 } : {}) });
    return { path, sha256 };
  };
  const ids = [];
  for (const row of value.decisions) {
    need(own(row, ['id', 'proposedMarkdown', 'proposedSidecar', 'chatSelection', 'predecessor', 'outputs'])
      && /^\d{4}-[a-z0-9][a-z0-9-]*$/u.test(row.id), 'ROW-SHAPE');
    ids.push(row.id);
    const markdown = get(row.proposedMarkdown), sidecar = get(row.proposedSidecar), selection = get(row.chatSelection);
    const proposed = parseStrictJson(sidecar.bytes), choice = parseStrictJson(selection.bytes);
    need(!PLACEHOLDER_LINE.test(markdown.text), 'PLACEHOLDER-REMAINS');
    need(row.proposedMarkdown.path.startsWith('docs/adr/draft-') && row.proposedSidecar.path === row.proposedMarkdown.path.slice(0, -3) + '.json'
      && validateArchitectureDecisionSidecar(proposed) && proposed.status === 'proposed' && !proposed.exception
      && proposed.id === row.proposedMarkdown.path.slice('docs/adr/'.length, -3)
      && proposed.id.startsWith('draft-') && proposed.digest === markdown.sha256, 'PROPOSAL-INVALID');
    need(own(choice, ['schema', 'id', 'decision', 'markdownSha256', 'sidecarSha256', 'scope', 'moduleIds', 'supersedes', 'attributedTo', 'origin', 'selections'])
      && choice.schema === 'pipeline.architecture-prospective-chat-selection.v1' && choice.id === proposed.id && choice.decision === 'selected'
      && choice.markdownSha256 === markdown.sha256 && choice.sidecarSha256 === sidecar.sha256
      && choice.scope === proposed.scope && canonicalizeJson(choice.moduleIds) === canonicalizeJson(proposed.moduleIds ?? [])
      && choice.supersedes === (proposed.supersedes ?? null) && typeof choice.attributedTo === 'string'
      && choice.attributedTo.trim() && choice.attributedTo.length <= 160 && !/[\r\n\0]/u.test(choice.attributedTo), 'SELECTION-INVALID');
    const origin = parseStrictJson(get(choice.origin).bytes);
    need(Array.isArray(choice.selections) && choice.selections.length > 0 && choice.selections.length <= 64
      && Array.isArray(origin.selections) && choice.selections.every(item => own(item, ['topic', 'text'])
        && typeof item.topic === 'string' && typeof item.text === 'string' && item.text.trim()
        && origin.selections.some(original => original.topic === item.topic && original.text === item.text)), 'SELECTION-ORIGIN-DRIFT');
    const { acceptedMarkdown, acceptedSidecar, acceptedChoice } = deriveAcceptedRecords({ id: row.id, proposed, markdownText: markdown.text, choice });
    need(validateArchitectureDecisionSidecar(acceptedSidecar), 'POSTIMAGE-INVALID');
    need(own(row.outputs, ['markdown', 'sidecar', 'chatSelection']) && Object.values(row.outputs).every(refOK)
      && row.outputs.markdown.path === `docs/adr/${row.id}.md` && row.outputs.sidecar.path === `docs/adr/${row.id}.json`
      && row.outputs.chatSelection.path === `project/architecture-chat-selections/${row.id}.json`, 'OUTPUT-SHAPE');
    const entry = { id: row.id, markdown: add(row.outputs.markdown.path, acceptedMarkdown, row.outputs.markdown.sha256),
      sidecar: add(row.outputs.sidecar.path, json(acceptedSidecar), row.outputs.sidecar.sha256),
      chatSelection: add(row.outputs.chatSelection.path, json(acceptedChoice), row.outputs.chatSelection.sha256) };
    if (proposed.supersedes) {
      // A predecessor that already has a sidecar names the digest of that file (`sidecarPreimageSha256`) inside the signed manifest:
      // only bytes with exactly that digest may be replaced by the superseded postimage (C20 G20-23 (a)).
      const preimage = row.predecessor !== null && typeof row.predecessor === 'object' && Object.hasOwn(row.predecessor, 'sidecarPreimageSha256');
      need(own(row.predecessor, preimage ? ['markdown', 'sidecar', 'sidecarPreimageSha256'] : ['markdown', 'sidecar']) && refOK(row.predecessor.markdown) && refOK(row.predecessor.sidecar)
        && (!preimage || /^[a-f0-9]{64}$/u.test(row.predecessor.sidecarPreimageSha256))
        && row.predecessor.markdown.path === `docs/adr/${proposed.supersedes}.md`
        && row.predecessor.sidecar.path === `docs/adr/${proposed.supersedes}.json`, 'PREDECESSOR-SHAPE');
      const historic = get(row.predecessor.markdown);
      need(historic.text.startsWith(`# ADR-${proposed.supersedes.slice(0,4)}:`), 'PREDECESSOR-TITLE');
      const prior = preimage ? existing(row.predecessor.sidecar.path) : null;
      need(!preimage || prior, 'PREDECESSOR-PREIMAGE-MISSING');
      const { record } = derivePredecessorSidecar({ supersedes: proposed.supersedes, historic, proposed, prior });
      need(validateArchitectureDecisionSidecar(record) && (preimage || record.scope !== 'module'), 'PREDECESSOR-INVALID');
      add(row.predecessor.sidecar.path, json(record), row.predecessor.sidecar.sha256, preimage ? row.predecessor.sidecarPreimageSha256 : null);
    } else need(row.predecessor === null, 'PREDECESSOR-UNEXPECTED');
    decisions.push({ entry, record: acceptedSidecar });
  }
  need(ids.join('\0') === [...new Set(ids)].sort().join('\0'), 'ORDER');
  return { files, targets, decisions, materialized: targets.every(target => target.present) };
}
