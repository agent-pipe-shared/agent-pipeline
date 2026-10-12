// SPDX-License-Identifier: SUL-1.0
// Administrative provenance describes changed content, never delegated authorship.
import { tokenizeArgv } from "./git-cmd.mjs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseCommitTrailerBlock } from "./commit-message-policy.mjs";
import { parseBacklogItem, parseTransitionLedger, projectBacklog, transitionHash, validateTransitionShape } from "./backlog-state.mjs";

export const ADMINISTRATIVE_DISPATCH = "administrative (elephant)";
const SHA = (value) => createHash("sha256").update(value).digest("hex");
export function hasAdministrativeDispatch(message) {
  return parseCommitTrailerBlock(message).some((entry) => entry.key === "Dispatch" && entry.value === ADMINISTRATIVE_DISPATCH);
}
export function isAdministrativePath(path) {
  if (typeof path !== "string" || !path || path.split("/").some((part) => !part || part === "." || part === "..") || /[\\\u0000-\u001f\u007f]/u.test(path)) return false;
  return /^backlog\/items\/[^/]+\.md$/u.test(path) && path !== "backlog/items/TEMPLATE.md"
    || ["backlog/transitions.ndjson", "backlog/STATUS.md", "backlog/index.json"].includes(path)
    || /^specs\/(?:[A-Za-z0-9._-]+\/)+(?:prd|spec|design|sdp|plan|acceptance|readiness)(?:_[A-Za-z0-9._-]+)?\.md$/u.test(path) && !path.split("/").includes("evidence");
}
// Pure view seam for deterministic tests. The production inspector obtains every
// path/blob from Git itself; no caller-supplied view is used by hooks or readers.
export function validateAdministrativeCommitView({message, paths, contents, items = [], ledger = null}) {
  const trailers = parseCommitTrailerBlock(message);
  if (trailers.length !== 2 || trailers[0].key !== "Dispatch" || trailers[0].value !== ADMINISTRATIVE_DISPATCH || trailers[1].key !== "AI-Assisted" || trailers[1].value !== "true") return {ok:false,code:"GIT-03-ADMINISTRATIVE-TRAILER"};
  if (!Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length || !paths.every(isAdministrativePath)) return {ok:false,code:"GIT-03-ADMINISTRATIVE-PATHS"};
  if (!contents || typeof contents !== "object") return {ok:false,code:"GIT-03-ADMINISTRATIVE-UNAVAILABLE"};
  for (const path of paths.filter((path) => path.startsWith("backlog/items/"))) {
    if (typeof contents[path] !== "string" || !parseBacklogItem(contents[path], {path}).ok) return {ok:false,code:"GIT-03-ADMINISTRATIVE-ITEM"};
  }
  if (paths.some((path) => ["backlog/STATUS.md","backlog/index.json"].includes(path))) {
    const parsed = parseTransitionLedger(ledger ?? "");
    if (parsed.errors.length || !items.length || items.some((item) => !item.ok)) return {ok:false,code:"GIT-03-ADMINISTRATIVE-PROJECTION"};
    const projected = projectBacklog(items.map((item) => item.item), parsed.events);
    if (paths.includes("backlog/STATUS.md") && contents["backlog/STATUS.md"] !== projected.statusText || paths.includes("backlog/index.json") && contents["backlog/index.json"] !== projected.indexText) return {ok:false,code:"GIT-03-ADMINISTRATIVE-PROJECTION"};
  }
  return {ok:true,code:"GIT-03-ADMINISTRATIVE-VERIFIED",schema:"pipeline.administrative-commit-content.v1",messageSha256:SHA(String(message).replace(/\r\n/gu,"\n")),classification:"administrative",paths:[...paths]};
}
// Match only an explicitly exclusive commit pathspec. Unknown/include/all/amend
// flags fall back to the complete index; this never guesses a narrower scope.
export function administrativeCommitPathspec(command) {
  const tokens=tokenizeArgv(command), index=tokens.indexOf("commit");
  if(index<0)return null;
  const end=tokens.indexOf("--",index+1);
  if(end<0 || end===tokens.length-1)return null;
  const flags=new Set(["-q","--quiet","-v","--verbose","-s","--signoff","--no-gpg-sign","--allow-empty-message","--no-status","--status"]);
  const values=new Set(["-m","--message","-F","--file","--trailer","--author","--date","--cleanup"]);
  for(let i=index+1;i<end;i++){
    const token=tokens[i];
    if(flags.has(token))continue;
    if(values.has(token)){if(++i>=end)return null;continue;}
    if(/^(?:--(?:message|file|trailer|author|date|cleanup|gpg-sign)=|-[mFS].+)/u.test(token))continue;
    return null;
  }
  return tokens.slice(end+1);
}
export function inspectAdministrativeCommit({repoRoot, message, commitSha = null, pathspec = null}) {
  try {
    const rootResult=spawnSync("git",["rev-parse","--show-toplevel"],{cwd:repoRoot,timeout:10000,maxBuffer:1024*1024,encoding:"utf8"});
    if(rootResult.error || rootResult.signal || rootResult.status!==0 || !rootResult.stdout?.trim())throw new Error("repository root unavailable");
    repoRoot=resolve(rootResult.stdout.trim());
    const git = (args) => {
      const r=spawnSync("git",args,{cwd:repoRoot,timeout:10000,maxBuffer:16*1024*1024,windowsHide:true});
      if(r.error || r.signal || r.status!==0 || !Buffer.isBuffer(r.stdout)) throw new Error("Git unavailable");
      return new TextDecoder("utf-8",{fatal:true}).decode(r.stdout);
    };
    const oid = git(["rev-parse","--verify",commitSha === null ? "HEAD" : commitSha+"^{commit}"]).trim();
    if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(oid)) throw new Error("OID unavailable");
    const snapshot = () => commitSha === null ? git(["ls-files","--stage","-z"]) : oid;
    const before=snapshot();
    // An exclusive commit takes selected worktree content, not stale index
    // content. Refuse this view unless Git itself observes no selected drift.
    // Display drivers are not evidence; no index or worktree is rewritten.
    const selectedWorktreeUnchanged = () => commitSha !== null || !Array.isArray(pathspec)
      || git(["diff","--no-ext-diff","--no-textconv","--name-only","--no-renames","-z","--",...pathspec]) === "";
    if(!selectedWorktreeUnchanged()) return {ok:false,code:"GIT-03-ADMINISTRATIVE-WORKTREE-DRIFT"};
    const listing=commitSha===null ? git(["diff","--cached","--name-only","--no-renames","-z",...(Array.isArray(pathspec) ? ["--",...pathspec] : [])]) : git(["diff-tree","--no-commit-id","--name-only","-r","--root","--no-renames","-z",oid]);
    if(!listing.endsWith("\0")) throw new Error("empty or malformed paths");
    const paths=listing.slice(0,-1).split("\0");
    if(!paths.every(isAdministrativePath)) return {ok:false,code:"GIT-03-ADMINISTRATIVE-PATHS"};
    const selected=new Set(paths);
    const fromIndex=(path)=>commitSha===null && (!Array.isArray(pathspec) || selected.has(path));
    const read=(path) => {
      const mode=fromIndex(path) ? git(["ls-files","--stage","-z","--",path]) : git(["ls-tree","-z",oid,"--",path]);
      if(!/^100644 /u.test(mode) || mode.split("\0").filter(Boolean).length!==1) throw new Error("not an ordinary Markdown/data blob");
      const text=git(["show",fromIndex(path) ? ":0:"+path : oid+":"+path]);
      if(Buffer.byteLength(text)>1024*1024 && path!=="backlog/transitions.ndjson") throw new Error("blob exceeds bound");
      return text;
    };
    const contents=Object.fromEntries(paths.map((path)=>[path,read(path)]));
    let items=[],ledger=null;
    if(paths.some((path)=>["backlog/transitions.ndjson","backlog/STATUS.md","backlog/index.json"].includes(path))) {
      const all=commitSha===null ? git(["ls-files","-z","--","backlog/items/"]) : git(["ls-tree","-r","--name-only","-z",oid,"--","backlog/items/"]);
      const names=Array.isArray(pathspec) && commitSha===null
        ? [...new Set([...git(["ls-tree","-r","--name-only","-z",oid,"--","backlog/items/"]).split("\0"),...paths.filter((path)=>path.startsWith("backlog/items/"))])]
        : all.split("\0");
      items=names.filter((path)=>/^backlog\/items\/[^/]+\.md$/u.test(path) && !path.endsWith("/TEMPLATE.md")).map((path)=>parseBacklogItem(read(path),{path}));
      ledger=read("backlog/transitions.ndjson");
    }
    if(paths.includes("backlog/transitions.ndjson")) {
      const base=commitSha===null ? oid : (()=>{const parents=git(["rev-list","--parents","-n","1",oid]).trim().split(" ");if(parents.length!==2)throw new Error("not a single-parent ledger change");return parents[1];})();
      const original=git(["show",base+":backlog/transitions.ndjson"]);
      if(!ledger.startsWith(original))throw new Error("ledger history rewritten");
      const prior=parseTransitionLedger(original),next=parseTransitionLedger(ledger);
      if(prior.errors.length || next.errors.length)throw new Error("ledger malformed");
      let previous=prior.events.at(-1)?.entryHash??null;
      const currentItems=new Map(items.filter((p)=>p.ok).map((p)=>[p.item.metadata.id,p.item]));
      for(const event of next.events.slice(prior.events.length)) {
        const item=currentItems.get(event.id);
        if(validateTransitionShape(event).length || event.sequence!==prior.events.length+1 || event.previousHash!==previous || event.entryHash!==transitionHash(event)
          || event.schema!=="pipeline.backlog-transition.v1" || event.actor!=="backlog-reconciliation" || event.evidence?.kind!=="item-file-reconciliation"
          || !item || event.evidence.reference!==item.path)throw new Error("not an ordinary official reconciliation event");
        const from=[...prior.events].reverse().find((previous)=>previous.id===event.id)?.to??null;
        if(event.from!==from || !(from===null && event.to==="open" || from==="open" && ["in_progress","rejected","deferred"].includes(event.to) || from==="in_progress" && event.to==="closed"))throw new Error("not a forward official reconciliation step");
        if(event.to==="closed") {
          if(event.evidence.commit!==item.metadata.closure_commit)throw new Error("closure evidence commit differs from recorded item");
          git(["cat-file","-e",event.evidence.commit+"^{commit}"]);
        } else {
          const evidence=parseBacklogItem(git(["show",event.evidence.commit+":"+event.evidence.reference]),{path:event.evidence.reference});
          const order=["open","in_progress","closed"];
          if(!evidence.ok || evidence.item.metadata.id!==event.id || !(order.includes(event.to) && order.indexOf(evidence.item.metadata.status)>=order.indexOf(event.to)
            || ["rejected","deferred"].includes(evidence.item.metadata.status) && ["open",evidence.item.metadata.status].includes(event.to)))throw new Error("reconciliation evidence is not the real item commit");
        }
        previous=event.entryHash;prior.events.push(event);
      }
      for(const id of new Set(next.events.slice(parseTransitionLedger(original).events.length).map((event)=>event.id))) {
        if([...next.events].reverse().find((event)=>event.id===id)?.to!==currentItems.get(id)?.metadata.status)throw new Error("reconciliation final status differs from the item");
      }
    }
    const result=validateAdministrativeCommitView({message,paths,contents,items,ledger});
    if(!selectedWorktreeUnchanged()) return {ok:false,code:"GIT-03-ADMINISTRATIVE-WORKTREE-DRIFT"};
    if(snapshot()!==before || git(["rev-parse","--verify",commitSha===null ? "HEAD" : commitSha+"^{commit}"]).trim()!==oid) throw new Error("Git input drift");
    return result;
  } catch { return {ok:false,code:"GIT-03-ADMINISTRATIVE-UNAVAILABLE"}; }
}
