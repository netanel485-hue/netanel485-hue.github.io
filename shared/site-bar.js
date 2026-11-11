/* סרגל אתר משותף לערכות שאין להן ניווט משלהן (11/11/2026).
   מוסיף בראש הדף קישור "🏠 מרכזי הלמידה" לדף הבית. נטען עם defer; אם נכשל, הדף עובד כרגיל.
   שימוש: <script src="../shared/site-bar.js" defer data-label="שם הערכה"></script>
   data-home — כתובת דף הבית (ברירת מחדל ../), data-static — סרגל לא דביק. */
(function(){
  'use strict';
  try{
    if(document.getElementById('siteBar'))return;
    var me=document.currentScript||document.querySelector('script[src*="site-bar.js"]');
    var label=(me&&me.getAttribute('data-label'))||'';
    var home=(me&&me.getAttribute('data-home'))||'../';
    // data-static: לדפים שיש להם כבר סרגל דביק משלהם
    var stat=!!(me&&me.hasAttribute('data-static'));
    var css='#siteBar{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:10px;'
      +'margin:0 0 12px;padding:8px 12px;background:#FFFDF7;border-bottom:1px solid #D8E4D4;box-shadow:0 2px 10px rgba(30,70,50,.08);'
      +'font-family:"Segoe UI",Arial,system-ui,sans-serif;direction:rtl}'
      +'#siteBar a{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:6px 12px;border-radius:12px;'
      +'text-decoration:none;font-weight:800;font-size:15px;color:#1E4634;background:#EAF4E6}'
      +'#siteBar a:focus-visible{outline:3px solid #F59E0B;outline-offset:2px}'
      +'#siteBar span{font-size:14px;font-weight:700;color:#4F6B5D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
    var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
    var bar=document.createElement('nav');bar.id='siteBar';bar.setAttribute('aria-label','ניווט באתר');
    var a=document.createElement('a');a.href=home;a.textContent='🏠 מרכזי הלמידה';
    bar.appendChild(a);
    if(label){var s=document.createElement('span');s.textContent=label;bar.appendChild(s);}
    var b=document.body;
    // דפים עם padding על body: מותחים את הסרגל לרוחב מלא
    var cs=getComputedStyle(b),pl=parseFloat(cs.paddingLeft)||0,pr=parseFloat(cs.paddingRight)||0,pt=parseFloat(cs.paddingTop)||0;
    if(pl||pr||pt){bar.style.marginLeft=(-pl)+'px';bar.style.marginRight=(-pr)+'px';bar.style.marginTop=(-pt)+'px';}
    if(stat)bar.style.position='relative';
    b.insertBefore(bar,b.firstChild);
  }catch(e){}
})();
