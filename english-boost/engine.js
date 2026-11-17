/* English Boost — מנוע הבדיקה וההתאמה לרמה (17/11/2026).
   הועבר מאפליקציית EnglishCoach (AnswerChecker.swift + Planner.swift), באותם כללים בדיוק.
   אין כאן ממשק: הדף (index.html) קורא לפונקציות, והבדיקות (test/engine.test.js) רצות ב-node.
   כל כללי ההתאמה לרמה נמצאים רק כאן. */
(function (root) {
  'use strict';
  var DAY = 86400000;

  // ---------- זמן ----------
  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(n, t) { var d = new Date(startOfDay(t)); d.setDate(d.getDate() + n); return d.getTime(); }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }
  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------- בודק תשובות ----------
  /* נרמול: אותיות קטנות, גרש מעוגל → רגיל, קיצורים נפתחים, בלי פסיקים, רווח אחד, בלי פיסוק בסוף. */
  function normalize(s) {
    var t = String(s || '').toLowerCase();
    t = t.replace(/’/g, "'").replace(/‘/g, "'");
    t = t.split("won't").join('will not').split("can't").join('cannot');
    t = t.split("n't").join(' not');
    t = t.split("'ve").join(' have').split("'m").join(' am').split("'re").join(' are').split("'ll").join(' will');
    t = t.split(',').join('');
    t = t.replace(/\s+/g, ' ').replace(/^ +| +$/g, '');
    t = t.replace(/[.!?]+$/, '').replace(/^ +| +$/g, '');
    return t;
  }
  var reCache = {};
  function re(p) { if (!(p in reCache)) { try { reCache[p] = new RegExp(p); } catch (e) { reCache[p] = null; } } return reCache[p]; }
  /* accept: התאמה לתשובה כולה. errors: מספיק שהדפוס מופיע בתוכה. */
  function check(answer, ex) {
    var n = normalize(answer);
    if (!n) return { kind: 'unknown' };
    for (var i = 0; i < ex.accept.length; i++) {
      var r = re('^(?:' + ex.accept[i] + ')$');
      if (r && r.test(n)) return { kind: 'correct' };
    }
    var errs = ex.errors || [];
    for (var j = 0; j < errs.length; j++) {
      var r2 = re(errs[j].pattern);
      if (r2 && r2.test(n)) return { kind: 'error', tag: errs[j].tag, explainHe: errs[j].explainHe };
    }
    return { kind: 'unknown' };
  }

  // ---------- התאמה לרמה ----------
  var INTERVALS = [0, 1, 3, 7, 14, 30];   // ימים עד החזרה, לפי קופסת לייטנר 1…5
  var SESSION_SIZE = 5, MAX_TASKS = 3;
  var STATE_HE = { 'new': 'חדש', learning: 'בלמידה', practicing: 'בתרגול', mastered: 'שולט' };

  function isCorrect(a) { return a.outcome === 'correct' || a.outcome === 'selfCorrect'; }
  function byDate(a, b) { return a.date - b.date; }
  function newProgress() { return { state: 'new', box: 0, nextDue: 0, last: null }; }

  /* תג טעות שהופיע לפחות פעמיים בנושא ב-7 הימים האחרונים. */
  function repeatedErrorTag(topicId, attempts, now) {
    var counts = {};
    attempts.forEach(function (a) {
      if (a.topic !== topicId || !a.tag || daysBetween(a.date, now) >= 7) return;
      counts[a.tag] = (counts[a.tag] || 0) + 1;
    });
    var best = null;
    Object.keys(counts).forEach(function (k) { if (counts[k] >= 2 && (!best || counts[k] > counts[best])) best = k; });
    return best;
  }

  /* מסך היום: (1) טעות חוזרת, (2) חזרות שהגיע זמנן, (3) נושא חדש. עד 3 משימות, לכל אחת סיבה. */
  function todayPlan(topics, progress, attempts, now) {
    var items = [];
    topics.forEach(function (t) {
      var p = progress[t.id];
      if (!p || p.state === 'new' || p.nextDue > now) return;
      var tag = repeatedErrorTag(t.id, attempts, now);
      if (tag) {
        items.push({ topic: t, kind: 0, focusTag: tag,
          reasonHe: 'טעות חוזרת: ' + (t.tags[tag] || tag) + '. נתרגל את זה במשפטים אחרים.' });
      } else {
        var days = p.last ? daysBetween(p.last, now) : 0;
        items.push({ topic: t, kind: 1, focusTag: null,
          reasonHe: p.state === 'mastered'
            ? 'בדיקת שימור: עברו ' + days + ' ימים מאז הפעם האחרונה.'
            : 'הגיע זמן חזרה (מצב: ' + STATE_HE[p.state] + ', עברו ' + days + ' ימים).' });
      }
    });
    items.sort(function (a, b) { return a.kind !== b.kind ? a.kind - b.kind : progress[a.topic.id].nextDue - progress[b.topic.id].nextDue; });
    if (items.length < MAX_TASKS) {
      var next = topics.find(function (t) { return !progress[t.id] || progress[t.id].state === 'new'; });
      if (next) items.push({ topic: next, kind: 2, focusTag: null, reasonHe: 'נושא חדש: ' + next.summaryHe + '.' });
    }
    return items.slice(0, MAX_TASKS);
  }

  /* קודם תרגילים שלא נראו (משפט חדש בכל פעם). עם תג מיקוד: קודם תרגילים שבודקים את הטעות הזו.
     אחר כך תרגילים שנענו לא נכון, ואחר כך הישנים ביותר. */
  function sessionExercises(topic, attempts, focusTag) {
    var lastResult = {}, lastSeen = {};
    attempts.filter(function (a) { return a.topic === topic.id; }).sort(byDate).forEach(function (a) {
      lastResult[a.ex] = isCorrect(a); lastSeen[a.ex] = a.date;
    });
    function focus(e) { return !!focusTag && (e.errors || []).some(function (x) { return x.tag === focusTag; }); }
    var unseen = topic.exercises.filter(function (e) { return !(e.id in lastResult); })
      .sort(function (a, b) { return (focus(b) ? 1 : 0) - (focus(a) ? 1 : 0); });
    var wrong = topic.exercises.filter(function (e) { return lastResult[e.id] === false; });
    var rest = topic.exercises.filter(function (e) { return lastResult[e.id] === true; })
      .sort(function (a, b) { return lastSeen[a.id] - lastSeen[b.id]; });
    var out = [];
    unseen.concat(wrong, rest).forEach(function (e) {
      if (out.length < SESSION_SIZE && !out.some(function (x) { return x.id === e.id; })) out.push(e);
    });
    return out;
  }

  /* אחרי שיעור. כללים:
     - בלמידה: פחות מ-5 תשובות, או דיוק מתחת ל-60%
     - שולט: לפחות 80% ב-10 האחרונות, לפחות 3 תשובות כתובות נכונות, הצלחה ב-2 ימים שונים לפחות,
       משפט חדש שנכתב נכון לפחות יומיים אחרי ההתחלה, ואין טעות חוזרת
     - בתרגול: כל השאר
     חזרות: 80% ומעלה בשיעור מעלה קופסה אחת, אחרת חזרה לקופסה 1 (מחר). טעות חוזרת תמיד מחזירה למחר. */
  function finishSession(p, topicAttempts, sessionResults, now) {
    var sorted = topicAttempts.slice().sort(byDate);
    var last10 = sorted.slice(-10);
    var accuracy = last10.filter(isCorrect).length / Math.max(last10.length, 1);
    var writtenCorrect = sorted.filter(function (a) { return a.prod && isCorrect(a); }).length;
    var days = {}; sorted.filter(isCorrect).forEach(function (a) { days[a.day || dayKey(a.date)] = 1; });
    var correctDays = Object.keys(days).length;
    var first = sorted.length ? sorted[0].date : now;
    var transferLater = sorted.some(function (a) { return a.isNew && a.prod && isCorrect(a) && daysBetween(first, a.date) >= 2; });
    var topicId = sorted.length ? sorted[0].topic : null;
    var repeatedTag = topicId ? repeatedErrorTag(topicId, sorted, now) : null;

    if (sorted.length < 5 || accuracy < 0.6) p.state = 'learning';
    else if (accuracy >= 0.8 && writtenCorrect >= 3 && correctDays >= 2 && transferLater && !repeatedTag) p.state = 'mastered';
    else p.state = 'practicing';

    var sessionCorrect = sessionResults.filter(Boolean).length;
    var sessionAccuracy = sessionCorrect / Math.max(sessionResults.length, 1);
    p.box = (repeatedTag || sessionAccuracy < 0.8) ? 1 : Math.min(p.box + 1, INTERVALS.length - 1);
    p.nextDue = addDays(INTERVALS[Math.max(p.box, 1)], now);
    p.last = now;
    return { correct: sessionCorrect, total: sessionResults.length, state: p.state, nextDue: p.nextDue, repeatedTag: repeatedTag };
  }

  function accuracyLast10(topicId, attempts) {
    var mine = attempts.filter(function (a) { return a.topic === topicId; }).sort(byDate).slice(-10);
    if (!mine.length) return null;
    return mine.filter(isCorrect).length / mine.length;
  }

  /* מחברת טעויות: לכל תרגיל הטעות האחרונה (טעות מזוהה או "טעיתי" בהשוואה עצמית), מהחדשה לישנה.
     resolved = אחרי הטעות הזו היתה תשובה נכונה באותו תרגיל. */
  function mistakeLog(attempts) {
    var sorted = attempts.slice().sort(byDate), last = {}, order = [];
    sorted.forEach(function (a) {
      if (a.outcome === 'error' || a.outcome === 'selfWrong') {
        if (!(a.ex in last)) order.push(a.ex);
        last[a.ex] = { attempt: a, resolved: false };
      } else if (isCorrect(a) && last[a.ex]) {
        last[a.ex].resolved = true;
      }
    });
    return order.map(function (id) { return last[id]; }).sort(function (x, y) { return y.attempt.date - x.attempt.date; });
  }

  /* חזרה מעורבת: תרגילים מכמה נושאים שכבר התחילו, לסירוגין, כדי לתרגל לזהות לבד איזה כלל מתאים.
     בכל נושא: קודם תרגילים עם טעות שעוד לא תוקנה, אחר כך הכי ישנים. בלי תרגילים שנענו היום.
     הנושאים לפי מועד החזרה. מחזיר [] אם התחילו פחות משני נושאים. */
  function mixedReview(topics, progress, attempts, now, size) {
    size = size || 6;
    var started = topics.filter(function (t) { return progress[t.id] && progress[t.id].state !== 'new'; })
      .sort(function (a, b) { return progress[a.id].nextDue - progress[b.id].nextDue; });
    if (started.length < 2) return [];
    var open = {};
    mistakeLog(attempts).forEach(function (m) { if (!m.resolved) open[m.attempt.ex] = 1; });
    var lastSeen = {};
    attempts.forEach(function (a) { if (!(a.ex in lastSeen) || a.date > lastSeen[a.ex]) lastSeen[a.ex] = a.date; });
    var queues = started.map(function (t) {
      var seen = t.exercises.filter(function (e) { return e.id in lastSeen && daysBetween(lastSeen[e.id], now) > 0; });
      seen.sort(function (a, b) { return ((open[b.id] ? 1 : 0) - (open[a.id] ? 1 : 0)) || (lastSeen[a.id] - lastSeen[b.id]); });
      return seen.map(function (e) { return { ex: e, topicId: t.id }; });
    });
    var out = [];
    for (var round = 0; out.length < size; round++) {
      var added = false;
      queues.forEach(function (q) { if (q[round] && out.length < size) { out.push(q[round]); added = true; } });
      if (!added) break;
    }
    var topicsIn = {}; out.forEach(function (x) { topicsIn[x.topicId] = 1; });
    return Object.keys(topicsIn).length >= 2 ? out : [];
  }

  function reviewVocab(item, correct, now) {
    item.box = correct ? Math.min(item.box + 1, INTERVALS.length - 1) : 1;
    item.nextDue = addDays(INTERVALS[Math.max(item.box, 1)], now);
  }

  var EB = {
    normalize: normalize, check: check, isCorrect: isCorrect, newProgress: newProgress,
    repeatedErrorTag: repeatedErrorTag, todayPlan: todayPlan, sessionExercises: sessionExercises,
    finishSession: finishSession, accuracyLast10: accuracyLast10, reviewVocab: reviewVocab,
    mistakeLog: mistakeLog, mixedReview: mixedReview,
    startOfDay: startOfDay, addDays: addDays, daysBetween: daysBetween, dayKey: dayKey,
    INTERVALS: INTERVALS, STATE_HE: STATE_HE, SESSION_SIZE: SESSION_SIZE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EB; else root.EB = EB;
})(typeof window !== 'undefined' ? window : this);
