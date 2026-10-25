// SPDX-License-Identifier: SUL-1.0
/** Retained accepted sources. Chat is methodological attribution, never identity proof. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isSuccessfulSpawn } from './successful-spawn.mjs';
import { readAcceptedDeliveryContract } from '../scripts/pipeline-state.mjs';
import { canonical, verifyPoApprovalProof } from './po-approval-proof.mjs';
import { verifyAgainstTrustAnchors } from './critical-human-proof-policy.mjs';
import { createDesignApprovalRequest, verifyDesignApprovalRequest } from './design-approval-binding.mjs';
import { validPlanSubmission, validCurrentPlanApproval, sha256CanonicalJson } from './plan-spec-state-v2.mjs';

export const ACCEPTED_DELIVERY_CONTRACT_SCHEMA = 'pipeline.accepted-delivery-contract-evidence.v1';
export const ACCEPTED_DELIVERY_CONTRACT_REFERENCE_SCHEMA = 'pipeline.accepted-delivery-contract-reference.v1';
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
/**
 * The one acceptance-criterion id grammar; every site that names a criterion id uses it.
 * Closed: the plain `AC-<n>` and the compound `AC-E<epic>-<story>-<nn>` (three numeric segments).
 * The compound form is deliberately not a general `AC-` plus alphanumeric segments: with exactly three
 * numeric segments no admitted id is a `-`-delimited prefix of another admitted id (a general form would
 * admit `AC-E1-01` beside `AC-E1-01-09`), and the plain form cannot prefix a compound one because a
 * compound segment starts with `E`. `{0,60}` keeps every admitted id within 64 characters.
 * Unanchored source for embedding in a larger expression; match an id with `isCriterionId`, never by prefix.
 */
export const CRITERION_ID_SOURCE = 'AC-(?:[1-9][0-9]{0,60}|E[1-9][0-9]{0,3}-[0-9]{1,4}-[0-9]{1,4})';
export const CRITERION_ID = new RegExp(`^${CRITERION_ID_SOURCE}$`, 'u');
export const CRITERION_ID_MAX_LENGTH = 64;
export const isCriterionId = value => typeof value === 'string' && value.length <= CRITERION_ID_MAX_LENGTH && CRITERION_ID.test(value);
const BULLET_ITEM = new RegExp(`^[-+*] \\*\\*(${CRITERION_ID_SOURCE}):\\*\\* (\\S.*)$`, 'u');
const NUMBERED_ITEM = new RegExp(`^([1-9][0-9]*)\\. \\*\\*(${CRITERION_ID_SOURCE}):\\*\\* (\\S.*)$`, 'u');
const BULLET_CONTINUATION = /^(?: {2,}|\t)\S/u;
const own = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const eq = (a,b) => canonical(a) === canonical(b);
const hash = v => createHash('sha256').update(canonical(v)).digest('hex');
const no = code => ({ok:false,code});
const envelopeKeys = ['schema','repositoryFingerprint','featureId','manifestPath','submission','approval','request','policyBinding'];
const inputKeys = envelopeKeys.filter(k => k !== 'schema');
const observationKeys = ['repositoryFingerprint','manifestPath','submission','approval','candidate','receipts','currentSources','policy','policyBinding','selectedMode'];
const pathFor = (featureId, digest) => `specs/${featureId}/evidence/accepted-delivery-contract-${digest}.json`;

function validEnvelope(envelope) {
  if (!own(envelope,envelopeKeys) || envelope.schema !== ACCEPTED_DELIVERY_CONTRACT_SCHEMA || !SHA.test(envelope.repositoryFingerprint)
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(envelope.featureId ?? '') || envelope.manifestPath !== `specs/${envelope.featureId}/lifecycle.json`
    || !validPlanSubmission(envelope.submission) || envelope.submission.featureId !== envelope.featureId
    || envelope.approval?.schema !== 'pipeline.plan-approval.v8' || !validCurrentPlanApproval(envelope.approval)
    || envelope.approval.submissionSha256 !== sha256CanonicalJson(envelope.submission) || envelope.approval.profileSha256 !== envelope.submission.profileSha256
    || envelope.approval.poGateAuthority.repositoryFingerprint !== envelope.repositoryFingerprint
    || envelope.approval.poGateAuthority.planPath !== envelope.submission.planPath || envelope.approval.poGateAuthority.planSha256 !== envelope.submission.planSha256
    || envelope.approval.poGateAuthority.specPath !== envelope.submission.specPath || envelope.approval.poGateAuthority.specSha256 !== envelope.submission.specSha256
    || !own(envelope.policyBinding,['path','blobOid','sha256','mode']) || !OID.test(envelope.policyBinding.blobOid) || !SHA.test(envelope.policyBinding.sha256)
    || !['signature','chat'].includes(envelope.policyBinding.mode) || envelope.policyBinding.path !== (envelope.policyBinding.mode === 'chat' ? 'pipeline.user.yaml' : 'project/critical-human-proof.json')) return false;
  const approval = envelope.approval.designApproval;
  if (!approval || approval.mode !== envelope.policyBinding.mode || approval.approvedBy !== envelope.approval.approvedBy
    || !eq(envelope.request?.binding,envelope.approval.designApprovalBinding)
    || envelope.request?.binding?.sources?.prd?.path !== envelope.submission.planPath || envelope.request?.binding?.sources?.prd?.sha256 !== envelope.submission.planSha256
    || envelope.request?.binding?.sources?.spec?.path !== envelope.submission.specPath || envelope.request?.binding?.sources?.spec?.sha256 !== envelope.submission.specSha256) return false;
  const made = createDesignApprovalRequest({binding:envelope.request?.binding,candidate:envelope.request?.approvalIntent?.value?.candidate});
  return made.ok && eq(made.request,envelope.request) && made.request.bindingSha256 === approval.bindingSha256 && made.intentSha256 === approval.intentSha256;
}

export function createAcceptedDeliveryContractEnvelope(input) {
  try {
    if (!own(input,inputKeys)) return no('CAC-ENVELOPE-INVALID');
    const envelope = structuredClone({schema:ACCEPTED_DELIVERY_CONTRACT_SCHEMA,...input});
    if (!validEnvelope(envelope)) return no('CAC-ENVELOPE-INVALID');
    const sha256 = hash(envelope);
    return {ok:true,envelope,sha256,path:pathFor(envelope.featureId,sha256)};
  } catch { return no('CAC-ENVELOPE-INVALID'); }
}

function originalProjection(approval, envelope) {
  if (approval?.schema === 'pipeline.plan-approval.v8') return approval;
  if (approval?.schema !== 'pipeline.plan-approval.v9' || !validCurrentPlanApproval(approval)) return null;
  const digest = hash(envelope);
  if (!eq(approval.acceptedContract,{schema:ACCEPTED_DELIVERY_CONTRACT_REFERENCE_SCHEMA,path:pathFor(envelope.featureId,digest),sha256:digest})) return null;
  const projected = {...approval,schema:'pipeline.plan-approval.v8'};
  delete projected.acceptedContract;
  return projected;
}

/** Controlled unit observations are not a serialized authorization token. Runtime reads them afresh. */
export function verifyAcceptedDeliveryContract({envelope,observations} = {}) {
  try {
    if (!validEnvelope(envelope) || !own(observations,observationKeys)) return no('CAC-ENVELOPE-INVALID');
    if (observations.repositoryFingerprint !== envelope.repositoryFingerprint || observations.manifestPath !== envelope.manifestPath
      || !eq(observations.submission,envelope.submission)) return no('CAC-SOURCE-BINDING-MISMATCH');
    if (!eq(originalProjection(observations.approval,envelope),envelope.approval)) return no('CAC-APPROVAL-STALE');
    if (!eq(observations.candidate,envelope.request.approvalIntent.value.candidate)) return no('CAC-SOURCE-BINDING-MISMATCH');
    if (!eq(observations.policyBinding,envelope.policyBinding)) return no('CAC-POLICY-BINDING-MISMATCH');
    const mode = observations.selectedMode;
    if (!own(mode,['mode','scope','source']) || mode.mode !== envelope.policyBinding.mode
      || !['signature','chat'].includes(mode.mode)) return no('CAC-MODE-UNAVAILABLE');
    const bound = verifyDesignApprovalRequest({request:envelope.request,featureId:envelope.featureId,receipts:observations.receipts,currentSources:observations.currentSources});
    if (!bound.ok) return no('CAC-SOURCE-BINDING-MISMATCH');
    const approval = envelope.approval.designApproval;
    let signer = null;
    if (mode.mode === 'chat') {
      if (mode.scope !== 'global' || mode.source !== 'pipeline.user.yaml' || approval.proof !== null || approval.proofSha256 !== null) return no('CAC-MODE-UNAVAILABLE');
    } else {
      const policy = observations.policy;
      if (!policy?.ok || !approval.proof || approval.proofSha256 !== hash(approval.proof)
        || approval.approvedBy !== `verified:${approval.proof.keyReference}`) return no('CAC-PROOF-INVALID');
      const verified = Array.isArray(policy.trustAnchors)
        ? verifyAgainstTrustAnchors({intent:envelope.request.approvalIntent,anchors:policy.trustAnchors,proof:approval.proof})
        : verifyPoApprovalProof({intent:envelope.request.approvalIntent,trustPolicy:policy.trustAnchor,proof:approval.proof});
      if (!verified.verified || verified.proofSha256 !== approval.proofSha256) return no('CAC-PROOF-INVALID');
      signer = verified.signer ?? {keyReference:policy.trustAnchor.keyReference,publicKeySha256:policy.trustAnchor.publicKeySha256};
    }
    return {ok:true,authorityBasis:mode.mode === 'chat' ? 'chat-attributed-unattested' : 'signature',cryptographicallyAuthenticated:mode.mode === 'signature',
      envelopeSha256:hash(envelope),featureId:envelope.featureId,manifestPath:envelope.manifestPath,submissionSha256:hash(envelope.submission),
      bindingSha256:bound.bindingSha256,intentSha256:bound.intentSha256,candidate:structuredClone(bound.candidate),sources:structuredClone(observations.currentSources),signer};
  } catch { return no('CAC-ENVELOPE-INVALID'); }
}

export function prepareAcceptedContractCapture({state,expectedStateSha256,approval,envelope} = {}) {
  try {
    if (!state || sha256CanonicalJson(state) !== expectedStateSha256) return no('CAC-APPROVAL-STALE');
    if (!validEnvelope(envelope) || !eq(approval,envelope.approval) || !eq(state.planSubmission,envelope.submission)) return no('CAC-SOURCE-BINDING-MISMATCH');
    const sha256 = hash(envelope), path = pathFor(envelope.featureId,sha256);
    const nextApproval = {...structuredClone(approval),schema:'pipeline.plan-approval.v9',acceptedContract:{schema:ACCEPTED_DELIVERY_CONTRACT_REFERENCE_SCHEMA,path,sha256}};
    if (!validCurrentPlanApproval(nextApproval)) return no('CAC-ENVELOPE-INVALID');
    const next = {...state,planApproved:true,planApproval:nextApproval};
    delete next.planRevocation;
    return {ok:true,state:next,envelope:structuredClone(envelope),sha256,path};
  } catch { return no('CAC-ENVELOPE-INVALID'); }
}

/** Publication ordering only; production supplies lock-held CAS and durable readback. */
export function commitAcceptedContractCapture({capture,persistEnvelope,publishState} = {}) {
  let retained = false;
  try {
    if (!capture?.ok || !validEnvelope(capture.envelope) || hash(capture.envelope) !== capture.sha256
      || capture.path !== pathFor(capture.envelope.featureId,capture.sha256) || typeof persistEnvelope !== 'function' || typeof publishState !== 'function') return {...no('CAC-ENVELOPE-INVALID'),committed:false,envelopeRetained:false};
    const stored = persistEnvelope({path:capture.path,sha256:capture.sha256,envelope:capture.envelope});
    if (!stored?.ok || stored.path !== capture.path || stored.sha256 !== capture.sha256) return {...no('CAC-CAPTURE-READBACK'),committed:false,envelopeRetained:false};
    retained = true;
    if (!publishState(capture.state)?.ok) return {...no('CAC-CAPTURE-PUBLICATION'),committed:false,envelopeRetained:true};
    return {ok:true,committed:true,envelopeRetained:true};
  } catch { return {...no(retained ? 'CAC-CAPTURE-PUBLICATION' : 'CAC-CAPTURE-READBACK'),committed:false,envelopeRetained:retained}; }
}

// Normative and excluded heading vocabulary of the criterion scan (shared with `inspectSpecCriterionRows`).
const NORMATIVE_HEADING = /\b(?:acceptance\s+(?:criteria|requirements)|abnahmekriterien|akzeptanzkriterien|abnahmeanforderungen)\b/iu;
const EXCLUDED_HEADING = /\b(?:examples?|notes?|commentary|beispiele?|hinweise?|anmerkung(?:en)?|kommentare?)\b/iu;

/**
 * The ordered criterion-row scan of the host parser, exported unchanged so other readers (plan-readiness
 * hand-off, lib/plan-handoff-readiness.mjs) see exactly the rows `parseAcceptedCriticCriterion` selects from.
 * Pure and byte-offset exact: `source` is the strictly decoded Spec text; each row carries `id`, `normative`,
 * `text`, `startByte`, `endByte` and (where the shape has one) `valid` and `parserVersion`. A row is a candidate,
 * never an acceptance: only the parser's later checks decide whether a locator on it is supported.
 */
export function scanAcceptedCriterionRows(source) {
    const lines = []; let byteOffset = 0;
    for (const raw of source.split(/(?<=\n)/u)) {
      lines.push({text:raw.replace(/\r?\n$/u,''),byteOffset}); byteOffset += Buffer.byteLength(raw);
    }
    // Normative and excluded heading vocabulary, shared by the table and the clause scanners below (module level).
    // Two-column acceptance table: a number cell, then a criterion cell. Rows `n` and `R-n` map to `AC-n`.
    const TWO_COLUMN_NUMBER = /^(?:#|nr\.?|id)$/iu;
    const TWO_COLUMN_CRITERION = /^(?:kriterium|kriterien|abnahmekriterium|anforderung|criterion|requirement)$/iu;
    const cells = (text, width = 3) => {
      // Escaped pipes require a separate Markdown representation; never miscount their columns.
      if (text.includes('\\|')) return null;
      const separators = [...text.matchAll(/\|/gu)].map(match => match.index);
      if (separators.length < 2) return null;
      const outerLeft = text.slice(0,separators[0]).trim() === '', outerRight = text.slice(separators.at(-1)+1).trim() === '';
      const limits = [outerLeft ? separators[0]+1 : 0];
      const ends = [];
      for (let index = outerLeft ? 1 : 0; index < separators.length - (outerRight ? 1 : 0); index++) {
        ends.push(separators[index]); limits.push(separators[index]+1);
      }
      ends.push(outerRight ? separators.at(-1) : text.length);
      if (limits.length !== width || ends.length !== width) return null;
      return limits.map((start,index) => {
        const raw = text.slice(start,ends[index]), leading = raw.length - raw.trimStart().length;
        const value = raw.trim(); return {value,start:start+leading,end:start+leading+value.length};
      });
    };
    const headings = [], rows = []; let comment = false, fence = null, table = null;
    for (let index=0; index<lines.length; index++) {
      const line = lines[index], text = line.text;
      if (comment || text.includes('<!--')) {
        if (text.includes('<!--')) comment = true;
        if (text.includes('-->')) comment = false;
        table = null; continue;
      }
      const marker = text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
      if (fence) {
        if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && marker[2].trim() === '') fence = null;
        table = null; continue;
      }
      if (marker) { fence = {char:marker[1][0],length:marker[1].length}; table = null; continue; }
      if (/^(?: {0,3}>| {4}|\t)/u.test(text)) { table = null; continue; }
      const heading = text.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/u);
      if (heading) {
        while (headings.length && headings.at(-1).level >= heading[1].length) headings.pop();
        headings.push({level:heading[1].length,text:heading[2]}); table = null; continue;
      }
      const parts = cells(text), pair = cells(text, 2);
      const threeColumn = parts !== null && parts.map(cell=>cell.value).join('\0') === '#\0Criterion\0Evidence';
      const twoColumn = !threeColumn && pair !== null && TWO_COLUMN_NUMBER.test(pair[0].value) && TWO_COLUMN_CRITERION.test(pair[1].value);
      if (threeColumn || twoColumn) {
        const width = threeColumn ? 3 : 2, delimiter = cells(lines[index+1]?.text ?? '', width);
        if (delimiter?.every(cell=>/^:?-{3,}:?$/u.test(cell.value))) {
          table = {width,normative:headings.some(entry=>NORMATIVE_HEADING.test(entry.text))
            && !headings.some(entry=>EXCLUDED_HEADING.test(entry.text))}; index++; continue;
        }
      }
      const row = table ? cells(text, table.width) : null;
      if (!table || !row) { table = null; continue; }
      const number = table.width === 2 ? row[0].value.match(/^(?:R-)?([1-9][0-9]*)$/u)?.[1] : null;
      const rowId = table.width === 3 ? row[0].value : (number ? `AC-${number}` : null);
      if (rowId !== null && isCriterionId(rowId)) {
        const cell = row[1]; rows.push({id:rowId,normative:table.normative,text:cell.value,
          startByte:line.byteOffset+Buffer.byteLength(text.slice(0,cell.start)),endByte:line.byteOffset+Buffer.byteLength(text.slice(0,cell.end)),
          ...(table.width === 2 ? {parserVersion:'markdown-acceptance-table-two-column.v1'} : {})});
      }
    }
    // Heading paragraphs and numbered AC items have separate, closed renderings.
    // Observe their whole structural scope; a locator cannot trim a second body
    // paragraph, continuation, excluded context or contradictory sentence away.
    const clauseHeadings = []; let clauseComment=false, clauseFence=null, active=null;
    const normative = () => clauseHeadings.some(h=>NORMATIVE_HEADING.test(h.text))
      && !clauseHeadings.some(h=>EXCLUDED_HEADING.test(h.text));
    const markExcluded = () => { if(active)active.valid=false; };
    for(const line of lines){const text=line.text;
      if(clauseComment || text.includes('<!--')){markExcluded();if(text.includes('<!--'))clauseComment=true;if(text.includes('-->'))clauseComment=false;continue;}
      const marker=text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
      if(clauseFence){markExcluded();if(marker&&marker[1][0]===clauseFence.char&&marker[1].length>=clauseFence.length&&marker[2].trim()==='')clauseFence=null;continue;}
      if(marker){markExcluded();clauseFence={char:marker[1][0],length:marker[1].length};continue;}
      if(active?.kind==='bullet'){
        // A bullet item's scope is its line plus the directly following indented continuation lines (sub-bullets or
        // wrapped text). It ends at a blank line, a heading or the next top-level item; any other adjacent line may be a
        // lazy continuation, so it invalidates the item instead of being trimmed away. Continuations are consumed here,
        // before the four-space code-block rule below would drop them.
        if(!text.trim()){active=null;continue;}
        if(BULLET_CONTINUATION.test(text)){const end=text.trimEnd();active.text+='\n'+end;active.endByte=line.byteOffset+Buffer.byteLength(end);continue;}
        if(!/^ {0,3}(?:#{1,6}\s|[-+*]\s|[0-9]+[.)]\s)/u.test(text))active.valid=false;
        active=null;
      }
      if(/^(?: {0,3}>| {4}|\t)/u.test(text)){markExcluded();continue;}
      const heading=text.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/u);
      if(heading){
        if(active?.kind==='paragraph'&&heading[1].length>active.level)active.valid=false;
        active=null;
        while(clauseHeadings.length&&clauseHeadings.at(-1).level>=heading[1].length)clauseHeadings.pop();
        clauseHeadings.push({level:heading[1].length,text:heading[2]});
        if(isCriterionId(heading[2])){
          active={id:heading[2],kind:'paragraph',level:heading[1].length,normative:normative(),valid:true,text:'',startByte:null,endByte:null,bodyEnded:false,parserVersion:'markdown-acceptance-heading-paragraph.v1'};rows.push(active);
        }
        continue;
      }
      const item=text.match(NUMBERED_ITEM);
      if(item){
        if(active?.kind==='paragraph')active.valid=false;
        const start=text.length-item[3].length;
        active={id:item[2],kind:'numbered',normative:normative(),valid:true,text:item[3],startByte:line.byteOffset+Buffer.byteLength(text.slice(0,start)),endByte:line.byteOffset+Buffer.byteLength(text),parserVersion:'markdown-acceptance-numbered-item.v1'};rows.push(active);continue;
      }
      const bullet=text.match(BULLET_ITEM);
      if(bullet){
        if(active?.kind==='paragraph')active.valid=false;
        const start=text.length-bullet[2].length,first=text.trimEnd();
        active={id:bullet[1],kind:'bullet',normative:normative(),valid:true,text:first.slice(start),startByte:line.byteOffset+Buffer.byteLength(text.slice(0,start)),endByte:line.byteOffset+Buffer.byteLength(first),parserVersion:'markdown-acceptance-bullet-item.v1'};rows.push(active);continue;
      }
      if(!text.trim()){if(active?.kind==='paragraph'&&active.startByte!==null)active.bodyEnded=true;continue;}
      if(active?.kind==='numbered'){active.valid=false;continue;}
      if(active?.kind==='paragraph'){
        if(active.bodyEnded||cells(text)||/^ {0,3}(?:[-+*]\s|[0-9]+[.)]\s)/u.test(text)){active.valid=false;continue;}
        if(active.startByte===null){active.startByte=line.byteOffset;active.text=text;}
        else active.text+='\n'+text;
        active.endByte=line.byteOffset+Buffer.byteLength(text);
      }
    }
    return rows;
}

/** The criterion shapes the host parser locates, as named in a refusal (D64: the repair is stated where the refusal is). */
export const SUPPORTED_CRITERION_SHAPES = Object.freeze([
  'a three-column table with the header `| # | Criterion | Evidence |` and the id (AC-<n>) in the first cell',
  'a two-column table with the header `| # | Criterion |` (or `| Nr. | Kriterium |`) whose first cell is `n`, `R-n` or `AC-n`',
  'a heading `AC-<n>` followed by one paragraph',
  'a bullet `- **AC-<n>:** text` or a numbered item `1. **AC-<n>:** text`',
]);
export const CRITERION_ID_RULE = 'an id is AC-<n> (n without a leading zero) or AC-E<epic>-<story>-<nn>';
const CRITERION_CANDIDATE_TOKEN = 'AC-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*';
const TABLE_CANDIDATE = new RegExp(`^\\s*\\|\\s*(?:\\*\\*|\`)?(${CRITERION_CANDIDATE_TOKEN})(?:\\*\\*|\`)?\\s*\\|`, 'u');
const ITEM_CANDIDATE = new RegExp(`^\\s*(?:[-+*]|[0-9]+[.)])\\s+(?:\\*\\*|\`)?(${CRITERION_CANDIDATE_TOKEN})(?:\\*\\*|\`)?[:.)]?(?:\\s|$|\\*)`, 'u');
const HEADING_CANDIDATE = new RegExp(`^ {0,3}#{1,6}\\s+(${CRITERION_CANDIDATE_TOKEN})(?:\\s+#+)?\\s*$`, 'u');

/**
 * D64 (present-plan): is every acceptance-criterion row of the Spec one the registration and dispatch parser locates?
 * Reuses `scanAcceptedCriterionRows` for what is located; the only addition is the list of CANDIDATE rows under a
 * normative acceptance heading (a line that starts with an `AC-` token in a table cell, list item or heading), so a
 * row the scan silently ignores -- the four-column table, a leading-zero id -- is named instead of first failing at
 * dispatch preparation. A Spec with no candidate row is outside this check (the delivery hand-off, which also wants
 * a row to exist, is a separate and deferred concern, PO decision D85). `source` is the strictly decoded Spec text.
 * @returns {{ok: true, located: string[]} | {ok: false, code: 'CAC-CRITERION-UNSUPPORTED', located: string[], unsupported: {id: string, line: number, reason: string}[], message: string}}
 */
export function inspectSpecCriterionRows(source) {
  const rows = scanAcceptedCriterionRows(source);
  const counts = new Map();
  for (const row of rows) if (row.normative) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  const located = [...new Set(rows.filter(row => row.normative && row.valid !== false).map(row => row.id))];
  const unsupported = [];
  for (const row of rows) {
    if (!row.normative) continue;
    if (row.valid === false) unsupported.push({id: row.id, line: 0, reason: 'shape'});
    else if (counts.get(row.id) > 1 && !unsupported.some(entry => entry.id === row.id && entry.reason === 'duplicate')) unsupported.push({id: row.id, line: 0, reason: 'duplicate'});
  }
  const headings = []; let comment = false, fence = null;
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index];
    if (comment || text.includes('<!--')) { if (text.includes('<!--')) comment = true; if (text.includes('-->')) comment = false; continue; }
    const marker = text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    if (fence) { if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && marker[2].trim() === '') fence = null; continue; }
    if (marker) { fence = {char: marker[1][0], length: marker[1].length}; continue; }
    if (/^(?: {0,3}>| {4}|\t)/u.test(text)) continue;
    const heading = text.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/u);
    if (heading) {
      while (headings.length && headings.at(-1).level >= heading[1].length) headings.pop();
      headings.push({level: heading[1].length, text: heading[2]});
    }
    if (!headings.some(entry => NORMATIVE_HEADING.test(entry.text)) || headings.some(entry => EXCLUDED_HEADING.test(entry.text))) continue;
    const token = (heading ? text.match(HEADING_CANDIDATE) : text.match(TABLE_CANDIDATE) ?? text.match(ITEM_CANDIDATE))?.[1];
    if (!token) continue;
    if (!isCriterionId(token)) unsupported.push({id: token, line: index + 1, reason: 'id'});
    else if (!located.includes(token)) unsupported.push({id: token, line: index + 1, reason: 'shape'});
  }
  if (unsupported.length === 0) return {ok: true, located};
  const why = {id: `not a criterion id (${CRITERION_ID_RULE}; a leading zero is not allowed)`, shape: 'row shape the parser does not locate', duplicate: 'stated more than once'};
  const named = unsupported.slice(0, 8).map(entry => `${entry.id}${entry.line ? ` (line ${entry.line}` : ' ('}${entry.line ? ', ' : ''}${why[entry.reason]})`).join('; ');
  return {ok: false, code: 'CAC-CRITERION-UNSUPPORTED', located, unsupported,
    message: `acceptance criterion rows the registration and dispatch parser cannot locate: ${named}${unsupported.length > 8 ? '; ...' : ''}. Supported shapes: ${SUPPORTED_CRITERION_SHAPES.join('; ')}. ${CRITERION_ID_RULE}; a leading zero is not allowed. Re-render the row; the criterion text itself need not change.`};
}

/** Pure original-byte interpretation only. Locators and parser success confer no authority. */
export function parseAcceptedCriticCriterion(input) {
  let parserVersion = 'markdown-acceptance-table.v1';
  const locator = input?.locator;
  const diagnostic = (status, code) => ({status, code, parserVersion,
    sourcePath: typeof locator?.sourcePath === 'string' && /^specs\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[A-Za-z0-9_./-]+$/u.test(locator.sourcePath)
      && !locator.sourcePath.split('/').some(part => part === '.' || part === '..' || part === '') ? locator.sourcePath : null,
    sourceSha256: typeof locator?.sourceSha256 === 'string' && SHA.test(locator.sourceSha256) ? locator.sourceSha256 : null,
    criterionId: isCriterionId(locator?.criterionId) ? locator.criterionId : null,
    excerptSha256: typeof locator?.excerptSha256 === 'string' && SHA.test(locator.excerptSha256) ? locator.excerptSha256 : null});
  const binding = () => diagnostic('unsupported-or-ambiguous', 'CAC-CRITERION-BINDING');
  const unsupported = () => diagnostic('unsupported-or-ambiguous', 'CAC-CRITERION-UNSUPPORTED');
  const absent = () => diagnostic('no-explicit-criterion', 'CAC-CRITERION-NOT-EXPLICIT');
  try {
    if (!own(input, ['sourceBytes','locator','packageContext']) || !(input.sourceBytes instanceof Uint8Array)
      || input.sourceBytes.byteLength < 1 || input.sourceBytes.byteLength > 1048576
      || !own(locator, ['schema','sourcePath','sourceSha256','criterionId','startByte','endByte','excerptSha256'])
      || locator.schema !== 'pipeline.critic-criterion-locator.v1' || !diagnostic('', '').sourcePath
      || typeof locator.sourceSha256 !== 'string' || !SHA.test(locator.sourceSha256)
      || typeof locator.excerptSha256 !== 'string' || !SHA.test(locator.excerptSha256)
      || !isCriterionId(locator.criterionId)
      || !Number.isSafeInteger(locator.startByte) || !Number.isSafeInteger(locator.endByte)
      || locator.startByte < 0 || locator.endByte > input.sourceBytes.byteLength
      || locator.endByte <= locator.startByte || locator.endByte - locator.startByte > 4096) return binding();
    const context = input.packageContext;
    if (!own(context, ['featureId','sourceBindings']) || typeof context.featureId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(context.featureId)
      || !Array.isArray(context.sourceBindings) || context.sourceBindings.length < 1 || context.sourceBindings.length > 16) return binding();
    const prefix = `specs/${context.featureId}/`, seen = new Set();
    for (const entry of context.sourceBindings) {
      if (!own(entry, ['path','sha256','role']) || typeof entry.path !== 'string' || !entry.path.startsWith(prefix)
        || !/^specs\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[A-Za-z0-9_./-]+$/u.test(entry.path)
        || entry.path.split('/').some(part => part === '.' || part === '..' || part === '')
        || typeof entry.sha256 !== 'string' || !SHA.test(entry.sha256) || !['prd','spec','companion'].includes(entry.role) || seen.has(entry.path)) return binding();
      seen.add(entry.path);
    }
    const matched = context.sourceBindings.filter(entry => entry.path === locator.sourcePath && entry.sha256 === locator.sourceSha256);
    if (matched.length !== 1 || !locator.sourcePath.startsWith(prefix)) return binding();
    const bytes = Buffer.from(input.sourceBytes), byteHash = value => createHash('sha256').update(value).digest('hex');
    if (byteHash(bytes) !== locator.sourceSha256) return binding();
    const decoder = new TextDecoder('utf-8', {fatal:true,ignoreBOM:true});
    const source = decoder.decode(bytes);
    // Independently decode both boundaries, so rehashed split UTF-8 cannot masquerade as a cell.
    decoder.decode(bytes.subarray(0,locator.startByte));
    const excerpt = bytes.subarray(locator.startByte,locator.endByte);
    decoder.decode(excerpt); decoder.decode(bytes.subarray(locator.endByte));
    if (byteHash(excerpt) !== locator.excerptSha256) return binding();
    const rows = scanAcceptedCriterionRows(source);
    const selected = rows.filter(row=>row.id === locator.criterionId);
    if (selected.length !== 1 || !selected[0].normative || selected[0].valid===false || selected[0].startByte !== locator.startByte || selected[0].endByte !== locator.endByte) return unsupported();
    parserVersion=selected[0].parserVersion??parserVersion;
    let criterion = selected[0].text;
    // Inline markup is only a hazard for text that can speak about the critic: a code span, quote or stray
    // emphasis marker can hide a negation or a second condition from the patterns below. A criterion that never
    // names the critic cannot be (mis)read as a critic-pass criterion, so markup alone no longer refuses it.
    // `_` and `*` count as delimiters here (so `_critic_` is vocabulary); `critical` is not.
    const criticVocabulary = /(?<![A-Za-z0-9])critics?(?![A-Za-z0-9])/iu.test(criterion);
    if (criticVocabulary && (criterion.includes('`') || /[“”"]/u.test(criterion))) {
      if (/\b(?:implementor|self[- ]verif)/iu.test(criterion)) return absent();
      return unsupported();
    }
    criterion = criterion.replace(/(\*\*|__)([^\n]+?)\1/gu,'$2').replace(/(\*|_)([^\n]+?)\1/gu,'$2');
    if (criticVocabulary && /[*_]/u.test(criterion)) return unsupported();
    const normalized = criterion.toLowerCase().replace(/\s+/gu,' ').trim().replace(/\.$/u,'');
    const patterns = [
      /^(?:the|this(?: delivery)?) package must (?:receive|obtain) a (?:pass|passing) verdict from an independent critic before (?:acceptance|delivery)$/u,
      /^acceptance of this (?:delivery )?package requires an actual independent critic pass$/u,
      /^an independent critic must issue a passing verdict for this (?:delivery )?package before (?:delivery|acceptance)$/u,
      /^this delivery package is acceptable only when its independent critic review passes$/u,
      /^all deliverables in this package must pass independent (?:read-only )?critic review$/u
    ];
    const firstSentence = normalized.split(/\.\s+|;\s+/u)[0];
    const contradicts = /\b(?:not|no|never|may|optional|advisory|should|if|recommend\w*|implementor|self[- ]verif\w*)\b/u.test(normalized);
    if (contradicts) return patterns.some(pattern=>pattern.test(firstSentence)) ? unsupported() : absent();
    if (patterns.some(pattern=>pattern.test(normalized))) return diagnostic('explicit-actual-independent-pass','CAC-CRITERION-EXPLICIT');
    if (/\b(?:another|other) package\b/u.test(normalized)
      || (/\bindependent\b/u.test(normalized) && /\bcritic\b/u.test(normalized) && /\b(?:pass|passing|passes)\b/u.test(normalized))) return unsupported();
    return absent();
  } catch { return binding(); }
}

/** Read-only bridge from actual original acceptance to its bounded criterion bytes. */
export function readAcceptedCriticCriterion(input) {
  let locator = null, criterion = null;
  const fail = (code, status = ['CAC-SOURCE-UNAVAILABLE','CAC-ENVELOPE-UNAVAILABLE','CAC-CRITERION-UNSUPPORTED','CAC-CRITERION-NOT-EXPLICIT'].includes(code) ? 'unavailable' : 'refused') => ({ok:false,status,code,locator,criterion});
  try {
    const value = input?.criterionLocator;
    if (!own(input,['repoRoot','featureId','envelopePath','criterionLocator'])
      || typeof input.repoRoot !== 'string' || !input.repoRoot
      || typeof input.featureId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(input.featureId)
      || typeof input.envelopePath !== 'string'
      || !own(value,['schema','sourcePath','sourceSha256','criterionId','startByte','endByte','excerptSha256'])
      || value.schema !== 'pipeline.critic-criterion-locator.v1'
      || typeof value.sourcePath !== 'string' || !/^specs\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[A-Za-z0-9_./-]+$/u.test(value.sourcePath)
      || value.sourcePath.split('/').some(part=>part === '.' || part === '..' || part === '')
      || typeof value.sourceSha256 !== 'string' || !SHA.test(value.sourceSha256)
      || typeof value.excerptSha256 !== 'string' || !SHA.test(value.excerptSha256)
      || !isCriterionId(value.criterionId)
      || !Number.isSafeInteger(value.startByte) || !Number.isSafeInteger(value.endByte)
      || value.startByte < 0 || value.endByte <= value.startByte || value.endByte > 1048576
      || value.endByte-value.startByte > 4096) return fail('CAC-CRITERION-BINDING');
    locator = structuredClone(value);
    const verified = readAcceptedDeliveryContract({dir:input.repoRoot,envelopePath:input.envelopePath});
    if (!verified.ok) return fail(verified.code);
    if (verified.featureId !== input.featureId || !locator.sourcePath.startsWith(`specs/${input.featureId}/`)) return fail('CAC-CRITERION-BINDING');
    const root = realpathSync(resolve(input.repoRoot));
    const physical = path => {
      let target = root;
      for (const part of path.split('/')) {
        target = join(target,part);
        const observed = lstatSync(target);
        if (observed.isSymbolicLink() || realpathSync(target) !== target) throw Error('unsafe physical component');
      }
      const observed = lstatSync(target);
      if (!observed.isFile() || observed.nlink !== 1 || observed.size > 1048576) throw Error('unsafe physical file');
      return {bytes:readFileSync(target),gitMode:(observed.mode & 0o111) === 0 ? '100644' : '100755'};
    };
    const raw = physical(input.envelopePath).bytes;
    if (createHash('sha256').update(raw).digest('hex') !== verified.envelopeSha256) return fail('CAC-ENVELOPE-UNAVAILABLE');
    const envelope = JSON.parse(raw.toString('utf8'));
    if (canonical(envelope) !== raw.toString('utf8')) return fail('CAC-ENVELOPE-UNAVAILABLE');
    const sources = envelope.request.binding.sources;
    const sourceBindings = [{...sources.prd,role:'prd'},{...sources.spec,role:'spec'},...sources.companions.map(entry=>({...entry,role:'companion'}))];
    const bound = sourceBindings.find(entry=>entry.path === locator.sourcePath);
    if (!bound || bound.sha256 !== locator.sourceSha256) return fail('CAC-CRITERION-BINDING');
    const invoke = argv => {
      const result = spawnSync('git',argv,{cwd:root,maxBuffer:2097152});
      if (!isSuccessfulSpawn(result) || !Buffer.isBuffer(result.stdout)) throw Error('original Git observation unavailable');
      return result.stdout;
    };
    const listed = invoke(['ls-tree','-z',verified.candidate.commit,'--',bound.path]).toString('utf8');
    const record = listed.match(/^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)\0$/u);
    if (!record || record[3] !== bound.path) return fail('CAC-SOURCE-UNAVAILABLE');
    const bytes = invoke(['show',`${verified.candidate.commit}:${bound.path}`]);
    if (bytes.length < 1 || bytes.length > 1048576) return fail('CAC-SOURCE-UNAVAILABLE');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const blobOid = createHash(record[2].length === 64 ? 'sha256' : 'sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    if (sha256 !== bound.sha256 || blobOid !== record[2]) return fail('CAC-SOURCE-BINDING-MISMATCH');
    const current = physical(bound.path);
    if (!current.bytes.equals(bytes) || current.gitMode !== record[1]) return fail('CAC-SOURCE-BINDING-MISMATCH');
    criterion = parseAcceptedCriticCriterion({sourceBytes:bytes,locator,packageContext:{featureId:input.featureId,sourceBindings}});
    if (criterion.status !== 'explicit-actual-independent-pass') return fail(criterion.code);
    const reread = readAcceptedDeliveryContract({dir:root,envelopePath:input.envelopePath});
    if (!reread.ok) return fail(reread.code);
    if (!eq(reread,verified) || !physical(input.envelopePath).bytes.equals(raw)
      || !physical(bound.path).bytes.equals(bytes)) return fail('CAC-SOURCE-BINDING-MISMATCH');
    const acceptanceKeys = ['authorityBasis','cryptographicallyAuthenticated','envelopeSha256','submissionSha256','bindingSha256','intentSha256','featureId','manifestPath','candidate'];
    return {ok:true,acceptance:Object.fromEntries(acceptanceKeys.map(key=>[key,structuredClone(verified[key])])),criterion,
      source:{path:bound.path,sha256,blobOid,gitMode:record[1]},locator};
  } catch { return fail('CAC-SOURCE-UNAVAILABLE'); }
}
