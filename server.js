// ¡Vamos! — Spanish & French courses for Hebrew speakers. Zero-dependency Node server.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC = path.join(__dirname, 'public');
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const TZ = process.env.TZ_NAME || 'Asia/Jerusalem';
const WA = {
  token: process.env.WA_TOKEN || '',
  phoneId: process.env.WA_PHONE_ID || '',
  template: process.env.WA_TEMPLATE || 'vamos_reminder',
  lang: process.env.WA_LANG || 'he',
  time: process.env.REMINDER_TIME || '15:30',
  until: process.env.REMINDER_UNTIL || '21:00',
  params: (process.env.WA_PARAMS || 'name').split(',').map((x) => x.trim()).filter(Boolean),
};
// Spanish progress lives at the top level of the user record (as it always has);
// other courses live under user.courses[code].
const COURSES = ['es', 'fr'];
const courseOf = (b) => (COURSES.includes(b && b.course) ? b.course : 'es');
function cdata(u, c) {
  if (c === 'es') return u;
  u.courses = u.courses || {};
  return (u.courses[c] = u.courses[c] || { lessons: {}, attempts: {}, mistakes: {}, fixed: 0, flashcards: 0 });
}
function allLessons(u) {
  return [u.lessons].concat(Object.values(u.courses || {}).map((c) => c.lessons)).flatMap((l) => Object.values(l || {}));
}
function allFinished(u) {
  const counts = [Object.keys(u.lessons).length].concat(Object.values(u.courses || {}).map((c) => Object.keys(c.lessons).length));
  const started = counts.filter((n) => n > 0);
  return started.length > 0 && started.every((n) => n >= 30);
}

// ---------- Well-Being course (private, parent-approved accounts only) ----------
// The Hebrew translation is kept encrypted in the repo; the key lives only in the server DB (db.settings.wbKey).
const wbCache = {};
function wbContent(m) {
  m = String(Number(m) || 1);
  if (wbCache[m]) return wbCache[m];
  const key = db.settings && db.settings.wbKey;
  const file = path.join(__dirname, 'content-private', `wb${m}.enc`);
  if (!key || !fs.existsSync(file)) return null;
  try {
    const raw = Buffer.from(fs.readFileSync(file, 'utf8'), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    wbCache[m] = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
    return wbCache[m];
  } catch (e) { console.error('wb decrypt', e.message); return null; }
}
const wbModules = () => fs.readdirSync(path.join(__dirname, 'content-private')).map((f) => (f.match(/^wb(\d+)\.enc$/) || [])[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
// PERMA-Profiler (Butler & Kern, 2016) scoring, item numbers 1..23
const PERMA_SCALES = {
  P: [3, 13, 22], E: [2, 10, 17], R: [8, 19, 21], M: [7, 9, 20], A: [1, 5, 15],
  N: [4, 14, 16], H: [6, 12, 18], Lon: [11],
  overall: [1, 2, 3, 5, 7, 8, 9, 10, 13, 15, 17, 19, 20, 21, 22, 23],
};
function permaScores(ans) {
  const out = {};
  for (const [k, items] of Object.entries(PERMA_SCALES)) {
    out[k] = Math.round(items.reduce((s, i) => s + ans[i], 0) / items.length * 100) / 100;
  }
  out.Hap = ans[23];
  return out;
}
// ---------- course passwords ----------
// A course with a password stays locked until the user types it once (u.unlocked[course] = true).
// The well-being course ('wb') is locked until a password is set (or the user was approved earlier).
const ALL_COURSES = ['es', 'fr', 'wb'];
const pwHash = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const coursePw = (c) => (db.settings.coursePw || {})[c] || null;
const courseOpen = (c) => !!((db.settings.courseOpen || {})[c]);
// wb is closed by default; removing its password in the parent area opens it to everyone (courseOpen), until closed again.
const courseLocked = (u, c) => { if ((u.unlocked || {})[c]) return false; if (coursePw(c)) return true; return c === 'wb' && !courseOpen(c); };
const lockMap = (u) => Object.fromEntries(ALL_COURSES.map((c) => [c, courseLocked(u, c) ? (coursePw(c) ? 'password' : 'closed') : 'open']));
const unlockTries = {};
const wbOf = (u) => (u.wb = u.wb || { read: {}, perma: [], strengths: [], strengthDays: [] });

fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { users: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) {}
if (!db.users) db.users = {};
if (!db.reminders) db.reminders = { sent: {}, log: [] };
if (!db.settings) db.settings = {};
// migrate: accounts approved for the well-being course before passwords existed stay unlocked
for (const u of Object.values(db.users)) if (u.wbAccess) { u.unlocked = u.unlocked || {}; u.unlocked.wb = true; delete u.wbAccess; }
// one-off (parent's request, Nov 2026): only the parent's account keeps well-being access
if (!db.settings.migWbParentOnly) { for (const u of Object.values(db.users)) if (u.email !== 'lahav2000@gmail.com' && u.unlocked) delete u.unlocked.wb; db.settings.migWbParentOnly = true; }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 200);
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const normEmail = (e) => String(e || '').trim().toLowerCase();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function newUser(email, name) {
  return {
    email, name: String(name || '').slice(0, 40), createdAt: new Date().toISOString(),
    lessons: {},        // lessonId -> { completedAt, date }
    attempts: {},       // lessonId -> [{ at, date, score, total, wrong:[qid] }]
    mistakes: {},       // qid -> { lessonId, at }
    fixed: 0,           // mistakes later answered correctly
    flashcards: 0,      // flashcard sessions finished
    activeDates: [],    // YYYY-MM-DD days with activity
  };
}

function publicUser(u) { return Object.assign({}, u, { locks: lockMap(u) }); }

function pinOk(pin) {
  const a = Buffer.from(String(pin || '')), b = Buffer.from(ADMIN_PIN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}

function getUser(req) {
  const email = normEmail(req.headers['x-user-email']);
  return db.users[email] || null;
}

function markActive(u, date) {
  if (DATE_RE.test(date || '') && !u.activeDates.includes(date)) {
    u.activeDates.push(date);
    u.activeDates.sort();
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': p === '/index.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(buf);
  });
}

async function api(req, res, url) {
  const route = url.pathname;
  const method = req.method;
  let body = {};
  if (method === 'POST') {
    try { body = await readBody(req); } catch (_) { return send(res, 400, { error: 'bad json' }); }
  }

  if (route === '/api/signup' && method === 'POST') {
    const email = normEmail(body.email);
    const name = String(body.name || '').trim().slice(0, 40);
    if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'invalid email' });
    if (!name) return send(res, 400, { error: 'missing name' });
    if (db.users[email]) return send(res, 409, { error: 'exists' });
    db.users[email] = newUser(email, name); save();
    return send(res, 200, { user: publicUser(db.users[email]) });
  }

  if (route === '/api/login' && method === 'POST') {
    const email = normEmail(body.email);
    if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'invalid email' });
    const u = db.users[email];
    if (!u) return send(res, 404, { error: 'not registered' });
    return send(res, 200, { user: publicUser(u) });
  }

  // reminder check: is today's lesson done? (Israel time). Auth: X-Admin-Pin header or ?pin=
  if (route === '/api/admin/status' && method === 'GET') {
    if (!pinOk(req.headers['x-admin-pin'] || url.searchParams.get('pin'))) return send(res, 403, { error: 'bad pin' });
    const tz = process.env.TZ_NAME || 'Asia/Jerusalem';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const list = Object.values(db.users)
      .filter((u) => !url.searchParams.get('email') || u.email === normEmail(url.searchParams.get('email')))
      .map((u) => {
        const doneToday = allLessons(u).some((l) => l.date === today || (l.completedAt && new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(l.completedAt)) === today));
        const count = Object.keys(u.lessons).length;
        const fr = (u.courses && u.courses.fr) ? Object.keys(u.courses.fr.lessons).length : 0;
        return { email: u.email, name: u.name, today, doneToday, lessonsDone: count, frenchDone: fr, finished: allFinished(u), nextLesson: count >= 30 ? null : count + 1 };
      });
    return send(res, 200, { today, users: list });
  }

  if (route === '/api/admin/users' && method === 'GET') {
    if (!pinOk(req.headers['x-admin-pin'])) return send(res, 403, { error: 'bad pin' });
    return send(res, 200, { users: Object.values(db.users).map(publicUser) });
  }

  if (route === '/api/admin/course-passwords' && method === 'GET') {
    if (!pinOk(req.headers['x-admin-pin'])) return send(res, 403, { error: 'bad pin' });
    return send(res, 200, { courses: Object.fromEntries(ALL_COURSES.map((c) => [c, !!coursePw(c)])), open: Object.fromEntries(ALL_COURSES.map((c) => [c, courseOpen(c)])) });
  }
  if (route === '/api/admin/delete-user' && method === 'POST') {
    if (!pinOk(req.headers['x-admin-pin'])) return send(res, 403, { error: 'bad pin' });
    const em = normEmail(body.email);
    if (!db.users[em]) return send(res, 404, { error: 'not found' });
    delete db.users[em]; save(); return send(res, 200, { ok: true });
  }
  if (route === '/api/admin/course-access' && method === 'POST') {
    if (!pinOk(req.headers['x-admin-pin'])) return send(res, 403, { error: 'bad pin' });
    const t = db.users[normEmail(body.email)];
    if (!t || !ALL_COURSES.includes(body.course)) return send(res, 400, { error: 'bad request' });
    t.unlocked = t.unlocked || {};
    if (body.on) t.unlocked[body.course] = true; else delete t.unlocked[body.course];
    save(); return send(res, 200, { ok: true });
  }
  if (route === '/api/admin/course-password' && method === 'POST') {
    if (!pinOk(req.headers['x-admin-pin'])) return send(res, 403, { error: 'bad pin' });
    if (!ALL_COURSES.includes(body.course)) return send(res, 400, { error: 'bad course' });
    db.settings.coursePw = db.settings.coursePw || {};
    const pw = String(body.password || '').trim();
    db.settings.courseOpen = db.settings.courseOpen || {};
    if (body.close) { delete db.settings.coursePw[body.course]; delete db.settings.courseOpen[body.course]; save(); return send(res, 200, { ok: true, set: false, closed: true }); }
    if (!pw) { delete db.settings.coursePw[body.course]; db.settings.courseOpen[body.course] = true; }
    else { const salt = crypto.randomBytes(16).toString('hex'); db.settings.coursePw[body.course] = { salt, hash: pwHash(pw, salt) }; delete db.settings.courseOpen[body.course]; }
    save();
    return send(res, 200, { ok: true, set: !!pw });
  }
  if (route === '/api/admin/wb-key' && method === 'POST') {
    if (!pinOk(req.headers['x-admin-pin'])) return send(res, 403, { error: 'bad pin' });
    if (!/^[0-9a-f]{64}$/.test(String(body.key || ''))) return send(res, 400, { error: 'bad key' });
    db.settings.wbKey = body.key; Object.keys(wbCache).forEach((k) => delete wbCache[k]); save();
    return send(res, 200, { ok: !!wbContent(1) });
  }

  if (route.startsWith('/api/admin/') && method === 'POST') {
    if (!pinOk(req.headers['x-admin-pin'])) return send(res, 403, { error: 'bad pin' });
    const t = db.users[normEmail(body.email)];
    if (!t) return send(res, 404, { error: 'no such user' });
    if (route === '/api/admin/phone') {
      const digits = String(body.phone || '').replace(/\D/g, '').replace(/^0/, '972');
      t.phone = digits.length >= 9 ? digits : '';
      t.remindersOff = !!body.off; save();
      return send(res, 200, { user: t });
    }
    if (route === '/api/admin/remind-test') {
      return send(res, 200, await sendWhatsApp(t, body.template));
    }
  }
  if (route === '/api/wa-status' && method === 'GET') {
    // minimal health check (no secrets): is the WhatsApp token accepted by Meta?
    if (!WA.token || !WA.phoneId) return send(res, 200, { configured: false });
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${WA.phoneId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`, { headers: { Authorization: `Bearer ${WA.token}` } });
      const d = await r.json().catch(() => ({}));
      return send(res, 200, r.ok ? { configured: true, tokenOk: true, number: d.display_phone_number, name: d.verified_name, quality: d.quality_rating, template: WA.template, lang: WA.lang, params: WA.params }
        : { configured: true, tokenOk: false, error: d.error && { code: d.error.code, subcode: d.error.error_subcode, type: d.error.type, message: d.error.message } });
    } catch (e) { return send(res, 200, { configured: true, tokenOk: false, error: String(e.message || e) }); }
  }
  if (route === '/api/admin/reminders' && method === 'GET') {
    if (!pinOk(req.headers['x-admin-pin'])) return send(res, 403, { error: 'bad pin' });
    return send(res, 200, { configured: !!(WA.token && WA.phoneId), time: WA.time, template: WA.template, now: tzNow(), sent: db.reminders.sent, log: db.reminders.log });
  }

  const u = getUser(req);
  if (!u) return send(res, 401, { error: 'not logged in' });

  if (route === '/api/unlock' && method === 'POST') {
    const c = body.course; const pw = coursePw(c);
    if (!ALL_COURSES.includes(c) || !pw) return send(res, 400, { error: 'no password for this course' });
    const t = unlockTries[u.email] = (unlockTries[u.email] || []).filter((x) => Date.now() - x < 3600e3);
    if (t.length >= 10) return send(res, 429, { error: 'too many tries' });
    const ok = crypto.timingSafeEqual(Buffer.from(pwHash(String(body.password || '').trim(), pw.salt), 'hex'), Buffer.from(pw.hash, 'hex'));
    if (!ok) { t.push(Date.now()); return send(res, 403, { error: 'wrong password' }); }
    u.unlocked = u.unlocked || {}; u.unlocked[c] = true; save();
    return send(res, 200, { user: publicUser(u) });
  }

  if (route === '/api/me' && method === 'GET') return send(res, 200, { user: publicUser(u) });

  if (route === '/api/name' && method === 'POST') {
    u.name = String(body.name || '').trim().slice(0, 40); save();
    return send(res, 200, { user: publicUser(u) });
  }

  if (route === '/api/lesson-complete' && method === 'POST') {
    const id = Number(body.lessonId);
    if (!(id >= 1 && id <= 30)) return send(res, 400, { error: 'bad lesson' });
    const d = cdata(u, courseOf(body));
    if (!d.lessons[id]) d.lessons[id] = { completedAt: new Date().toISOString(), date: DATE_RE.test(body.date) ? body.date : null };
    markActive(u, body.date); save();
    return send(res, 200, { user: publicUser(u) });
  }

  if (route === '/api/quiz-attempt' && method === 'POST') {
    const isMistakes = body.mode === 'mistakes';
    const id = isMistakes ? 'mistakes' : Number(body.lessonId);
    if (!isMistakes && !(id >= 1 && id <= 30)) return send(res, 400, { error: 'bad lesson' });
    const d = cdata(u, courseOf(body));
    const results = Array.isArray(body.results) ? body.results.slice(0, 60) : [];
    const wrong = [];
    const picked = {};
    let score = 0;
    for (const r of results) {
      const qid = String(r.qid || '').slice(0, 40);
      if (!qid) continue;
      if (r.correct) {
        score++;
        if (d.mistakes[qid]) { delete d.mistakes[qid]; d.fixed++; }
      } else {
        wrong.push(qid);
        picked[qid] = String(r.picked || '').slice(0, 120);
        d.mistakes[qid] = { lessonId: Number(r.lessonId) || Number(id) || 0, at: new Date().toISOString() };
      }
    }
    (d.attempts[id] = d.attempts[id] || []).push({
      at: new Date().toISOString(), date: DATE_RE.test(body.date) ? body.date : null,
      score, total: results.length, wrong, picked,
      mode: ['mistakes', 'lesson', 'retake'].includes(body.mode) ? body.mode : 'quiz',
    });
    markActive(u, body.date); save();
    return send(res, 200, { user: publicUser(u) });
  }

  if (route.startsWith('/api/wb/')) {
    if (courseLocked(u, 'wb')) return send(res, 403, { error: 'locked' });
    const w = wbOf(u);
    if (route === '/api/wb/modules' && method === 'GET') {
      return send(res, 200, { modules: wbModules().map((m) => { const c = wbContent(m); return c ? { module: m, title: c.moduleTitle, sections: c.sections.map((x) => x.id) } : null; }).filter(Boolean) });
    }
    if (route === '/api/wb/content' && method === 'GET') {
      const c = wbContent(url.searchParams.get('m') || 1);
      return c ? send(res, 200, { content: c }) : send(res, 503, { error: 'content unavailable' });
    }
    if (route === '/api/wb/health' && method === 'POST') {
      if (!DATE_RE.test(body.date || '')) return send(res, 400, { error: 'bad date' });
      w.health = w.health || {};
      const act = String(body.act || '').trim().slice(0, 300);
      const min = Math.max(0, Math.min(600, Math.round(Number(body.min) || 0)));
      const sleep = Math.max(0, Math.min(16, Math.round((Number(body.sleep) || 0) * 2) / 2));
      if (!act && !min && !sleep) delete w.health[body.date]; else w.health[body.date] = { act, min, sleep, at: new Date().toISOString() };
      markActive(u, body.date); save();
      return send(res, 200, { user: publicUser(u) });
    }
    if (route === '/api/wb/medit' && method === 'POST') {
      if (body.letter) {
        w.letter = { to: String(body.letter.to || '').trim().slice(0, 100), done: !!body.letter.done, at: new Date().toISOString() };
        save(); return send(res, 200, { user: publicUser(u) });
      }
      if (!DATE_RE.test(body.date || '')) return send(res, 400, { error: 'bad date' });
      w.medit = w.medit || {};
      const min = Math.max(0, Math.min(300, Math.round(Number(body.min) || 0)));
      const feel = String(body.feel || '').trim().slice(0, 300);
      if (!min && !feel) delete w.medit[body.date]; else w.medit[body.date] = { min, feel, at: new Date().toISOString() };
      markActive(u, body.date); save();
      return send(res, 200, { user: publicUser(u) });
    }
    if (route === '/api/wb/challenge' && method === 'POST') {
      const c = w.challenge = w.challenge || { days: {} };
      const t = (v, n) => String(v || '').trim().slice(0, n);
      if (body.setup) {
        const HAB = ['strengths', 'savor', 'grat', 'kind', 'social', 'move', 'sleep', 'medit'];
        if (!HAB.includes(body.setup.habit)) return send(res, 400, { error: 'bad habit' });
        c.habit = body.setup.habit;
        c.woop = { w: t(body.setup.w, 200), o: t(body.setup.o, 200), ob: t(body.setup.ob, 200), p: t(body.setup.p, 200) };
        c.told = t(body.setup.told, 100);
        if (!c.start) c.start = DATE_RE.test(body.setup.start || '') ? body.setup.start : new Date().toISOString().slice(0, 10);
      }
      if (body.day) {
        if (!DATE_RE.test(body.day.date || '')) return send(res, 400, { error: 'bad date' });
        if (body.day.done) c.days[body.day.date] = true; else delete c.days[body.day.date];
        markActive(u, body.day.date);
      }
      if (body.reflect) c.reflect = { why: t(body.reflect.why, 600), how: t(body.reflect.how, 600), exp: t(body.reflect.exp, 1000), at: new Date().toISOString() };
      if (body.reset) w.challenge = { days: {} };
      save();
      return send(res, 200, { user: publicUser(u) });
    }
    if (route === '/api/wb/kindlog' && method === 'POST') {
      if (!DATE_RE.test(body.date || '')) return send(res, 400, { error: 'bad date' });
      w.kindlog = w.kindlog || {};
      const kind = String(body.kind || '').trim().slice(0, 500), conn = String(body.conn || '').trim().slice(0, 500);
      if (!kind && !conn) delete w.kindlog[body.date]; else w.kindlog[body.date] = { kind, conn, at: new Date().toISOString() };
      markActive(u, body.date); save();
      return send(res, 200, { user: publicUser(u) });
    }
    if (route === '/api/wb/quiz' && method === 'POST') {
      const m = String(Number(body.m) || 0), score = Number(body.score), total = Number(body.total);
      if (!wbContent(m) || !(total > 0 && score >= 0 && score <= total)) return send(res, 400, { error: 'bad quiz' });
      w.quiz = w.quiz || {}; (w.quiz[m] = w.quiz[m] || []).push({ at: new Date().toISOString(), date: DATE_RE.test(body.date) ? body.date : null, score, total, wrong: (Array.isArray(body.wrong) ? body.wrong : []).map(Number).slice(0, 50) });
      markActive(u, body.date); save();
      return send(res, 200, { user: publicUser(u) });
    }
    if (route === '/api/wb/journal' && method === 'POST') {
      if (!DATE_RE.test(body.date || '')) return send(res, 400, { error: 'bad date' });
      w.journal = w.journal || {};
      const savor = String(body.savor || '').trim().slice(0, 500);
      const grat = (Array.isArray(body.grat) ? body.grat : []).map((x) => String(x || '').trim().slice(0, 200)).slice(0, 5);
      if (!savor && !grat.some(Boolean)) delete w.journal[body.date];
      else w.journal[body.date] = { savor, grat, at: new Date().toISOString() };
      markActive(u, body.date); save();
      return send(res, 200, { user: publicUser(u) });
    }
    if (route === '/api/wb/read' && method === 'POST') {
      const sid = String(body.sid || '').slice(0, 40);
      if (!sid) return send(res, 400, { error: 'bad section' });
      if (!w.read[sid]) w.read[sid] = DATE_RE.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);
      markActive(u, body.date); save();
      return send(res, 200, { user: publicUser(u) });
    }
    if (route === '/api/wb/perma' && method === 'POST') {
      const a = body.answers || {}; const ans = {};
      for (let i = 1; i <= 23; i++) {
        const v = Number(a[i]);
        if (!(Number.isInteger(v) && v >= 0 && v <= 10)) return send(res, 400, { error: 'missing answer ' + i });
        ans[i] = v;
      }
      const phase = body.phase === 'post' ? 'post' : 'pre';
      w.perma.push({ at: new Date().toISOString(), date: DATE_RE.test(body.date) ? body.date : null, phase, answers: ans, scores: permaScores(ans) });
      markActive(u, body.date); save();
      return send(res, 200, { user: publicUser(u) });
    }
    if (route === '/api/wb/strengths' && method === 'POST') {
      w.strengths = (Array.isArray(body.top) ? body.top : []).map((x) => String(x).slice(0, 40)).slice(0, 5);
      w.strengthsAt = new Date().toISOString(); save();
      return send(res, 200, { user: publicUser(u) });
    }
    if (route === '/api/wb/strength-day' && method === 'POST') {
      if (!DATE_RE.test(body.date || '')) return send(res, 400, { error: 'bad date' });
      const i = w.strengthDays.indexOf(body.date);
      if (i >= 0) w.strengthDays.splice(i, 1); else w.strengthDays.push(body.date);
      w.strengthDays.sort(); markActive(u, body.date); save();
      return send(res, 200, { user: publicUser(u) });
    }
    return send(res, 404, { error: 'not found' });
  }

  if (route === '/api/flashcards-done' && method === 'POST') {
    cdata(u, courseOf(body)).flashcards++; markActive(u, body.date); save();
    return send(res, 200, { user: publicUser(u) });
  }

  return send(res, 404, { error: 'not found' });
}


// ---------- WhatsApp reminders ----------
function tzNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` };
}
function lessonDoneOn(u, date) {
  return allLessons(u).some((l) => l.date === date || (l.completedAt && new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(l.completedAt)) === date));
}
function logReminder(entry) {
  db.reminders.log.unshift(Object.assign({ at: new Date().toISOString() }, entry));
  db.reminders.log = db.reminders.log.slice(0, 60); save();
}
async function sendWhatsApp(u, template) {
  if (!WA.token || !WA.phoneId) return { ok: false, error: 'WhatsApp is not configured' };
  if (!u.phone) return { ok: false, error: 'no phone number' };
  const tpl = template || WA.template;
  const count = Object.keys(u.lessons).length;
  const values = { name: u.name || 'שלום', day: String(Math.min(count + 1, 30)) };
  const body = tpl === 'hello_world'
    ? { name: 'hello_world', language: { code: 'en_US' } }
    : { name: tpl, language: { code: WA.lang }, components: WA.params.length ? [{ type: 'body', parameters: WA.params.map((k) => ({ type: 'text', text: values[k] || '' })) }] : [] };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${WA.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: u.phone, type: 'template', template: body }),
    });
    const data = await r.json().catch(() => ({}));
    const res = r.ok ? { ok: true, id: data.messages && data.messages[0] && data.messages[0].id } : { ok: false, error: (data.error && data.error.message) || `HTTP ${r.status}` };
    logReminder({ email: u.email, template: tpl, ok: res.ok, error: res.error || null });
    return res;
  } catch (e) {
    logReminder({ email: u.email, template: tpl, ok: false, error: String(e.message || e) });
    return { ok: false, error: String(e.message || e) };
  }
}
async function reminderTick() {
  const { date, hm } = tzNow();
  if (hm < WA.time || hm >= WA.until) return;
  const sent = db.reminders.sent[date] = db.reminders.sent[date] || {};
  for (const u of Object.values(db.users)) {
    if (!u.phone || u.remindersOff || sent[u.email]) continue;
    if (allFinished(u)) continue;
    sent[u.email] = 'checking'; save();
    if (lessonDoneOn(u, date)) { sent[u.email] = 'done-already'; save(); continue; }
    const r = await sendWhatsApp(u);
    sent[u.email] = r.ok ? 'sent' : 'failed: ' + r.error; save();
  }
  // keep only the last 14 days of "sent" markers
  const keys = Object.keys(db.reminders.sent).sort(); while (keys.length > 14) delete db.reminders.sent[keys.shift()];
}
setInterval(() => reminderTick().catch((e) => console.error('reminder', e)), 30 * 1000);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (url.pathname.startsWith('/api/')) {
    return api(req, res, url).catch((e) => { console.error(e); send(res, 500, { error: 'server error' }); });
  }
  serveStatic(req, res, url.pathname);
}).listen(PORT, () => console.log(`¡Vamos! listening on ${PORT}`));
