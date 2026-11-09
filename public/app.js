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
    n.lang = info ? info.code : 'he'; n.dir = info ? 'ltr' : 'rtl';
    document.title = info ? `${info.brand} – ${info.name} בכיף` : 'לומדים שפות – ספרדית וצרפתית בכיף';
  }

  function viewCourses() {
    const card = (c) => {
      const info = COURSES[c]; const d = c === 'es' ? user : (user.courses && user.courses[c]) || EMPTY;
      const n = Object.keys(d.lessons).length;
      return `<a class="card lcard" href="#/home" data-course="${c}" style="padding:24px;flex-wrap:wrap">
        <span class="em" style="font-size:2.6rem;width:72px;height:72px">${info.flag}</span>
        <span style="flex:1 1 180px"><h2 style="margin:0">${info.name} <bdi dir="ltr" lang="${c}" class="muted small">${esc(info.brand)}</bdi></h2>
        <span class="small muted">30 שיעורים למתחילים · כ-20 דקות ליום</span>
        <div class="bar" style="margin-top:8px"><i style="width:${n / 30 * 100}%"></i></div>
        <span class="small">${n ? `סיימתם ${n} מתוך 30` : 'עוד לא התחלתם'}</span></span>
        <span class="btn" style="flex:1 1 100%">${n ? 'להמשיך' : 'להתחיל'} ←</span></a>`;
    };
    $app.innerHTML = `<h1>איזו שפה לומדים היום, ${esc(user.name)}? 🌍</h1>
      <p class="muted">כל קורס נשמר בנפרד – אפשר ללמוד את שניהם ולעבור ביניהם מתי שרוצים.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${card('es')}${card('fr')}</div>`;
    $app.querySelectorAll('[data-course]').forEach((a) => a.onclick = () => { setCourse(a.dataset.course); });
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
    const statusHe = (st) => !st ? 'עוד לא נבדק היום' : st === 'sent' ? '✅ נשלחה תזכורת' : st === 'done-already' ? '🌟 השיעור כבר נעשה – לא נשלחה תזכורת' : st === 'checking' ? 'בבדיקה…' : '⚠️ ' + st;
    const remCard = rem ? `<div class="card"><h2>📱 תזכורות וואטסאפ</h2>
      <p style="margin-top:0">${rem.configured ? `✅ מחובר. כל יום בשעה <b>${esc(rem.time)}</b> נבדק מי לא עשה שיעור היום, ונשלחת אליו תזכורת (תבנית: <bdi dir="ltr">${esc(rem.template)}</bdi>).` : '⚠️ וואטסאפ עוד לא מוגדר בשרת.'}</p>
      ${rem.log && rem.log.length ? `<details><summary>יומן שליחות אחרונות (${rem.log.length})</summary><table class="tbl">${rem.log.slice(0, 15).map((l) => `<tr><td>${fmtDate(l.at)} ${new Date(l.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</td><td dir="ltr" style="text-align:right">${esc(l.email)}</td><td>${l.ok ? '✅ נשלח' : '❌ ' + esc(l.error || '')}</td></tr>`).join('')}</table></details>` : ''}</div>` : '';
    $app.innerHTML = `<div class="row between"><h1>👨‍👩‍👧 אזור הורים</h1><button class="btn ghost" id="out">יציאה מאזור ההורים</button></div>
      <div class="card scroll"><table class="tbl"><tr><th>שם</th><th>מייל</th><th>🇪🇸 ספרדית</th><th>🇫🇷 צרפתית</th><th>טעויות פתוחות</th><th>פעילות אחרונה</th></tr>
      ${users.map((u) => { const a = summary(u, 'es'), b = summary(u, 'fr'); return `<tr><td><b>${esc(u.name || '—')}</b></td><td dir="ltr" style="text-align:right">${esc(u.email)}</td><td>${a.ids.length}/30 · ${a.avg == null ? '–' : a.avg}</td><td>${dataOf(u, 'fr') ? `${b.ids.length}/30 · ${b.avg == null ? '–' : b.avg}` : '–'}</td><td>${a.mist + b.mist}</td><td>${a.last ? fmtDate(a.last) : '–'}</td></tr>`; }).join('') || '<tr><td colspan="6">אין עדיין משתמשים</td></tr>'}
      </table></div>
      ${remCard}
      ${users.map((u) => `<div class="card"><h2>${esc(u.name || u.email)}</h2>
        <div class="row" style="margin-bottom:12px">
          <label class="small">📱 טלפון לתזכורות: <input class="search" style="width:190px;margin:0;direction:ltr" data-ph="${esc(u.email)}" value="${esc(u.phone || '')}" placeholder="05X-XXXXXXX"></label>
          <label class="small"><input type="checkbox" data-off="${esc(u.email)}" ${u.remindersOff ? 'checked' : ''}> השהיית תזכורות</label>
          <button class="btn ghost" data-save="${esc(u.email)}">שמירה</button>
          ${u.phone ? `<button class="btn alt" data-test="${esc(u.email)}">שליחת תזכורת לבדיקה</button>` : ''}
          <span class="small muted">היום: ${statusHe(rem && rem.sent && rem.sent[today] && rem.sent[today][u.email])}</span>
        </div>
        ${trackerFor(u, 'es')}${dataOf(u, 'fr') ? trackerFor(u, 'fr') : ''}</div>`).join('')}`;
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
    setBrand(r === 'courses' ? null : INFO);
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
