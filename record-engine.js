(function (root) {
  'use strict';
  const abilities = ['자기조절력', '대인관계력', '자기동기력'];
  const words = {
    '자기조절력': ['감정', '화가', '짜증', '차분', '침착', '조절', '충분히 자', '잠도', '휴식'],
    '대인관계력': ['서로', '도와', '도움', '동료', '함께', '챙겨', '소통', '질문'],
    '자기동기력': ['포기', '끝까지', '마쳤', '완료', '공부', '열심', '다시', '계획']
  };
  const fields = ['강점이 드러난 일화:', '강점을 위해 노력하고 생각한 것:', '나에게 남기는 말:', '내가 나눈 감사:'];
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('기록 날짜는 YYYY-MM-DD로 적어 주세요.');
    const d = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw Error('존재하지 않는 기록 날짜입니다.');
    return value;
  }
  function week(value) {
    const d = new Date(value + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const year = d.getUTCFullYear();
    const first = new Date(Date.UTC(year, 0, 1));
    return year + '-W' + String(Math.ceil((((d - first) / 86400000) + 1) / 7)).padStart(2, '0');
  }
  const stable = value => JSON.stringify(value, Object.keys(value || {}).sort());
  function id(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h.toString(16).padStart(8, '0');
  }
  function clean(text) {
    return String(text).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[연락처 생략]')
      .replace(/(?:\+82[- ]?)?01[016789][- ]?\d{3,4}[- ]?\d{4}/g, '[연락처 생략]')
      .replace(/(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g, '[비밀값 생략]')
      .slice(0, 600).trim();
  }
  function generate(raw, taskInput, attendanceInput) {
    const entries = Array.isArray(raw) ? raw : (raw?.days || raw?.records);
    if (!Array.isArray(entries) || !entries.length) throw Error('days 또는 records 배열이 있는 JSON 기록 파일을 선택해 주세요.');
    const byDate = new Map();
    for (const entry of entries) {
      const when = date(entry.date);
      const generic = [entry.text, entry.content, entry.reflection, entry.note].filter(x => typeof x === 'string' && x.trim());
      const open = entry.open;
      const close = entry.close;
      const hasOpen = Array.isArray(open) ? open.some(x => typeof x === 'string' && x.trim()) : open === true;
      const hasClose = Array.isArray(close) ? close.some(x => typeof x === 'string' && x.trim()) : close === true;
      if (!hasOpen && !hasClose && !generic.length) continue;
      const current = byDate.get(when) || { date: when, opening: false, closing: false, own: [], signals: [] };
      current.opening ||= hasOpen || !!generic.length;
      current.closing ||= hasClose;
      for (const source of [open, close]) {
        if (Array.isArray(source)) current.own.push(...source.filter(x => typeof x === 'string' && fields.some(f => x.startsWith(f))));
      }
      current.own.push(...generic);
      current.signals.push(...(Array.isArray(entry.signals) ? entry.signals.filter(x => abilities.includes(x)) : []));
      if (abilities.includes(entry.ability)) current.signals.push(entry.ability);
      current.own = [...new Set(current.own)].sort();
      byDate.set(when, current);
    }
    const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (!days.length) throw Error('내용이 있는 기록을 찾지 못했습니다.');
    const taskRows = taskInput?.items || taskInput?.tasks || (Array.isArray(taskInput) ? taskInput : []);
    if (!Array.isArray(taskRows)) throw Error('과제 목록에는 items 배열이 필요합니다.');
    const tasks = taskRows.map(t => ({id: t.id, status: ['completed','in_progress','planned'].includes(t.status) ? t.status : 'unconfirmed'}));
    const taskIds = tasks.map(x => x.id);
    if (taskIds.some(x => !/^T(?:0[1-9]|1[01])$/.test(x)) || new Set(taskIds).size !== taskIds.length) throw Error('과제 ID는 중복 없는 T01~T11이어야 합니다.');
    let attendance = null;
    if (attendanceInput && (attendanceInput.attended_days != null || attendanceInput.scheduled_days != null)) {
      const a = attendanceInput.attended_days, total = attendanceInput.scheduled_days;
      if (!Number.isInteger(a) || !Number.isInteger(total) || a < 0 || total < a) throw Error('출석일과 대상 수업일은 0 이상의 정수이며 출석일이 더 클 수 없습니다.');
      attendance = { attendedDays: a, scheduledDays: total, asOf: date(attendanceInput.as_of) };
    }
    const candidates = [];
    for (const ability of abilities) {
      const relevant = days.filter(d => d.signals.includes(ability) || d.own.some(t => words[ability].some(w => t.includes(w)))).slice(-3);
      for (const d of relevant) {
        const evidence = d.own.find(t => words[ability].some(w => t.includes(w)));
        const field = evidence?.includes(':') ? evidence.split(':')[0] : '본인 기록';
        const excerpt = evidence ? clean(evidence.replace(/^[^:]+:\s*/, '')) : '';
        const text = excerpt || ability + '과 관련된 경험과 생각을 돌아보았습니다.';
        candidates.push({ id: id(ability + d.date + text), ability, date: d.date, text,
          evidence: { source: '리추얼·기록 파일', date: d.date, field, excerpt } });
      }
    }
    const result = {
      schemaVersion: 2, asOf: days.at(-1).date,
      metrics: { recordedDays: days.length, openingDays: days.filter(d => d.opening).length,
        closingDays: days.filter(d => d.closing).length, recordedCalendarWeeks: new Set(days.map(d => week(d.date))).size,
        selectedTasks: tasks.length, completedSelectedTasks: tasks.filter(t => t.status === 'completed').length },
      sources: { ritual: { name: '리추얼·기록 파일', periodStart: days[0].date, periodEnd: days.at(-1).date },
        tasks: { name: 'T01~T11 과제 목록', scope: '과제 목록이며 전체 제출률이 아닙니다.' } },
      days: days.map(({date, opening, closing}) => ({date, opening, closing})),
      attendance, candidates: candidates.sort((a, b) => a.ability.localeCompare(b.ability, 'ko') || a.date.localeCompare(b.date)),
      approvedParagraphs: [], taskCatalog: tasks
    };
    return result;
  }
  const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function numbers(data) {
    const m = data.metrics, s = data.sources.ritual;
    const values = [[m.recordedDays, '일', '기록을 남긴 날', '시작 또는 마무리 기록이 있는 날짜를 하루에 한 번 셌습니다.', '리추얼·기록 파일'],
      [m.closingDays, '일', '하루를 돌아본 날', '마무리 기록에 내용이 있는 날짜만 셌습니다.', '리추얼·기록 파일'],
      [m.recordedCalendarWeeks, '주', '기록이 있는 달력주', '월요일~일요일 기준이며 공식 교육 주차와는 구분합니다.', '리추얼·기록 파일'],
      [m.selectedTasks, '개', 'T01~T11 과제 목록', 'T01부터 T11까지의 과제 목록입니다. 완료·제출률을 뜻하지 않습니다.', 'T01~T11 과제 목록']];
    if (data.attendance) values.push([data.attendance.attendedDays, '일', '출석한 날', '대상 수업일 '+data.attendance.scheduledDays+'일', '내 출석 기록']);
    const cards = values.map(([n,u,t,d,source]) => '<div class="metric"><p class="metric-value">'+esc(n)+'<span>'+u+'</span></p><h3>'+t+'</h3><p>'+d+'</p><p class="metric-source">출처: '+source+(source==='리추얼·기록 파일'?' · '+esc(s.periodStart)+'~'+esc(s.periodEnd):'')+'</p></div>').join('');
    const after = (data.days || []).filter(d => d.date > '2026-10-20' && d.date <= '2026-10-30').length;
    const story = after ? '<aside class="recovery"><h3>진도가 늦었던 날 이후에도, '+after+'일의 기록</h3><p>공부가 계획보다 늦었던 시기에도 충분히 쉬고 다시 해보자는 말을 남겼습니다. 그 뒤에도 기록을 이어가며 다음 날을 준비했습니다.</p><p class="metric-source">출처: 리추얼 기록 · 2026.10.21~10.30 기록 '+after+'일</p><a class="text-link" href="#slow-days">당시의 이야기 읽기</a></aside>' : '';
    return '<div class="section-head"><h2 id="numbers-title">숫자로 보는 과정</h2><p>'+esc(data.asOf)+' 기준</p></div><p class="section-lead">뜻대로 되지 않은 날에도 기록을 이어갔습니다.</p><div class="metrics">'+cards+'</div>'+story+'<p><a class="text-link record-entry" href="#record-refresh">리추얼·기록 파일로 갱신하기</a></p><details class="source-details"><summary>숫자의 출처와 계산 기준</summary><div><p>기록 날짜를 중복 제거했습니다. 기록 '+esc(m.recordedDays)+'일, 시작 '+esc(m.openingDays)+'일, 마무리 '+esc(m.closingDays)+'일입니다. 주 수는 월~일 기준입니다. 기록 수는 출석일·능력 점수와 다르며, 과제 목록은 T01~T11을 대상으로 합니다.</p><p>출처: 리추얼·기록 JSON 파일 / T01~T11 과제 목록 / 실제 출석 파일이 있을 때에만 출석 수치 표시</p><a class="text-link" href="#record-refresh">새 기록 반영하기</a></div></details>';
  }
  function approved(data) {
    return (data.approvedParagraphs || []).map(x => '<section class="approved-entry"><h3>'+esc(x.ability)+'</h3><p>'+esc(x.text)+'</p></section>').join('');
  }
  const api = { generate, numbers, approved, clean, esc, abilities };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RecordEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
