import {execFileSync} from 'node:child_process';
import {scanSecretText} from '../lib/server/secret-patterns.js';
const git=args=>execFileSync('git',args,{maxBuffer:16*1024*1024,encoding:'utf8',stdio:['pipe','pipe','pipe']});
let summary;
try{
 const objects=git(['rev-list','--objects','--all']).split('\n').filter(Boolean).map(line=>line.split(' ')[0]);
 const unique=[...new Set(objects)];let textBlobs=0,binaryBlobs=0,largeBlobs=0;const rules={};
 for(const id of unique){
  if(git(['cat-file','-t',id]).trim()!=='blob')continue;
  if(Number(git(['cat-file','-s',id]).trim())>2*1024*1024){largeBlobs++;continue;}
  const body=git(['cat-file','blob',id]);if(body.includes('\0')){binaryBlobs++;continue;}
  textBlobs++;
  for(const finding of scanSecretText(body))rules[finding.rule]=(rules[finding.rule]||0)+1;
 }
 summary={scope:'all fetched reachable Git blobs; text only',objects:unique.length,textBlobs,binaryBlobs,largeBlobs,rules,
  complete:largeBlobs===0,findings:Object.values(rules).reduce((a,b)=>a+b,0)};
 console.log(JSON.stringify(summary));process.exitCode=summary.findings?1:summary.complete?0:2;
}catch{
 console.log(JSON.stringify({scope:'Git history',complete:false,state:'scan-unavailable'}));process.exitCode=2;
}
