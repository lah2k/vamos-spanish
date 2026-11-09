// ¡Vamos! — Spanish course for Hebrew speakers. Zero-dependency Node server.
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
};

fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { users: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) {}
if (!db.users) db.users = {};
if (!db.reminders) db.reminders = { sent: {}, log: [] };

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

function publicUser(u) { return u; }

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
        const doneToday = Object.values(u.lessons).some((l) => l.date === today || (l.completedAt && new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(l.completedAt)) === today));
        const count = Object.keys(u.lessons).length;
        return { email: u.email, name: u.name, today, doneToday, lessonsDone: count, finished: count >= 30, nextLesson: count >= 30 ? null : count + 1 };
      });
    return send(res, 200, { today, users: list });
  }

  if (route === '/api/admin/users' && method === 'GET') {
    if (!pinOk(req.headers['x-admin-pin'])) return send(res, 403, { error: 'bad pin' });
    return send(res, 200, { users: Object.values(db.users) });
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
  if (route === '/api/admin/reminders' && method === 'GET') {
    if (!pinOk(req.headers['x-admin-pin'])) return send(res, 403, { error: 'bad pin' });
    return send(res, 200, { configured: !!(WA.token && WA.phoneId), time: WA.time, template: WA.template, now: tzNow(), sent: db.reminders.sent, log: db.reminders.log });
  }

  const u = getUser(req);
  if (!u) return send(res, 401, { error: 'not logged in' });

  if (route === '/api/me' && method === 'GET') return send(res, 200, { user: publicUser(u) });

  if (route === '/api/name' && method === 'POST') {
    u.name = String(body.name || '').trim().slice(0, 40); save();
    return send(res, 200, { user: publicUser(u) });
  }

  if (route === '/api/lesson-complete' && method === 'POST') {
    const id = Number(body.lessonId);
    if (!(id >= 1 && id <= 30)) return send(res, 400, { error: 'bad lesson' });
    if (!u.lessons[id]) u.lessons[id] = { completedAt: new Date().toISOString(), date: DATE_RE.test(body.date) ? body.date : null };
    markActive(u, body.date); save();
    return send(res, 200, { user: publicUser(u) });
  }

  if (route === '/api/quiz-attempt' && method === 'POST') {
    const isMistakes = body.mode === 'mistakes';
    const id = isMistakes ? 'mistakes' : Number(body.lessonId);
    if (!isMistakes && !(id >= 1 && id <= 30)) return send(res, 400, { error: 'bad lesson' });
    const results = Array.isArray(body.results) ? body.results.slice(0, 60) : [];
    const wrong = [];
    const picked = {};
    let score = 0;
    for (const r of results) {
      const qid = String(r.qid || '').slice(0, 40);
      if (!qid) continue;
      if (r.correct) {
        score++;
        if (u.mistakes[qid]) { delete u.mistakes[qid]; u.fixed++; }
      } else {
        wrong.push(qid);
        picked[qid] = String(r.picked || '').slice(0, 120);
        u.mistakes[qid] = { lessonId: Number(r.lessonId) || Number(id) || 0, at: new Date().toISOString() };
      }
    }
    (u.attempts[id] = u.attempts[id] || []).push({
      at: new Date().toISOString(), date: DATE_RE.test(body.date) ? body.date : null,
      score, total: results.length, wrong, picked,
      mode: ['mistakes', 'lesson', 'retake'].includes(body.mode) ? body.mode : 'quiz',
    });
    markActive(u, body.date); save();
    return send(res, 200, { user: publicUser(u) });
  }

  if (route === '/api/flashcards-done' && method === 'POST') {
    u.flashcards++; markActive(u, body.date); save();
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
  return Object.values(u.lessons).some((l) => l.date === date || (l.completedAt && new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(l.completedAt)) === date));
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
  const body = tpl === 'hello_world'
    ? { name: 'hello_world', language: { code: 'en_US' } }
    : { name: tpl, language: { code: WA.lang }, components: [{ type: 'body', parameters: [
        { type: 'text', text: u.name || 'שלום' }, { type: 'text', text: String(Math.min(count + 1, 30)) }] }] };
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
    if (Object.keys(u.lessons).length >= 30) continue;
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
