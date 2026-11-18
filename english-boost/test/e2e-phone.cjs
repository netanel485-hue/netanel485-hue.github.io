// בדיקת דפדפן ל-English Boost בגודל טלפון (375×812): שיעור מלא, מחברת טעויות, גיבוי ושחזור, והגנה על נתונים.
// הרצה מתיקיית השורש של האתר:
//   npm i --no-save playwright@1.49.1 && npx playwright install chromium
//   node english-boost/test/e2e-phone.cjs
// רץ גם ב-GitHub Actions (.github/workflows/checks.yml).
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT = path.join(__dirname, '..', 'content');
const PORT = 8765 + Math.floor(Math.random() * 200);
const URL = `http://127.0.0.1:${PORT}/english-boost/`;
const EXS = fs.readdirSync(CONTENT).filter(f => /^topic-.*\.json$/.test(f))
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8')).exercises);

function step(name) { console.log('▶ ' + name); }
async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(URL); if (r.ok) return; } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}
/* התרגיל שמוצג עכשיו, לפי הטקסט שעל המסך */
async function currentExercise(page) {
  const en = await page.locator('.prompt-en').first().textContent().catch(() => null);
  const he = await page.locator('.prompt').first().textContent();
  const ex = EXS.find(e => (en && e.promptEn === en.trim()) || (!e.promptEn && e.promptHe === he.trim()));
  assert.ok(ex, `exercise not found for: ${he} ${en || ''}`);
  return ex;
}
async function answer(page, ex, text) {
  if (ex.type === 'choose') await page.locator('[data-opt]', { hasText: new RegExp('^\\s*' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).click();
  else { await page.fill('#ans', text); await page.click('#check'); }
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch();
  let failed = false;
  try {
    await waitServer();
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, acceptDownloads: true, locale: 'he-IL' });
    // בלי רשת חיצונית: הסנכרון בענן נכשל בשקט, והערכה ממשיכה לעבוד במכשיר
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('dialog', d => d.accept());

    step('מסך היום נטען עם כל הנושאים');
    await page.goto(URL);
    await page.getByRole('heading', { name: 'כל הנושאים' }).waitFor();
    const files = fs.readdirSync(CONTENT).filter(f => /^topic-.*\.json$/.test(f)).length;
    assert.equal(await page.locator('[data-free]').count(), files);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at 375px');

    step('כלי פיתוח מוסתרים, גיבוי מוצג');
    await page.click('[data-tab="progress"]');
    await page.getByRole('heading', { name: 'גיבוי' }).waitFor();
    assert.equal(await page.locator('#dayPlus').count(), 0, 'dev tools hidden without ?dev');

    step('שיעור מלא: טעות מכוונת בתרגיל הראשון, תיקון, ואז תשובות נכונות');
    await page.click('[data-tab="today"]');
    await page.click('[data-start="0"]');
    await page.click('#go');
    let first = true, n = 0;
    while (await page.locator('.prompt').count()) {
      const ex = await currentExercise(page);
      const wrong = Object.keys((ex.tests || {}).flag || {})[0];
      if (first && wrong) {
        await answer(page, ex, wrong);
        await page.locator('.fb.warn').waitFor();
        const hint = await page.locator('.fb.warn').textContent();
        if (ex.type === 'choose') assert.ok(hint.includes('תשובה אחרת'), 'choose retry hint');
        else {
          assert.ok(hint.includes('בדיקה'), 'write retry hint');
          assert.ok(hint.includes('רמז:'), 'first try shows a hint, not the full explanation');
          // רמז "עט אדום": מסמן איפה הבעיה בלי לגלות את התשובה
          assert.ok(await page.locator('.fb.warn .diff .hint, .fb.warn .diff .gap').count() > 0, 'hint marks the problem');
          assert.equal(await page.locator('.fb.warn .diff .ins').count(), 0, 'hint does not reveal the answer');
        }
        first = false;
      }
      await answer(page, ex, ex.tests.accept[0]);
      await page.locator('.fb.ok').waitFor();
      await page.click('#next'); n++;
      if (await page.getByRole('heading', { name: 'סיכום' }).count()) break;
    }
    assert.ok(!first, 'made one deliberate mistake');
    await page.getByRole('heading', { name: 'סיכום' }).waitFor();
    assert.ok(n >= 3, `answered ${n} exercises`);
    await page.click('#done');

    step('הטעות נכנסה למחברת, במצב "בתיקון" (תוקנה בניסיון השני)');
    await page.click('[data-tab="mistakes"]');
    await page.locator('.mist.st-fixing').waitFor();
    assert.equal(await page.locator('.mist').count(), 1);
    assert.equal(await page.locator('#practice').count(), 0, 'proof waits for another day');

    step('מצב כהה: רקע כהה וטקסט בהיר');
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color]);
    assert.notEqual(dark[0], 'rgb(250, 246, 235)', 'dark background'); assert.ok(/^rgb\((2[0-9]{2}|1[5-9][0-9])/.test(dark[1]), 'light text ' + dark[1]);
    await page.emulateMedia({ colorScheme: 'light' });

    step('שמירת גיבוי, מחיקה ושחזור');
    await page.click('[data-tab="progress"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkSave')]);
    const file = await dl.path();
    assert.match(dl.suggestedFilename(), /^english-boost-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(backup.app, 'english-boost'); assert.ok(backup.data.attempts.length >= n);
    await page.locator('summary', { hasText: 'מחיקת כל ההתקדמות' }).click();
    await page.click('#wipe');
    await page.click('[data-tab="mistakes"]');
    await page.getByText('עוד אין טעויות').waitFor();
    await page.click('[data-tab="progress"]');
    await page.setInputFiles('#bkFile', file);
    await page.getByText('הגיבוי שוחזר.').waitFor();
    await page.click('[data-tab="mistakes"]');
    await page.locator('.mist.st-fixing').waitFor();

    step('למחרת: משפט חדש עם אותו כלל, והכרטיס עובר להוכחה 1/3');
    await page.evaluate(() => localStorage.setItem('eb.dayOffset', '1'));
    await page.reload();
    await page.getByRole('heading', { name: 'כל הנושאים' }).waitFor();
    await page.click('[data-tab="mistakes"]');
    await page.click('#practice');
    const proofEx = await currentExercise(page);
    const lastWrong = JSON.parse(await page.evaluate(() => localStorage.getItem('eb.data'))).attempts.find(a => a.outcome === 'error');
    assert.notEqual(proofEx.id, lastWrong.ex, 'proof uses a new sentence');
    await answer(page, proofEx, proofEx.tests.accept[0]);
    await page.locator('.fb.ok').waitFor();
    await page.click('#next');
    while (await page.locator('.prompt').count()) {
      const e2 = await currentExercise(page); await answer(page, e2, e2.tests.accept[0]); await page.locator('.fb.ok').waitFor(); await page.click('#next');
      if (await page.getByRole('heading', { name: 'סיכום' }).count()) break;
    }
    await page.click('#done');
    await page.click('[data-tab="mistakes"]');
    await page.locator('.mist.st-proving').waitFor();
    assert.match(await page.locator('.mist.st-proving .pill').textContent(), /1\/3/);
    await page.evaluate(() => localStorage.removeItem('eb.dayOffset'));

    step('נתונים מגרסה חדשה יותר לא נדרסים');
    await page.evaluate(() => localStorage.setItem('eb.data', JSON.stringify({ v: 99, attempts: [{ keep: 1 }] })));
    await page.reload();
    await page.getByText('נשמרה בגרסה חדשה יותר').waitFor();
    await page.click('[data-free]');
    await page.click('#go');
    const ex = await currentExercise(page);
    await answer(page, ex, ex.tests.accept[0]);
    await page.locator('.fb.ok').waitFor();
    const kept = JSON.parse(await page.evaluate(() => localStorage.getItem('eb.data')));
    assert.equal(kept.v, 99, 'newer data left untouched');

    step('כלי פיתוח עם ?dev');
    await page.evaluate(() => localStorage.clear());
    await page.goto(URL + '?dev');
    await page.getByRole('heading', { name: 'כל הנושאים' }).waitFor(); // התוכן נטען לפני שעוברים מסך (אחרת הציור מחדש סוגר את ה-details)
    await page.click('[data-tab="progress"]');
    await page.locator('summary', { hasText: 'כלי פיתוח' }).click();
    await page.locator('#dayPlus').waitFor();

    assert.deepEqual(errors, [], 'no page errors');
    console.log('✓ כל הבדיקות עברו');
  } catch (e) {
    failed = true;
    console.error('✗ ' + (e && e.stack || e));
  } finally {
    await browser.close();
    server.kill();
    process.exit(failed ? 1 : 0);
  }
})();
