// בדיקות למנוע של English Boost. הרצה: node --test english-boost/test/
// רץ גם אוטומטית מתוך tools/check.py בכל push ו-PR.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const EB = require('../engine.js');

const CONTENT = path.join(__dirname, '..', 'content');
const files = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  .match(/TOPIC_FILES\s*=\s*\[([^\]]*)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
const topics = files.map(f => JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8')));

// ---------- תוכן ----------
test('every content file is listed in index.html', () => {
  const onDisk = fs.readdirSync(CONTENT).filter(f => /^topic-.*\.json$/.test(f)).sort();
  assert.deepEqual([...files].sort(), onDisk);
});

test('content structure', () => {
  const ids = new Set(), orders = new Set();
  for (const t of topics) {
    for (const k of ['id', 'order', 'titleHe', 'summaryHe', 'ruleHe', 'examples', 'tags', 'exercises']) assert.ok(k in t, `${t.id}: missing ${k}`);
    assert.ok(!orders.has(t.order), `duplicate order ${t.order}`); orders.add(t.order);
    for (const ex of t.exercises) {
      const w = `${t.id}/${ex.id}`;
      assert.ok(!ids.has(ex.id), `${w}: duplicate id`); ids.add(ex.id);
      assert.ok(['choose', 'translate', 'rewrite', 'write'].includes(ex.type), `${w}: type`);
      assert.ok(ex.accept.length > 0, `${w}: accept`);
      for (const p of ex.accept.concat(ex.errors.map(e => e.pattern))) assert.doesNotThrow(() => new RegExp(p), `${w}: regex ${p}`);
      for (const e of ex.errors) {
        assert.ok(e.tag in t.tags, `${w}: tag ${e.tag} not defined`);
        assert.ok(e.explainHe, `${w}: explainHe`);
      }
      if (ex.type === 'choose') {
        const right = (ex.options || []).filter(o => EB.check(o, ex).kind === 'correct');
        assert.equal(right.length, 1, `${w}: exactly one option must be correct, got ${JSON.stringify(right)}`);
      } else {
        assert.equal(EB.check(ex.modelAnswer, ex).kind, 'correct', `${w}: modelAnswer not accepted`);
      }
      for (const alt of ex.alternatives || []) assert.equal(EB.check(alt, ex).kind, 'correct', `${w}: alternative ${alt}`);
    }
  }
});

test('the tests block of every exercise passes with the browser checker', () => {
  let n = 0;
  for (const t of topics) for (const ex of t.exercises) {
    const tests = ex.tests || {};
    for (const a of tests.accept || []) { n++; assert.equal(EB.check(a, ex).kind, 'correct', `${ex.id}: should accept ${a} (normalized: ${EB.normalize(a)})`); }
    for (const [a, tag] of Object.entries(tests.flag || {})) {
      n++; const r = EB.check(a, ex);
      assert.equal(r.kind, 'error', `${ex.id}: ${a} should be flagged ${tag}`); assert.equal(r.tag, tag, `${ex.id}: ${a}`);
    }
  }
  assert.ok(n > 20, `only ${n} test answers`);
});

test('normalize', () => {
  assert.equal(EB.normalize('  I’ve   worked, here!! '), 'i have worked here');
  assert.equal(EB.normalize("I don't know."), 'i do not know');
  assert.equal(EB.normalize("I won't go?"), 'i will not go');
  assert.equal(EB.normalize('...'), '');
});

test('README since/for examples', () => {
  const ex = topics.flatMap(t => t.exercises).find(e => e.id === 'pp-since-01');
  assert.equal(EB.check("I've worked at this company since 2019.", ex).kind, 'correct');
  assert.equal(EB.check('I have been working for this company since 2019', ex).kind, 'correct');
  const r = EB.check('I work in this company since 2019', ex);
  assert.equal(r.kind, 'error'); assert.equal(r.tag, 'PP_SINCE_TENSE'); assert.ok(r.explainHe);
});

// ---------- התאמה לרמה ----------
const T = 'test-topic';
const day0 = new Date(2026, 10, 2, 12).getTime();
const at = (day, minute = 0) => EB.addDays(day, day0) + 12 * 3600000 + minute * 60000;
let seq = 0;
function att(day, correct, { tag = null, prod = true, isNew = true } = {}) {
  seq++;
  const date = at(day, seq);
  return { ex: 'ex-' + seq, topic: T, answer: 'x', outcome: correct ? 'correct' : (tag ? 'error' : 'selfWrong'),
    tag, date, day: EB.dayKey(date), prod, isNew };
}
const range = (n, f) => Array.from({ length: n }, f);
const topic = { id: T, order: 99, titleHe: 'בדיקה', summaryHe: 'בדיקה', ruleHe: [], examples: [], tags: { T1: 'טעות בדיקה' }, exercises: [] };
function finish(attempts, now, results = [true]) {
  const p = { state: 'learning', box: 1, nextDue: 0, last: null };
  return [p, EB.finishSession(p, attempts, results, now)];
}

test('same tag twice within 7 days: back tomorrow, first on Today, with focusTag', () => {
  const attempts = [att(0, true), att(0, false, { tag: 'T1' }), att(5, false, { tag: 'T1' }), att(5, true)];
  const now = at(5, 500);
  assert.equal(EB.repeatedErrorTag(T, attempts, now), 'T1');
  const [p, s] = finish(attempts, now, [true, true, true, true, true]);
  assert.equal(s.repeatedTag, 'T1'); assert.equal(p.box, 1);
  assert.equal(EB.daysBetween(now, p.nextDue), 1);
  const plan = EB.todayPlan([topic], { [T]: p }, attempts, at(6));
  assert.equal(plan[0].kind, 0); assert.equal(plan[0].focusTag, 'T1'); assert.match(plan[0].reasonHe, /טעות בדיקה/);
});

test('same tag 7 days apart, or two different tags, is not repeated', () => {
  assert.equal(EB.repeatedErrorTag(T, [att(0, false, { tag: 'T1' }), att(7, false, { tag: 'T1' })], at(7, 500)), null);
  assert.equal(EB.repeatedErrorTag(T, [att(0, false, { tag: 'T1' }), att(1, false, { tag: 'T2' })], at(1, 500)), null);
});

test('focus tag puts the matching unseen exercise first', () => {
  const ex = (id, tag) => ({ id, type: 'write', accept: ['x'], errors: tag ? [{ pattern: 'y', tag, explainHe: 'z' }] : [], modelAnswer: 'x' });
  const t = Object.assign({}, topic, { exercises: [ex('a'), ex('b'), ex('c', 'T1')] });
  assert.equal(EB.sessionExercises(t, [], 'T1')[0].id, 'c');
});

const baseline = () => range(3, () => att(0, true)).concat(range(2, () => att(2, true)));

test('mastered only when every condition holds', () => {
  assert.equal(finish(baseline(), at(2, 500))[1].state, 'mastered');
  // דיוק 5/7 = 71%
  assert.equal(finish(baseline().concat([att(2, false), att(2, false)]), at(2, 500))[1].state, 'practicing');
  // רק 2 תשובות כתובות
  assert.equal(finish(range(3, () => att(0, true, { prod: false })).concat(range(2, () => att(2, true))), at(2, 500))[1].state, 'practicing');
  // הצלחה ביום אחד בלבד
  assert.equal(finish([att(0, false)].concat(range(5, () => att(2, true))), at(2, 500))[1].state, 'practicing');
  // משפט חדש רק יום אחד אחרי ההתחלה
  assert.equal(finish(range(3, () => att(0, true)).concat(range(2, () => att(1, true))), at(1, 500))[1].state, 'practicing');
  // יומיים אחרי, אבל משפט שכבר נראה
  assert.equal(finish(range(3, () => att(0, true)).concat(range(2, () => att(2, true, { isNew: false }))), at(2, 500))[1].state, 'practicing');
  // טעות חוזרת (8/10 ב-10 האחרונות, אבל T1 פעמיים)
  const r = finish(range(4, () => att(0, true)).concat(range(6, () => att(2, true)), [att(2, false, { tag: 'T1' }), att(2, false, { tag: 'T1' })]), at(2, 500))[1];
  assert.equal(r.repeatedTag, 'T1'); assert.equal(r.state, 'practicing');
  // פחות מ-5 תשובות
  assert.equal(finish(range(4, () => att(0, true)), at(0, 500))[1].state, 'learning');
});

test('good session moves up one Leitner box', () => {
  const p = { state: 'practicing', box: 2, nextDue: 0, last: null };
  const now = at(3);
  EB.finishSession(p, baseline(), [true, true, true, true, false], now);
  assert.equal(p.box, 3); assert.equal(EB.daysBetween(now, p.nextDue), 7);
});

test('vocab review', () => {
  const v = { box: 0, nextDue: 0 };
  EB.reviewVocab(v, true, at(0)); assert.equal(v.box, 1); assert.equal(EB.daysBetween(at(0), v.nextDue), 1);
  EB.reviewVocab(v, true, at(0)); assert.equal(v.box, 2); assert.equal(EB.daysBetween(at(0), v.nextDue), 3);
  EB.reviewVocab(v, false, at(0)); assert.equal(v.box, 1);
});

// ---------- מחברת טעויות וחזרה מעורבת ----------
function attOn(topicId, exId, day, outcome, tag = null) {
  seq++;
  const date = at(day, seq);
  return { ex: exId, topic: topicId, answer: 'x', outcome, tag, date, day: EB.dayKey(date), prod: true, isNew: false };
}

test('mistake log: newest first, one row per exercise, resolved after a later correct answer', () => {
  const log = EB.mistakeLog([
    attOn(T, 'a', 0, 'error', 'T1'),
    attOn(T, 'b', 1, 'selfWrong'),
    attOn(T, 'a', 2, 'correct'),
    attOn(T, 'c', 3, 'correct'),
    attOn(T, 'b', 3, 'error', 'T1'),
  ]);
  assert.deepEqual(log.map(m => [m.attempt.ex, m.resolved]), [['b', false], ['a', true]]);
});

test('mixed review interleaves started topics, open mistakes first, nothing answered today', () => {
  const ex = id => ({ id, type: 'write', accept: ['x'], errors: [], modelAnswer: 'x' });
  const A = Object.assign({}, topic, { id: 'A', exercises: [ex('a1'), ex('a2'), ex('a3')] });
  const B = Object.assign({}, topic, { id: 'B', exercises: [ex('b1'), ex('b2')] });
  const C = Object.assign({}, topic, { id: 'C', exercises: [ex('c1')] });
  const progress = { A: { state: 'practicing', box: 1, nextDue: at(3) }, B: { state: 'learning', box: 1, nextDue: at(2) }, C: { state: 'new', box: 0, nextDue: 0 } };
  const attempts = [
    attOn('A', 'a1', 0, 'correct'), attOn('A', 'a2', 0, 'error', 'T1'), attOn('A', 'a3', 5, 'correct'),
    attOn('B', 'b1', 0, 'correct'), attOn('B', 'b2', 1, 'correct'),
    attOn('C', 'c1', 0, 'correct'),
  ];
  const r = EB.mixedReview([A, B, C], progress, attempts, at(5, 500));
  // B is due first; A's open mistake (a2) comes before a1; a3 was answered today; C is not started.
  assert.deepEqual(r.map(x => x.ex.id), ['b1', 'a2', 'b2', 'a1']);
  assert.deepEqual(r.map(x => x.topicId), ['B', 'A', 'B', 'A']);
});

test('mixed review needs at least two started topics', () => {
  const ex = id => ({ id, type: 'write', accept: ['x'], errors: [], modelAnswer: 'x' });
  const A = Object.assign({}, topic, { id: 'A', exercises: [ex('a1')] });
  const B = Object.assign({}, topic, { id: 'B', exercises: [ex('b1')] });
  const attempts = [attOn('A', 'a1', 0, 'correct')];
  assert.deepEqual(EB.mixedReview([A, B], { A: { state: 'learning', box: 1, nextDue: 0 } }, attempts, at(3)), []);
  // two started topics, but only one has anything to review → not mixed
  assert.deepEqual(EB.mixedReview([A, B], { A: { state: 'learning', box: 1, nextDue: 0 }, B: { state: 'learning', box: 1, nextDue: 0 } }, attempts, at(3)), []);
});

// ---------- נתונים שמורים: גרסה, עדכון וגיבוי ----------
test('migrateData: empty, current, old, newer, broken', () => {
  assert.equal(EB.migrateData(null).status, 'empty');
  const cur = { v: EB.DATA_V, progress: { a: { state: 'learning' } }, attempts: [{ ex: 'x', date: 1 }], vocab: [], mixedDay: null };
  const ok = EB.migrateData(cur);
  assert.equal(ok.status, 'ok'); assert.deepEqual(ok.data, cur); assert.notEqual(ok.data, cur, 'returns a copy');
  const old = EB.migrateData({ progress: {}, attempts: [{ ex: 'x', date: 1 }, { bad: true }] });
  assert.equal(old.status, 'migrated'); assert.equal(old.data.v, EB.DATA_V);
  assert.equal(old.data.attempts.length, 1, 'drops broken attempts'); assert.deepEqual(old.data.vocab, []);
  assert.equal(EB.migrateData({ v: EB.DATA_V + 1, attempts: [] }).status, 'newer', 'never downgrades data from a newer version');
  for (const bad of [5, 'x', [], { v: 'one' }, { v: -1 }]) assert.equal(EB.migrateData(bad).status, 'invalid', JSON.stringify(bad));
});

test('backup round trip and bad files', () => {
  const data = { v: EB.DATA_V, progress: { t: { state: 'practicing', box: 2, nextDue: 5, last: 4 } },
    attempts: [{ ex: 'a', date: 10 }, { ex: 'b', date: 11 }], vocab: [{ en: 'since', he: 'מאז' }], mixedDay: '2026-11-18' };
  const r = EB.readBackup(EB.makeBackup(data, 1234));
  assert.equal(r.error, undefined); assert.deepEqual(r.data, data); assert.equal(r.exportedAt, 1234);
  assert.deepEqual(r.counts, { attempts: 2, vocab: 1, topics: 1 });
  assert.deepEqual(EB.readBackup(JSON.stringify(data)).data, data, 'accepts raw data without the wrapper');
  for (const bad of ['not json', '5', '{}', JSON.stringify({ app: 'other-kit', data }),
    JSON.stringify({ app: 'english-boost', data: { v: EB.DATA_V + 1, attempts: [] } })]) {
    assert.ok(EB.readBackup(bad).error, `should reject ${bad.slice(0, 40)}`);
  }
});

// ---------- השוואה מילה מול מילה ----------
const fmt = d => d.ops.map(o => o.op === 'same' ? o.text : o.op === 'del' ? `-${o.text}-` : `+${o.text}+`).join(' ');
test('wordDiff marks exactly the changed words', () => {
  assert.equal(fmt(EB.wordDiff('She work from home on Mondays', ['She works from home on Mondays.'])), 'She -work- +works+ from home on Mondays.');
  assert.equal(fmt(EB.wordDiff('I am software engineer', ["I'm a software engineer."])), 'I am +a+ software engineer.', 'uses the expanded form when closer');
  assert.equal(fmt(EB.wordDiff('I work in this company since 2019', ["I've worked at this company since 2019."])),
    'I -work in- +have worked at+ this company since 2019.');
});
test('wordDiff picks the closest correct phrasing and ignores case and punctuation', () => {
  const d = EB.wordDiff('i have been working for this company since 2019', ["I've worked at this company since 2019.", "I've been working for this company since 2019."]);
  assert.equal(d.changes, 0); assert.ok(d.ops.every(o => o.op === 'same'));
  assert.deepEqual(EB.wordDiff('   ', ['Hello.']), { ops: [], target: null, changes: 0 });
  assert.equal(EB.expandContractions("I'm sure they won't, and I can't"), 'I am sure they will not, and I cannot');
});
test('wordDiff on every flagged test answer always points at something to fix', () => {
  for (const t of topics) for (const ex of t.exercises) {
    if (ex.type === 'choose') continue;
    for (const a of Object.keys((ex.tests || {}).flag || {})) {
      const d = EB.wordDiff(a, [ex.modelAnswer].concat(ex.alternatives || []));
      assert.ok(d.changes > 0 && d.ops.some(o => o.op !== 'same'), `${ex.id}: ${a}`);
    }
  }
});

test('wordDiff never marks an accepted variant as wrong (in / at this company)', () => {
  const ex = topics.flatMap(t => t.exercises).find(e => e.id === 'pp-since-01');
  const ok = x => EB.check(x, ex).kind === 'correct';
  const d1 = EB.wordDiff('I work in this company since 2019', [ex.modelAnswer].concat(ex.alternatives || []), ok);
  assert.equal(fmt(d1), 'I -work- +have worked+ in this company since 2019.');
  const d2 = EB.wordDiff('I am working in this company since 2019', [ex.modelAnswer].concat(ex.alternatives || []), ok);
  assert.ok(!d2.ops.some(o => o.op !== 'same' && /\bin\b/.test(o.text)), fmt(d2));
});

// ---------- מחזור החיים של טעות ----------
const mkEx = (id, tags) => ({ id, type: 'write', promptHe: '', accept: ['x'], errors: tags.map(tag => ({ pattern: 'y', tag, explainHe: 'z' })), modelAnswer: 'x' });
const LT = { id: 'L', order: 1, titleHe: '', summaryHe: '', ruleHe: [], examples: [], tags: { X: 'x', Y: 'y' },
  exercises: [mkEx('e1', ['X']), mkEx('e2', ['X']), mkEx('e3', ['X']), mkEx('e4', []), mkEx('e5', ['Y'])] };
let lseq = 0;
const la = (ex, day, outcome, extra = {}) => Object.assign({ ex, topic: 'L', answer: 'a', outcome, tag: null, date: at(day, ++lseq), prod: true, isNew: true }, extra);
const card = (atts, now, key = 'L|X') => EB.mistakeCards(atts, [LT], now).find(c => c.key === key);

test('mistake card: open → fixing → proving → ink, only new sentences on later days count', () => {
  const atts = [la('e1', 0, 'error', { tag: 'X' })];
  assert.equal(card(atts, at(0, 500)).state, 'open');
  atts[0].fixed = true;
  assert.equal(card(atts, at(0, 500)).state, 'fixing', 'fixed on retry');
  atts.push(la('e2', 0, 'correct'));
  assert.equal(card(atts, at(0, 500)).proofs, 0, 'same day does not prove');
  atts.push(la('e2', 1, 'correct'), la('e3', 1, 'correct'));
  let c = card(atts, at(1, 500));
  assert.equal(c.state, 'proving'); assert.equal(c.proofs, 1, 'one proof per day'); assert.ok(c.provedToday);
  atts.push(la('e1', 2, 'correct'));
  assert.equal(card(atts, at(2, 500)).proofs, 1, 'the same sentence is not a proof when others exist');
  atts.push(la('e3', 2, 'correct'), la('e2', 4, 'correct'));
  c = card(atts, at(4, 500));
  assert.equal(c.state, 'ink'); assert.equal(c.proofs, EB.PROOFS_NEEDED);
  assert.deepEqual(c.history.map(h => h.type), ['wrong', 'fixed', 'proof', 'proof', 'proof', 'ink']);
});

test('mistake card: a new mistake of the same kind reopens it; untagged and single-sentence mistakes', () => {
  const atts = [la('e1', 0, 'error', { tag: 'X' }), la('e2', 1, 'correct'), la('e3', 2, 'correct'), la('e2', 3, 'error', { tag: 'X' })];
  const c = card(atts, at(3, 500));
  assert.equal(c.state, 'open'); assert.equal(c.proofs, 0); assert.equal(c.wrongCount, 2); assert.equal(c.last.ex, 'e2');
  const self = [la('e4', 0, 'selfWrong'), la('e4', 0, 'selfCorrect'), la('e4', 2, 'selfCorrect')];
  const cs = card(self, at(2, 500), 'ex|e4');
  assert.equal(cs.state, 'proving'); assert.equal(cs.proofs, 1, 'untagged: the same sentence on a later day');
  const only = [la('e5', 0, 'error', { tag: 'Y' }), la('e5', 1, 'correct')];
  assert.equal(card(only, at(1, 500), 'L|Y').proofs, 1, 'only one sentence tests Y, so it counts on a later day');
});

test('mistake practice: open → same sentence; fixing → another sentence, not on the day of the mistake', () => {
  const atts = [la('e1', 0, 'error', { tag: 'X', fixed: false })];
  let q = EB.mistakePractice(EB.mistakeCards(atts, [LT], at(0, 500)), [LT], atts, at(0, 500));
  assert.deepEqual(q.map(x => x.ex.id), ['e1']);
  atts[0].fixed = true;
  q = EB.mistakePractice(EB.mistakeCards(atts, [LT], at(0, 500)), [LT], atts, at(0, 500));
  assert.deepEqual(q, [], 'fixed today: proof starts tomorrow');
  q = EB.mistakePractice(EB.mistakeCards(atts, [LT], at(1, 500)), [LT], atts, at(1, 500));
  assert.equal(q.length, 1); assert.notEqual(q[0].ex.id, 'e1', 'a new sentence for the proof');
  atts.push(la(q[0].ex.id, 1, 'correct'));
  q = EB.mistakePractice(EB.mistakeCards(atts, [LT], at(1, 550)), [LT], atts, at(1, 550));
  assert.deepEqual(q, [], 'already proved today');
});

test('week summary counts only the last 7 days', () => {
  const atts = [la('e1', 0, 'error', { tag: 'X' }), la('e2', 8, 'correct'), la('e3', 9, 'correct'), la('e2', 9, 'error', { tag: 'X' })];
  const w = EB.weekSummary(atts, EB.mistakeCards(atts, [LT], at(9, 500)), at(9, 500));
  assert.equal(w.days, 2); assert.equal(w.answers, 3); assert.equal(Math.round(w.accuracy * 100), 67);
  assert.equal(w.newMistakes, 0, 'the X mistake started on day 0'); assert.equal(w.proofs, 2);
});
