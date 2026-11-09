/* ¡Vamos! front-end — Hebrew RTL single-page app */
(function () {
  'use strict';
  // ---------- courses ----------
  const COURSES = {
    es: { code: 'es', name: 'ספרדית', inLang: 'בספרדית', flag: '🇪🇸', brand: '¡Vamos!', hello: '¡Hola!', tts: 'es-ES', lessons: window.LESSONS || [],
      cheers: ['✅ נכון! ¡Muy bien!', '✅ מצוין! ¡Perfecto!', '✅ כל הכבוד! ¡Genial!', '✅ בדיוק! ¡Excelente!'],
      perfect: '¡Perfecto!', veryGood: '¡Muy bien!', good: '¡Bien!', congrats: '¡Felicidades!', cert: '¡Enhorabuena!', ten: '¡Diez!', champ: 'אלופ/ת הספרדית',
      sampleF: '¡Hola! Me llamo Ana.', sampleM: '¡Hola! Me llamo Carlos.', voicesKey: 'vamos_voices' },
    fr: { code: 'fr', name: 'צרפתית', inLang: 'בצרפתית', flag: '🇫🇷', brand: 'Allons-y !', hello: 'Bonjour !', tts: 'fr-FR', lessons: window.LESSONS_FR || [],
      cheers: ['✅ נכון! Très bien !', '✅ מצוין! Parfait !', '✅ כל הכבוד! Bravo !', '✅ בדיוק! Excellent !'],
      perfect: 'Parfait !', veryGood: 'Très bien !', good: 'Bien !', congrats: 'Félicitations !', cert: 'Bravo !', ten: 'Dix !', champ: 'אלופ/ת הצרפתית',
      sampleF: 'Bonjour ! Je m’appelle Lucie.', sampleM: 'Bonjour ! Je m’appelle Tom.', voicesKey: 'vamos_voices_fr' },
  };
  let COURSE = 'es', INFO = COURSES.es, LESSONS = [], byId = {}, QUESTIONS = {};
  function setCourse(code, persist) {
    COURSE = COURSES[code] ? code : 'es'; INFO = COURSES[COURSE];
    if (persist !== false) { try { localStorage.setItem('vamos_course', COURSE); } catch (e) {} }
    document.documentElement.dataset.course = COURSE;
    LESSONS = INFO.lessons.slice().sort((a, b) => a.id - b.id);
    byId = {}; LESSONS.forEach((l) => { byId[l.id] = l; });
    QUESTIONS = {};
    LESSONS.forEach((l) => l.quiz.forEach((q, i) => { QUESTIONS[`${l.id}-${i + 1}`] = Object.assign({ qid: `${l.id}-${i + 1}`, lessonId: l.id }, q); }));
    if (typeof pickVoice === 'function') pickVoice();
  }
  const EMPTY = { lessons: {}, attempts: {}, mistakes: {}, fixed: 0, flashcards: 0 };
  // Spanish progress is stored at the top level of the user; other courses under user.courses[code]
  const CD = () => (!user ? EMPTY : COURSE === 'es' ? user : (user.courses && user.courses[COURSE]) || EMPTY);

  const $app = document.getElementById('app');
  let user = null;

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' }); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const es = (t) => `<span class="es${String(t).length > 22 ? ' long' : ''}" lang="${INFO.code}" dir="ltr">${esc(t)}</span>`;
  // Hebrew text that may contain Spanish fragments: wrap Latin runs so punctuation renders correctly
  const L = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñàâäçèêëîïôöûùÿœæÀÂÄÇÈÊËÎÏÔÖÛÙŸŒÆ';
  // Latin-script runs; French-style " !" / " ?" after a run stays with it
  const RUN = new RegExp(`([¿¡][${L}0-9 ,'’…\\-]*[?!]|[${L}][${L}0-9 ,'’…\\-]*[${L}0-9](?:\u00a0?\\s[!?])?)`, 'g');
  const mixed = (t) => {
    const s = String(t == null ? '' : t);
    if (!/[֐-׿]/.test(s)) return /[A-Za-z]/.test(s) ? `<bdi dir="ltr" lang="${INFO.code}">${esc(s)}</bdi>` : esc(s);
    return s.split(RUN).map((part, i) => (i % 2 ? `<bdi dir="ltr" lang="${INFO.code}">${esc(part)}</bdi>` : esc(part))).join('');
  };

  function toast(msg, ms) {
    const t = document.getElementById('toast');
    t.innerHTML = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }

  async function api(path, body) {
    const opts = { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' } };
    if (user) opts.headers['X-User-Email'] = user.email;
    if (body) opts.body = JSON.stringify(Object.assign({ course: COURSE }, body));
    const r = await fetch('/api/' + path, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || 'error'), { status: r.status });
    return data;
  }

  // ---------- speech ----------
  // Two distinct Spanish voices: female speakers get a woman's voice, male speakers a man's voice.
  const FEMALE_RE = /(am[eé]lie|audrey|aur[eé]lie|marie|julie|hortense|denise|elo[iï]se|c[eé]leste|chantal|sylvie|brigitte|vivienne|coralie|jacqueline|jos[eé]phine|yvette|google fran[cç]ais|helena|laura|elvira|ximena|dalia|paulina|m[oó]nica|luc[ií]a|marisol|esperanza|sabina|elena|conchita|pen[eé]lope|lupe|camila|sof[ií]a|paloma|abril|estrella|irene|triana|vera|larissa|beatriz|isabel|laia|lia\b|catalina|marta|nuria|carmen|renata|valentina|yolanda|google espa[nñ]ol|female|mujer)/i;
  const MALE_RE = /(thomas|henri|\bpaul\b|claude|r[eé]my|j[eé]r[oô]me|alain|antoine|nicolas|guillaume|maurice|yves|fabrice|mathieu|pablo|[aá]lvaro|jorge|diego|juan|enrique|carlos|ra[uú]l|jos[eé]|miguel|manuel|alonso|andr[eé]s|gonzalo|dar[ií]o|arnau|\bteo\b|sergio|el[ií]as|saul|sa[uú]l|nil\b|gerardo|esteban|cristian|federico|tom[aá]s|alberto|male\b|hombre)/i;
  const SPEAKER_GENDER = { 'לוסי': 'f', 'קלואה': 'f', 'תום': 'm', 'פייר': 'm', 'שני': 'f', 'אנה': 'f', 'מאיה': 'f', 'אמא': 'f', 'מוכרת': 'f', 'רופאה': 'f', 'לאו': 'm', 'קרלוס': 'm', 'אבא': 'm', 'מלצר': 'm', 'איש': 'm', 'מורה': 'm' };
  const MALE_ALT_RE = /\b(eddy|reed|rocko|grandpa)\b/i;
  const FEMALE_ALT_RE = /\b(flo|grandma|sandy|shelley)\b/i;
  let esVoice = null, femaleVoice = null, maleVoice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(INFO.code));
    const main = INFO.tts.toLowerCase().replace('-', '[-_]');
    const rank = (v) => (new RegExp('^' + main, 'i').test(v.lang) ? 0 : /^es[-_]MX|^fr[-_]CA/i.test(v.lang) ? 1 : 2) + (/natural|online|google/i.test(v.name) ? -0.5 : 0);
    vs.sort((a, b) => rank(a) - rank(b));
    esVoice = vs[0] || null;
    femaleVoice = vs.find((v) => FEMALE_RE.test(v.name)) || null;
    maleVoice = vs.find((v) => MALE_RE.test(v.name) && !FEMALE_RE.test(v.name))
      || vs.find((v) => MALE_ALT_RE.test(v.name)) || null;
    if (!femaleVoice) femaleVoice = vs.find((v) => FEMALE_ALT_RE.test(v.name)) || null;
    // never use a novelty voice as the default voice for words
    const plain = vs.filter((v) => !MALE_ALT_RE.test(v.name) && !FEMALE_ALT_RE.test(v.name));
    if (plain.length) esVoice = plain[0];
    // Google's plain "español" voice is female
    if (!femaleVoice) femaleVoice = vs.find((v) => /google/i.test(v.name)) || null;
    // the user's own choice (from the voice picker) wins
    let pref = {}; try { pref = JSON.parse(localStorage.getItem(INFO.voicesKey) || '{}'); } catch (e) {}
    if (pref.f) femaleVoice = vs.find((v) => v.name === pref.f) || femaleVoice;
    if (pref.m) maleVoice = vs.find((v) => v.name === pref.m) || maleVoice;
  }
  function voicePicker(el) {
    const vs = ('speechSynthesis' in window) ? speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(INFO.code)) : [];
    if (!vs.length) { el.innerHTML = `<p class="small muted">לא נמצאו קולות ${INFO.inLang} במכשיר הזה. אפשר להוסיף קול ${INFO.inLang} בהגדרות השפה והדיבור של המכשיר.</p>`; return; }
    const opt = (sel) => vs.map((v) => `<option value="${esc(v.name)}" ${sel && v.name === sel.name ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    el.innerHTML = `<div class="row small">
      <label>👩 קול נשי: <select id="vf" class="search" style="width:auto;margin:0;direction:ltr">${opt(femaleVoice)}</select></label>
      <button class="say" id="tf" title="השמעה">🔊</button>
      <label>👨 קול גברי: <select id="vm" class="search" style="width:auto;margin:0;direction:ltr">${opt(maleVoice)}</select></label>
      <button class="say" id="tm" title="השמעה">🔊</button></div>
      <p class="small muted">נמצאו ${vs.length} קולות ${INFO.inLang} במכשיר. אם יש רק קול אחד, הקולות יובדלו בגובה הצליל.</p>`;
    const saveSel = () => {
      try { localStorage.setItem(INFO.voicesKey, JSON.stringify({ f: document.getElementById('vf').value, m: document.getElementById('vm').value })); } catch (e) {}
      pickVoice();
    };
    document.getElementById('vf').onchange = saveSel; document.getElementById('vm').onchange = saveSel;
    document.getElementById('tf').onclick = (e) => { e.stopPropagation(); speak(INFO.sampleF, false, null, 'f'); };
    document.getElementById('tm').onclick = (e) => { e.stopPropagation(); speak(INFO.sampleM, false, null, 'm'); };
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function utter(text, slow, gender) {
    const u = new SpeechSynthesisUtterance(String(text).replace(/\s*\/\s*/g, ', '));
    const fv = femaleVoice || esVoice, mv = maleVoice || esVoice;
    const distinct = fv && mv && fv !== mv;
    let v = esVoice, pitch = 1;
    if (gender === 'f') { v = fv; if (!distinct) pitch = 1.2; }
    if (gender === 'm') { v = mv; if (!distinct) pitch = 0.6; }
    u.lang = v ? v.lang : INFO.tts; if (v) u.voice = v;
    u.rate = slow ? 0.55 : 0.85; u.pitch = pitch;
    return u;
  }
  function speak(text, slow, btn, gender) {
    if (!('speechSynthesis' in window)) { toast('הדפדפן הזה לא תומך בהשמעת קול 😕'); return; }
    speechSynthesis.cancel();
    const u = utter(text, slow, gender);
    if (btn) { btn.classList.add('playing'); u.onend = u.onerror = () => btn.classList.remove('playing'); }
    speechSynthesis.speak(u);
    if (!esVoice && !speak._warned) { speak._warned = true; setTimeout(() => { if (!esVoice) toast(`טיפ: אם לא שומעים טוב, אפשר להתקין קול ${INFO.inLang} בהגדרות המכשיר (שפה ודיבור).`, 5000); }, 800); }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-say]');
    if (b) { e.preventDefault(); e.stopPropagation(); speak(b.dataset.say, b.dataset.slow === '1', b, b.dataset.g); }
  });
  const sayBtns = (t) => `<button class="say" data-say="${esc(t)}" title="השמעה" aria-label="השמעה">🔊</button><button class="say slow" data-say="${esc(t)}" data-slow="1" title="השמעה איטית" aria-label="השמעה איטית">🐢</button>`;

  // ---------- progress logic ----------
  const done = (id) => !!(user && CD().lessons[id]);
  const doneCount = () => LESSONS.filter((l) => done(l.id)).length;
  const unlocked = (id) => id === 1 || done(id) || done(id - 1);
  const nextLesson = () => { const l = LESSONS.find((x) => !done(x.id)); return l ? l.id : null; };
  const attemptsOf = (id) => (CD().attempts[id] || []);
  const bestOf = (id) => attemptsOf(id).reduce((b, a) => (!b || a.score / a.total > b.score / b.total ? a : b), null);
  const openMistakes = () => Object.keys(CD().mistakes || {}).filter((q) => QUESTIONS[q])
    .sort((a, b) => (CD().mistakes[a].at < CD().mistakes[b].at ? -1 : 1));
  function streak() {
    const set = new Set(user.activeDates || []);
    const d = new Date(); let n = 0;
    const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    if (!set.has(key(d))) d.setDate(d.getDate() - 1);
    while (set.has(key(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function bestStreak() {
    const ds = (user.activeDates || []).slice().sort(); let best = 0, cur = 0, prev = null;
    for (const s of ds) { const t = new Date(s + 'T12:00:00'); cur = prev && (t - prev) / 864e5 === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = t; }
    return best;
  }
  const learnedWords = () => LESSONS.filter((l) => done(l.id) && !l.review).flatMap((l) => l.vocab.map((v) => Object.assign({ lesson: l.id }, v)));
  function allAttempts() { return Object.entries(CD().attempts || {}).flatMap(([k, arr]) => arr.map((a) => Object.assign({ key: k }, a))); }
  function avgScore() {
    const ids = LESSONS.map((l) => l.id).filter((id) => attemptsOf(id).length);
    if (!ids.length) return null;
    return Math.round(ids.reduce((s, id) => { const b = bestOf(id); return s + b.score / b.total; }, 0) / ids.length * 100);
  }

  const BADGES = [
    { id: 'first', ic: '🌱', t: 'צעד ראשון', d: 'סיימתם את השיעור הראשון', ok: () => doneCount() >= 1 },
    { id: 'five', ic: '🖐️', t: 'חמישה שיעורים', d: 'סיימתם 5 שיעורים', ok: () => doneCount() >= 5 },
    { id: 'week', ic: '📅', t: 'שבוע שלם', d: 'סיימתם את שבוע 1', ok: () => done(7) },
    { id: 'ten', ic: '🔟', get t() { return INFO.ten; }, d: 'סיימתם 10 שיעורים', ok: () => doneCount() >= 10 },
    { id: 'half', ic: '🌓', t: 'חצי דרך', d: 'סיימתם 15 שיעורים', ok: () => doneCount() >= 15 },
    { id: 'twenty', ic: '🚀', t: 'עשרים!', d: 'סיימתם 20 שיעורים', ok: () => doneCount() >= 20 },
    { id: 'all', ic: '🏆', get t() { return INFO.champ; }, d: 'סיימתם את כל 30 השיעורים', ok: () => doneCount() >= 30 },
    { id: 's3', ic: '🔥', t: 'רצף של 3', d: '3 ימים ברצף של למידה', ok: () => bestStreak() >= 3 },
    { id: 's7', ic: '🔥🔥', t: 'רצף של שבוע', d: '7 ימים ברצף של למידה', ok: () => bestStreak() >= 7 },
    { id: 's14', ic: '☄️', t: 'רצף של שבועיים', d: '14 ימים ברצף של למידה', ok: () => bestStreak() >= 14 },
    { id: 'perfect', ic: '💯', t: 'מושלם!', d: 'קיבלתם 100 בבוחן', ok: () => allAttempts().some((a) => a.total >= 8 && a.score === a.total) },
    { id: 'perfect5', ic: '🌟', t: 'כוכב/ת', d: '100 בחמישה בחנים שונים', ok: () => LESSONS.filter((l) => attemptsOf(l.id).some((a) => a.score === a.total)).length >= 5 },
    { id: 'fix5', ic: '🔧', t: 'לומדים מטעויות', d: 'תיקנתם 5 טעויות קודמות', ok: () => (CD().fixed || 0) >= 5 },
    { id: 'fix20', ic: '🛠️', t: 'מתקנ/ת מקצועי/ת', d: 'תיקנתם 20 טעויות קודמות', ok: () => (CD().fixed || 0) >= 20 },
    { id: 'cards', ic: '🃏', t: 'שליטה בכרטיסיות', d: 'סיימתם 5 סבבי כרטיסיות', ok: () => (CD().flashcards || 0) >= 5 },
    { id: 'words100', ic: '📚', t: '100 מילים', d: 'למדתם 100 מילים', ok: () => learnedWords().length >= 100 },
    { id: 'words250', ic: '🧠', t: '250 מילים', d: 'למדתם 250 מילים', ok: () => learnedWords().length >= 250 },
  ];
  const earned = () => new Set(BADGES.filter((b) => b.ok()).map((b) => b.id));
  async function update(fn) {
    const before = earned();
    const r = await fn();
    if (r && r.user) user = r.user;
    const fresh = BADGES.filter((b) => b.ok() && !before.has(b.id));
    if (fresh.length) setTimeout(() => toast(`🏅 הישג חדש: <b>${esc(fresh.map((b) => b.ic + ' ' + b.t).join(', '))}</b>`, 4000), 400);
  }

  // ---------- views ----------
  function viewLogin(mode) {
    mode = mode || 'login'; setBrand(null);
    document.getElementById('topbar').hidden = true;
    const su = mode === 'signup';
    $app.innerHTML = `
      <div class="card login">
        <div class="hero">🇪🇸</div>
        <h1>ברוכים הבאים! 👋</h1>
        <p class="muted">קורסים למתחילים ב-30 יום: 🇪🇸 ספרדית ו-🇫🇷 צרפתית.</p>
        <div class="tabs"><button class="${su ? '' : 'on'}" data-m="login">כניסה</button><button class="${su ? 'on' : ''}" data-m="signup">הרשמה</button></div>
        <form id="lf">
          <label for="em"><b>כתובת מייל</b></label>
          <input type="email" id="em" placeholder="name@example.com" autocomplete="email" required>
          ${su ? `<label for="nm"><b>השם שלך (בעברית)</b></label>
          <input type="text" id="nm" maxlength="40" placeholder="למשל: שני" required>` : ''}
          <div class="err" id="err"></div>
          <button class="btn big" type="submit" style="width:100%">${su ? 'להירשם ולהתחיל 🚀' : 'כניסה 🚀'}</button>
        </form>
        <p class="small muted">${su ? 'כבר רשומים? <a href="#" data-m="login">לכניסה</a>' : 'פעם ראשונה כאן? <a href="#" data-m="signup">להרשמה</a>'} · אין צורך בסיסמה.</p>
      </div>`;
    $app.querySelectorAll('[data-m]').forEach((x) => x.onclick = (e) => { e.preventDefault(); const em = document.getElementById('em').value; viewLogin(x.dataset.m); document.getElementById('em').value = em; });
    const err = (t) => { document.getElementById('err').innerHTML = t; };
    document.getElementById('lf').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('em').value.trim();
      try {
        if (su) {
          const name = document.getElementById('nm').value.trim();
          if (!name) return err('נא לכתוב שם 😊');
          if (!/[֐-׿]/.test(name)) return err('נא לכתוב את השם באותיות עבריות');
          user = (await api('signup', { email, name })).user;
        } else {
          user = (await api('login', { email })).user;
        }
        localStorage.setItem('vamos_email', user.email);
        location.hash = '#/home'; route();
      } catch (er) {
        if (er.status === 400) err('כתובת המייל לא נראית תקינה');
        else if (er.status === 404) err('המייל הזה עוד לא רשום. <a href="#" id="toSu">להרשמה</a>');
        else if (er.status === 409) err('המייל הזה כבר רשום. <a href="#" id="toLi">לכניסה</a>');
        else err('משהו השתבש, נסו שוב');
        const t = document.getElementById('toSu') || document.getElementById('toLi');
        if (t) t.onclick = (ev) => { ev.preventDefault(); viewLogin(t.id === 'toSu' ? 'signup' : 'login'); document.getElementById('em').value = email; };
      }
    };
  }

  function setBrand(info) {
    document.getElementById('brandflag').textContent = info ? info.flag : '🌍';
    const n = document.getElementById('brandname');
    n.textContent = info ? info.brand : 'לומדים שפות';
    n.lang = info ? info.code : 'he'; n.dir = info && info.code !== 'he' ? 'ltr' : 'rtl';
    document.title = !info ? 'לומדים שפות – ספרדית וצרפתית בכיף' : info.code === 'he' ? info.brand : `${info.brand} – ${info.name} בכיף`;
  }

  const locked = (c) => !!(user && user.locks && user.locks[c] && user.locks[c] !== 'open');
  function viewUnlock(c) {
    const name = c === 'wb' ? 'המדע של האושר' : (COURSES[c] || {}).name || c;
    const closed = user.locks && user.locks[c] === 'closed';
    $app.innerHTML = `<div class="card login"><div class="hero">🔒</div><h1>${esc(name)}</h1>
      ${closed ? '<p class="muted">הקורס הזה עוד לא נפתח. נסו שוב בקרוב 🙂</p>' : `<p class="muted">הקורס מוגן בסיסמה. הסיסמה נדרשת פעם אחת בלבד.</p>
      <form id="uf"><input type="password" id="upw" placeholder="סיסמת הקורס" style="text-align:center" autocomplete="off"><div class="err" id="uerr"></div><button class="btn" style="width:100%">פתיחה</button></form>`}
      <p><a href="#/courses">→ חזרה לבחירת קורס</a></p></div>`;
    const f = document.getElementById('uf'); if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { user = (await api('unlock', { course: c, password: document.getElementById('upw').value })).user; toast('🔓 הקורס נפתח!'); if (c === 'wb') go('#/wb'); else { setCourse(c); go('#/home'); } }
      catch (er) { document.getElementById('uerr').textContent = er.status === 429 ? 'יותר מדי ניסיונות. נסו שוב בעוד שעה.' : 'הסיסמה לא נכונה'; }
    };
  }
  function wbCard() {
    const w = WB(); const n = Object.keys(w.read).length + (w.perma.length ? 1 : 0) + (w.strengths.length ? 1 : 0);
    if (locked('wb')) return `<a class="card lcard" href="#/unlock/wb" style="padding:24px;flex-wrap:wrap">
      <span class="em" style="font-size:2.6rem;width:72px;height:72px">😊</span>
      <span style="flex:1 1 180px"><h2 style="margin:0">המדע של האושר 🔒</h2>
      <span class="small muted">לפי הקורס של פרופ׳ לורי סנטוס · סרטונים, קריאה ושאלונים</span></span>
      <span class="btn ghost" style="flex:1 1 100%">${user.locks.wb === 'closed' ? 'בקרוב' : '🔑 הזנת סיסמה'}</span></a>`;
    return `<a class="card lcard" href="#/wb" style="padding:24px;flex-wrap:wrap">
      <span class="em" style="font-size:2.6rem;width:72px;height:72px">😊</span>
      <span style="flex:1 1 180px"><h2 style="margin:0">המדע של האושר</h2>
      <span class="small muted">לפי הקורס של פרופ׳ לורי סנטוס · סרטונים, קריאה ושאלונים</span>
      <span class="small" style="display:block;margin-top:8px">${n ? `התחלתם · ${n} חלקים הושלמו` : 'עוד לא התחלתם'}</span></span>
      <span class="btn alt" style="flex:1 1 100%">${n ? 'להמשיך' : 'להתחיל'} ←</span></a>`;
  }

  function viewCourses() {
    const card = (c) => {
      const info = COURSES[c]; const d = c === 'es' ? user : (user.courses && user.courses[c]) || EMPTY;
      const n = Object.keys(d.lessons).length;
      return `<a class="card lcard" href="${locked(c) ? '#/unlock/' + c : '#/home'}" data-course="${c}" style="padding:24px;flex-wrap:wrap">
        <span class="em" style="font-size:2.6rem;width:72px;height:72px">${info.flag}</span>
        <span style="flex:1 1 180px"><h2 style="margin:0">${info.name} <bdi dir="ltr" lang="${c}" class="muted small">${esc(info.brand)}</bdi></h2>
        <span class="small muted">30 שיעורים למתחילים · כ-20 דקות ליום</span>
        <div class="bar" style="margin-top:8px"><i style="width:${n / 30 * 100}%"></i></div>
        <span class="small">${n ? `סיימתם ${n} מתוך 30` : 'עוד לא התחלתם'}</span></span>
        <span class="btn" style="flex:1 1 100%">${locked(c) ? '🔒 הזנת סיסמה' : n ? 'להמשיך ←' : 'להתחיל ←'}</span></a>`;
    };
    $app.innerHTML = `<h1>מה לומדים היום, ${esc(user.name)}? 🌍</h1>
      <p class="muted">כל קורס נשמר בנפרד – אפשר ללמוד כמה קורסים ולעבור ביניהם מתי שרוצים.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${card('es')}${card('fr')}${wbCard()}</div>`;
    $app.querySelectorAll('[data-course]').forEach((a) => a.onclick = () => { if (!locked(a.dataset.course)) setCourse(a.dataset.course); });
  }

  function viewHome() {
    const n = doneCount(); const nx = nextLesson(); const st = streak(); const avg = avgScore();
    const mist = openMistakes().length;
    const tiles = LESSONS.map((l) => {
      const d = CD().lessons[l.id];
      const cls = d ? 'done' : (l.id === nx ? 'next' : (unlocked(l.id) ? '' : 'locked'));
      const sub = d ? `✓ ${fmtDate(d.date || d.completedAt)}` : (l.id === nx ? 'היום!' : '');
      return `<a class="day ${cls}" href="${unlocked(l.id) ? '#/lesson/' + l.id : '#/home'}" title="${esc(l.title)}">
        <span class="e">${l.emoji}</span><span class="n">${l.id}</span><span>${sub || 'יום ' + l.id}</span></a>`;
    }).join('');
    $app.innerHTML = `
      <div class="card hello">
        <div class="row between"><h1 style="margin:0">שלום, ${esc(user.name)}! 👋</h1><a class="pill" href="#/courses" style="text-decoration:none">${INFO.flag} קורס ${INFO.name} · 🔄 החלפה</a></div>
        <p style="margin:0">${n === 0 ? `מוכנים להתחיל להרפתקה ${INFO.inLang}? השיעור הראשון מחכה!` : n === 30 ? `${INFO.congrats} סיימתם את כל הקורס! 🏆` : `כל הכבוד! סיימתם ${n} מתוך 30 שיעורים. ¡Vamos!`}</p>
        <div class="stats">
          <div class="stat"><b>${n}/30</b>שיעורים</div>
          <div class="stat"><b>${st} 🔥</b>ימים ברצף</div>
          <div class="stat"><b>${avg == null ? '–' : avg}</b>ציון ממוצע</div>
          <div class="stat"><b>${learnedWords().length}</b>מילים שלמדתם</div>
        </div>
        <div style="margin-top:14px" class="bar"><i style="width:${n / 30 * 100}%"></i></div>
        <div class="row" style="margin-top:16px">
          ${nx ? `<a class="btn big" href="#/lesson/${nx}">${byId[nx].emoji} ${n ? 'להמשיך ליום' : 'להתחיל את יום'} ${nx}</a>` : `<a class="btn big" href="#/certificate">📜 התעודה שלי</a>`}
          ${mist ? `<a class="btn alt" href="#/mistakes">🔁 לתרגל ${mist} טעויות</a>` : ''}
        </div>
      </div>
      <div class="card">
        <div class="row between"><h2>📆 מעקב 30 הימים שלי</h2><span class="small muted">ירוק = נלמד, צהוב = השיעור הבא</span></div>
        <div class="tracker">${tiles}</div>
      </div>`;
  }

  function viewLessons() {
    const cards = LESSONS.map((l) => {
      const d = done(l.id); const ul = unlocked(l.id); const b = bestOf(l.id);
      return `<a class="card lcard ${ul ? '' : 'locked'}" href="#/lesson/${l.id}">
        <span class="em">${ul ? l.emoji : '🔒'}</span>
        <span><span class="small muted">יום ${l.id}${l.review ? ' · חזרה' : ''}</span><h3>${mixed(l.title)}</h3>
        ${d ? `<span class="pill ok">✓ נלמד ${fmtDate(CD().lessons[l.id].date || CD().lessons[l.id].completedAt)}</span>` : ul ? '<span class="pill">פתוח</span>' : '<span class="pill">נעול</span>'}
        ${b ? ` <span class="pill purple">ציון ${Math.round(b.score / b.total * 100)}</span>` : ''}</span></a>`;
    }).join('');
    $app.innerHTML = `<h1>📘 שיעורים</h1><p class="muted">כל שיעור לוקח בערך 20 דקות: מילים, דקדוק, שיחה, תרגול ובוחן. שיעור חדש נפתח כשמסיימים את הקודם.</p><div class="grid">${cards}</div>`;
  }

  // ----- lesson player -----
  const STEPS = [
    { k: 'vocab', t: 'מילים חדשות', m: 7 },
    { k: 'grammar', t: 'דקדוק', m: 5 },
    { k: 'dialogue', t: 'שיחה', m: 2 },
    { k: 'practice', t: 'תרגול', m: 2 },
    { k: 'quiz', t: 'בוחן', m: 4 },
  ];
  function viewLesson(id, stepIdx) {
    const l = byId[id];
    if (!l) return go('#/lessons');
    if (!unlocked(id)) { toast('🔒 קודם צריך לסיים את השיעור הקודם'); return go('#/lessons'); }
    stepIdx = Math.max(0, Math.min(STEPS.length - 1, Number(stepIdx) || 0));
    const s = STEPS[stepIdx];
    const head = `
      <div class="row between"><a href="#/lessons" class="small">→ לכל השיעורים</a><span class="small muted">⏱️ כ-20 דקות</span></div>
      <h1>${l.emoji} יום ${l.id}: ${mixed(l.title)}</h1>
      <div class="steps">${STEPS.map((x, i) => `<span class="${i < stepIdx ? 'done' : i === stepIdx ? 'on' : ''}"></span>`).join('')}</div>
      <div class="steplabel">שלב ${stepIdx + 1} מתוך ${STEPS.length}: ${s.t} <span class="muted small">(כ-${s.m} דק׳)</span></div>`;
    const nav = (nextLabel) => `<div class="navrow">
      ${stepIdx > 0 ? `<a class="btn ghost" href="#/lesson/${id}/${stepIdx - 1}">→ הקודם</a>` : '<span></span>'}
      ${nextLabel ? `<a class="btn" href="#/lesson/${id}/${stepIdx + 1}">${nextLabel} ←</a>` : ''}</div>`;
    let body = '';
    if (s.k === 'vocab') {
      body = `<div class="card"><p style="margin-top:0">${mixed(l.intro)}</p>
        ${l.review ? '<p class="pill purple">שיעור חזרה – מילים חשובות מהימים הקודמים</p>' : ''}
        <div class="vocab">${l.vocab.map((v) => `
          <div class="word"><span class="em">${v.em || '🔤'}</span>
            <span class="txt">${es(v.es)}<span class="he">${esc(v.he)}</span><br><span class="pr">הגייה: ${esc(v.pr)}</span></span>
            ${sayBtns(v.es)}</div>`).join('')}</div>
        <p class="small muted">🔊 = השמעה רגילה · 🐢 = השמעה איטית. חזרו על כל מילה בקול לפחות פעמיים!</p></div>${nav('לדקדוק')}`;
    } else if (s.k === 'grammar') {
      const g = l.grammar;
      body = `<div class="card"><h2>📐 ${mixed(g.title)}</h2>
        <ul class="gpoints">${g.points.map((p) => `<li>${mixed(p)}</li>`).join('')}</ul>
        <h3>דוגמאות</h3>
        <table class="gtable">${g.table.map(([a, b]) => `<tr><td class="es" lang="${INFO.code}" dir="ltr">${esc(a)}</td><td>${mixed(b)}</td><td style="width:50px">${a.length < 60 ? `<button class="say" data-say="${esc(a.replace(/→/g, ','))}">🔊</button>` : ''}</td></tr>`).join('')}</table>
        ${g.tip ? `<div class="tip">💡 ${mixed(g.tip)}</div>` : ''}</div>${nav('לשיחה')}`;
    } else if (s.k === 'dialogue') {
      const speakers = [...new Set(l.dialogue.map((d) => d.who))];
      body = `<div class="card"><h2>💬 שיחה קצרה</h2><p class="muted small">הקשיבו לכל משפט, ואז נסו לקרוא אותו בקול. 🙈 אפשר להסתיר את התרגום כדי לבדוק את עצמכם.</p>
        <label class="small"><input type="checkbox" id="hideTr"> הסתרת התרגום</label>
        <div class="dlg" style="margin-top:12px">${l.dialogue.map((d) => `
          <div class="bubble ${speakers.indexOf(d.who) % 2 ? 'b' : ''}">
            <button class="say" data-say="${esc(d.es)}" data-g="${SPEAKER_GENDER[d.who] || ''}">🔊</button>
            <span><span class="who">${SPEAKER_GENDER[d.who] === 'm' ? '👨' : SPEAKER_GENDER[d.who] === 'f' ? '👩' : ''} ${esc(d.who)}</span>${es(d.es)}<span class="tr small">${esc(d.he)}</span></span>
          </div>`).join('')}</div>
        <div class="row" style="margin-top:14px"><button class="btn ghost" id="playAll">▶️ השמעת כל השיחה</button></div>
        <details style="margin-top:14px"><summary class="small">⚙️ בחירת קולות (אם שני הדוברים נשמעים אותו דבר)</summary><div id="vpick" style="margin-top:10px"></div></details></div>${nav('לתרגול')}`;
    } else if (s.k === 'practice') {
      body = `<div class="card"><h2>🧩 משחק התאמה</h2><p class="muted">לחצו על מילה ${INFO.inLang} ואז על התרגום שלה. כשמסיימים – ממשיכים לבוחן!</p><div id="match"></div></div>
        <div class="navrow"><a class="btn ghost" href="#/lesson/${id}/${stepIdx - 1}">→ הקודם</a><a class="btn" id="toQuiz" href="#/lesson/${id}/4">לבוחן ←</a></div>`;
    } else if (s.k === 'quiz') {
      body = `<div id="quiz"></div>`;
    }
    $app.innerHTML = head + body;
    window.scrollTo(0, 0);

    if (s.k === 'dialogue') {
      document.getElementById('hideTr').onchange = (e) => document.querySelectorAll('.tr').forEach((x) => { x.style.visibility = e.target.checked ? 'hidden' : ''; });
      voicePicker(document.getElementById('vpick'));
      if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', () => { const vp = document.getElementById('vpick'); if (vp) voicePicker(vp); });
      document.getElementById('playAll').onclick = () => {
        if (!('speechSynthesis' in window)) return toast('הדפדפן הזה לא תומך בהשמעת קול');
        speechSynthesis.cancel();
        l.dialogue.forEach((d) => speechSynthesis.speak(utter(d.es, false, SPEAKER_GENDER[d.who])));
      };
    }
    if (s.k === 'practice') matchGame(document.getElementById('match'), l.vocab);
    if (s.k === 'quiz') {
      // lesson quiz = ALL open earlier mistakes (from other lessons) + this lesson's questions
      const own = l.quiz.map((q, i) => QUESTIONS[`${l.id}-${i + 1}`]);
      const repeat = openMistakes().filter((q) => QUESTIONS[q].lessonId !== l.id).map((q) => Object.assign({ repeat: true }, QUESTIONS[q]));
      runQuiz(document.getElementById('quiz'), repeat.concat(own), { lessonId: l.id, mode: 'lesson' });
    }
  }

  function matchGame(el, vocab) {
    const pick = shuffle(vocab).slice(0, 6);
    const left = shuffle(pick), right = shuffle(pick);
    el.innerHTML = `<div class="match"><div class="col">${left.map((v) => `<button class="mbtn es" lang="${INFO.code}" dir="ltr" data-k="${esc(v.es)}" data-side="es">${esc(v.es)}</button>`).join('')}</div>
      <div class="col">${right.map((v) => `<button class="mbtn" data-k="${esc(v.es)}" data-side="he">${esc(v.he)}</button>`).join('')}</div></div>
      <p id="mres" class="center" style="font-weight:700;min-height:1.6em"></p>`;
    let sel = null, matched = 0;
    el.querySelectorAll('.mbtn').forEach((b) => b.onclick = () => {
      if (b.dataset.side === 'es') speak(b.dataset.k);
      if (!sel || sel.dataset.side === b.dataset.side) { if (sel) sel.classList.remove('sel'); sel = b; b.classList.add('sel'); return; }
      if (sel.dataset.k === b.dataset.k) {
        sel.classList.remove('sel'); sel.classList.add('ok'); b.classList.add('ok'); matched++;
        if (matched === pick.length) document.getElementById('mres').innerHTML = `🎉 ${INFO.veryGood} כל ההתאמות נכונות! עכשיו לבוחן.`;
      } else {
        [sel, b].forEach((x) => { x.classList.remove('sel'); x.classList.add('no'); setTimeout(() => x.classList.remove('no'), 400); });
      }
      sel = null;
    });
  }

  // ----- quiz engine -----
  function runQuiz(el, questions, ctx) {
    const qs = questions.map((q) => Object.assign({}, q, { opts: shuffle(q.o), right: q.o[0] }));
    const results = []; let i = 0;
    function show() {
      const q = qs[i];
      el.innerHTML = `<div class="card">
        <div class="qhead"><span class="pill">שאלה ${i + 1} מתוך ${qs.length}</span>
          <span>${q.repeat ? `<span class="pill bad">🔁 שאלה חוזרת מיום ${q.lessonId}</span>` : ''} <span class="pill ok">✓ ${results.filter((r) => r.correct).length}</span></span></div>
        <div class="bar" style="height:8px"><i style="width:${i / qs.length * 100}%"></i></div>
        ${q.say ? `<button class="say bigsay" data-say="${esc(q.say)}" id="qsay">🔊</button><p class="center small muted" style="margin:0">לחצו כדי לשמוע שוב · <button class="linkbtn" data-say="${esc(q.say)}" data-slow="1">🐢 לאט</button></p>` : ''}
        <div class="qtext">${mixed(q.q)}</div>
        <div class="opts">${q.opts.map((o, k) => `<button class="opt" data-k="${k}">${mixed(o)}</button>`).join('')}</div>
        <div id="fb"></div></div>`;
      if (q.say) setTimeout(() => speak(q.say), 250);
      el.querySelectorAll('.opt').forEach((b) => b.onclick = () => answer(b));
    }
    function answer(btn) {
      const q = qs[i]; const choice = q.opts[Number(btn.dataset.k)]; const ok = choice === q.right;
      results.push({ qid: q.qid, lessonId: q.lessonId, correct: ok, picked: choice });
      el.querySelectorAll('.opt').forEach((b) => {
        b.disabled = true;
        const t = q.opts[Number(b.dataset.k)];
        if (t === q.right) b.classList.add('right'); else if (b === btn) b.classList.add('wrong');
      });
      const last = i === qs.length - 1;
      document.getElementById('fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}">
        <b>${ok ? shuffle(INFO.cheers)[0] : '❌ לא בדיוק… התשובה הנכונה: ' + mixed(q.right)}</b>
        ${mixed(q.x)}</div>
        <div class="navrow"><span></span><button class="btn" id="nextQ">${last ? 'לתוצאות 🏁' : 'לשאלה הבאה ←'}</button></div>`;
      const nb = document.getElementById('nextQ'); nb.focus({ preventScroll: true });
      nb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      nb.onclick = () => { if (last) finish(); else { i++; show(); window.scrollTo(0, 0); } };
    }
    async function finish() {
      const score = results.filter((r) => r.correct).length, total = results.length;
      el.innerHTML = '<div class="card center">שומרים את התוצאות… ⏳</div>';
      try {
        await update(async () => {
          let r = await api('quiz-attempt', { lessonId: ctx.lessonId, mode: ctx.mode, results, date: today() });
          if (ctx.mode === 'lesson') r = await api('lesson-complete', { lessonId: ctx.lessonId, date: today() });
          return r;
        });
      } catch (e) { toast('לא הצלחנו לשמור את התוצאה – בדקו את החיבור לאינטרנט'); }
      const pct = Math.round(score / total * 100);
      const stars = pct === 100 ? '⭐⭐⭐' : pct >= 75 ? '⭐⭐' : pct >= 50 ? '⭐' : '💪';
      const msg = pct === 100 ? `${INFO.perfect} ציון מושלם!` : pct >= 75 ? `${INFO.veryGood} עבודה מצוינת!` : pct >= 50 ? `${INFO.good} ממשיכים להתאמן.` : 'לא נורא! טעויות הן חלק מהלמידה. ננסה שוב?';
      const wrong = results.filter((r) => !r.correct);
      const nx = ctx.mode === 'lesson' && ctx.lessonId < 30 ? ctx.lessonId + 1 : null;
      el.innerHTML = `<div class="card center">
          <div class="stars">${stars}</div>
          <div class="score">${score} / ${total}</div>
          <h2>${mixed(msg)}</h2>
          ${ctx.mode === 'lesson' ? `<p>🎉 סיימתם את יום ${ctx.lessonId}!${ctx.lessonId === 30 ? ` ${INFO.congrats} סיימתם את כל הקורס!` : ''}</p>` : ''}
          ${wrong.length ? `<p class="muted small">השאלות שטעיתם בהן יחזרו בבוחן של השיעור הבא, כדי לבדוק שהבנתם 💡</p>` : ''}
          <div class="row" style="justify-content:center">
            ${ctx.lessonId === 30 && ctx.mode === 'lesson' ? '<a class="btn big" href="#/certificate">📜 לתעודה שלי</a>' : ''}
            ${nx ? `<a class="btn" href="#/home">🏠 למסך הבית</a>` : `<a class="btn" href="#/quizzes">📝 לכל הבחנים</a>`}
            <button class="btn ghost" id="again">🔄 לנסות שוב</button>
          </div></div>
        ${wrong.length ? `<div class="card"><h2>📖 בואו נלמד מהטעויות</h2>${wrong.map((r) => { const q = QUESTIONS[r.qid]; return `
          <div class="review"><b>${mixed(q.q)}</b> ${q.say ? `<button class="say slow" data-say="${esc(q.say)}">🔊</button>` : ''}<br>
          <span class="pill bad">עניתם: ${mixed(r.picked)}</span> <span class="pill ok">נכון: ${mixed(q.o[0])}</span><br><span class="small">${mixed(q.x)}</span></div>`; }).join('')}</div>` : ''}`;
      document.getElementById('again').onclick = () => runQuiz(el, questions.filter((q) => !q.repeat || ctx.mode === 'mistakes'), Object.assign({}, ctx, { mode: ctx.mode === 'lesson' ? 'retake' : ctx.mode }));
      window.scrollTo(0, 0);
    }
    show();
  }

  function viewQuizzes() {
    const mist = openMistakes();
    const rows = LESSONS.map((l) => {
      const at = attemptsOf(l.id); const b = bestOf(l.id); const last = at[at.length - 1];
      const ul = done(l.id);
      return `<div class="card">
        <div class="row between"><h3 style="margin:0">${l.emoji} יום ${l.id}: ${mixed(l.title)}</h3>
          ${b ? `<span class="pill ${b.score === b.total ? 'ok' : 'purple'}">הכי טוב: ${b.score}/${b.total}</span>` : ''}</div>
        <p class="small muted" style="margin:6px 0 10px">${at.length ? `${at.length} ניסיונות · אחרון: ${last.score}/${last.total} ב-${fmtDate(last.at)}` : ul ? 'עוד לא נבחנתם' : '🔒 ייפתח אחרי שתסיימו את שיעור ' + l.id}</p>
        <div class="row">${ul ? `<a class="btn" href="#/quiz/${l.id}">✍️ להיבחן ${at.length ? 'שוב' : ''}</a>` : ''}
          ${at.length ? `<a class="btn ghost" href="#/results/${l.id}">📊 התוצאות שלי</a>` : ''}</div></div>`;
    }).join('');
    $app.innerHTML = `<h1>📝 בחנים</h1>
      <div class="card hello"><h2>🔁 תרגול טעויות</h2>
        <p style="margin-top:0">${mist.length ? `יש ${mist.length} שאלות שעוד לא תוקנו. כשעונים עליהן נכון – הן יוצאות מהרשימה!` : 'אין טעויות פתוחות – ¡Genial! 🎉'}</p>
        ${mist.length ? '<a class="btn alt" href="#/mistakes">לתרגל את הטעויות שלי</a>' : ''}
        ${CD().attempts.mistakes ? ' <a class="btn ghost" href="#/results/mistakes">📊 היסטוריית תרגול טעויות</a>' : ''}</div>
      <div class="grid">${rows}</div>`;
  }

  function viewQuiz(id) {
    const l = byId[id]; if (!l || !done(id)) return go('#/quizzes');
    $app.innerHTML = `<a href="#/quizzes" class="small">→ לכל הבחנים</a><h1>${l.emoji} בוחן יום ${l.id}</h1><div id="quiz"></div>`;
    runQuiz(document.getElementById('quiz'), l.quiz.map((q, i) => QUESTIONS[`${l.id}-${i + 1}`]), { lessonId: l.id, mode: 'retake' });
  }

  function viewMistakes() {
    const m = openMistakes();
    if (!m.length) { toast('אין טעויות פתוחות 🎉'); return go('#/quizzes'); }
    $app.innerHTML = `<a href="#/quizzes" class="small">→ לכל הבחנים</a><h1>🔁 תרגול הטעויות שלי</h1><div id="quiz"></div>`;
    runQuiz(document.getElementById('quiz'), shuffle(m).slice(0, 15).map((q) => QUESTIONS[q]), { lessonId: 0, mode: 'mistakes' });
  }

  function viewResults(key) {
    const isM = key === 'mistakes'; const l = byId[key];
    const at = (CD().attempts[key] || []).slice().reverse();
    if (!at.length) return go('#/quizzes');
    $app.innerHTML = `<a href="#/quizzes" class="small">→ לכל הבחנים</a>
      <h1>📊 ${isM ? 'תרגול טעויות' : `${l.emoji} תוצאות יום ${l.id}`}</h1>
      ${!isM ? `<a class="btn" href="#/quiz/${l.id}" style="margin-bottom:14px">✍️ להיבחן שוב</a>` : ''}
      ${at.map((a, n) => `<div class="card"><div class="row between"><b>ניסיון ${at.length - n} · ${fmtDate(a.at)}${a.mode === 'lesson' ? ' · במהלך השיעור' : ''}</b>
        <span class="pill ${a.score === a.total ? 'ok' : a.score / a.total >= .75 ? 'purple' : 'bad'}">${a.score}/${a.total} (${Math.round(a.score / a.total * 100)})</span></div>
        ${a.wrong && a.wrong.length ? a.wrong.filter((q) => QUESTIONS[q]).map((qid) => { const q = QUESTIONS[qid]; return `<div class="review"><b>${mixed(q.q)}</b>${q.say ? ` <span class="small muted">(${es(q.say)})</span>` : ''}<br>
          ${a.picked && a.picked[qid] ? `<span class="pill bad">עניתם: ${mixed(a.picked[qid])}</span> ` : ''}<span class="pill ok">נכון: ${mixed(q.o[0])}</span>
          ${CD().mistakes[qid] ? '' : ' <span class="pill purple">✓ תוקן מאז</span>'}<br><span class="small">${mixed(q.x)}</span></div>`; }).join('') : '<p class="muted" style="margin:6px 0 0">כל התשובות נכונות! 💯</p>'}</div>`).join('')}`;
  }

  function viewWords() {
    const words = learnedWords();
    const all = LESSONS.filter((l) => !l.review).flatMap((l) => l.vocab.map((v) => Object.assign({ lesson: l.id }, v)));
    let showAll = false;
    $app.innerHTML = `<h1>📚 המילון שלי</h1>
      <p class="muted">כל המילים מהשיעורים שסיימתם (${words.length} מילים). לחצו 🔊 כדי לשמוע.</p>
      <input class="search" id="q" placeholder="🔍 חיפוש בעברית או ${INFO.inLang}…">
      <label class="small"><input type="checkbox" id="all"> להציג גם מילים משיעורים שעוד לא למדתם</label>
      <div id="list" style="margin-top:12px"></div>`;
    const render = () => {
      const t = document.getElementById('q').value.trim().toLowerCase();
      const src = showAll ? all : words;
      const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const f = src.filter((w) => !t || norm(w.es).includes(norm(t)) || w.he.includes(t));
      document.getElementById('list').innerHTML = f.length ? `<div class="vocab">${f.map((v) => `
        <div class="word"><span class="em">${v.em || '🔤'}</span><span class="txt">${es(v.es)}<span class="he">${esc(v.he)}</span><br><span class="pr">יום ${v.lesson} · ${esc(v.pr)}</span></span>${sayBtns(v.es)}</div>`).join('')}</div>`
        : `<div class="card center muted">${src.length ? 'לא נמצאו מילים' : 'המילון יתמלא אחרי שתסיימו את השיעור הראשון 🌱'}</div>`;
    };
    document.getElementById('q').oninput = render;
    document.getElementById('all').onchange = (e) => { showAll = e.target.checked; render(); };
    render();
  }

  function viewFlashcards() {
    const learned = LESSONS.filter((l) => done(l.id) && !l.review);
    if (!learned.length) {
      $app.innerHTML = `<h1>🃏 כרטיסיות</h1><div class="card center"><p>הכרטיסיות ייפתחו אחרי שתסיימו את השיעור הראשון 🌱</p><a class="btn" href="#/lesson/1">ליום 1</a></div>`;
      return;
    }
    $app.innerHTML = `<h1>🃏 כרטיסיות</h1><p class="muted">בחרו חפיסה. רואים מילה ${INFO.inLang}, מנסים להיזכר בתרגום, ואז הופכים את הכרטיס.</p>
      <div class="card"><div class="row">
        <select id="deck" class="search" style="max-width:360px;margin:0">
          <option value="all">כל המילים שלמדתי (${learnedWords().length})</option>
          <option value="mix">10 מילים אקראיות</option>
          ${learned.map((l) => `<option value="${l.id}">יום ${l.id}: ${esc(l.title)}</option>`).join('')}
        </select>
        <label class="small"><input type="checkbox" id="rev"> הפוך: עברית ← ${INFO.name}</label>
        <button class="btn" id="go">להתחיל ▶️</button></div></div><div id="fc"></div>`;
    document.getElementById('go').onclick = () => {
      const v = document.getElementById('deck').value; const rev = document.getElementById('rev').checked;
      let cards = v === 'all' ? learnedWords() : v === 'mix' ? shuffle(learnedWords()).slice(0, 10) : byId[v].vocab.slice();
      cards = shuffle(cards);
      let i = 0, know = 0; const again = [];
      const fc = document.getElementById('fc');
      const show = () => {
        if (i >= cards.length) {
          if (again.length) { cards = shuffle(again.splice(0)); i = 0; toast('סבב נוסף על המילים שעוד לא ידעתם 💪'); return show(); }
          update(() => api('flashcards-done', { date: today() })).catch(() => {});
          fc.innerHTML = `<div class="card center"><div class="stars">🎉</div><h2>${mixed(INFO.veryGood)} סיימתם את החפיסה</h2><p>ידעתם ${know} מילים בפעם הראשונה.</p><button class="btn" id="go2">עוד סבב</button></div>`;
          document.getElementById('go2').onclick = () => document.getElementById('go').click();
          return;
        }
        const c = cards[i];
        const front = rev ? `<div class="em">${c.em || ''}</div><div class="w">${esc(c.he)}</div>` : `<div class="em">${c.em || ''}</div><div class="w" lang="${INFO.code}" dir="ltr">${esc(c.es)}</div><button class="say" data-say="${esc(c.es)}">🔊</button>`;
        const back = rev ? `<div class="w" lang="${INFO.code}" dir="ltr">${esc(c.es)}</div><div class="small">${esc(c.pr)}</div><button class="say" data-say="${esc(c.es)}">🔊</button>` : `<div class="w">${esc(c.he)}</div><div class="small">הגייה: ${esc(c.pr)}</div>`;
        fc.innerHTML = `<p class="center muted">כרטיס ${i + 1} מתוך ${cards.length}</p>
          <div class="flip" id="card"><div class="in"><div class="face">${front}<p class="small muted">לחצו כדי להפוך</p></div><div class="face back">${back}</div></div></div>
          <div class="row" style="justify-content:center;margin-top:16px" id="ans" hidden>
            <button class="btn alt" id="yes">😀 ידעתי</button><button class="btn ghost" id="no">🤔 עוד לא</button></div>`;
        if (!rev) setTimeout(() => speak(c.es), 200);
        document.getElementById('card').onclick = (e) => { if (e.target.closest('.say')) return; e.currentTarget.classList.toggle('on'); document.getElementById('ans').hidden = false; if (rev) speak(c.es); };
        document.getElementById('yes').onclick = () => { if (!c._again) know++; i++; show(); };
        document.getElementById('no').onclick = () => { again.push(Object.assign({}, c, { _again: true })); i++; show(); };
      };
      show();
    };
  }

  function viewBadges() {
    const got = earned();
    $app.innerHTML = `<h1>🏅 ההישגים שלי</h1><p class="muted">אספתם ${got.size} מתוך ${BADGES.length} הישגים · רצף נוכחי: ${streak()} 🔥 · הרצף הכי ארוך: ${bestStreak()}</p>
      ${done(30) ? '<a class="btn" href="#/certificate" style="margin-bottom:14px">📜 התעודה שלי</a>' : ''}
      <div class="grid">${BADGES.map((b) => `<div class="card badge ${got.has(b.id) ? 'got' : ''}"><div class="ic">${b.ic}</div><h3>${mixed(b.t)}</h3><p class="small muted" style="margin:0">${esc(b.d)}</p>${got.has(b.id) ? '<span class="pill ok">✓ הושג</span>' : ''}</div>`).join('')}</div>`;
  }

  function viewCertificate() {
    if (!done(30)) { toast('התעודה תחכה לכם בסוף יום 30 📜'); return go('#/home'); }
    const avg = avgScore();
    $app.innerHTML = `<div class="cert card"><div style="font-size:3.5rem">🏆${INFO.flag}</div><h1>תעודת סיום</h1>
      <p>מוענקת בגאווה ל</p><div class="name">${esc(user.name)}</div>
      <p>על השלמת הקורס <b lang="${INFO.code}" dir="ltr">${esc(INFO.brand)}</b> – ${INFO.name} למתחילים ב-30 יום</p>
      <p>${learnedWords().length} מילים · ציון ממוצע ${avg == null ? '–' : avg} · ${fmtDate(CD().lessons[30].completedAt)}</p>
      <p style="font-size:1.4rem" lang="${INFO.code}" dir="ltr">${esc(INFO.cert)} 🎉</p></div>
      <div class="center noprint"><button class="btn" onclick="window.print()">🖨️ הדפסה / שמירה כ-PDF</button></div>`;
  }

  function wbParent(u) {
    const w = u.wb; if (!w) return '';
    if (!w) return '<h3 style="margin-top:14px">😊 המדע של האושר – עוד לא התחיל/ה</h3>';
    const p = (w.perma || []).slice(-1)[0];
    return `<h3 style="margin-top:14px">😊 המדע של האושר – ${Object.keys(w.read || {}).length} חלקים נקראו</h3>
      <p class="small" style="margin:0">${p ? `PERMA (${p.phase === 'pre' ? 'פתיחה' : 'סיום'}, ${fmtDate(p.date || p.at)}): רווחה כללית <b>${p.scores.overall.toFixed(1)}</b> · P ${p.scores.P.toFixed(1)} · E ${p.scores.E.toFixed(1)} · R ${p.scores.R.toFixed(1)} · M ${p.scores.M.toFixed(1)} · A ${p.scores.A.toFixed(1)}` : 'PERMA: עוד לא מולא'}
      ${w.strengths && w.strengths.length ? ` · חוזקות: ${w.strengths.map(esc).join(', ')} · שבוע חוזקות ${(w.strengthDays || []).length}/7` : ''}${w.journal ? ` · יומן הנאה ותודה ${Object.keys(w.journal).length}/7` : ''}${w.kindlog ? ` · יומן טוב לב ${Object.keys(w.kindlog).length}/7` : ''}${w.health ? ` · יומן תנועה ושינה ${Object.keys(w.health).length} ימים` : ''}${w.quiz ? ' · בחנים: ' + Object.keys(w.quiz).map((m) => { const a = w.quiz[m].slice(-1)[0]; return `מודול ${m} ${a.score}/${a.total}`; }).join(', ') : ''}</p>`;
  }

  async function viewParent() {
    document.getElementById('topbar').hidden = !user;
    const pin = sessionStorage.getItem('vamos_pin');
    const ask = (err) => {
      $app.innerHTML = `<div class="card login"><div class="hero">👨‍👩‍👧</div><h1>אזור הורים</h1><p class="muted">כאן רואים את ההתקדמות של כל המשתמשים באתר.</p>
        <form id="pf"><input type="password" id="pin" inputmode="numeric" placeholder="קוד הורים" style="text-align:center"><div class="err">${err || ''}</div><button class="btn" style="width:100%">כניסה</button></form>
        <p><a href="#/home">→ חזרה</a></p></div>`;
      document.getElementById('pf').onsubmit = (e) => { e.preventDefault(); sessionStorage.setItem('vamos_pin', document.getElementById('pin').value); viewParent(); };
    };
    if (!pin) return ask();
    let users;
    try { users = (await fetch('/api/admin/users', { headers: { 'X-Admin-Pin': pin } }).then((r) => { if (!r.ok) throw r; return r.json(); })).users; }
    catch (e) { sessionStorage.removeItem('vamos_pin'); return ask('קוד שגוי'); }
    const dataOf = (u, c) => (c === 'es' ? u : (u.courses && u.courses[c]) || null);
    const summary = (u, c) => {
      const d = dataOf(u, c) || EMPTY;
      const ids = Object.keys(d.lessons).map(Number);
      const best = (id) => (d.attempts[id] || []).reduce((b, a) => Math.max(b, a.score / a.total), 0);
      const scored = ids.concat(Object.keys(d.attempts).map(Number)).filter((id, i, a) => id >= 1 && a.indexOf(id) === i && (d.attempts[id] || []).length);
      const avg = scored.length ? Math.round(scored.reduce((s, id) => s + best(id), 0) / scored.length * 100) : null;
      const last = (u.activeDates || []).slice(-1)[0];
      return { d, ids, avg, last, best, mist: Object.keys(d.mistakes || {}).length };
    };
    const trackerFor = (u, c) => {
      const s = summary(u, c); const lessons = COURSES[c].lessons;
      return `<h3 style="margin-top:14px">${COURSES[c].flag} ${COURSES[c].name} – ${s.ids.length}/30 · ציון ממוצע ${s.avg == null ? '–' : s.avg} · טעויות פתוחות ${s.mist} · תוקנו ${s.d.fixed || 0}</h3>
        <div class="tracker">${lessons.map((l) => { const d = s.d.lessons[l.id]; const at = s.d.attempts[l.id] || []; return `<div class="day ${d ? 'done' : ''}" title="${esc(l.title)}"><span class="n">${l.id}</span><span>${d ? fmtDate(d.date || d.completedAt) : '–'}</span>${at.length ? `<span>${Math.round(s.best(l.id) * 100)} (${at.length}×)</span>` : ''}</div>`; }).join('')}</div>`;
    };
    let rem = null;
    try { rem = await fetch('/api/admin/reminders', { headers: { 'X-Admin-Pin': pin } }).then((r) => r.json()); } catch (e) { rem = null; }
    const adminPost = (path, body) => fetch('/api/admin/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': pin }, body: JSON.stringify(body) }).then((r) => r.json());
    const today = rem && rem.now ? rem.now.date : '';
    let pws = {}; try { pws = (await fetch('/api/admin/course-passwords', { headers: { 'X-Admin-Pin': pin } }).then((r) => r.json())).courses || {}; } catch (e) {}
    const pwRow = (c, name) => `<tr><td><b>${name}</b></td><td>${pws[c] ? '🔒 מוגן בסיסמה' : c === 'wb' ? '⛔ סגור (עוד לא הוגדרה סיסמה)' : '🔓 פתוח לכולם'}</td>
      <td><input class="search" style="width:170px;margin:0" type="text" autocomplete="off" data-cpwin="${c}" placeholder="${pws[c] ? 'סיסמה חדשה' : 'סיסמה'}"></td>
      <td><button class="btn ghost" data-cpw="${c}">שמירה</button> ${pws[c] ? `<button class="linkbtn" data-cpw="${c}" data-clear="1">הסרת סיסמה</button>` : ''}</td></tr>`;
    const pwCard = `<div class="card"><h2>🔑 סיסמאות לקורסים</h2>
      <p class="small muted" style="margin-top:0">מי שמכיר/ה את הסיסמה פותח/ת את הקורס פעם אחת, והוא נשאר פתוח בחשבון שלו/ה. "המדע של האושר" סגור עד שמגדירים לו סיסמה (מי שכבר אושר/ה קודם נשאר/ה עם גישה).</p>
      <table class="tbl">${pwRow('wb', '😊 המדע של האושר')}${pwRow('es', '🇪🇸 ספרדית')}${pwRow('fr', '🇫🇷 צרפתית')}</table></div>`;
    const statusHe = (st) => !st ? 'עוד לא נבדק היום' : st === 'sent' ? '✅ נשלחה תזכורת' : st === 'done-already' ? '🌟 השיעור כבר נעשה – לא נשלחה תזכורת' : st === 'checking' ? 'בבדיקה…' : '⚠️ ' + st;
    const remCard = rem ? `<div class="card"><h2>📱 תזכורות וואטסאפ</h2>
      <p style="margin-top:0">${rem.configured ? `✅ מחובר. כל יום בשעה <b>${esc(rem.time)}</b> נבדק מי לא עשה שיעור היום, ונשלחת אליו תזכורת (תבנית: <bdi dir="ltr">${esc(rem.template)}</bdi>).` : '⚠️ וואטסאפ עוד לא מוגדר בשרת.'}</p>
      ${rem.log && rem.log.length ? `<details><summary>יומן שליחות אחרונות (${rem.log.length})</summary><table class="tbl">${rem.log.slice(0, 15).map((l) => `<tr><td>${fmtDate(l.at)} ${new Date(l.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</td><td dir="ltr" style="text-align:right">${esc(l.email)}</td><td>${l.ok ? '✅ נשלח' : '❌ ' + esc(l.error || '')}</td></tr>`).join('')}</table></details>` : ''}</div>` : '';
    $app.innerHTML = `<div class="row between"><h1>👨‍👩‍👧 אזור הורים</h1><button class="btn ghost" id="out">יציאה מאזור ההורים</button></div>
      <div class="card scroll"><table class="tbl"><tr><th>שם</th><th>מייל</th><th>🇪🇸 ספרדית</th><th>🇫🇷 צרפתית</th><th>טעויות פתוחות</th><th>פעילות אחרונה</th></tr>
      ${users.map((u) => { const a = summary(u, 'es'), b = summary(u, 'fr'); return `<tr><td><b>${esc(u.name || '—')}</b></td><td dir="ltr" style="text-align:right">${esc(u.email)}</td><td>${a.ids.length}/30 · ${a.avg == null ? '–' : a.avg}</td><td>${dataOf(u, 'fr') ? `${b.ids.length}/30 · ${b.avg == null ? '–' : b.avg}` : '–'}</td><td>${a.mist + b.mist}</td><td>${a.last ? fmtDate(a.last) : '–'}</td></tr>`; }).join('') || '<tr><td colspan="6">אין עדיין משתמשים</td></tr>'}
      </table></div>
      ${remCard}${pwCard}
      ${users.map((u) => `<div class="card"><h2>${esc(u.name || u.email)}</h2>
        <div class="row" style="margin-bottom:12px">
          <label class="small">📱 טלפון לתזכורות: <input class="search" style="width:190px;margin:0;direction:ltr" data-ph="${esc(u.email)}" value="${esc(u.phone || '')}" placeholder="05X-XXXXXXX"></label>
          <label class="small"><input type="checkbox" data-off="${esc(u.email)}" ${u.remindersOff ? 'checked' : ''}> השהיית תזכורות</label>
          <button class="btn ghost" data-save="${esc(u.email)}">שמירה</button>
          ${u.phone ? `<button class="btn alt" data-test="${esc(u.email)}">שליחת תזכורת לבדיקה</button>` : ''}
          <span class="small muted">היום: ${statusHe(rem && rem.sent && rem.sent[today] && rem.sent[today][u.email])}</span>
        </div>
        ${trackerFor(u, 'es')}${dataOf(u, 'fr') ? trackerFor(u, 'fr') : ''}${wbParent(u)}</div>`).join('')}`;
    $app.querySelectorAll('[data-cpw]').forEach((b) => b.onclick = async () => {
      const c = b.dataset.cpw, inp = $app.querySelector(`[data-cpwin="${c}"]`);
      const clear = b.dataset.clear === '1';
      if (!clear && !inp.value.trim()) return toast('נא להקליד סיסמה');
      const r = await adminPost('course-password', { course: c, password: clear ? '' : inp.value });
      toast(r.ok ? (r.set ? '✅ הסיסמה נשמרה' : 'הסיסמה הוסרה') : 'שגיאה בשמירה'); viewParent();
    });
    document.getElementById('out').onclick = () => { sessionStorage.removeItem('vamos_pin'); go(user ? '#/home' : '#/'); };
    $app.querySelectorAll('[data-save]').forEach((b) => b.onclick = async () => {
      const em = b.dataset.save;
      const r = await adminPost('phone', { email: em, phone: $app.querySelector(`[data-ph="${em}"]`).value, off: $app.querySelector(`[data-off="${em}"]`).checked });
      toast(r.user ? '✅ נשמר' : 'שגיאה בשמירה'); viewParent();
    });
    $app.querySelectorAll('[data-test]').forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = 'שולח…';
      const r = await adminPost('remind-test', { email: b.dataset.test });
      toast(r.ok ? '✅ התזכורת נשלחה בוואטסאפ' : '❌ השליחה נכשלה: ' + esc(r.error || ''), 6000); viewParent();
    });
  }

  // ---------- המדע של האושר (Well-Being, private course) ----------
  const WBINFO = { code: 'he', flag: '😊', brand: 'המדע של האושר', name: 'המדע של האושר' };
  let WBC = null, CUR = 1, WBMODS = null; const WBM = {};
  const WB = () => (user && user.wb) || { read: {}, perma: [], strengths: [], strengthDays: [] };
  const PERMA_DIMS = [
    ['P', 'רגשות חיוביים', 'שמחה, סיפוק ותחושה טובה ביום-יום', false],
    ['E', 'מעורבות', 'להיות שקועים ומתעניינים במה שעושים', false],
    ['R', 'קשרים', 'תמיכה, אהבה וקשר עם אנשים אחרים', false],
    ['M', 'משמעות', 'תחושה שהחיים חשובים ויש להם כיוון', false],
    ['A', 'הישגים', 'התקדמות לעבר מטרות וסיום משימות', false],
    ['overall', 'רווחה כללית', 'ממוצע של כל שאלות השגשוג והאושר', false],
    ['H', 'בריאות', 'איך מרגישים פיזית', false],
    ['N', 'רגשות שליליים', 'דאגה, כעס ועצב – כאן נמוך יותר זה טוב', true],
    ['Lon', 'בדידות', 'כאן נמוך יותר זה טוב', true],
  ];
  const WB_FIG = `<figure class="wbfig"><svg viewBox="0 0 640 230" role="img" aria-label="אשליית מילר-לייר והשולחנות של שפרד" style="width:100%;max-width:640px">
    <g stroke="#1d2433" stroke-width="4" stroke-linecap="round" fill="none">
      <line x1="60" y1="60" x2="260" y2="60"/><polyline points="80,40 60,60 80,80"/><polyline points="240,40 260,60 240,80"/>
      <line x1="60" y1="160" x2="260" y2="160"/><polyline points="40,140 60,160 40,180"/><polyline points="280,140 260,160 280,180"/>
    </g>
    <text x="160" y="215" text-anchor="middle" font-size="15" fill="#667085">שני הקווים באותו אורך בדיוק</text>
    <g stroke="#7a4a1d" stroke-width="2" fill="#e9c38f">
      <polygon points="350,120 450,60 500,90 400,150"/>
      <polygon points="540,40 600,40 600,170 540,170" transform="skewY(-12) translate(0,120)"/>
    </g>
    <text x="490" y="215" text-anchor="middle" font-size="15" fill="#667085">גם שני השולחנות זהים (בערך כמו אצל שפרד)</text>
  </svg><figcaption class="small muted">אשליית מילר-לייר והשולחנות של שפרד</figcaption></figure>`;
  async function wbLoad(m) {
    CUR = m;
    if (!WBM[m]) WBM[m] = (await api('wb/content?m=' + m)).content;
    WBC = WBM[m];
    return WBC;
  }
  function wbSteps() {
    const s = WBC.sections.map((x, i) => ({ key: 's' + i, href: `#/wb/${CUR}/s/` + i, title: x.title, sid: x.id, icon: /^סרטון/.test(x.title) ? '🎬' : /^קריאה/.test(x.title) ? '📖' : /^משימת/.test(x.title) ? '✅' : 'ℹ️' }));
    if (CUR === 1) {
      s.push({ key: 'perma', href: '#/wb/1/perma', title: 'שאלון PERMA – מדידת רווחה נפשית', icon: '📊', done: WB().perma.length > 0 });
      s.push({ key: 'via', href: '#/wb/1/via', title: 'שאלון VIA – 24 חוזקות האופי', icon: '💪', done: WB().strengths.length > 0 });
    }
    if (CUR === 4) s.push({ key: 'health', href: '#/wb/4/health', title: 'היומן שלי: תנועה ושינה', icon: '🏃', done: Object.keys(WB().health || {}).length > 0 });
    if (CUR === 3) s.push({ key: 'kindlog', href: '#/wb/3/kindlog', title: 'היומן שלי: טוב לב וקשר חברתי', icon: '🤝', done: Object.keys(WB().kindlog || {}).length > 0 });
    if (CUR === 2) s.push({ key: 'journal', href: '#/wb/2/journal', title: 'היומן שלי: הנאה מודעת ותודה', icon: '📔', done: Object.keys(WB().journal || {}).length > 0 });
    if (WBC.quiz) s.push({ key: 'quiz', href: `#/wb/${CUR}/quiz`, title: `בוחן מודול ${CUR}`, icon: '📝', done: !!((WB().quiz || {})[CUR] || []).length });
    s.push({ key: 'review', href: `#/wb/${CUR}/review`, title: WBC.review.title, sid: CUR === 1 ? 'review' : `m${CUR}:review`, icon: '❓' });
    s.forEach((x) => { if (x.done == null) x.done = !!WB().read[x.sid]; });
    return s;
  }
  const wbMark = async (sid) => { if (!WB().read[sid]) { try { user = (await api('wb/read', { sid, date: today() })).user; } catch (e) {} } };
  async function viewWb(parts) {
    parts = parts.slice();
    if (locked('wb')) return viewUnlock('wb');
    if (parts[1] && !/^\d+$/.test(parts[1])) parts.splice(1, 0, '1'); // old links: #/wb/perma -> #/wb/1/perma
    try {
      if (!WBMODS) WBMODS = (await api('wb/modules')).modules;
      if (!parts[1]) return wbOverview();
      await wbLoad(Number(parts[1]));
    } catch (e) { $app.innerHTML = '<div class="card">😕 לא הצלחנו לטעון את התוכן כרגע. נסו שוב בעוד רגע.</div>'; return; }
    parts = parts.slice(1);
    const sub = parts[1];
    if (sub === 's') return wbSection(Number(parts[2]));
    if (sub === 'perma') return wbPerma(parts[2]);
    if (sub === 'via') return wbVia();
    if (sub === 'journal') return wbJournal();
    if (sub === 'kindlog') return wbKindlog();
    if (sub === 'health') return wbHealth();
    if (sub === 'review') return wbReview();
    if (sub === 'quiz') return wbQuiz();
    const steps = wbSteps(); const n = steps.filter((x) => x.done).length;
    const next = steps.find((x) => !x.done);
    const last = WB().perma.slice(-1)[0];
    $app.innerHTML = `<div class="card hello">
        <div class="row between"><h1 style="margin:0">😊 ${esc(WBC.moduleTitle)}</h1><a class="pill" href="#/wb" style="text-decoration:none">📚 כל הקורס</a></div>
        <p style="margin:6px 0 0">המדע של האושר · לפי הקורס של פרופ׳ לורי סנטוס (ייל). תרגום לשימוש אישי ומשפחתי בלבד.</p>
        <div style="margin-top:14px" class="bar"><i style="width:${n / steps.length * 100}%"></i></div>
        <p class="small muted">${n} מתוך ${steps.length} חלקים הושלמו</p>
        <div class="row">${next ? `<a class="btn big" href="${next.href}">${next.icon} ${n ? 'להמשיך' : 'להתחיל'}: ${next.title}</a>` : `<span class="pill ok">🎉 סיימתם את מודול ${CUR}!</span>${WBMODS.some((m) => m.module === CUR + 1) ? ` <a class="btn" href="#/wb/${CUR + 1}">למודול ${CUR + 1} ←</a>` : ''}`}
        ${last && CUR === 1 ? `<a class="btn alt" href="#/wb/1/perma/results">📊 התוצאות שלי</a>` : ''}</div>
      </div>
      <div class="card"><h2>📋 חלקי המודול</h2><div class="wbsteps">${steps.map((x, i) => `<a class="card lcard ${x.done ? 'done' : ''}" href="${x.href}"><span class="em">${x.done ? '✅' : x.icon}</span><span><b>${i + 1}. ${x.title}</b></span></a>`).join('')}</div></div>`;
  }
  function wbNav(i) {
    const steps = wbSteps(); const j = steps.findIndex((x) => x.key === i);
    const prev = steps[j - 1], next = steps[j + 1];
    return `<div class="row between noprint" style="margin-top:16px">${prev ? `<a class="btn ghost" href="${prev.href}">→ ${prev.title}</a>` : `<a class="btn ghost" href="#/wb/${CUR}">→ לתוכן המודול</a>`}
      ${next ? `<a class="btn" data-next href="${next.href}">${next.title} ←</a>` : `<a class="btn" data-next href="#/wb/${CUR}">סיום ←</a>`}</div>`;
  }
  function wbSection(i) {
    const s = WBC.sections[i]; if (!s) return go('#/wb/' + CUR);
    let html = s.html.replace('@@FIG@@', WB_FIG);
    if (/^משימת/.test(s.title) && CUR === 1) html += `<div class="row" style="margin-top:10px"><a class="btn alt" href="#/wb/1/perma">📊 למלא את שאלון PERMA כאן באתר</a><a class="btn alt" href="#/wb/1/via">💪 לבחור חוזקות</a></div>`;
    if (/^משימת/.test(s.title) && CUR === 4) html += `<div class="row" style="margin-top:10px"><a class="btn alt" href="#/wb/4/health">🏃 למלא את היומן כאן באתר</a></div>`;
    if (/^משימת/.test(s.title) && CUR === 3) html += `<div class="row" style="margin-top:10px"><a class="btn alt" href="#/wb/3/kindlog">🤝 למלא את היומן כאן באתר</a></div>`;
    if (/^משימת/.test(s.title) && CUR === 2) html += `<div class="row" style="margin-top:10px"><a class="btn alt" href="#/wb/2/journal">📔 למלא את היומן כאן באתר</a></div>`;
    $app.innerHTML = `<p class="small"><a href="#/wb/${CUR}">😊 ${esc(WBC.moduleTitle)}</a> · חלק ${i + 1}</p>
      <article class="card wbtext"><h1>${s.title}</h1>${html}</article>${wbNav('s' + i)}`;
    $app.querySelector('[data-next]').addEventListener('click', () => wbMark(s.id));
    window.scrollTo(0, 0);
  }
  function wbReview() {
    const r = WBC.review;
    $app.innerHTML = `<p class="small"><a href="#/wb/${CUR}">😊 ${esc(WBC.moduleTitle)}</a></p><div class="card wbtext"><h1>${r.title}</h1>${r.intro}
      ${r.items.map((q, i) => `<details class="wbq"><summary><b>${i + 1}.</b> ${q.q}</summary><div class="ans">${q.a.replace(/<\/?li>/g, '')}</div></details>`).join('')}</div>${wbNav('review')}`;
    $app.querySelector('[data-next]').addEventListener('click', () => wbMark(CUR === 1 ? 'review' : `m${CUR}:review`));
  }
  function wbPerma(sub) {
    const P = WBC.perma; const hist = WB().perma;
    if (sub === 'results') return wbPermaResults();
    const phase = hist.some((h) => h.phase === 'pre') ? 'post' : 'pre';
    const ans = {};
    $app.innerHTML = `<p class="small"><a href="#/wb/${CUR}">😊 ${esc(WBC.moduleTitle)}</a></p><div class="card wbtext"><h1>${P.title}</h1>${P.intro}
      <p class="small">💾 כאן באתר לא צריך לרשום כלום – התשובות והציונים נשמרים בחשבון שלכם${hist.length ? ` (כבר מילאתם ${hist.length} פעמים · <a href="#/wb/1/perma/results">לתוצאות</a>)` : ''}.</p>
      <div class="row small"><label><input type="radio" name="ph" value="pre" ${phase === 'pre' ? 'checked' : ''}> מדידת פתיחה</label><label><input type="radio" name="ph" value="post" ${phase === 'post' ? 'checked' : ''}> מדידת סיום (להשוואה)</label></div></div>
      ${P.items.map((it) => `<div class="card pq" data-n="${it.n}"><p><b>${it.n}.</b> ${it.q}</p>
        <div class="scale">${Array.from({ length: 11 }, (_, v) => `<button type="button" data-v="${v}">${v}</button>`).join('')}</div>
        <div class="row between small muted"><span>0 = ${it.lo}</span><span>10 = ${it.hi}</span></div></div>`).join('')}
      <div class="card center"><p id="pcount" class="muted">ענית על 0 מתוך ${P.items.length}</p><button class="btn big" id="psend" disabled>📊 לחישוב הציונים</button></div>`;
    const upd = () => { const k = Object.keys(ans).length; document.getElementById('pcount').textContent = `ענית על ${k} מתוך ${P.items.length}`; document.getElementById('psend').disabled = k < P.items.length; };
    $app.querySelectorAll('.pq').forEach((c) => c.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => {
      c.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b)); c.classList.add('answered');
      ans[c.dataset.n] = Number(b.dataset.v); upd();
      const nx = c.nextElementSibling; if (nx && nx.classList.contains('pq') && !nx.classList.contains('answered')) nx.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    document.getElementById('psend').onclick = async () => {
      const ph = ($app.querySelector('[name=ph]:checked') || {}).value || phase;
      try { user = (await api('wb/perma', { answers: ans, phase: ph, date: today() })).user; go('#/wb/1/perma/results'); }
      catch (e) { toast('לא הצלחנו לשמור, נסו שוב'); }
    };
  }
  function wbPermaResults() {
    const hist = WB().perma;
    if (!hist.length) return go('#/wb/1/perma');
    const last = hist[hist.length - 1];
    const pre = hist.filter((h) => h.phase === 'pre')[0];
    const post = hist.filter((h) => h.phase === 'post').slice(-1)[0];
    const cmp = pre && post ? [pre, post] : null;
    const bar = (v, inv) => `<div class="pbar ${inv ? 'inv' : ''}"><i style="width:${v * 10}%"></i></div>`;
    const row = ([k, he, desc, inv]) => {
      const v = last.scores[k];
      const d = cmp ? Math.round((post.scores[k] - pre.scores[k]) * 10) / 10 : null;
      const good = d == null || d === 0 ? '' : (d > 0) !== inv ? 'ok' : 'bad';
      return `<div class="prow"><div><b>${he}</b> <span class="small muted">${desc}</span></div>${bar(v, inv)}<b class="pv">${v.toFixed(1)}</b>
        ${cmp ? `<span class="pill ${good}"><bdi dir="ltr">${d > 0 ? '+' : ''}${d}</bdi></span>` : ''}</div>`;
    };
    const top = PERMA_DIMS.slice(0, 5).map((x) => [x[1], last.scores[x[0]]]).sort((a, b) => b[1] - a[1]);
    $app.innerHTML = `<p class="small"><a href="#/wb/${CUR}">😊 ${esc(WBC.moduleTitle)}</a></p>
      <div class="card"><h1>📊 התוצאות שלי – PERMA</h1>
      <p class="muted">${last.phase === 'pre' ? 'מדידת פתיחה' : 'מדידת סיום'} · ${fmtDate(last.date || last.at)} · כל ציון הוא ממוצע מ-0 עד 10.</p>
      ${PERMA_DIMS.map(row).join('')}
      <p class="small">⭐ התחום החזק ביותר שלך כרגע: <b>${top[0][0]}</b> (${top[0][1].toFixed(1)}). התחום שהכי כדאי לטפח: <b>${top[4][0]}</b> (${top[4][1].toFixed(1)}).</p>
      <p class="small muted">${cmp ? `ההשוואה היא בין מדידת הפתיחה (${fmtDate(pre.date || pre.at)}) למדידת הסיום (${fmtDate(post.date || post.at)}).` : 'בסוף הקורס ממלאים שוב, ואז יופיע כאן כמה כל תחום השתנה.'} זה לא מבחן ואין "ציון עובר" – משווים רק לעצמנו. שאלון PERMA-Profiler נבנה למבוגרים (Butler &amp; Kern, 2016); זה תרגום לא רשמי.</p>
      <div class="row"><a class="btn" href="#/wb/1/via">💪 להמשיך לחוזקות</a><a class="btn ghost" href="#/wb/1/perma">🔁 למלא שוב</a></div></div>
      ${hist.length > 1 ? `<div class="card"><h2>🗓️ כל המילויים</h2><table class="tbl"><tr><th>תאריך</th><th>סוג</th><th>רווחה כללית</th><th>P</th><th>E</th><th>R</th><th>M</th><th>A</th></tr>${hist.map((h) => `<tr><td>${fmtDate(h.date || h.at)}</td><td>${h.phase === 'pre' ? 'פתיחה' : 'סיום'}</td><td><b>${h.scores.overall.toFixed(1)}</b></td>${['P', 'E', 'R', 'M', 'A'].map((k) => `<td>${h.scores[k].toFixed(1)}</td>`).join('')}</tr>`).join('')}</table></div>` : ''}`;
  }
  function wbVia() {
    const V = WBC.via; let top = WB().strengths.slice();
    const areas = [...new Set(V.strengths.map((s) => s.area))];
    const render = () => {
      const days = WB().strengthDays || []; const t = today();
      $app.innerHTML = `<p class="small"><a href="#/wb/${CUR}">😊 ${esc(WBC.moduleTitle)}</a></p><div class="card wbtext"><h1>${V.title}</h1>${V.intro}</div>
        <div class="card"><h2>💪 החוזקות שלי <span class="small muted">(${top.length}/5 – לחצו לבחירה, לפי הסדר)</span></h2>
        <div class="row">${top.length ? top.map((n, i) => `<span class="pill purple">${i + 1}. ${esc(n)}</span>`).join('') : '<span class="muted small">עוד לא בחרתם</span>'}</div>
        ${areas.map((a) => `<h3 style="margin-top:14px">${esc(a)}</h3><div class="via">${V.strengths.filter((s) => s.area === a).map((s) => `<button type="button" class="vchip ${top.includes(s.name) ? 'on' : ''}" data-s="${esc(s.name)}"><b>${esc(s.name)}</b><span>${esc(s.desc)}</span>${top.includes(s.name) ? `<i>${top.indexOf(s.name) + 1}</i>` : ''}</button>`).join('')}</div>`).join('')}
        <div class="row" style="margin-top:14px"><button class="btn" id="vsave" ${top.length ? '' : 'disabled'}>💾 שמירת החוזקות</button>${top.length ? '<button class="btn ghost" id="vclr">ניקוי</button>' : ''}</div></div>
        ${WB().strengths.length ? `<div class="card"><h2>📅 שבוע של חוזקות</h2><p>כל יום, השתמשו באחת החוזקות שלכם בדרך חדשה – וסמנו כאן.</p>
          <div class="row"><button class="btn alt" id="vday">${days.includes(t) ? '✅ סימנתי היום (לחיצה לביטול)' : '✔️ השתמשתי היום בחוזקה שלי'}</button>
          <span class="big7">${Array.from({ length: 7 }, (_, i) => `<span class="dot ${i < days.length ? 'on' : ''}"></span>`).join('')}</span><span class="small muted">${days.length}/7 ימים</span></div></div>` : ''}
        ${wbNav('via')}`;
      $app.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => {
        const n = b.dataset.s; const i = top.indexOf(n);
        if (i >= 0) top.splice(i, 1); else if (top.length < 5) top.push(n); else return toast('אפשר לבחור עד 5 חוזקות 🙂');
        render();
      });
      document.getElementById('vsave').onclick = async () => { user = (await api('wb/strengths', { top })).user; toast('✅ החוזקות נשמרו'); render(); };
      const c = document.getElementById('vclr'); if (c) c.onclick = () => { top = []; render(); };
      const d = document.getElementById('vday'); if (d) d.onclick = async () => { user = (await api('wb/strength-day', { date: t })).user; render(); };
    };
    render();
  }

  async function wbOverview() {
    await Promise.all(WBMODS.map((m) => WBM[m.module] ? null : api('wb/content?m=' + m.module).then((r) => { WBM[m.module] = r.content; })));
    const keep = [CUR, WBC];
    const mods = WBMODS.map((m) => { CUR = m.module; WBC = WBM[m.module]; return { m, steps: wbSteps() }; });
    [CUR, WBC] = keep;
    const all = mods.flatMap((x) => x.steps); const n = all.filter((x) => x.done).length;
    const next = mods.map((x) => ({ x, st: x.steps.find((y) => !y.done) })).find((y) => y.st);
    $app.innerHTML = `<div class="card hello"><div class="row between"><h1 style="margin:0">😊 המדע של האושר</h1><a class="pill" href="#/courses" style="text-decoration:none">🔄 החלפת קורס</a></div>
      <p style="margin:6px 0 0">לפי הקורס The Science of Well-Being של פרופ׳ לורי סנטוס (ייל). תרגום לשימוש אישי ומשפחתי בלבד.</p>
      <div style="margin-top:14px" class="bar"><i style="width:${n / all.length * 100}%"></i></div>
      <p class="small muted">${n} מתוך ${all.length} חלקים הושלמו · ${WBMODS.length} מודולים</p>
      <div class="row">${next ? `<a class="btn big" href="${next.st.href}">${next.st.icon} ${n ? 'להמשיך' : 'להתחיל'}: מודול ${next.x.m.module} – ${next.st.title}</a>` : '<span class="pill ok">🎉 סיימתם את כל המודולים שכאן!</span>'}</div></div>
      ${mods.map(({ m, steps }) => { const d = steps.filter((x) => x.done).length; return `<div class="card"><div class="row between"><h2 style="margin:0"><a href="#/wb/${m.module}" style="color:inherit;text-decoration:none">${esc(m.title)}</a></h2><span class="pill ${d === steps.length ? 'ok' : ''}">${d}/${steps.length}</span></div>
        <div class="wbsteps" style="margin-top:12px">${steps.map((x, i) => `<a class="card lcard ${x.done ? 'done' : ''}" href="${x.href}"><span class="em">${x.done ? '✅' : x.icon}</span><span><b>${i + 1}. ${x.title}</b></span></a>`).join('')}</div></div>`; }).join('')}`;
  }
  function wbHealth() {
    const J = WB().health || {}; const t = today();
    let date = sessionStorage.getItem('wb_hdate') || t; if (date > t) date = t;
    const e = J[date] || { act: '', min: '', sleep: '' };
    const days = Object.keys(J).sort().reverse();
    const moveDays = days.filter((d) => J[d].min >= 30).length, sleepNights = days.filter((d) => J[d].sleep >= 9).length;
    const shift = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const dots = (n, of) => `<span class="big7">${Array.from({ length: of }, (_, i) => `<span class="dot ${i < n ? 'on' : ''}"></span>`).join('')}</span>`;
    $app.innerHTML = `<p class="small"><a href="#/wb/${CUR}">😊 ${esc(WBC.moduleTitle)}</a></p>
      <div class="card"><h1>🏃 היומן שלי: תנועה ושינה</h1>
      <p class="muted">כל יום רושמים כמה דקות זזתם וכמה שעות ישנתם בלילה. המטרה: 30 דקות תנועה ב-7 ימים, ולפחות 4 לילות של שינה מלאה (לילדים – לפחות 9 שעות).</p>
      <div class="row">🏃 ${dots(moveDays, 7)}<span class="small muted">${moveDays}/7 ימים עם 30 דקות</span></div>
      <div class="row" style="margin-top:6px">😴 ${dots(sleepNights, 4)}<span class="small muted">${sleepNights}/4 לילות של 9 שעות ומעלה</span></div></div>
      <div class="card"><div class="row between"><button class="btn ghost" id="hprev">→ יום קודם</button><h2 style="margin:0">${date === t ? 'היום' : fmtDate(date)}</h2><button class="btn ghost" id="hnext" ${date >= t ? 'disabled' : ''}>יום הבא ←</button></div>
        <h3 style="margin-top:16px">🏃 מה עשיתי?</h3>
        <input id="hact" class="search" style="width:100%" placeholder="למשל: רקדתי בחדר, הליכה עם אמא" value="${esc(e.act)}">
        <div class="row" style="margin-top:10px">
          <label>⏱️ דקות תנועה: <input id="hmin" class="search" type="number" min="0" max="600" style="width:100px;margin:0" value="${esc(e.min || '')}"></label>
          <label>😴 שעות שינה בלילה: <input id="hsleep" class="search" type="number" min="0" max="16" step="0.5" style="width:100px;margin:0" value="${esc(e.sleep || '')}"></label></div>
        <div class="row" style="margin-top:12px"><button class="btn" id="hsave">💾 שמירה</button></div></div>
      ${days.length ? `<div class="card"><h2>📅 מה רשמתי</h2><table class="tbl"><tr><th>תאריך</th><th>תנועה</th><th>דקות</th><th>שינה</th></tr>${days.map((d) => `<tr><td>${fmtDate(d)}</td><td>${esc(J[d].act || '')}</td><td>${J[d].min || '–'}${J[d].min >= 30 ? ' ✅' : ''}</td><td>${J[d].sleep || '–'}${J[d].sleep >= 9 ? ' ✅' : ''}</td></tr>`).join('')}</table></div>` : ''}
      ${wbNav('health')}`;
    document.getElementById('hprev').onclick = () => { sessionStorage.setItem('wb_hdate', shift(date, -1)); wbHealth(); };
    document.getElementById('hnext').onclick = () => { sessionStorage.setItem('wb_hdate', shift(date, 1)); wbHealth(); };
    document.getElementById('hsave').onclick = async () => {
      try { user = (await api('wb/health', { date, act: document.getElementById('hact').value, min: document.getElementById('hmin').value, sleep: document.getElementById('hsleep').value })).user; toast('✅ נשמר ביומן'); wbHealth(); }
      catch (er) { toast('לא הצלחנו לשמור, נסו שוב'); }
    };
  }
  function wbKindlog() {
    const J = WB().kindlog || {}; const t = today();
    let date = sessionStorage.getItem('wb_kdate') || t; if (date > t) date = t;
    const e = J[date] || { kind: '', conn: '' };
    const days = Object.keys(J).sort().reverse();
    const shift = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    $app.innerHTML = `<p class="small"><a href="#/wb/${CUR}">😊 ${esc(WBC.moduleTitle)}</a></p>
      <div class="card"><h1>🤝 היומן שלי: טוב לב וקשר חברתי</h1>
      <p class="muted">7 ימים: כל ערב רושמים איזה מעשה טוב עשיתם היום, ועם מי יצרתם קשר. הכול נשמר בחשבון שלכם.</p>
      <div class="row"><span class="big7">${Array.from({ length: 7 }, (_, i) => `<span class="dot ${i < days.length ? 'on' : ''}"></span>`).join('')}</span><span class="small muted">${days.length}/7 ימים</span></div></div>
      <div class="card"><div class="row between"><button class="btn ghost" id="kprev">→ יום קודם</button><h2 style="margin:0">${date === t ? 'היום' : fmtDate(date)}</h2><button class="btn ghost" id="knext" ${date >= t ? 'disabled' : ''}>יום הבא ←</button></div>
        <h3 style="margin-top:16px">💛 המעשה הטוב שלי היום</h3>
        <textarea id="kkind" class="search" rows="3" style="width:100%;resize:vertical" placeholder="למשל: עזרתי לאחי בשיעורי הבית">${esc(e.kind)}</textarea>
        <h3>🗣️ הקשר החברתי שלי היום</h3>
        <textarea id="kconn" class="search" rows="3" style="width:100%;resize:vertical" placeholder="למשל: שאלתי את המוכרת בקנטינה איך עבר עליה היום – היא חייכה">${esc(e.conn)}</textarea>
        <div class="row" style="margin-top:12px"><button class="btn" id="ksave">💾 שמירה</button></div></div>
      ${days.length ? `<div class="card"><h2>📅 מה כתבתי</h2>${days.map((d) => `<details class="wbq"><summary><b>${fmtDate(d)}</b> ${J[d].kind ? '· 💛 ' + esc(J[d].kind.slice(0, 50)) : ''}</summary><div class="ans">${J[d].kind ? `<p>💛 ${esc(J[d].kind)}</p>` : ''}${J[d].conn ? `<p>🗣️ ${esc(J[d].conn)}</p>` : ''}</div></details>`).join('')}</div>` : ''}
      ${wbNav('kindlog')}`;
    document.getElementById('kprev').onclick = () => { sessionStorage.setItem('wb_kdate', shift(date, -1)); wbKindlog(); };
    document.getElementById('knext').onclick = () => { sessionStorage.setItem('wb_kdate', shift(date, 1)); wbKindlog(); };
    document.getElementById('ksave').onclick = async () => {
      try { user = (await api('wb/kindlog', { date, kind: document.getElementById('kkind').value, conn: document.getElementById('kconn').value })).user; toast('✅ נשמר ביומן'); wbKindlog(); }
      catch (er) { toast('לא הצלחנו לשמור, נסו שוב'); }
    };
  }
  function wbQuiz() {
    const Q = WBC.quiz || []; let i = 0, score = 0; const wrong = []; const hist = (WB().quiz || {})[CUR] || [];
    const head = `<p class="small"><a href="#/wb/${CUR}">😊 ${esc(WBC.moduleTitle)}</a></p>`;
    const show = () => {
      if (i >= Q.length) return finish();
      const q = Q[i]; const order = q.o.map((_, k) => k);
      $app.innerHTML = `${head}<div class="card"><div class="row between"><h2 style="margin:0">📝 בוחן מודול ${CUR}</h2><span class="pill">שאלה ${i + 1} מתוך ${Q.length}</span></div>
        <div class="bar" style="margin:12px 0"><i style="width:${i / Q.length * 100}%"></i></div>
        <p style="font-size:1.1rem;font-weight:500">${esc(q.q)}</p>${q.fig || ''}
        ${q.multi ? '<p class="small muted">✔️ אפשר לבחור יותר מתשובה אחת, ואז ללחוץ "בדיקה"</p>' : ''}
        <div class="opts">${order.map((k) => `<button class="opt" data-k="${k}">${q.multi ? '<span class="box">☐</span> ' : ''}${esc(q.o[k])}</button>`).join('')}</div>
        ${q.multi ? '<div class="row" style="margin-top:10px"><button class="btn" id="qcheck" disabled>בדיקה</button></div>' : ''}
        <div id="fb"></div></div>`;
      const btns = [...$app.querySelectorAll('.opt')]; const picked = new Set();
      const check = () => {
        const ok = q.c.length === picked.size && q.c.every((k) => picked.has(k));
        btns.forEach((b) => { const k = Number(b.dataset.k); b.disabled = true; b.classList.remove('sel'); if (q.c.includes(k)) b.classList.add('right'); else if (picked.has(k)) b.classList.add('wrong'); });
        if (ok) score++; else wrong.push(i + 1);
        const c = document.getElementById('qcheck'); if (c) c.remove();
        document.getElementById('fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}"><b>${ok ? '✅ נכון!' : '❌ לא בדיוק.'}</b> ${esc(q.x)}</div>
          <div class="row" style="margin-top:12px"><button class="btn" id="qnext">${i + 1 < Q.length ? 'לשאלה הבאה ←' : 'לתוצאה ←'}</button></div>`;
        document.getElementById('qnext').onclick = () => { i++; show(); };
      };
      btns.forEach((b) => b.onclick = () => {
        const k = Number(b.dataset.k);
        if (!q.multi) { picked.add(k); return check(); }
        if (picked.has(k)) picked.delete(k); else picked.add(k);
        b.classList.toggle('sel', picked.has(k)); b.querySelector('.box').textContent = picked.has(k) ? '☑' : '☐';
        document.getElementById('qcheck').disabled = !picked.size;
      });
      const c = document.getElementById('qcheck'); if (c) c.onclick = check;
    };
    const finish = async () => {
      try { user = (await api('wb/quiz', { m: CUR, score, total: Q.length, wrong, date: today() })).user; } catch (e) {}
      const pct = Math.round(score / Q.length * 100);
      $app.innerHTML = `${head}<div class="card center"><div style="font-size:3rem">${pct === 100 ? '🏆' : pct >= 60 ? '🌟' : '💪'}</div>
        <h1>${score} מתוך ${Q.length}</h1><p>${pct === 100 ? 'מושלם!' : pct >= 60 ? 'עבודה טובה!' : 'שווה לחזור על החומר ולנסות שוב.'}</p>
        <div class="row" style="justify-content:center"><button class="btn ghost" id="again">🔁 שוב</button>${wbNav('quiz').replace(/<div class="row between noprint" style="margin-top:16px">|<\/div>$/g, '')}</div></div>
        ${hist.length ? `<div class="card"><h2>🗓️ ניסיונות קודמים</h2><table class="tbl">${hist.slice().reverse().map((h) => `<tr><td>${fmtDate(h.date || h.at)}</td><td><b>${h.score}/${h.total}</b></td></tr>`).join('')}</table></div>` : ''}`;
      document.getElementById('again').onclick = () => wbQuiz();
    };
    show();
  }
  function wbJournal() {
    const J = WB().journal || {}; const t = today();
    let date = sessionStorage.getItem('wb_jdate') || t; if (date > t) date = t;
    const e = J[date] || { savor: '', grat: [] };
    const days = Object.keys(J).sort().reverse();
    const shift = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    $app.innerHTML = `<p class="small"><a href="#/wb/${CUR}">😊 ${esc(WBC.moduleTitle)}</a></p>
      <div class="card"><h1>📔 היומן שלי: הנאה מודעת ותודה</h1>
      <p class="muted">7 ימים: כל ערב רושמים על מה התענגתם היום, וחמישה דברים שאתם מוקירים תודה עליהם. הכול נשמר בחשבון שלכם.</p>
      <div class="row"><span class="big7">${Array.from({ length: 7 }, (_, i) => `<span class="dot ${i < days.length ? 'on' : ''}"></span>`).join('')}</span><span class="small muted">${days.length}/7 ימים</span></div></div>
      <div class="card"><div class="row between"><button class="btn ghost" id="jprev">→ יום קודם</button><h2 style="margin:0">${date === t ? 'היום' : fmtDate(date)}</h2><button class="btn ghost" id="jnext" ${date >= t ? 'disabled' : ''}>יום הבא ←</button></div>
        <h3 style="margin-top:16px">🌸 על מה התענגתי היום?</h3>
        <textarea id="jsav" class="search" rows="3" style="width:100%;resize:vertical" placeholder="למשל: ארוחת ערב עם המשפחה – צילמתי תמונה וסיפרתי לאבא כמה היה טעים">${esc(e.savor)}</textarea>
        <h3>🙏 חמישה דברים שאני מוקיר/ה תודה עליהם</h3>
        ${[0, 1, 2, 3, 4].map((i) => `<input class="search jg" style="width:100%;margin:4px 0" placeholder="${i + 1}." value="${esc(e.grat[i] || '')}">`).join('')}
        <div class="row" style="margin-top:12px"><button class="btn" id="jsave">💾 שמירה</button></div></div>
      ${days.length ? `<div class="card"><h2>📅 מה כתבתי</h2>${days.map((d) => `<details class="wbq"><summary><b>${fmtDate(d)}</b> ${J[d].savor ? '· 🌸 ' + esc(J[d].savor.slice(0, 50)) : ''}</summary><div class="ans">${J[d].savor ? `<p>🌸 ${esc(J[d].savor)}</p>` : ''}${J[d].grat.filter(Boolean).length ? `<ol>${J[d].grat.filter(Boolean).map((g) => `<li>${esc(g)}</li>`).join('')}</ol>` : ''}</div></details>`).join('')}</div>` : ''}
      ${wbNav('journal')}`;
    document.getElementById('jprev').onclick = () => { sessionStorage.setItem('wb_jdate', shift(date, -1)); wbJournal(); };
    document.getElementById('jnext').onclick = () => { sessionStorage.setItem('wb_jdate', shift(date, 1)); wbJournal(); };
    document.getElementById('jsave').onclick = async () => {
      try {
        user = (await api('wb/journal', { date, savor: document.getElementById('jsav').value, grat: [...$app.querySelectorAll('.jg')].map((x) => x.value) })).user;
        toast('✅ נשמר ביומן'); wbJournal();
      } catch (er) { toast('לא הצלחנו לשמור, נסו שוב'); }
    };
  }

  // ---------- router ----------
  function go(h) { location.hash = h; }
  async function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const r = parts[0];
    if (r === 'parent') { setBrand(null); return viewParent(); }
    if (!user) {
      const saved = localStorage.getItem('vamos_email');
      if (saved) {
        try { user = (await api('login', { email: saved })).user; } catch (e) { user = null; }
      }
      if (!user) { localStorage.removeItem('vamos_email'); return viewLogin(r === 'signup' ? 'signup' : 'login'); }
    }
    document.getElementById('topbar').hidden = false;
    document.getElementById('username').textContent = '👤 ' + user.name;
    setBrand(r === 'courses' ? null : r === 'wb' ? WBINFO : INFO);
    document.getElementById('mainnav').style.visibility = r === 'wb' ? 'hidden' : '';
    if (r === 'courses' || r === 'unlock' || (r === 'wb' && locked('wb'))) { try { user = (await api('me')).user; } catch (e) {} }
    if (r === 'wb') { if ('speechSynthesis' in window) speechSynthesis.cancel(); return viewWb(parts); }
    if (r === 'unlock') { setBrand(null); return viewUnlock(parts[1]); }
    if (r !== 'courses' && locked(COURSE)) return go('#/unlock/' + COURSE);
    if (!localStorage.getItem('vamos_course') && r !== 'courses') return go('#/courses');
    const navKey = { courses: 'home', lesson: 'lessons', quiz: 'quizzes', results: 'quizzes', mistakes: 'quizzes', certificate: 'badges' }[r] || r;
    document.querySelectorAll('#mainnav a').forEach((a) => a.classList.toggle('on', a.dataset.r === navKey));
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    switch (r) {
      case 'home': return viewHome();
      case 'courses': return viewCourses();
      case 'lessons': return viewLessons();
      case 'lesson': return viewLesson(Number(parts[1]), parts[2]);
      case 'quizzes': return viewQuizzes();
      case 'quiz': return viewQuiz(Number(parts[1]));
      case 'results': return viewResults(parts[1] === 'mistakes' ? 'mistakes' : Number(parts[1]));
      case 'mistakes': return viewMistakes();
      case 'words': return viewWords();
      case 'flashcards': return viewFlashcards();
      case 'badges': return viewBadges();
      case 'certificate': return viewCertificate();
      default: return viewHome();
    }
  }
  document.getElementById('logout').onclick = () => { localStorage.removeItem('vamos_email'); user = null; go('#/'); viewLogin(); };
  window.addEventListener('hashchange', route);
  let saved = 'es'; try { saved = localStorage.getItem('vamos_course') || 'es'; } catch (e) {}
  setCourse(saved, false);
  route();
})();
