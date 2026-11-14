/* Service worker של כל האתר (13/11/2026): האתר עובד גם בלי אינטרנט.
   כשיש רשת — תמיד הגרסה החדשה (רשת קודם); בלי רשת או ברשת איטית — העותק השמור.
   מוחק רק מטמונים שמתחילים ב-"site-", כדי לא לפגוע במטמונים של כיתה ד׳ ו־ו׳. */
const C='site-5';
const CORE=['./','index.html','manifest.webmanifest','favicon.png','apple-touch-icon.png','icon-192.png','icon-512.png','icon-maskable-512.png','shared/site-bar.js','shared/cloud.js','shared/kit-theme.css'];
const PAGES=['grade1-learning/','adi-english-game/','grade2-math/','grade4-learning/','grade4-mivdak/','grade6-learning/','math-test-prep/','dvir-melachim/'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>
  c.addAll(CORE.map(u=>new Request(u,{cache:'reload'}))).then(()=>
  Promise.allSettled(PAGES.map(u=>c.add(new Request(u,{cache:'reload'})))))
  // ההקלטות של כיתה א׳ (קבצים נפרדים מאז 14/11/2026) — נשמרות ברקע לשימוש בלי אינטרנט
  .then(()=>fetch('grade1-learning/audio/list.json',{cache:'reload'}).then(r=>r.json()).then(list=>
    Promise.allSettled(list.map(u=>c.add(new Request(u,{cache:'reload'}))))).catch(()=>{}))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('site-')&&k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// הקלטה שמורה כשהדפדפן מבקש חלק מהקובץ (Range) — Safari מנגן אודיו רק עם תשובה 206
async function partial(saved,range){
  const buf=await saved.arrayBuffer(),m=/bytes=(\d*)-(\d*)/.exec(range)||[];
  const start=+(m[1]||0),end=m[2]?Math.min(+m[2],buf.byteLength-1):buf.byteLength-1;
  return new Response(buf.slice(start,end+1),{status:206,headers:{'Content-Type':saved.headers.get('Content-Type')||'audio/mpeg',
    'Content-Range':'bytes '+start+'-'+end+'/'+buf.byteLength,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
}
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==self.location.origin)return;
  if(r.headers.get('range')&&/\.mp3$/.test(u.pathname)){
    e.respondWith(caches.open(C).then(c=>c.match(u.pathname,{ignoreSearch:true})).then(saved=>saved?partial(saved,r.headers.get('range')):fetch(r)));
    return;
  }
  e.respondWith((async()=>{
    const cache=await caches.open(C);
    const net=fetch(r).then(n=>{if(n.ok&&n.type==='basic')cache.put(r,n.clone()).catch(()=>{});return n;});
    const saved=await cache.match(r,{ignoreSearch:true});
    net.catch(()=>{});
    if(!saved)return net.catch(()=>r.mode==='navigate'?cache.match('./'):Response.error());
    // יש עותק שמור: מחכים לרשת עד 4 שניות, ואז מגישים את העותק
    const slow=new Promise(res=>setTimeout(()=>res(saved),4000));
    try{return await Promise.race([net,slow]);}catch(_){return saved;}
  })());
});
