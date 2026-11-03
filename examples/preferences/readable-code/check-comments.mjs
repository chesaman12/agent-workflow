import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { addedComments } from './comments.mjs';

const banned = [
  ['doc-reference', /\b[\w./-]+\.(?:md|mdx|rst|adoc)\b|\bdocs?\/|§\s*\d|\b(?:see|refer to|according to|per) (?:the )?(?:docs?|documentation|design document|architecture document)\b/i],
  ['session-reference', /\b(?:phase|wave|block)\s+\d|\b(?:previous|last|this|next|coding|claude|codex) session\b|\b(?:per|as discussed in|as agreed in) (?:the )?(?:plan|brief|chat|conversation)\b|\b(?:operator|user) (?:asked|answers|requested)\b/i],
];

export function scanComments(body, file) {
  const style = /\.(?:[cm]?[jt]sx?|css|scss|java|go|rs|c|cpp|h)$/.test(file) ? 'c' : /\.(?:py|sh|rb)$/.test(file) ? 'hash' : /\.sql$/.test(file) ? 'sql' : null;
  if (!style) return [];
  return addedComments(body.split('\n').map((text,i)=>({text,line:i+1})),style).flatMap(comment => banned.filter(([,rule])=>rule.test(comment.text)).map(([rule])=>({file,line:comment.line,rule})));
}

function git(repo,args) {
  const r=spawnSync('git',['-C',repo,'-c','core.quotePath=false',...args],{encoding:'utf8',maxBuffer:32*1024*1024});
  if (r.status!==0) throw new Error(r.stderr);
  return r.stdout;
}

export function checkComments(repo,base) {
  const paths=[...new Set([...git(repo,['diff','--name-only','--no-renames','-z',base]).split('\0'),...git(repo,['ls-files','--others','--exclude-standard','-z']).split('\0')].filter(Boolean))];
  const findings=[];
  for (const file of paths) {
    let body;
    try { body=readFileSync(path.join(repo,file),'utf8'); } catch(error) { if(error.code==='ENOENT') continue; throw error; }
    if (body.includes('\0')) continue;
    const diff=git(repo,['diff','--no-ext-diff','--no-color','-U0',base,'--',file]);
    const lines=new Set();
    for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
      const start=Number(match[1]), count=match[2]===undefined?1:Number(match[2]);
      for(let n=start;n<start+count;n++) lines.add(n);
    }
    const tracked=git(repo,['ls-files','--',file]).trim();
    if (!tracked) body.split('\n').forEach((_,i)=>lines.add(i+1));
    findings.push(...scanComments(body,file).filter(f=>lines.has(f.line)));
    body.split('\n').forEach((line,i)=>{if(lines.has(i+1)&&line.includes(String.fromCodePoint(0x2014))) findings.push({file,line:i+1,rule:'em-dash'});});
  }
  return findings;
}

if(process.argv[1] && existsSync(process.argv[1]) && import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const {values}=parseArgs({options:{repo:{type:'string'},base:{type:'string'}}});
    if(!values.repo||!values.base) throw new Error('--repo and --base are required');
    const findings=checkComments(values.repo,values.base);
    console.log(JSON.stringify({passed:!findings.length,findings},null,2));
    process.exitCode=findings.length?1:0;
  }catch(error){console.error(error.message);process.exitCode=2;}
}
