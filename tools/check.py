#!/usr/bin/env python3
"""בדיקות אוטומטיות לאתר הלמידה. רץ בכל push ו-PR (‎.github/workflows/checks.yml‎), וגם מקומית:
    python3 tools/check.py            # בדיקת כל הקבצים
    python3 tools/check.py --base origin/main   # גם: שינוי ב-index של מרכז מחייב שם מטמון חדש ב-sw.js
יוצא עם קוד 1 אם יש כשל. אזהרות (⚠) לא מכשילות."""
import re, json, glob, subprocess, sys, os, tempfile, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
fails, warns = [], []
def fail(m): fails.append(m)
def warn(m): warns.append(m)

PAGES = sorted(glob.glob('*.html') + glob.glob('*/index.html'))
KID_NAMES = ['עדי', 'איתי', 'אריאל', 'דביר', 'אורי']

def scripts_of(s):
    return [x for x in re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', s, re.S) if x.strip()]

def node_check(code, label):
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as t:
        t.write(code); path = t.name
    r = subprocess.run(['node', '--check', path], capture_output=True, text=True)
    os.unlink(path)
    if r.returncode: fail(f'{label}: שגיאת תחביר JavaScript — {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else ""}')

QPAT = re.compile(r'"q":\s*"((?:[^"\\]|\\.)*)",\s*"(?:opts|options)":\s*(\[(?:\s*"(?:[^"\\]|\\.)*",?\s*)+\]),\s*"a":\s*(\d+)')

for p in PAGES:
    s = open(p, encoding='utf-8').read()
    # 1. meta robots
    if 'name="robots" content="noindex' not in s: fail(f'{p}: חסר <meta name="robots" content="noindex, nofollow">')
    # 2. no kids names in <title>
    t = re.search(r'<title>(.*?)</title>', s, re.S)
    if t and any(n in t.group(1) for n in KID_NAMES): fail(f'{p}: שם של ילד בכותרת הדף: {t.group(1)}')
    # 3. JS syntax (each inline script on its own, then all together for cross-script redeclarations)
    sc = scripts_of(s)
    for i, code in enumerate(sc): node_check(code, f'{p} script #{i+1}')
    # 4. no literal "<script" inside a CSS block (breaks tools that parse the page)
    for css in re.findall(r'<style[^>]*>(.*?)</style>', s, re.S):
        if '<script' in css: fail(f'{p}: הטקסט "<script" מופיע בתוך בלוק CSS')
    # 5. static question banks
    n = 0; pos = collections.Counter()
    for m in QPAT.finditer(s):
        n += 1
        try: o = json.loads(m.group(2))
        except Exception: continue
        a = int(m.group(3)); pos[a] += 1
        if a >= len(o): fail(f'{p}: תשובה מחוץ לטווח — {m.group(1)[:60]}')
        if len({x.strip() for x in o}) < len(o): fail(f'{p}: אפשרויות כפולות — {m.group(1)[:60]}')
    if n >= 40:
        lo, hi = min(pos.values()), max(pos.values())
        if hi > lo * 1.6: warn(f'{p}: פיזור מיקום התשובה הנכונה לא אחיד {dict(pos)}')
    # 6. passages: text psg needs the engine to accept strings
    if re.search(r'"psg":\s*"', s) and 'psgText' not in s: fail(f'{p}: יש קטעי קריאה כטקסט אבל המנוע לא מציג אותם (חסר psgText)')
    # 7. explanations must be visible in hubs
    if '<div class="explain">' in s and '.explain { display: none' in s and '#hubQFb .explain' not in s:
        fail(f'{p}: הסברים מוסתרים (‎.explain{{display:none}}‎ בלי ‎#hubQFb .explain{{display:block}}‎)')
    # 8. gender agreement in generators
    for m in re.finditer(r'pick\(NAMES\)\}?\'?\s*\+?\s*\'?\s*([^\s`\'+]+)', s):
        verb = m.group(1)
        if verb in ('לקח','קנה','אכל','צייר','צבע','מדד','שתה','קורא','חשב','קנתה','שילמה','קיבלה'):
            fail(f'{p}: שם מעורב (NAMES) עם פועל ממוגדר "{verb}" — השתמשו ב-NAMES_M / NAMES_F')
    # 9. negative numbers in grade-4 explanations
    if 'grade4' in p and re.search(r'\+ \(-\d', s): fail(f'{p}: מספר שלילי בהסבר לכיתה ד׳')

# 10. service workers keep cache:'reload'; hub index change needs a new cache name
for sw in glob.glob('*/sw.js'):
    w = open(sw, encoding='utf-8').read()
    if "cache:'reload'" not in w: fail(f"{sw}: ההתקנה חייבת לטעון עם {{cache:'reload'}}")
    node_check(w, sw)
if '--base' in sys.argv:
    base = sys.argv[sys.argv.index('--base') + 1]
    changed = subprocess.run(['git', 'diff', '--name-only', base, '--'], capture_output=True, text=True).stdout.split()
    for sw in glob.glob('*/sw.js'):
        d = os.path.dirname(sw)
        if f'{d}/index.html' in changed and sw not in changed:
            fail(f'{d}/index.html השתנה אבל שם המטמון ב-{sw} לא עודכן — ילדים יישארו על הגרסה הישנה')

for w_ in warns: print('⚠', w_)
for f_ in fails: print('❌', f_)
print(f'\n{len(PAGES)} דפים נבדקו · {len(fails)} כשלים · {len(warns)} אזהרות')
sys.exit(1 if fails else 0)
