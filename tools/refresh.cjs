#!/usr/bin/env node
'use strict';
// The CLI and browser share the exact same deterministic record engine.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const E = require('../record-engine.js');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const stable = x => JSON.stringify(x, null, 2) + '\n';
const digest = c => hash(JSON.stringify([c.id,c.ability,c.date,c.text,c.evidence]));
function options(argv) {
  const result = {command: argv[0] || 'help', ids: []};
  for (let i=1;i<argv.length;i++) {
    const key=argv[i]; if (!['--input','--output','--site','--approvals','--attendance','--id'].includes(key) || !argv[i+1] || argv[i+1].startsWith('--')) throw Error('옵션과 값을 확인하세요. --help 대신 help로 사용법을 확인할 수 있습니다.');
    const value=argv[++i]; if(key==='--id') result.ids.push(value); else result[key.slice(2)]=path.resolve(value);
  }
  return result;
}
function prepare(o) {
  const input=o.input || path.join(root,'input/ritual.json');
  const raw=E.parseRecordFile(fs.readFileSync(input,'utf8'),path.basename(input));
  return E.generate(raw,json(path.join(root,'data/tasks.json')),o.attendance?json(o.attendance):null);
}
function save(p,x) {fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,stable(x));}
function section(html, id) {
  const opening=new RegExp('<(section|article|details)\\b[^>]*\\bid="'+id+'"[^>]*>').exec(html);
  if(!opening) throw Error('사이트 영역을 찾지 못했습니다: '+id);
  const tags=new RegExp('</?'+opening[1]+'\\b[^>]*>','g');tags.lastIndex=opening.index+opening[0].length;let depth=1,m;
  while((m=tags.exec(html))) {depth+=m[0].startsWith('</')?-1:1;if(!depth)return [opening.index,tags.lastIndex];}
  throw Error('사이트 영역이 닫히지 않았습니다: '+id);
}
function replaceSection(html,id,body) {const [a,b]=section(html,id);return html.slice(0,a)+body+html.slice(b);}
function publish(result,siteDir,source=root) {
  if(path.resolve(siteDir)===path.resolve(source))throw Error('원본 폴더 대신 별도 공개 결과 폴더를 지정하세요.');
  fs.mkdirSync(siteDir,{recursive:true});
  for(const p of ['style.css','script.js','record-engine.js'])fs.copyFileSync(path.join(source,p),path.join(siteDir,p));
  for(const p of ['images','documents'])if(fs.existsSync(path.join(source,p)))fs.cpSync(path.join(source,p),path.join(siteDir,p),{recursive:true});
  const state={...result,candidates:[]};
  let html=fs.readFileSync(path.join(source,'index.html'),'utf8');
  html=replaceSection(html,'numbers','<section class="evidence-section" id="numbers" aria-labelledby="numbers-title">'+E.numbers(state)+'</section>');
  html=replaceSection(html,'approved-records','<section class="evidence-section" id="approved-records"'+(state.approvedParagraphs.length?'':' hidden')+'>'+(state.approvedParagraphs.length?'<h2>새 기록에서 이어지는 이야기</h2>'+E.approved(state):'')+'</section>');
  html=html.replace(/(<script type="application\/json" id="portfolio-state">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(state).replace(/</g,'\\u003c')+b);
  fs.writeFileSync(path.join(siteDir,'index.html'),html);
  save(path.join(siteDir,'data/site-data.json'),state);
  save(path.join(siteDir,'data/tasks.json'),json(path.join(source,'data/tasks.json')));
}
function run(argv) {
  const o=options(argv),out=o.output||path.join(root,'output');
  const approvalFile=o.approvals||path.join(root,'input/approvals.json');
  if(o.command==='help') {console.log('Node.js 18 이상. generate --input 파일 --output output / approve --input 파일 --id 후보ID [--id 후보ID] / build --input 파일 --output output --site site. 공통 선택 옵션: --approvals 파일, --attendance 실제출석JSON. approve는 승인 목록 전체를 교체하며 --id 없이 실행하면 승인을 모두 취소합니다.');return;}
  if(!['generate','approve','build'].includes(o.command))throw Error('generate, approve, build 중 하나를 선택하세요.');
  const result=prepare(o);
  if(o.command==='approve') {
    const picked=[...new Set(o.ids)].sort().map(id=>{const c=result.candidates.find(x=>x.id===id);if(!c)throw Error('후보 ID를 찾지 못했습니다: '+id);return {id,sha256:digest(c)};});
    save(approvalFile,{approved:picked});console.log('승인 목록 '+picked.length+'건 저장. 실제 기록과 공개 범위를 직접 확인한 뒤에만 사용하세요.');return;
  }
  const approvals=fs.existsSync(approvalFile)?json(approvalFile).approved:[];
  if(!Array.isArray(approvals))throw Error('승인 파일에 approved 배열이 필요합니다.');
  const seen=new Set();
  for(const approval of approvals) {
    const c=result.candidates.find(x=>x.id===approval.id);
    if(!c||approval.sha256!==digest(c)||seen.has(c.id))throw Error('승인한 후보가 바뀌었거나 중복되었습니다. 후보를 다시 확인하고 승인하세요.');
    seen.add(c.id);
  }
  result.approvedParagraphs=result.candidates.filter(c=>seen.has(c.id));
  // No output is written until all input and approval checks have passed.
  save(path.join(out,'site-data.json'),result);
  save(path.join(out,'summary.json'),{asOf:result.asOf,metrics:result.metrics,sources:result.sources});
  save(path.join(out,'candidates.json'),result.candidates);
  save(path.join(out,'approval-status.json'),{candidates:result.candidates.length,approved:result.approvedParagraphs.length});
  if(o.command==='build')publish(result,o.site||path.join(root,'site'));
  console.log(JSON.stringify({recordedDays:result.metrics.recordedDays,candidates:result.candidates.length,approved:result.approvedParagraphs.length,built:o.command==='build'}));
}
if(require.main===module){try{run(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={run,prepare,publish,digest};
