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
