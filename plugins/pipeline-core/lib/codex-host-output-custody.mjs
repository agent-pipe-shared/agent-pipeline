// SPDX-License-Identifier: SUL-1.0
// Proposed host-owned transient byte custody. Snapshot exports hashes/metadata only.
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { parseStrictJson } from './governance-event.mjs';
import { canonicalJson } from './codex-sandbox-compatibility.mjs';

export const HOST_OUTPUT_CUSTODY_SCHEMA = 'pipeline.codex-host-output-custody.v1';
export const HOST_OUTPUT_CUSTODY_MAX_BYTES = 8 * 1024 * 1024;
const digest = value => createHash('sha256').update(value).digest('hex');
export function createHostOutputCustody({onFrame,onFault,maxBytes = HOST_OUTPUT_CUSTODY_MAX_BYTES} = {}) {
  if (typeof onFrame !== 'function' || typeof onFault !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > HOST_OUTPUT_CUSTODY_MAX_BYTES) throw new Error('host-output-custody-input');
  let failed = false, finalMessageFrameSha256 = null, reportRawJsonSha256 = null, reportRawJsonBytes = null, reportCanonicalSha256 = null;
  const stdin = {finished:false,closed:false,errored:false};
  const make = () => ({bytes:0,retainedBytes:0,storage:Buffer.allocUnsafe(maxBytes),hasher:createHash('sha256'),decoder:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}),ended:false,closed:false,errored:false,utf8Verified:false,bounded:true,frameStart:0,frameCount:0,framingComplete:false,parserVerified:true});
  const channels = {stdout:make(),stderr:make()};
  const channel = name => { if (!Object.hasOwn(channels,name)) throw new Error('host-output-custody-channel'); return channels[name]; };
  const fail = () => { if (!failed) { failed=true; onFault(); } };
  const data = (name,chunk) => {
    const c=channel(name);
    if (!Buffer.isBuffer(chunk) || c.ended || c.closed) { c.errored=true; fail(); return; }
    // Hash every observed byte, even overflow. Retention remains bounded and a
    // failed observation never claims a complete-stream digest.
    c.hasher.update(chunk); c.bytes+=chunk.length;
    const available=maxBytes-c.retainedBytes, kept=Math.min(available,chunk.length);
    chunk.copy(c.storage,c.retainedBytes,0,kept);c.retainedBytes+=kept;
    if (kept !== chunk.length) { c.bounded=false; fail(); return; }
    try { c.decoder.decode(chunk,{stream:true}); } catch { c.errored=true; fail(); return; }
    if (name !== 'stdout' || failed) return;
    let end;
    while ((end=c.storage.indexOf(0x0a,c.frameStart)) >= 0 && end < c.retainedBytes) {
      const frame=c.storage.subarray(c.frameStart,end);c.frameStart=end+1;
      if (frame.length === 0) continue; // empty newline is not a JSON frame
      let value;
      try { value=parseStrictJson(frame); if(value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('frame'); }
      catch { c.parserVerified=false;fail();return; }
      c.frameCount++;
      try { onFrame(value,Buffer.from(frame)); } catch { c.parserVerified=false;fail();return; }
    }
  };
  const end = name => {
    const c=channel(name);c.ended=true;
    try { c.decoder.decode();c.utf8Verified=!c.errored && c.bounded; } catch { c.errored=true;fail(); }
    if (name === 'stdout') { c.framingComplete=c.frameStart===c.retainedBytes && c.bounded; if(!c.framingComplete){c.parserVerified=false;fail();} }
  };
  const close = name => { const c=channel(name);c.closed=true;if(!c.ended){c.errored=true;fail();} };
  const error = name => { channel(name).errored=true;fail(); };
  const bindFinalMessage = (frameBytes,reportText) => {
    if (!Buffer.isBuffer(frameBytes) || typeof reportText !== 'string' || finalMessageFrameSha256 !== null) { fail();return false; }
    const bytes=Buffer.from(reportText,'utf8');
    if (bytes.length>maxBytes || new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)!==reportText) {fail();return false;}
    finalMessageFrameSha256=digest(frameBytes);reportRawJsonSha256=digest(bytes);reportRawJsonBytes=bytes.length;return true;
  };
  const bindParsedReport = report => { try {reportCanonicalSha256=digest(canonicalJson(report));}catch{fail();} };
  const snapshot = () => {
    const s=channels.stdout,e=channels.stderr;
    const stream = c => ({bytes:c.bytes,retainedBytes:c.retainedBytes,sha256:c.hasher.copy().digest('hex'),ended:c.ended,closed:c.closed,errored:c.errored,utf8Verified:c.utf8Verified,bounded:c.bounded});
    const complete=!failed && stdin.finished && stdin.closed && !stdin.errored
      && [s,e].every(c=>c.ended&&c.closed&&!c.errored&&c.utf8Verified&&c.bounded)
      && s.framingComplete&&s.parserVerified;
    return {schema:HOST_OUTPUT_CUSTODY_SCHEMA,stdioStatus:complete?'complete':'failed',
      stdin:{...stdin},stdout:{...stream(s),frameCount:s.frameCount,framingComplete:s.framingComplete,parserVerified:s.parserVerified},stderr:stream(e),
      finalMessageFrameSha256,reportRawJsonSha256,reportRawJsonBytes,reportCanonicalSha256};
  };
  return Object.freeze({data,end,close,error,bindFinalMessage,bindParsedReport,reportFailure:fail,
    stdinFinish(){stdin.finished=true;},stdinClose(){stdin.closed=true;if(!stdin.finished){stdin.errored=true;fail();}},stdinError(){stdin.errored=true;fail();},snapshot});
}
