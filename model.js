// 진도표 공용: Firebase 설정, 종 시간, 날짜 도구, 시간표·진도 계산.
// index.html(진도표 앱) · desk.html(바탕화면) · quick.html(휴대폰 기록)이 같이 씀 → 계산이 어긋나지 않게 여기 한 곳에만 둠

// 기존 앱과 같은 Firebase 프로젝트/경로 → 기존 로그인·학사일정(events) 그대로 사용
export const FB_CONFIG = {
  apiKey: "AIzaSyC74vmNOFabZ0qd2iPjDL7pWFg3W13h6rE",
  authDomain: "moon-pixel.firebaseapp.com",
  projectId: "moon-pixel",
  storageBucket: "moon-pixel.firebasestorage.app",
  messagingSenderId: "690517363714",
  appId: "1:690517363714:web:a5204517fcc83982942b1b",
};
export const APP_ID = "godeok-ms-final-v3";

// ponytail: 일반적인 중학교 종 시간(45분 수업·10분 휴식). 학교 시정과 다르면 여기만 고치면 됨.
export const BELL = [null, ["09:00", "09:45"], ["09:55", "10:40"], ["10:50", "11:35"], ["11:45", "12:30"], ["13:20", "14:05"], ["14:15", "15:00"], ["15:10", "15:55"]];
export const PERIODS = [1, 2, 3, 4, 5, 6, 7];
export const WD = ["일", "월", "화", "수", "목", "금", "토"];
export const YEAR_END = "2027-02-26";

// ---------- 날짜 ----------
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromIso = s => new Date(s + "T00:00:00");
export const addDays = (s, n) => { const d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); };
export const isWeekend = s => [0, 6].includes(fromIso(s).getDay());
export const md = s => { const d = fromIso(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
export const mdw = s => `${md(s)}(${WD[fromIso(s).getDay()]})`;
export const atTime = (s, hhmm) => new Date(`${s}T${hhmm}:00`);
export const gradeOf = c => +c.split("-")[0];
export const slotKey = (date, p) => `${date}_${p}`;
export const nextSchoolDay = (s, dir = 1) => { let d = addDays(s, dir); while (isWeekend(d)) d = addDays(d, dir); return d; };

// 학사일정(기존 앱 규칙 그대로): 제목 괄호의 'n학년' → 대상 학년, 없으면 전 학년
export const targetGrades = title => {
  const m = title?.match(/\(([^)]*?)\s*학년/);
  if (!m) return [1, 2, 3];
  const r = m[1].match(/([1-3])\s*[-~∼–—]\s*([1-3])/);
  if (r) { const a = []; for (let g = Math.min(+r[1], +r[2]); g <= Math.max(+r[1], +r[2]); g++) a.push(g); return a; }
  const gs = [...new Set((m[1].match(/[1-3]/g) || []).map(Number))];
  return gs.length ? gs : [1, 2, 3];
};
export const isExam = e => e.type === "시험" || e.title?.includes("고사");
export const blocks = e => !e.title?.includes("창체") && (e.type === "시험" || e.type === "휴업" || e.type === "행사(수업제외)");
export const allDay = e => !e.period || e.period === "전교시";

// 시간표·진도 계산을 한곳에
export function buildModel({ meta, lessons, events }) {
  let tt = null;
  try { tt = meta.timetable?.json ? JSON.parse(meta.timetable.json) : null; } catch { }
  const sa = meta.timetable?.syncedAt; // SDK 는 Timestamp, REST(desk.html)는 Date
  const syncedAt = sa?.toDate ? sa.toDate() : sa instanceof Date ? sa : null;
  const plans = meta.plans || {};
  const notes = meta.notes || {};
  const tinted = meta.prefs?.colorMode !== "mono";

  const classes = [...new Set(Object.values(tt?.base || {}).flatMap(d => Object.values(d).map(x => x.c)))]
    .sort((a, b) => gradeOf(a) - gradeOf(b) || +a.split("-")[1] - +b.split("-")[1]);
  const firstDay = Object.keys(tt?.days || {}).sort()[0];

  const eventsByDate = {};
  for (const e of events) (eventsByDate[e.date] ||= []).push(e);
  const blockingEvent = (date, p, grade) => (eventsByDate[date] || []).find(e => blocks(e) && (allDay(e) || e.period === `${p}교시`) && targetGrades(e.title).includes(grade));
  const grades = [...new Set(classes.map(gradeOf))];
  // 내 모든 학년이 하루 종일 수업이 없는 날(방학·휴업·시험) → 연간표에서 접어서 표시
  const dayOff = date => {
    const e = (eventsByDate[date] || []).find(e => blocks(e) && allDay(e) && grades.every(g => targetGrades(e.title).includes(g)));
    if (e) return e;
    const wd = fromIso(date).getDay(), live = tt?.days[date];
    // 컴시간에서 그날 내 수업이 전부 빠짐(시험·출장 등)
    if (live && !Object.keys(live).length && Object.keys(tt.base[wd] || {}).length) return { title: "수업 없음 (컴시간)" };
  };

  // 그날의 교시별 수업. 알림이 주간 데이터가 있으면 그것(변경 반영), 없으면 기본 시간표.
  const slotsFor = date => {
    const wd = fromIso(date).getDay();
    if (!tt || wd === 0 || wd === 6) return [];
    const base = tt.base[wd] || {};
    const live = tt.days[date];
    const day = live || base;
    const slots = PERIODS.map(p => {
      const cur = day[p], orig = base[p];
      const c = cur?.c || null, oc = orig?.c || null;
      return {
        date, p, c, s: cur?.s,
        changed: !!live && !!c && c !== oc,   // 이 시간에 다른 반(또는 원래 없던 수업)이 들어옴
        was: !!live && c !== oc ? oc : null,   // 원래 있던 반
        removed: !!live && !c && oc ? oc : null, // 원래 있던 수업이 빠짐
        event: c ? blockingEvent(date, p, gradeOf(c)) : null,
      };
    });
    // 같은 날 빠진 반이 다른 교시에 들어왔으면 '이동'으로 짝지음
    for (const r of slots.filter(s => s.removed)) {
      const a = slots.find(s => s.changed && s.c === r.removed && !s.from);
      if (a) { a.from = r.p; r.to = a.p; }
    }
    return slots;
  };

  // 수업 기록: lessons/{date_p} = { date, p, c, step, note, skip }
  const byClass = {};
  for (const [k, l] of Object.entries(lessons)) (byClass[l.c] ||= []).push({ ...l, k });
  for (const c in byClass) byClass[c].sort((a, b) => a.k < b.k ? -1 : 1);
  const stepBefore = (c, k) => { let s = 0; for (const l of byClass[c] || []) { if (l.k >= k) break; if (l.step) s = Math.max(s, l.step); } return s; };
  const progress = c => Math.max(0, ...(byClass[c] || []).map(l => l.step || 0));
  const lastLesson = c => [...(byClass[c] || [])].reverse().find(l => !l.skip);
  const planOf = c => plans[gradeOf(c)] || [];
  const planName = (c, step) => planOf(c)[step - 1] || `${step}차시`;
  const stepTitle = (c, step) => step ? `${step}. ${planOf(c)[step - 1] || `${step}차시`}` : "";
  const firstLesson = Object.keys(lessons).sort()[0]?.slice(0, 10);

  // 칸마다 차시: 기록한 수업은 기록 그대로, 아직인 수업은 앞 기록 +1, +2 … 로 이어서 예상
  // (기록을 쓰기 시작한 날 전, 학사일정으로 빠진 수업은 차시 없음. 차시 계획을 넘어가면 -1 = 계획 끝)
  const stepOf = {};
  const startFrom = firstLesson || iso(new Date());
  const run = {};
  for (let d = firstDay; d && d <= YEAR_END; d = addDays(d, 1)) for (const s of slotsFor(d)) {
    if (!s.c) continue;
    const k = slotKey(d, s.p), l = lessons[k];
    if (l) { stepOf[k] = l.skip ? 0 : l.step || 0; continue; }
    if (s.event || d < startFrom) continue;
    const b = stepBefore(s.c, k);
    const r = run[s.c]?.[0] === b ? run[s.c] : (run[s.c] = [b, 0]);
    const n = b + ++r[1], last = planOf(s.c).length;
    stepOf[k] = last && n > last ? -1 : n;
  }

  const nextExam = (grade, from) => events.filter(e => isExam(e) && e.date >= from && targetGrades(e.title).includes(grade)).sort((a, b) => a.date < b.date ? -1 : 1)[0];
  const lessonsUntil = (c, from, until) => {
    let n = 0;
    for (let d = from; d < until; d = addDays(d, 1)) n += slotsFor(d).filter(s => s.c === c && !s.event).length;
    return n;
  };

  // 끝났는데 기록 안 한 수업: 처음 기록을 남긴 날 이후, 최근 2주까지만 (쓰기 전 수업까지 밀린 걸로 치지 않음)
  const pending = now => {
    const today = iso(now), out = [];
    const start = [addDays(today, -14), firstLesson || today].sort()[1];
    for (let d = start; d <= today; d = addDays(d, 1))
      for (const s of slotsFor(d))
        if (s.c && !s.event && !lessons[slotKey(d, s.p)] && atTime(d, BELL[s.p][1]) <= now) out.push(s);
    return out;
  };

  // 오늘부터 n일 안의 시간표 변경 (컴시간 알리미처럼 한눈에)
  const changesFrom = (from, n) => {
    const out = [];
    for (let d = from, i = 0; i < n; d = addDays(d, 1), i++)
      if (dayOff(d)?.title === "수업 없음 (컴시간)") out.push({ date: d, p: 0, allOff: true });
      else for (const s of slotsFor(d)) if (s.changed || s.removed) out.push(s);
    return out;
  };

  return { tt, syncedAt, plans, notes, tinted, classes, firstDay, slotsFor, dayOff, byClass, stepBefore, stepOf, progress, lastLesson, planOf, planName, stepTitle, nextExam, lessonsUntil, pending, changesFrom, lessons, events };
}

// 칸에 보일 차시 번호와 이름
export function slotInfo(m, s) {
  const l = m.lessons[slotKey(s.date, s.p)];
  const v = m.stepOf[slotKey(s.date, s.p)] || 0, step = Math.max(0, v), over = v < 0;
  return { l, step, over, planned: !l, name: l?.skip ? "수업 못함" : l?.topic || (step ? m.planName(s.c, step) : over ? "계획 끝" : ""), note: l?.note || "" };
}

// 기록 한 건 (index·desk·quick 모두 같은 모양으로 저장). topic: 바탕화면에서 직접 쓴 진도, color: 직접 고른 색 번호(--tag0~7)
export const lessonDoc = (slot, rec) => ({ date: slot.date, p: slot.p, c: slot.c, step: rec.step || 0, note: rec.note || "", skip: !!rec.skip, at: Date.now(),
  ...(rec.topic ? { topic: rec.topic } : {}), ...(Number.isInteger(rec.color) ? { color: rec.color } : {}) });
