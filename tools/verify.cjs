#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-check-'));
const checks={};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name),prefix+x.name+'/'):[prefix+x.name]).sort();}
function manifest(dir){return Object.fromEntries(files(dir).map(p=>[p,hash(fs.readFileSync(path.join(dir,p)))]));}
function run(work,args,ok=true){const p=spawnSync(process.execPath,['tools/refresh.cjs',...args],{cwd:work,encoding:'utf8'});if(ok)assert.equal(p.status,0,p.stderr);else assert.notEqual(p.status,0);return p;}
try{
  const fresh=path.join(temp,'fresh');fs.mkdirSync(fresh);
  for(const p of ['index.html','style.css','script.js','record-engine.js','README.md','tools','data','input','documents','images'])fs.cpSync(path.join(root,p),path.join(fresh,p),{recursive:true});
  run(fresh,['generate','--input','input/ritual.json','--output','output']);
  run(fresh,['build','--input','input/ritual.json','--output','output','--site','site']);
  const first={output:manifest(path.join(fresh,'output')),site:manifest(path.join(fresh,'site'))};
  run(fresh,['build','--input','input/ritual.json','--output','output','--site','site']);
  const second={output:manifest(path.join(fresh,'output')),site:manifest(path.join(fresh,'site'))};
  assert.deepEqual(first,second);checks.freshFolderBuild=true;checks.sameInputSameBytes=true;
  const result=JSON.parse(fs.readFileSync(path.join(fresh,'output/site-data.json')));
  assert.equal(result.metrics.recordedDays,54);assert.equal(result.metrics.closingDays,47);assert.equal(result.metrics.selectedTasks,11);checks.actualRecordTotals=true;
  const baselineHtml=fs.readFileSync(path.join(fresh,'site/index.html'),'utf8');
  assert(baselineHtml.includes('id="approved-records" hidden'));assert(!baselineHtml.includes('task-file'));checks.unapprovedParagraphsHidden=true;checks.noTaskUpload=true;
  const candidates=result.candidates;assert(candidates.length>0);
  run(fresh,['approve','--input','input/ritual.json','--id',candidates[0].id]);
  run(fresh,['build','--input','input/ritual.json','--output','output','--site','site']);
  const approved=JSON.parse(fs.readFileSync(path.join(fresh,'site/data/site-data.json')));assert.equal(approved.approvedParagraphs.length,1);assert.equal(approved.candidates.length,0);checks.explicitApprovalOnly=true;
  const previous=manifest(path.join(fresh,'site'));
  const ap=path.join(fresh,'input/approvals.json'),a=JSON.parse(fs.readFileSync(ap));a.approved[0].sha256='0'.repeat(64);fs.writeFileSync(ap,JSON.stringify(a));
  run(fresh,['build','--input','input/ritual.json','--output','output','--site','site'],false);assert.deepEqual(previous,manifest(path.join(fresh,'site')));checks.changedApprovalRejected=true;
  run(fresh,['approve','--input','input/ritual.json']);
  run(fresh,['build','--input','input/ritual.json','--output','output','--site','site']);assert.deepEqual(first.site,manifest(path.join(fresh,'site')));checks.approvalRevocation=true;
  const E=require(path.join(fresh,'record-engine.js'));
  assert.throws(()=>E.parseRecordFile('2026-02-30\n공부','bad.txt'));
  assert.throws(()=>E.parseRecordFile('날짜 없음','bad.txt'));
  const txt=E.generate(E.parseRecordFile('2026-10-30\n다시 공부했습니다.\n2026-10-30\n회고: 동료와 함께 도움을 나누었습니다.','test.txt'));
  assert.equal(txt.metrics.recordedDays,1);assert.equal(txt.metrics.closingDays,1);checks.txtDatesAndDuplicates=true;checks.invalidDatesRejected=true;
  assert(E.approved({approvedParagraphs:[{ability:'자기동기력',text:'<script>alert(1)</script>'}]}).includes('&lt;script&gt;'));checks.htmlEscaping=true;
  const story=/<article class="story"[\s\S]*?<\/article>/.exec(baselineHtml)[0];assert(story.includes('2026년 10월 20일'));checks.datedStoryScene=true;
  const report={checks,first,second,note:'승인 동작 검사는 임시 폴더에서만 실행했습니다. 이 결과는 사용자 승인이나 동료 피드백을 뜻하지 않습니다.'};
  fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification/comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:Object.keys(checks).length,checks}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
