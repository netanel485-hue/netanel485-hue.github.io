#!/usr/bin/env python3
"""פיצול השאלות של מרכזי כיתה ד׳ ו־ו׳ לקבצים נפרדים (15/11/2026).

למה: כל השאלות של כל המקצועות ישבו בתוך index.html (4.3MB בכיתה ו׳), ומסך הפתיחה חיכה לכולן.
עכשיו index.html מחזיק "שלד": לכל נושא רק id, emoji, name, desc, tips. השדות הכבדים
(questions, learn, passages) נמצאים ב-<hub>/data/<data_name>.json ונטענים ברקע מיד אחרי שמסך הפתיחה מוצג.

הרצה (מתוך שורש המאגר):
    python3 tools/split_data.py grade6-learning grade4-learning

הסקריפט אידמפוטנטי: אפשר להריץ אותו שוב אחרי עריכה.
  * אם index.html עדיין מחזיק נתונים מלאים (למשל אחרי שמישהו הדביק שאלות חדשות), הם מועברים לקבצים.
  * עריכת שאלות נעשית ישירות ב-data/*.json. אחרי עריכה מריצים את הסקריפט שוב כדי לעדכן את
    מספרי הגרסה ב-index.html וב-sw.js (אחרת ילדים יישארו עם הגרסה הישנה במטמון).
"""
import hashlib, json, os, re, sys

HEAVY = ('questions', 'learn', 'passages')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEC = json.JSONDecoder()

LOADER = r'''<script id="hub-data-loader">
/* HUB-DATA (15/11/2026): השאלות נטענות ברקע מ-data/*.json אחרי שמסך הפתיחה מוצג. נוצר ע"י tools/split_data.py — לא לערוך ידנית.
   עד שהטעינה מסתיימת (בדרך כלל פחות משנייה), לחיצה על כפתור נשמרת ומתבצעת מיד כשהשאלות מוכנות. */
(function(){
  var FILES=__FILES__;
  var ready=false,failed=false,pending=null,toast=null;
  window.hubDataReady=false;
  function show(msg){ try{ if(!toast){ toast=document.createElement('div'); toast.id='hubDataToast';
      toast.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:#1E4634;color:#fff;padding:10px 18px;border-radius:999px;font:700 16px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.2);direction:rtl';
      document.body.appendChild(toast);} toast.textContent=msg; toast.hidden=false; }catch(e){} }
  function hide(){ if(toast) toast.hidden=true; }
  // לחיצה לפני שהשאלות מוכנות: שומרים אותה ומבצעים אחר כך. קישורים רגילים, שדות הקלדה ובחירת פרופיל לא נעצרים.
  document.addEventListener('click',function(e){
    if(ready) return;
    var el=e.target&&e.target.closest&&e.target.closest('button,[onclick],select,.h-scard,.h-tcard');
    if(!el||el.closest('a[href]')||el.closest('#hubProfiles,#hubProfilesBody')) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    pending=el; show(failed?'📴 אין חיבור לאינטרנט, והשאלות עוד לא נשמרו במחשב':'⏳ רגע, טוענים את השאלות…');
  },true);
  function merge(name,data){
    var tgt=FILES[name].get(); if(!tgt||!tgt.topics) return;
    tgt.topics.forEach(function(t){ var d=data[t.id]; if(d) for(var k in d) t[k]=d[k]; });
    var hid=FILES[name].hidden||[]; hid.forEach(function(t){ var d=data[t.id]; if(d) for(var k in d) t[k]=d[k]; });
  }
  function load(){
    failed=false;
    var names=Object.keys(FILES);
    Promise.all(names.map(function(n){ return fetch('data/'+FILES[n].file).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); }).then(function(d){ merge(n,d); }); }))
    .then(function(){ ready=true; window.hubDataReady=true; hide(); try{ window.dispatchEvent(new Event('hub-data-ready')); }catch(e){}
      if(pending){ var p=pending; pending=null; setTimeout(function(){ try{ p.click(); }catch(e){} },0); } })
    .catch(function(){ failed=true; if(pending) show('📴 אין חיבור לאינטרנט, והשאלות עוד לא נשמרו במחשב'); });
  }
  window.addEventListener('online',function(){ if(!ready) load(); });
  if(document.readyState==='complete') setTimeout(load,0); else window.addEventListener('load',function(){ setTimeout(load,0); });
})();
</script>
'''


def find_data(s):
    """Yield (name, start, end, obj) for every `const DATA_X = {json}` block with topics."""
    for m in re.finditer(r'const\s+(DATA_[A-Z0-9_]+)\s*=\s*', s):
        try:
            obj, end = DEC.raw_decode(s, m.end())
        except ValueError:
            continue
        if isinstance(obj, dict) and isinstance(obj.get('topics'), list):
            yield m.group(1), m.end(), end, obj


def split(hub):
    p = os.path.join(ROOT, hub, 'index.html')
    s = open(p, encoding='utf-8').read()
    ddir = os.path.join(ROOT, hub, 'data')
    os.makedirs(ddir, exist_ok=True)
    blocks = list(find_data(s))
    files = {}
    out, pos = [], 0
    for name, a, b, obj in blocks:
        fn = os.path.join(ddir, name.lower() + '.json')
        heavy = {}
        if os.path.exists(fn):
            heavy = json.load(open(fn, encoding='utf-8'))
        for t in obj['topics']:
            h = {k: t.pop(k) for k in HEAVY if k in t}
            if h:  # data still inline (first run, or someone pasted new questions): it wins
                heavy[t['id']] = h
        heavy = {k: heavy[k] for k in sorted(heavy, key=lambda k: [t['id'] for t in obj['topics']].index(k) if k in [t['id'] for t in obj['topics']] else 1e9)}
        txt = json.dumps(heavy, ensure_ascii=False, separators=(',', ':'))
        open(fn, 'w', encoding='utf-8').write(txt)
        ver = hashlib.sha1(txt.encode()).hexdigest()[:8]
        files[name] = (name.lower() + '.json?v=' + ver)
        out.append(s[pos:a]); out.append(json.dumps(obj, ensure_ascii=False, separators=(',', ':'))); pos = b
    out.append(s[pos:])
    s = ''.join(out)
    # loader (replace previous copy)
    s = re.sub(r'<script id="hub-data-loader">.*?</script>\n', '', s, flags=re.S)
    js_files = '{' + ','.join('%s:{file:%s,get:function(){try{return %s}catch(e){return null}}}' % (n, json.dumps(f), n) for n, f in files.items()) + '}'
    loader = LOADER.replace('__FILES__', js_files)
    s = s.replace('</body>', loader + '</body>', 1)
    open(p, 'w', encoding='utf-8').write(s)
    # service worker: precache the data files, new cache name
    swp = os.path.join(ROOT, hub, 'sw.js')
    w = open(swp, encoding='utf-8').read()
    pre = ["'./'", "'index.html'", "'manifest.webmanifest'", "'icon.svg'"] + ["'data/%s'" % f for f in files.values()]
    w = re.sub(r"c\.addAll\(\[[^\]]*\]", "c.addAll([" + ','.join(pre) + "]", w, count=1)
    prefix = re.search(r"const C='([a-z0-9]+-)", w).group(1)
    allh = hashlib.sha1((s + ''.join(files.values())).encode()).hexdigest()[:8]
    w = re.sub(r"const C='[a-z0-9]+-[0-9a-f]+'", "const C='%s%s'" % (prefix, allh), w, count=1)
    open(swp, 'w', encoding='utf-8').write(w)
    return len(s.encode()), files


if __name__ == '__main__':
    for hub in sys.argv[1:] or ['grade6-learning', 'grade4-learning']:
        size, files = split(hub)
        print(f'{hub}: index.html {size // 1024}KB, {len(files)} data files')
