/* Service worker של כל האתר (13/11/2026): האתר עובד גם בלי אינטרנט.
   כשיש רשת — תמיד הגרסה החדשה (רשת קודם); בלי רשת או ברשת איטית — העותק השמור.
   מוחק רק מטמונים שמתחילים ב-"site-", כדי לא לפגוע במטמונים של כיתה ד׳ ו־ו׳. */
const C='site-3';
const CORE=['./','index.html','manifest.webmanifest','favicon.png','apple-touch-icon.png','icon-192.png','icon-512.png','icon-maskable-512.png','shared/site-bar.js','shared/cloud.js'];
const PAGES=['grade1-learning/','adi-english-game/','grade2-math/','grade4-learning/','grade4-mivdak/','grade6-learning/','math-test-prep/','dvir-melachim/'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>
  c.addAll(CORE.map(u=>new Request(u,{cache:'reload'}))).then(()=>
  Promise.allSettled(PAGES.map(u=>c.add(new Request(u,{cache:'reload'})))))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('site-')&&k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==self.location.origin)return;
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
