// 기기에서 모션 감소를 설정했을 때에도 앵커 이동 후 키보드 탐색이 이어지도록 합니다.
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', () => {
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
  });
});



// 기록 파일은 서버에 보내지 않고 현재 브라우저에서 읽습니다.
(function () {
  'use strict';
  const E = window.RecordEngine;
  const panel = document.getElementById('record-refresh');
  if (!panel || !E) return;
  const key = 'sumin-portfolio-records-v2';
  const initial = JSON.parse(document.getElementById('portfolio-state').textContent);
  let current = initial;
  let sequence = 0;
  const ritual = document.getElementById('ritual-file');
  const tasks = document.getElementById('task-file');
  const attendance = document.getElementById('attendance-file');
  const status = document.getElementById('refresh-status');
  const list = document.getElementById('candidate-list');
  const apply = document.getElementById('apply-records');
  const exportButton = document.getElementById('export-records');
  const reset = document.getElementById('reset-records');
  const approved = document.getElementById('approved-records');
  let selected = new Set();
  function save() {
    try { localStorage.setItem(key, JSON.stringify(current)); return true; }
    catch (_) { return false; }
  }
  function paint() {
    document.getElementById('numbers').innerHTML = E.numbers(current);
    approved.innerHTML = current.approvedParagraphs?.length ? '<h2>새 기록에서 이어지는 이야기</h2>'+E.approved(current) : '';
    approved.hidden = !current.approvedParagraphs?.length;
    const choices = current.candidates || [];
    list.replaceChildren();
    for (const c of choices) {
      const label = document.createElement('label');
      label.className = 'candidate';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.value = c.id; checkbox.checked = selected.has(c.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(c.id); else selected.delete(c.id);
      });
      const content = document.createElement('span');
      const meta = document.createElement('strong');
      meta.textContent = c.ability+' · '+c.date;
      const text = document.createElement('span'); text.textContent = c.text;
      const evidence = document.createElement('small');
      evidence.textContent = '근거: '+c.evidence.source+' / '+c.evidence.field+' / '+c.evidence.date;
      content.append(meta, text, evidence); label.append(checkbox, content); list.append(label);
    }
    document.getElementById('candidate-area').hidden = !choices.length;
    apply.disabled = !choices.length;
    exportButton.disabled = false;
    document.getElementById('record-summary').textContent = '기록 '+current.metrics.recordedDays+'일 · 마무리 '+current.metrics.closingDays+'일 · 문단 후보 '+choices.length+'개 · 승인 '+(current.approvedParagraphs || []).length+'개';
  }
  async function parse(file, isRecord = false) {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) throw Error('파일은 5MB 이하로 선택해 주세요.');
    const text = await file.text();
    if (isRecord) {
      document.getElementById('record-file-preview').textContent = text.slice(0, 12000);
      document.getElementById('record-preview').hidden = false;
      return E.parseRecordFile(text, file.name, document.getElementById('text-record-date').value);
    }
    try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (_) { throw Error('JSON 파일을 읽지 못했습니다. 내보낸 기록 파일인지 확인해 주세요.'); }
  }
  async function ingest() {
    const version = ++sequence;
    if (!ritual.files[0]) { status.textContent = '먼저 리추얼·기록 JSON 또는 TXT 파일을 선택해 주세요.'; return; }
    status.textContent = '기록을 읽고 숫자와 문단 후보를 만들고 있습니다.';
    try {
      const [r, t, a] = await Promise.all([parse(ritual.files[0], true), parse(tasks.files[0]), parse(attendance.files[0])]);
      if (version !== sequence) return;
      const next = E.generate(r, t || {items: initial.taskCatalog}, a);
      next.approvedParagraphs = (current.approvedParagraphs || []).filter(old => next.candidates.some(c => c.id === old.id && c.text === old.text && c.date === old.date && c.ability === old.ability));
      current = next;
      selected = new Set(current.approvedParagraphs.map(c => c.id));
      paint();
      const persisted = save();
      status.textContent = '숫자 칸과 문단 후보를 사이트에 반영했습니다. 원하는 후보를 선택하고 ‘선택한 문장 반영’을 누르면 이야기에 들어갑니다.'+(persisted ? ' 이 브라우저에 저장했습니다.' : ' 브라우저 저장을 사용할 수 없어 현재 화면에만 반영했습니다.');
    } catch (error) {
      if (version === sequence) status.textContent = error.message+' 기존 화면은 유지했습니다.';
    }
  }
  [ritual, tasks, attendance].forEach(input => input.addEventListener('change', ingest));
  document.getElementById('text-record-date').addEventListener('change', ingest);
  apply.addEventListener('click', () => {
    current.approvedParagraphs = (current.candidates || []).filter(c => selected.has(c.id));
    paint();
    const persisted = save();
    status.textContent = current.approvedParagraphs.length+'개 문장을 사이트 이야기에 반영했습니다.'+(persisted ? ' 새로고침해도 이 브라우저에서 유지됩니다.' : ' 현재 화면에만 반영했습니다.');
  });
  reset.addEventListener('click', () => {
    sequence += 1; current = initial; selected.clear();
    ritual.value = ''; tasks.value = ''; attendance.value = '';
    document.getElementById('text-record-date').value = '';
    document.getElementById('record-file-preview').textContent = '';
    document.getElementById('record-preview').hidden = true;
    try { localStorage.removeItem(key); } catch (_) {}
    paint(); status.textContent = '파일 반영 전의 공개 화면으로 돌아왔습니다.';
  });
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.getElementById('download-record-example').addEventListener('click', () => {
    download(new Blob([JSON.stringify({records:[{date:'2026-10-30',ability:'자기동기력',text:'오늘 공부한 내용을 돌아보고 다음에 할 일을 정리했습니다.'}]},null,2)],{type:'application/json'}), 'record-example.json');
  });
  document.getElementById('download-text-example').addEventListener('click', () => {
    download(new Blob(['2026-10-30\n공부가 잘 풀리지 않아 쉬고 다시 계획을 세웠습니다.\n\n2026-10-31\n마무리: 동료와 함께 공부하고 서로 도움을 나누었습니다.\n'], {type:'text/plain;charset=utf-8'}), 'record-example.txt');
  });
  // A small deterministic uncompressed ZIP writer; no external service or package.
  function zip(files) {
    const enc = new TextEncoder(), chunks = [], directory = []; let offset = 0;
    function header(size, entries) {
      const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
      entries.forEach(([at, value, len]) => len===4 ? view.setUint32(at,value,true) : view.setUint16(at,value,true));
      return bytes;
    }
    function crc(bytes) {
      let result = 0xffffffff;
      for (const byte of bytes) {
        result ^= byte;
        for(let i=0;i<8;i++) result = (result >>> 1) ^ (0xedb88320 & -(result & 1));
      }
      return (result ^ 0xffffffff) >>> 0;
    }
    for(const [name, raw] of Object.entries(files).sort(([a],[b]) => a.localeCompare(b))) {
      const filename = enc.encode(name), data = typeof raw==='string' ? enc.encode(raw) : new Uint8Array(raw), sum=crc(data);
      const local=header(30,[[0,0x04034b50,4],[4,20,2],[6,0x0800,2],[12,33,2],[14,sum,4],[18,data.length,4],[22,data.length,4],[26,filename.length,2]]);
      chunks.push(local,filename,data);
      const center=header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x0800,2],[14,33,2],[16,sum,4],[20,data.length,4],[24,data.length,4],[28,filename.length,2],[42,offset,4]]);
      directory.push(center,filename); offset += local.length+filename.length+data.length;
    }
    const size=directory.reduce((n,x)=>n+x.length,0), count=Object.keys(files).length;
    const end=header(22,[[0,0x06054b50,4],[8,count,2],[10,count,2],[12,size,4],[16,offset,4]]);
    return new Blob([...chunks,...directory,end],{type:'application/zip'});
  }
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    status.textContent = '승인된 내용과 숫자를 공개 반영 파일로 정리하고 있습니다.';
    try {
      const state = {...current, candidates:[]};
      const clone = document.documentElement.cloneNode(true);
      clone.querySelector('#portfolio-state').textContent = JSON.stringify(state).replace(/</g,'\\u003c');
      clone.querySelector('#candidate-list').replaceChildren();
      clone.querySelector('#candidate-area').hidden = true;
      clone.querySelector('#refresh-status').textContent = '';
      clone.querySelector('#record-summary').textContent = '';
      clone.querySelector('#apply-records').disabled = true;
      clone.querySelector('#record-refresh').open = false;
      clone.querySelector('#record-file-preview').textContent = '';
      clone.querySelector('#record-preview').hidden = true;
      clone.querySelector('#text-record-date').value = '';
      const files={'index.html':'<!doctype html>\n'+clone.outerHTML, 'data/site-data.json':JSON.stringify(state,null,2)+'\n', 'data/tasks.json':JSON.stringify({items:state.taskCatalog},null,2)+'\n'};
      for(const path of ['style.css','script.js','record-engine.js']) {
        const response = await fetch(path); if(!response.ok) throw Error('사이트 파일을 읽지 못했습니다: '+path);
        files[path]=await response.text();
      }
      // Keep document downloads working when the whole folder is uploaded.
      for(const path of ['documents/resume.docx','documents/introduction.docx','documents/experience.docx','documents/research-paper.docx']) {
        const response=await fetch(path); if(!response.ok) throw Error('문서 파일을 읽지 못했습니다: '+path);
        files[path]=await response.arrayBuffer();
      }
      download(zip(files),'portfolio-update.zip');
      status.textContent = '현재 숫자와 승인한 문장을 담은 반영 파일을 받았습니다. 압축을 풀어 GitHub 파일을 교체하면 다른 방문자에게도 공개됩니다.';
    } catch(error) { status.textContent=error.message+' 화면에 반영한 내용은 유지합니다.'; }
    finally { exportButton.disabled=false; }
  });
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if(saved?.schemaVersion===2 && saved.metrics && Array.isArray(saved.candidates) && Array.isArray(saved.approvedParagraphs)) {
      current=saved; selected=new Set(saved.approvedParagraphs.map(c=>c.id));
      status.textContent='이 브라우저에서 반영한 기록을 불러왔습니다.';
    }
  } catch (_) {}
  paint();
})();
