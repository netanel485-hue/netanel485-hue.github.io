/* שמירה בענן עם "קוד משפחה" (13/11/2026).
   בלי חשבון גוגל ובלי מייל: מכשיר ראשון יוצר קוד, ושאר המכשירים מקלידים אותו ורואים את אותה התקדמות.
   מה נשמר: רק מה שהאתר כבר שומר במכשיר (localStorage) — פרופילים, מטבעות, רמות ונקודת עצירה.
   בענן הקוד עצמו לא נשמר, רק "טביעת אצבע" שלו (SHA-256), כך שאי אפשר לנחש משפחות.
   הקובץ נטען כ-module. אם הוא נכשל (בלי אינטרנט, חסימה) — האתר ממשיך לעבוד כרגיל במכשיר.
   שימוש: <script type="module" src="../shared/cloud.js"></script> */
const SDK = 'https://www.gstatic.com/firebasejs/13.3.0/';
const CONFIG = {
  apiKey: 'AIzaSyCUsXagtqYebZKt20-apPgjFlLoN3Sdv0Q',
  authDomain: 'learning-hubs.firebaseapp.com',
  projectId: 'learning-hubs',
  storageBucket: 'learning-hubs.firebasestorage.app',
  messagingSenderId: '93127719780',
  appId: '1:93127719780:web:dd7d543d0cf3c1689fd871'
};
const LS = window.localStorage;
const K_CODE = 'cloud.family', K_META = 'cloud.meta', K_LAST = 'cloud.lastSync';
const MAX = 900000;                       // מגבלת גודל לערך אחד בענן
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // בלי O/0/I/1/L שמתבלבלים

// ---- מצב מקומי ----
const raw = {set: Storage.prototype.setItem, remove: Storage.prototype.removeItem};
function own(k) { return typeof k === 'string' && !k.startsWith('cloud.') && !k.startsWith('firebase'); }
function meta() { try { return JSON.parse(LS.getItem(K_META) || '{}') || {}; } catch (e) { return {}; } }
function saveMeta(m) { try { raw.set.call(LS, K_META, JSON.stringify(m)); } catch (e) {} }
function code() { try { return LS.getItem(K_CODE) || ''; } catch (e) { return ''; } }
const dirty = new Set();
let timer = null, api = null, pulling = false;

// כל שינוי ב-localStorage של האתר מסומן לשליחה (עם זמן השינוי)
Storage.prototype.setItem = function (k, v) {
  raw.set.call(this, k, v);
  if (this === LS && own(k) && !pulling) { const m = meta(); m[k] = Date.now(); saveMeta(m); dirty.add(k); schedule(); }
};
Storage.prototype.removeItem = function (k) {
  raw.remove.call(this, k);
  if (this === LS && own(k) && !pulling) { const m = meta(); m[k] = Date.now(); saveMeta(m); dirty.add(k); schedule(); }
};
function schedule() { if (!code()) return; clearTimeout(timer); timer = setTimeout(() => push().catch(() => {}), 2500); }

// ---- עזר ----
function newCode() {
  const b = new Uint8Array(10); crypto.getRandomValues(b);
  const s = Array.from(b, x => ABC[x % ABC.length]).join('');
  return s.slice(0, 5) + '-' + s.slice(5);
}
function norm(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function pretty(c) { const n = norm(c); return n.length === 10 ? n.slice(0, 5) + '-' + n.slice(5) : n; }
async function familyId(c) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('learning-hubs:' + norm(c)));
  return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
}
const enc = k => encodeURIComponent(k).replace(/\./g, '%2E');
const dec = id => decodeURIComponent(id);
function emit(state, extra) { try { window.dispatchEvent(new CustomEvent('lhcloud', {detail: Object.assign({state, code: pretty(code())}, extra || {})})); } catch (e) {} }

// ---- Firebase (נטען רק כשיש קוד משפחה או כשמבקשים ליצור/להצטרף) ----
async function connect() {
  if (api) return api;
  const [{initializeApp}, auth, fs] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore-lite.js')]);
  const app = initializeApp(CONFIG);
  const a = auth.getAuth(app);
  if (!a.currentUser) await auth.signInAnonymously(a);
  api = {db: fs.getFirestore(app), fs};
  return api;
}
async function col() { const {db, fs} = await connect(); return fs.collection(db, 'families', await familyId(code()), 'keys'); }

// שליחת השינויים המקומיים
async function push(all) {
  if (!code() || !navigator.onLine) return;
  const {db, fs} = await connect(); const c = await col(); const m = meta();
  const keys = all ? Object.keys(localStorage).filter(own) : Array.from(dirty);
  if (!keys.length) return;
  for (let i = 0; i < keys.length; i += 400) {
    const b = fs.writeBatch(db);
    keys.slice(i, i + 400).forEach(k => {
      const v = LS.getItem(k), ref = fs.doc(c, enc(k));
      if (v === null) b.delete(ref);
      else if (v.length <= MAX) b.set(ref, {v, t: m[k] || Date.now()});
    });
    await b.commit();
  }
  keys.forEach(k => dirty.delete(k));
  raw.set.call(LS, K_LAST, String(Date.now())); emit('saved');
}

// משיכה מהענן: לכל מפתח, הגרסה החדשה יותר מנצחת. remoteWins=true כשמצטרפים ממכשיר חדש.
async function pull(remoteWins) {
  if (!code() || !navigator.onLine) return 0;
  const {fs} = await connect(); const snap = await fs.getDocs(await col());
  const m = meta(), seen = new Set(); let changed = 0;
  pulling = true;
  try {
    snap.forEach(d => {
      const k = dec(d.id), r = d.data(); seen.add(k);
      if (!own(k) || typeof r.v !== 'string') return;
      const localT = remoteWins ? 0 : (m[k] || 0);
      if (r.t > localT) { if (LS.getItem(k) !== r.v) { raw.set.call(LS, k, r.v); changed++; } m[k] = r.t; }
      else if (r.t < localT) dirty.add(k);
    });
    Object.keys(localStorage).filter(own).forEach(k => { if (!seen.has(k)) dirty.add(k); });
  } finally { pulling = false; }
  saveMeta(m);
  if (dirty.size) await push();
  raw.set.call(LS, K_LAST, String(Date.now()));
  return changed;
}

async function sync(remoteWins) {
  emit('syncing');
  try {
    const changed = await pull(remoteWins);
    emit('saved', {changed});
    // המרכזים קוראים את ההתקדמות בעלייה; אם הגיע משהו חדש — טוענים מחדש פעם אחת
    const home = location.pathname === '/' || location.pathname === '/index.html';
    if (changed && !home && !sessionStorage.getItem('cloud.reloaded')) { sessionStorage.setItem('cloud.reloaded', '1'); location.reload(); }
    return changed;
  } catch (e) { emit('error', {message: String(e && e.message || e)}); throw e; }
}

// ---- API לדף הבית ----
window.LHCloud = {
  code: () => pretty(code()),
  lastSync: () => +(LS.getItem(K_LAST) || 0),
  async create() {
    const c = newCode(); raw.set.call(LS, K_CODE, c);
    const m = meta(), now = Date.now(); Object.keys(localStorage).filter(own).forEach(k => { m[k] = m[k] || now; }); saveMeta(m);
    try { await connect(); await push(true); emit('saved'); }
    catch (e) { raw.remove.call(LS, K_CODE); emit('error', {message: String(e && e.message || e)}); throw e; }
    return pretty(c);
  },
  async join(c) {
    if (norm(c).length !== 10) throw new Error('bad-code');
    const prev = code(); raw.set.call(LS, K_CODE, norm(c));
    try {
      const {fs} = await connect(); const snap = await fs.getDocs(await col());
      if (snap.empty) { if (prev) raw.set.call(LS, K_CODE, prev); else raw.remove.call(LS, K_CODE); throw new Error('not-found'); }
      return await sync(true);
    } catch (e) { if (e.message !== 'not-found') emit('error', {message: String(e && e.message || e)}); throw e; }
  },
  leave() { raw.remove.call(LS, K_CODE); raw.remove.call(LS, K_LAST); emit('off'); },
  sync: () => sync(false)
};

// ---- הפעלה ----
try {
  if (code()) {
    sync(false).catch(() => {});
    addEventListener('online', () => sync(false).catch(() => {}));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty.size) push().catch(() => {}); });
    addEventListener('pagehide', () => { if (dirty.size) push().catch(() => {}); });
  } else emit('off');
} catch (e) {}
window.dispatchEvent(new Event('lhcloud-ready'));
