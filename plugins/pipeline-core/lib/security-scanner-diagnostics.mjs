// SPDX-License-Identifier: SUL-1.0
// Prepared G13 contract implementation. No filesystem mutation or authority.
import { createHash } from "node:crypto";
import { isAbsolute as pathIsAbsolute, posix as pathPosix, relative as pathRelative, win32 as pathWin32 } from "node:path";
const MAX_OUTPUT = 1048576;
const MAX_RECORD = 16384;
const DIGEST = /^[a-f0-9]{64}(?![\s\S])/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})(?![\s\S])/;
const VERSION = /^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}(?![\s\S])/;
const CODES = new Set(["ETIMEDOUT","EPERM","EACCES","ENOENT","ENOBUFS","E2BIG","ENOMEM","OTHER"]);
const SIGNALS = new Set(["SIGTERM","SIGKILL","SIGINT","SIGABRT","SIGSEGV","OTHER"]);
const natural = v => Number.isSafeInteger(v) && v >= 0;
const nullable = (v, predicate) => v === null || predicate(v);
const object = v => v !== null && typeof v === "object" && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v));
const shape = (v, fields) => object(v) && Reflect.ownKeys(v).length === fields.length && fields.every(k => Object.hasOwn(v,k) && Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),"value"));
const safeCount = v => natural(v) ? v : null;

// Per-finding projection (AC-249, PO decision 2026-10-23): an OPTIONAL bounded array inside the
// child-result shape. Each entry is exactly a rule id, a repo-relative location and an evidence
// fingerprint (12-hex sha256 prefix plus byte length) of the matched text. The clear match, a
// snippet, the finding message and any absolute path never enter this record. The bounds keep the
// worst case (20 entries) inside MAX_RECORD, so a hostile identifier cannot cost the whole sidecar.
const MAX_FINDINGS = 20;
const MAX_RULE_ID = 128;
const MAX_PATH = 256;
const MAX_LINE = 2147483647;
const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?![\s\S])/;
// Mirrors the schema pattern: forward-slash segments, no empty/./.. segment, no control character,
// no backslash, no leading drive letter, no leading slash.
const SEGMENT = "(?!\\.{1,2}(?:/|(?![\\s\\S])))[^\\\\/\\u0000-\\u001f\\u007f]+";
const REL_PATH = new RegExp(`^(?![A-Za-z]:)${SEGMENT}(?:/${SEGMENT})*(?![\\s\\S])`);
const FINGERPRINT = /^[a-f0-9]{12}(?![\s\S])/;
const validFinding = f => shape(f, ["ruleId", "location", "evidenceFingerprint"])
  && typeof f.ruleId === "string" && f.ruleId.length <= MAX_RULE_ID && RULE_ID.test(f.ruleId)
  && shape(f.location, ["path", "line"]) && typeof f.location.path === "string" && f.location.path.length <= MAX_PATH && REL_PATH.test(f.location.path)
  && Number.isSafeInteger(f.location.line) && f.location.line >= 1 && f.location.line <= MAX_LINE
  && shape(f.evidenceFingerprint, ["sha256", "length"]) && typeof f.evidenceFingerprint.sha256 === "string" && FINGERPRINT.test(f.evidenceFingerprint.sha256)
  && natural(f.evidenceFingerprint.length) && f.evidenceFingerprint.length <= MAX_OUTPUT;
const typeName = type => typeof type === "string" ? type : Array.isArray(type) && typeof type[0] === "string" ? type[0] : null;
const partialParsingWarning = e => object(e) && e.level === "warn" && typeName(e.type) === "PartialParsing";

// Scan-root-relative path, or null. Absolute paths are accepted only when they sit under rootDir.
function relativeFindingPath(file, rootDir) {
  if (typeof file !== "string" || file.length === 0 || file.length > 4096) return null;
  let relative = file;
  if (pathIsAbsolute(file)) {
    if (typeof rootDir !== "string" || !pathIsAbsolute(rootDir)) return null;
    relative = pathRelative(rootDir, file);
    if (relative.length === 0 || pathIsAbsolute(relative)) return null;
  } else if (pathPosix.isAbsolute(file) || pathWin32.isAbsolute(file)) return null;
  return process.platform === "win32" ? relative.replaceAll("\\", "/") : relative;
}

function projectFindings(parsed, rootDir) {
  if (!Array.isArray(parsed?.results)) return [];
  // Same completion rule as the adapter: only warn-level PartialParsing entries leave a completed scan.
  if (parsed.errors !== undefined && !(Array.isArray(parsed.errors) && parsed.errors.every(partialParsingWarning))) return [];
  const findings = [];
  for (const r of parsed.results) {
    if (findings.length >= MAX_FINDINGS) break;
    const text = r?.extra?.lines;
    const path = relativeFindingPath(r?.path, rootDir);
    if (typeof r?.check_id !== "string" || typeof text !== "string" || path === null) continue;
    const bytes = Buffer.from(text, "utf8");
    const entry = {
      ruleId: r.check_id,
      location: { path, line: r?.start?.line },
      evidenceFingerprint: { sha256: createHash("sha256").update(bytes).digest("hex").slice(0, 12), length: bytes.length },
    };
    if (validFinding(entry)) findings.push(entry);
  }
  return findings;
}

export function observeSemgrepChild(result, elapsedMs, timeoutMs, rootDir) {
  if (!natural(timeoutMs) || timeoutMs < 1) return { observation:"not-observed" };
  const stdout = typeof result?.stdout === "string" ? result.stdout : "";
  const stderr = typeof result?.stderr === "string" ? result.stderr : "";
  const stdoutBytes = Buffer.byteLength(stdout), stderrBytes = Buffer.byteLength(stderr);
  let parsed = null, complete = false;
  if (stdoutBytes <= MAX_OUTPUT) {
    try { parsed = JSON.parse(stdout); complete = true; } catch { /* opaque */ }
  }
  const version = typeof parsed?.version === "string" && VERSION.test(parsed.version) ? parsed.version : null;
  const exitCode = Number.isInteger(result?.status) && result.status >= -2147483648 && result.status <= 2147483647 ? result.status : null;
  // Unavailable stays unavailable: findings only from a child that exited 0 without error or signal
  // and returned complete JSON; a timeout, refusal, crash or over-budget output projects nothing.
  let findings = [];
  if (complete && exitCode === 0 && !result?.error && !result?.signal) {
    try { findings = projectFindings(parsed, rootDir); } catch { findings = []; }
  }
  return {
    observation:"child-result",
    exitCode,
    errorCode:result?.error ? CODES.has(result.error.code) ? result.error.code : "OTHER" : null,
    signal:result?.signal ? SIGNALS.has(result.signal) ? result.signal : "OTHER" : null,
    elapsedMs:Number.isFinite(elapsedMs) ? Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.round(elapsedMs))) : 0,
    timeoutMs,
    version:{value:version,source:version ? "existing-json-output" : "unknown-or-withheld"},
    output:{stdoutBytes,stderrBytes,
      interpretation:stdoutBytes > MAX_OUTPUT ? "over-diagnostic-budget" : complete ? "complete-json" : "not-complete-json",
      resultsCount:Array.isArray(parsed?.results) ? safeCount(parsed.results.length) : null,
      errorsCount:Array.isArray(parsed?.errors) ? safeCount(parsed.errors.length) : null},
    ...(findings.length > 0 ? { findings } : {}),
  };
}

// Current caller has no robust candidate-tracked descriptor provenance seam.
// No path traversal/read fallback, no forged digest or OS no-follow claim.
export function observeLocalRules(rootDir, rulesDir) {
  return rulesDir ? {mode:"local",sha256:null,reason:"observation-unavailable",unchanged:null}
    : {mode:"auto",sha256:null,reason:"remote-config-not-observed",unchanged:null};
}

export function validateScannerDiagnostics(record) {
  try {
    if (!shape(record,["schema","authority","evidencePayloadSha256","candidate","scanners"]) || record.schema !== "pipeline.security-scanner-diagnostics.v1" || record.authority !== "diagnostic-only" || typeof record.evidencePayloadSha256 !== "string" || !DIGEST.test(record.evidencePayloadSha256)) return false;
    if (!shape(record.candidate,["commit","tree","inputSha256"]) || !nullable(record.candidate.commit,v=>typeof v === "string" && OID.test(v)) || !nullable(record.candidate.tree,v=>typeof v === "string" && OID.test(v)) || !nullable(record.candidate.inputSha256,v=>typeof v === "string" && DIGEST.test(v))) return false;
    if (!Array.isArray(record.scanners) || record.scanners.length > 1 || Reflect.ownKeys(record.scanners).length !== record.scanners.length+1 || (record.scanners.length === 1 && !Object.hasOwn(Object.getOwnPropertyDescriptor(record.scanners,"0")??{},"value"))) return false;
    for (const r of record.scanners) {
      if (!shape(r,["tool","executableSha256","rules","child"]) || r.tool !== "semgrep" || !nullable(r.executableSha256,v=>typeof v === "string" && DIGEST.test(v))) return false;
      const q=r.rules;
      if (!shape(q,["mode","sha256","reason","unchanged"]) || !["local","auto"].includes(q.mode)) return false;
      if (q.mode === "auto") { if(q.sha256 !== null || q.reason !== "remote-config-not-observed" || q.unchanged !== null) return false; }
      else if(q.sha256 === null) { if(q.reason !== "observation-unavailable" || q.unchanged !== null) return false; }
      else if(typeof q.sha256 !== "string" || !DIGEST.test(q.sha256) || q.reason !== null || typeof q.unchanged !== "boolean") return false;
      const c=r.child;
      if (shape(c,["observation"]) && c.observation === "not-observed") continue;
      const childFields=["observation","exitCode","errorCode","signal","elapsedMs","timeoutMs","version","output"];
      const hasFindings=object(c) && Reflect.ownKeys(c).includes("findings");
      if (!shape(c,hasFindings ? [...childFields,"findings"] : childFields) || c.observation !== "child-result" || !nullable(c.exitCode,v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647) || !nullable(c.errorCode,v=>CODES.has(v)) || !nullable(c.signal,v=>SIGNALS.has(v)) || !natural(c.elapsedMs) || !natural(c.timeoutMs) || c.timeoutMs < 1) return false;
      if(!shape(c.version,["value","source"]) || !["existing-json-output","unknown-or-withheld"].includes(c.version.source)) return false;
      if(c.version.source === "existing-json-output" ? typeof c.version.value !== "string" || !VERSION.test(c.version.value) : c.version.value !== null) return false;
      const o=c.output;
      if(!shape(o,["stdoutBytes","stderrBytes","interpretation","resultsCount","errorsCount"]) || !natural(o.stdoutBytes) || !natural(o.stderrBytes) || !["complete-json","not-complete-json","over-diagnostic-budget"].includes(o.interpretation) || !nullable(o.resultsCount,natural) || !nullable(o.errorsCount,natural)) return false;
      if (hasFindings) {
        const f=c.findings;
        if (!Array.isArray(f) || f.length < 1 || f.length > MAX_FINDINGS || Reflect.ownKeys(f).length !== f.length+1) return false;
        // Unavailable stays unavailable: only a completed, clean child may carry projected findings.
        if (c.exitCode !== 0 || c.errorCode !== null || c.signal !== null || o.interpretation !== "complete-json" || o.resultsCount === null || f.length > o.resultsCount) return false;
        for (let i=0;i<f.length;i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(f,String(i))??{},"value") || !validFinding(f[i])) return false;
      }
    }
    return Buffer.byteLength(JSON.stringify(record)) <= MAX_RECORD;
  } catch { return false; }
}

export function buildScannerDiagnostics(evidence, records) {
  const record={schema:"pipeline.security-scanner-diagnostics.v1",authority:"diagnostic-only",
    evidencePayloadSha256:evidence.payloadSha256,
    candidate:{commit:evidence.candidate?.commit??null,tree:evidence.candidate?.tree??null,inputSha256:evidence.candidate?.inputSha256??null},scanners:records};
  if(!validateScannerDiagnostics(record)) throw new Error("diagnostic-record-invalid");
  return record;
}


// Strict bounded decoder for display/readback only; never a verdict consumer.
export function parseScannerDiagnostics(bytes, expectedEvidence) {
  try {
    const expectedEvidenceSha256=expectedEvidence?.payloadSha256;
    const expectedCandidate=expectedEvidence?.candidate;
    const buffer=typeof bytes === "string" ? Buffer.from(bytes) : bytes;
    if(!Buffer.isBuffer(buffer) || buffer.length > MAX_RECORD || typeof expectedEvidenceSha256 !== "string" || !DIGEST.test(expectedEvidenceSha256)) throw Error();
    // The authoritative v1 evidence candidate also contains observation
    // metadata. Require data properties for the three identity fields while
    // leaving that unrelated metadata outside the diagnostic comparison.
    if(!object(expectedCandidate)||!["commit","tree","inputSha256"].every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(expectedCandidate,key)??{},"value"))
      ||!nullable(expectedCandidate.commit,v=>typeof v === "string" && OID.test(v))
      ||!nullable(expectedCandidate.tree,v=>typeof v === "string" && OID.test(v))
      ||!nullable(expectedCandidate.inputSha256,v=>typeof v === "string" && DIGEST.test(v)))throw Error();
    const text=buffer.toString("utf8");
    if(!Buffer.from(text).equals(buffer)) throw Error();
    let i=0;
    const ws=()=>{while(/[ \t\r\n]/.test(text[i]??"x"))i++;};
    const string=()=>{
      if(text[i]!== '"')throw Error();
      const start=i++;let escape=false;
      while(i<text.length){const c=text[i++];if(!escape && c==='"')return JSON.parse(text.slice(start,i));if(!escape && c==='\\')escape=true;else escape=false;}
      throw Error();
    };
    const value=(depth)=>{
      if(depth>32)throw Error();ws();
      if(text[i]==='{'){
        i++;ws();const keys=new Set();if(text[i]==='}'){i++;return;}
        while(true){ws();const key=string();if(keys.has(key))throw Error();keys.add(key);ws();if(text[i++]!==':')throw Error();value(depth+1);ws();const c=text[i++];if(c==='}')return;if(c!==',')throw Error();}
      }
      if(text[i]==='['){i++;ws();if(text[i]===']'){i++;return;}while(true){value(depth+1);ws();const c=text[i++];if(c===']')return;if(c!==',')throw Error();}}
      if(text[i]==='"'){string();return;}
      const match=text.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/);
      if(!match)throw Error();i+=match[0].length;
    };
    value(0);ws();if(i!==text.length)throw Error();
    const record=JSON.parse(text);
    if(!validateScannerDiagnostics(record))throw Error();
    if(record.evidencePayloadSha256!==expectedEvidenceSha256)return {ok:false,code:"diagnostic-binding-stale"};
    if(["commit","tree","inputSha256"].some(key=>record.candidate[key]!==expectedCandidate[key]))return {ok:false,code:"diagnostic-candidate-mismatch"};
    return {ok:true,record};
  } catch {return {ok:false,code:"diagnostic-record-invalid"};}
}
