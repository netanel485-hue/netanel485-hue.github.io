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

  // ---------- השוואה מילה מול מילה (משוב "עט אדום") ----------
  /* wordDiff(answer, targets): בוחר מבין הניסוחים הנכונים (וגרסה עם קיצורים פתוחים) את הקרוב ביותר לתשובה,
     ומחזיר רשימת חלקים { op: 'same' | 'del' | 'ins', text }. del = מילים מהתשובה שצריך להוריד/להחליף, ins = מה שחסר.
     ההשוואה לפי normalize של כל מילה, כך שאותיות גדולות ופיסוק לא נחשבים הבדל. */
  var EXPAND = [[/\bwon['’]t\b/gi, 'will not'], [/\bcan['’]t\b/gi, 'cannot'], [/n['’]t\b/gi, ' not'], [/['’]ve\b/gi, ' have'],
    [/['’]m\b/gi, ' am'], [/['’]re\b/gi, ' are'], [/['’]ll\b/gi, ' will']];
  function expandContractions(s) {
    var t = String(s);
    EXPAND.forEach(function (r) { t = t.replace(r[0], r[1]); });
    return t;
  }
  function words(s) { return String(s).trim().split(/\s+/).filter(Boolean); }
  function wkey(w) { return normalize(w).replace(/[.,!?;:"]+/g, ''); }
  function lcsOps(a, b) {
    var ka = a.map(wkey), kb = b.map(wkey), n = a.length, m = b.length, i, j;
    var L = [];
    for (i = 0; i <= n; i++) { L.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = ka[i] === kb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var ops = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (ka[i] === kb[j]) { ops.push({ op: 'same', text: b[j] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { ops.push({ op: 'del', text: a[i] }); i++; }
      else { ops.push({ op: 'ins', text: b[j] }); j++; }
    }
    for (; i < n; i++) ops.push({ op: 'del', text: a[i] });
    for (; j < m; j++) ops.push({ op: 'ins', text: b[j] });
    return { ops: ops, same: L[0][0] };
  }
  /* isOk (לא חובה): פונקציה שבודקת משפט מלא. הבדל שבו הנוסח של המשתמש, יחד עם שאר המשפט הנכון, עדיין מתקבל
     (למשל in במקום at כשגם in נכון) לא מסומן. כך העט האדום לא מסמן מילה נכונה כטעות. */
  function wordDiff(answer, targets, isOk) {
    var a = words(answer);
    if (!a.length) return { ops: [], target: null, changes: 0 };
    var cands = [];
    (targets || []).forEach(function (t) {
      if (!t) return;
      cands.push(t);
      var e = expandContractions(t);
      if (e !== t) cands.push(e);
    });
    var best = null;
    cands.forEach(function (t) {
      var b = words(t), r = lcsOps(a, b), changes = a.length + b.length - 2 * r.same;
      if (!best || changes < best.changes) best = { ops: merge(r.ops), target: t, changes: changes };
    });
    if (!best) return { ops: [], target: null, changes: 0 };
    if (typeof isOk === 'function') best = forgive(best, isOk);
    return best;
  }
  function tryOk(isOk, sentence) { try { return !!isOk(sentence); } catch (e) { return false; } }
  /* המשפט הנכון, כשבמקום הקבוצה k..end בא הטקסט mid */
  function joinAround(ops, k, end, mid) {
    return ops.map(function (o, i) {
      if (i >= k && i < end) return i === k ? mid : '';
      return o.op === 'del' ? '' : o.text;
    }).filter(Boolean).join(' ');
  }
  function forgive(d, isOk) {
    var ops = d.ops.slice(), k = 0;
    while (k < ops.length) {
      if (ops[k].op === 'same') { k++; continue; }
      var end = k; while (end < ops.length && ops[end].op !== 'same') end++;
      var mine = ops.slice(k, end).filter(function (o) { return o.op === 'del'; }).map(function (o) { return o.text; }).join(' ');
      var sentence = ops.map(function (o, i) {
        if (i >= k && i < end) return i === k ? mine : '';
        return o.op === 'del' ? '' : o.text;
      }).filter(Boolean).join(' ');
      if (tryOk(isOk, sentence)) { ops.splice(k, end - k, mine ? { op: 'same', text: mine } : null); ops = ops.filter(Boolean); continue; }
      // אחרת: אולי רק הקצה של הקבוצה נכון (work in → have worked at: ה-in נכון)
      var D = words(mine), I = words(ops.slice(k, end).filter(function (o) { return o.op === 'ins'; }).map(function (o) { return o.text; }).join(' '));
      var split = null;
      for (var t = Math.min(D.length, I.length); t >= 1 && !split; t--) {
        var suf = { del: D.slice(0, D.length - t), ins: I.slice(0, I.length - t), same: D.slice(D.length - t), at: 'end' };
        var pre = { del: D.slice(t), ins: I.slice(t), same: D.slice(0, t), at: 'start' };
        [suf, pre].forEach(function (c) {
          if (split || (!c.del.length && !c.ins.length)) return;
          var mid = c.at === 'end' ? c.ins.concat(c.same) : c.same.concat(c.ins);
          if (tryOk(isOk, joinAround(ops, k, end, mid.join(' ')))) split = c;
        });
      }
      if (split) {
        var rep = [];
        if (split.at === 'start') rep.push({ op: 'same', text: split.same.join(' ') });
        if (split.del.length) rep.push({ op: 'del', text: split.del.join(' ') });
        if (split.ins.length) rep.push({ op: 'ins', text: split.ins.join(' ') });
        if (split.at === 'end') rep.push({ op: 'same', text: split.same.join(' ') });
        ops.splice.apply(ops, [k, end - k].concat(rep));
      }
      k = end + (split ? 1 : 0);
      while (k < ops.length && ops[k].op !== 'same') k++;
    }
    var changes = 0;
    ops.forEach(function (o) { if (o.op !== 'same') changes += words(o.text).length; });
    return { ops: merge(ops), target: d.target, changes: changes };
  }
  /* מאחד חלקים רצופים מאותו סוג ומציב מחיקה לפני הוספה, כדי שיוצג "~~work~~ have worked" */
  function merge(ops) {
    var out = [];
    ops.forEach(function (o) {
      var last = out[out.length - 1];
      if (last && last.op === o.op) last.text += ' ' + o.text;
      else out.push({ op: o.op, text: o.text });
    });
    for (var k = 1; k < out.length; k++) {
      if (out[k].op === 'del' && out[k - 1].op === 'ins') { var x = out[k]; out[k] = out[k - 1]; out[k - 1] = x; }
    }
    return out;
  }

  // ---------- נתונים שמורים: גרסה, עדכון וגיבוי ----------
  /* DATA_V עולה בכל שינוי במבנה הנתונים. migrateData לא זורקת ולא מוחקת:
     ok/migrated = אפשר לעבוד; newer = נשמר בגרסה חדשה יותר (במכשיר אחר), לא נוגעים בו; invalid = לא נתונים של הערכה. */
  var DATA_V = 1;
  function emptyData() { return { v: DATA_V, progress: {}, attempts: [], vocab: [], mixedDay: null }; }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function migrateData(raw) {
    if (raw == null) return { status: 'empty', data: emptyData() };
    if (!isObj(raw)) return { status: 'invalid', data: null };
    var v = raw.v == null ? 0 : raw.v;
    if (typeof v !== 'number' || v < 0 || v !== Math.floor(v)) return { status: 'invalid', data: null };
    if (v > DATA_V) return { status: 'newer', data: null };
    var d = JSON.parse(JSON.stringify(raw));
    // v0 → v1: לפני שהיה מספר גרסה. המבנה זהה, רק משלימים שדות חסרים.
    // (כשיהיה v2: if (d.v === 1) { ...שינוי...; d.v = 2; })
    d.v = DATA_V;
    if (!isObj(d.progress)) d.progress = {};
    if (!Array.isArray(d.attempts)) d.attempts = [];
    if (!Array.isArray(d.vocab)) d.vocab = [];
    if (!('mixedDay' in d)) d.mixedDay = null;
    d.attempts = d.attempts.filter(function (a) { return isObj(a) && typeof a.ex === 'string' && typeof a.date === 'number'; });
    d.vocab = d.vocab.filter(function (x) { return isObj(x) && typeof x.en === 'string'; });
    return { status: v === DATA_V ? 'ok' : 'migrated', data: d };
  }
  var BACKUP_APP = 'english-boost';
  function makeBackup(data, now) { return JSON.stringify({ app: BACKUP_APP, kind: 'backup', exportedAt: now, data: data }, null, 1); }
  /* קורא קובץ גיבוי. מחזיר { data, exportedAt, counts } או { error } בעברית. מקבל גם נתונים "חשופים" בלי מעטפה. */
  function readBackup(text) {
    var obj;
    try { obj = JSON.parse(String(text)); } catch (e) { return { error: 'הקובץ לא נקרא. צריך לבחור קובץ גיבוי של English Boost (‎.json).' }; }
    var raw = isObj(obj) && obj.app === BACKUP_APP && 'data' in obj ? obj.data : obj;
    if (isObj(obj) && obj.app && obj.app !== BACKUP_APP) return { error: 'זה גיבוי של ערכה אחרת, לא של English Boost.' };
    var m = migrateData(raw);
    if (m.status === 'newer') return { error: 'הגיבוי נשמר בגרסה חדשה יותר של הערכה. רענן את הדף ונסה שוב.' };
    if (m.status === 'invalid' || m.status === 'empty' || !('attempts' in (raw || {}))) return { error: 'בקובץ אין נתונים של English Boost.' };
    return { data: m.data, exportedAt: isObj(obj) && typeof obj.exportedAt === 'number' ? obj.exportedAt : null,
      counts: { attempts: m.data.attempts.length, vocab: m.data.vocab.length, topics: Object.keys(m.data.progress).length } };
  }

  var EB = {
    normalize: normalize, check: check, isCorrect: isCorrect, newProgress: newProgress,
    repeatedErrorTag: repeatedErrorTag, todayPlan: todayPlan, sessionExercises: sessionExercises,
    finishSession: finishSession, accuracyLast10: accuracyLast10, reviewVocab: reviewVocab,
    mistakeLog: mistakeLog, mixedReview: mixedReview,
    wordDiff: wordDiff, expandContractions: expandContractions,
    DATA_V: DATA_V, emptyData: emptyData, migrateData: migrateData, makeBackup: makeBackup, readBackup: readBackup,
    startOfDay: startOfDay, addDays: addDays, daysBetween: daysBetween, dayKey: dayKey,
    INTERVALS: INTERVALS, STATE_HE: STATE_HE, SESSION_SIZE: SESSION_SIZE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = EB; else root.EB = EB;
})(typeof window !== 'undefined' ? window : this);
