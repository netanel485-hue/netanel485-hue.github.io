/* English Boost — שכבת הפלטפורמה (18/11/2026).
   כל מה שתלוי במכשיר עובר דרך כאן: שמירה, הקראה, רטט, התקנה.
   באתר: localStorage, speechSynthesis ו-beforeinstallprompt.
   באפליקציה (Capacitor, בהמשך) מחליפים רק את הקובץ הזה בתוספים: Preferences, TextToSpeech, Haptics.
   שאר הקוד (engine.js, index.html) לא משתנה. כל פונקציה כאן לא זורקת שגיאה: אם יכולת חסרה, היא פשוט לא פועלת. */
(function (root) {
  'use strict';

  // ---------- שמירה ----------
  var storage = {
    get: function (key) { try { return JSON.parse(root.localStorage.getItem(key) || 'null'); } catch (e) { return null; } },
    set: function (key, value) { try { root.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } },
    remove: function (key) { try { root.localStorage.removeItem(key); } catch (e) {} }
  };

  // ---------- הקראה ----------
  var synth = root.speechSynthesis;
  var voice = null;
  function pickVoice() {
    try {
      var vs = synth.getVoices().filter(function (v) { return /^en[-_]/i.test(v.lang); });
      // אנגלית אמריקאית/קנדית קודם (גם אם קול אחר מותקן מקומית); בתוך אותו מבטא, קול מקומי קודם
      var pref = ['en-US', 'en-CA'];
      voice = vs.sort(function (a, b) {
        var ia = pref.indexOf(a.lang.replace('_', '-')), ib = pref.indexOf(b.lang.replace('_', '-'));
        ia = ia < 0 ? 9 : ia; ib = ib < 0 ? 9 : ib;
        if (ia !== ib) return ia - ib;
        return a.localService === b.localService ? 0 : a.localService ? -1 : 1;
      })[0] || null;
    } catch (e) { voice = null; }
  }
  if (synth) { pickVoice(); try { synth.addEventListener('voiceschanged', pickVoice); } catch (e) {} }
  var speech = {
    available: !!(synth && root.SpeechSynthesisUtterance),
    speak: function (text, opts) {
      if (!speech.available || !text) return false;
      try {
        synth.cancel();
        var u = new root.SpeechSynthesisUtterance(String(text));
        u.lang = voice ? voice.lang : 'en-US';
        if (voice) u.voice = voice;
        u.rate = (opts && opts.slow) ? 0.7 : 0.95;
        synth.speak(u);
        return true;
      } catch (e) { return false; }
    },
    stop: function () { try { synth && synth.cancel(); } catch (e) {} }
  };

  // ---------- רטט ----------
  var haptics = {
    tap: function (kind) {
      try {
        var ua = root.navigator.userActivation;
        if (root.navigator.vibrate && (!ua || ua.hasBeenActive)) root.navigator.vibrate(kind === 'error' ? [30, 40, 30] : 15);
      } catch (e) {}
    }
  };

  // ---------- התקנה ----------
  var deferred = null, listeners = [];
  function notify() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  try {
    root.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; notify(); });
    root.addEventListener('appinstalled', function () { deferred = null; notify(); });
  } catch (e) {}
  var ua = (root.navigator && root.navigator.userAgent) || '';
  var install = {
    isStandalone: function () {
      try { return root.matchMedia('(display-mode: standalone)').matches || root.navigator.standalone === true; } catch (e) { return false; }
    },
    isIOS: /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in root.document),
    canPrompt: function () { return !!deferred; },
    prompt: function () {
      if (!deferred) return Promise.resolve(false);
      var d = deferred; deferred = null;
      return d.prompt().then(function () { return d.userChoice; }).then(function (c) { notify(); return c && c.outcome === 'accepted'; }, function () { return false; });
    },
    onChange: function (f) { listeners.push(f); }
  };

  // ---------- עבודה בלי רשת ----------
  // ה-service worker של כל האתר (../sw.js) כבר שומר את הערכה. רושמים אותו גם מכאן, למי שנכנס ישר לערכה.
  try {
    if ('serviceWorker' in root.navigator && /^http/.test(root.location.protocol)) {
      root.addEventListener('load', function () { root.navigator.serviceWorker.register('../sw.js').catch(function () {}); });
    }
  } catch (e) {}

  // ---------- קבצים ----------
  // הורדת קובץ (גיבוי). באפליקציה (Capacitor) מחליפים ב-Filesystem + Share.
  var files = {
    save: function (name, text) {
      try {
        var blob = new root.Blob([text], { type: 'application/json' });
        var url = root.URL.createObjectURL(blob), a = root.document.createElement('a');
        a.href = url; a.download = name; root.document.body.appendChild(a); a.click(); a.remove();
        root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 4000);
        return true;
      } catch (e) { return false; }
    }
  };

  root.Platform = { storage: storage, speech: speech, haptics: haptics, install: install, files: files };
})(window);
