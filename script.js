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
  const attendance = document.getElementById('attendance-file');
  const status = document.getElementById('refresh-status');
  const list = document.getElementById('candidate-list');
  const apply = document.getElementById('apply-records');
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
    document.getElementById('record-summary').textContent = '기록 '+current.metrics.recordedDays+'일 · 마무리 '+current.metrics.closingDays+'일 · 문단 후보 '+choices.length+'개 · 승인 '+(current.approvedParagraphs || []).length+'개';
  }
  async function parse(file, isRecord = false) {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) throw Error('파일은 5MB 이하로 선택해 주세요.');
    const text = await file.text();
    if (isRecord) {
      document.getElementById('record-file-preview').textContent = text.slice(0, 12000);
      document.getElementById('record-preview').hidden = false;
      return E.parseRecordFile(text, file.name);
    }
    try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (_) { throw Error('JSON 파일을 읽지 못했습니다. 내보낸 기록 파일인지 확인해 주세요.'); }
  }
  async function ingest() {
    const version = ++sequence;
    if (!ritual.files[0]) { status.textContent = '먼저 리추얼·기록 JSON 또는 TXT 파일을 선택해 주세요.'; return; }
    status.textContent = '기록을 읽고 숫자와 문단 후보를 만들고 있습니다.';
    try {
      const [r, a] = await Promise.all([parse(ritual.files[0], true), parse(attendance.files[0])]);
      if (version !== sequence) return;
      const next = E.generate(r, {items: initial.taskCatalog}, a);
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
  [ritual, attendance].forEach(input => input.addEventListener('change', ingest));
  apply.addEventListener('click', () => {
    current.approvedParagraphs = (current.candidates || []).filter(c => selected.has(c.id));
    paint();
    const persisted = save();
    status.textContent = current.approvedParagraphs.length+'개 문장을 사이트 이야기에 반영했습니다.'+(persisted ? ' 새로고침해도 이 브라우저에서 유지됩니다.' : ' 현재 화면에만 반영했습니다.');
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
