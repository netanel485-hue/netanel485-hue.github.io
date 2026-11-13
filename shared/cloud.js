/* שמירה בענן עם "קוד משפחה" (13/11/2026).
   בלי חשבון גוגל ובלי מייל: כל מכשיר מתחיל לשמור בענן לבד (קוד נוצר בשקט).
   כדי לחבר מכשיר נוסף שולחים קישור (#join=CODE) בוואטסאפ או סורקים ברקוד בדף הבית.
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
const K_CODE = 'cloud.family', K_META = 'cloud.meta', K_LAST = 'cloud.lastSync', K_NAME = 'cloud.loginName';
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
function norm(c) {
  const t = String(c || ''); const m = t.match(/join=([A-Za-z0-9-]+)/);
  return (m ? m[1] : t).toUpperCase().replace(/[^A-Z0-9]/g, '');
}
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
function cleanName(n) { return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
async function aliasRef(name, pw) {
  const n = cleanName(name), p = String(pw || '');
  if (n.length < 2) throw new Error('bad-name');
  if (p.length < 6) throw new Error('bad-password');
  const {db, fs} = await connect();
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('learning-hubs:login:' + n + '\n' + p));
  const id = Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
  return fs.doc(db, 'families', id, 'keys', 'cloud.alias');
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
  // שם משפחה + סיסמה: "כינוי" לקוד המשפחה. בענן נשמר מסמך מצביע תחת טביעת אצבע של השם והסיסמה יחד.
  loginName: () => LS.getItem(K_NAME) || '',
  async login(name, pw) {
    const ref = await aliasRef(name, pw); const {fs} = await connect();
    const d = await fs.getDoc(ref);
    if (!d.exists() || typeof d.data().v !== 'string') throw new Error('login-not-found');
    if (norm(d.data().v) === norm(code())) { raw.set.call(LS, K_NAME, cleanName(name)); emit('saved'); return 0; }
    const n = await this.join(d.data().v); raw.set.call(LS, K_NAME, cleanName(name)); return n;
  },
  async setLogin(name, pw) {
    if (!code()) await this.create();
    const ref = await aliasRef(name, pw); const {fs} = await connect();
    const d = await fs.getDoc(ref);
    if (d.exists() && norm(d.data().v) !== norm(code())) throw new Error('login-taken');
    await fs.setDoc(ref, {v: norm(code()), t: Date.now()});
    raw.set.call(LS, K_NAME, cleanName(name)); emit('saved');
  },
  link: () => code() ? ((location.origin && location.origin !== 'null') ? location.origin : 'https://netanel485-hue.github.io') + '/#join=' + pretty(code()) : '',
  pendingJoin: () => { const m = location.hash.match(/join=([A-Za-z0-9-]+)/); return m ? norm(m[1]) : ''; },
  sameFamily: c => norm(c) === norm(code()),
  hasLocalData: () => Object.keys(localStorage).some(own),
  leave() { raw.remove.call(LS, K_CODE); raw.remove.call(LS, K_LAST); raw.remove.call(LS, K_NAME); emit('off'); },
  sync: () => sync(false)
};

// ---- הפעלה ----
// אין קוד? יוצרים אחד בשקט — השמירה בענן מתחילה לבד. קישור הצטרפות (#join=) מטופל בדף הבית.
function hooks() {
  addEventListener('online', () => sync(false).catch(() => {}));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty.size) push().catch(() => {}); });
  addEventListener('pagehide', () => { if (dirty.size) push().catch(() => {}); });
}
try {
  const joining = /join=/.test(location.hash);
  if (code()) { if (!joining) sync(false).catch(() => {}); hooks(); }
  else if (!joining && navigator.onLine) { window.LHCloud.create().then(hooks, () => emit('off')); }
  else emit('off');
} catch (e) {}
window.dispatchEvent(new Event('lhcloud-ready'));
