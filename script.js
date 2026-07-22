/* ============================================================
   YTH TECH CHALLENGE — Logique complète de l'application
   Version autonome · Firebase Firestore · Vanilla JS
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────
// CONFIGURATION FIREBASE
// ➜ Remplacez ces valeurs par celles de votre projet Firebase
// ─────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBJDUubn3xUU9WBpO0yXMeBzxI6-O-6ryE",
  authDomain:        "yth-tech-challenge.firebaseapp.com",
  projectId:         "yth-tech-challenge",
  storageBucket:     "yth-tech-challenge.firebasestorage.app",
  messagingSenderId: "392359106177",
  appId:             "1:392359106177:web:091f92249dda551e681f80"
};

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const PASSWORD = 'YTH@YOUTH2024';
const TOTAL_QUESTIONS = 15;
const TIMER_SECONDS   = 15;
const TIMER_CIRC      = 2 * Math.PI * 54; // ≈ 339.29

const CATEGORIES = [
  { name: 'Informatique & Numérique',  icon: '💻', color: '#3b82f6' },
  { name: 'Robotique & Électronique',  icon: '🤖', color: '#f59e0b' },
  { name: 'Calcul Mental',             icon: '🧮', color: '#10b981' },
  { name: 'Histoire & Géographie',     icon: '🌍', color: '#8b5cf6' },
  { name: 'Quiz Togo',                 icon: '🇹🇬', color: '#ef4444' },
  { name: 'Culture Générale',          icon: '📚', color: '#ec4899' }
];

const LEVELS = [
  { min: 0,    max: 499,      name: 'Explorateur Tech' },
  { min: 500,  max: 999,      name: 'Maker'            },
  { min: 1000, max: 1499,     name: 'Innovateur'       },
  { min: 1500, max: 1999,     name: 'Tech Hero'        },
  { min: 2000, max: Infinity, name: 'YTH Legend'       }
];

const BADGE_DEFS = {
  'Informatique & Numérique': 'Digital Genius',
  'Robotique & Électronique': 'Robot Master',
  'Calcul Mental':            'Mental Calculator',
  'Histoire & Géographie':    'Historien Explorer',
  'Quiz Togo':                'Ambassadeur du Togo',
  'Culture Générale':         'Culture Master'
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

// ─────────────────────────────────────────────
// ÉTAT DU JEU
// ─────────────────────────────────────────────
let G = createFreshState();
let logoClickCount  = 0;
let logoClickTimer  = null;
let allAdminQuestions = [];
let audioCtx = null;

function createFreshState() {
  return {
    playerName:         '',
    selectedCategories: [],
    questions:          [],
    currentIdx:         0,
    score:              0,
    xp:                 0,
    lives:              3,
    combo:              0,
    comboMultiplier:    1,
    correct:            0,
    wrong:              0,
    categoryStats:      {}, // { catName: { correct, total } }
    badges:             [],
    jokers:             { half: false, time: false, skip: false },
    timerInterval:      null,
    timeLeft:           TIMER_SECONDS,
    answered:           false,
    gameStartTime:      null,
    totalTime:          0,
    savedToFirestore:   false
  };
}

// ─────────────────────────────────────────────
// SONS (Web Audio API)
// ─────────────────────────────────────────────
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq1, freq2, duration = 0.3) {
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq1, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(freq2, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function playCorrect() { playTone(440, 880, 0.25); }
function playWrong()   { playTone(440, 220, 0.35); }
function playTick()    { playTone(900, 900, 0.06); }

// ─────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getLevel(xp) {
  return LEVELS.find(l => xp >= l.min && xp <= l.max) || LEVELS[0];
}

function getCategoryColor(catName) {
  const cat = CATEGORIES.find(c => c.name === catName);
  return cat ? cat.color : '#7c3aed';
}

function calcBadges(categoryStats) {
  const earned = [];
  for (const [cat, stats] of Object.entries(categoryStats)) {
    if (stats.total > 0 && (stats.correct / stats.total) >= 0.9 && BADGE_DEFS[cat]) {
      earned.push(BADGE_DEFS[cat]);
    }
  }
  if (getLevel(G.xp).name === 'YTH Legend') earned.push('YTH Legend');
  return [...new Set(earned)];
}

function formatDate(date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ─────────────────────────────────────────────
// PAGE : LOGIN
// ─────────────────────────────────────────────
function handleLogoClick() {
  logoClickCount++;
  if (logoClickTimer) clearTimeout(logoClickTimer);
  logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 2500);

  if (logoClickCount >= 5) {
    logoClickCount = 0;
    sessionStorage.setItem('yth_admin', '1');
    showPage('page-admin');
    document.getElementById('admin-auth-wall').style.display = 'flex';
    document.getElementById('admin-panel').classList.add('hidden');
  }
}

function loginSubmit() {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('access-code').value.trim();
  const err  = document.getElementById('login-error');

  if (!name) { err.textContent = 'Veuillez entrer votre nom.'; return; }
  if (code !== PASSWORD) { err.textContent = 'Code d\'accès incorrect.'; return; }

  err.textContent = '';
  G = createFreshState();
  G.playerName = name;
  buildCategoriesPage();
  showPage('page-categories');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('page-login').classList.contains('active')) {
    loginSubmit();
  }
});

// ─────────────────────────────────────────────
// PAGE : CATÉGORIES
// ─────────────────────────────────────────────
function buildCategoriesPage() {
  document.getElementById('welcome-msg').textContent =
    `Bonjour, ${G.playerName} !`;

  const grid = document.getElementById('categories-grid');
  grid.innerHTML = '';

  CATEGORIES.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.style.setProperty('--cat-color', cat.color);
    card.innerHTML = `
      <div class="cat-check" id="check-${encodeId(cat.name)}">&#10003;</div>
      <div class="cat-icon">${cat.icon}</div>
      <div class="cat-name">${cat.name}</div>
    `;
    card.addEventListener('click', () => toggleCategory(cat.name, card));
    grid.appendChild(card);
  });

  // Populate admin filter too
  const sel = document.getElementById('admin-filter-cat');
  if (sel.children.length === 1) {
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = cat.name;
      sel.appendChild(opt);
    });
  }

  updatePlayButton();
}

function encodeId(str) { return str.replace(/[^a-zA-Z0-9]/g, '_'); }

function toggleCategory(name, card) {
  const idx = G.selectedCategories.indexOf(name);
  if (idx === -1) { G.selectedCategories.push(name); card.classList.add('selected'); }
  else { G.selectedCategories.splice(idx, 1); card.classList.remove('selected'); }
  updatePlayButton();
}

function updatePlayButton() {
  document.getElementById('btn-play').disabled = G.selectedCategories.length < 2;
}

// ─────────────────────────────────────────────
// CHARGEMENT DES QUESTIONS
// ─────────────────────────────────────────────
async function startGame() {
  document.getElementById('btn-play').disabled = true;
  document.getElementById('btn-play').textContent = 'Chargement…';

  try {
    const snap = await db.collection('questions')
      .where('active', '==', true)
      .get();

    const allQ = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const selected = G.selectedCategories;

    // Balance across categories
    const perCat   = Math.floor(TOTAL_QUESTIONS / selected.length);
    const extras   = TOTAL_QUESTIONS % selected.length;
    let picked = [];

    selected.forEach((cat, i) => {
      const pool = allQ.filter(q => q.category === cat);
      const count = perCat + (i < extras ? 1 : 0);
      picked = picked.concat(shuffle(pool).slice(0, count));
    });

    picked = shuffle(picked);

    if (picked.length === 0) {
      alert('Aucune question active trouvée pour ces catégories. Ajoutez des questions dans le panneau admin.');
      document.getElementById('btn-play').disabled = false;
      document.getElementById('btn-play').textContent = 'JOUER';
      return;
    }

    // Init category stats
    selected.forEach(cat => { G.categoryStats[cat] = { correct: 0, total: 0 }; });

    G.questions     = picked;
    G.currentIdx    = 0;
    G.gameStartTime = Date.now();
    G.jokers        = { half: false, time: false, skip: false };

    showPage('page-game');
    renderQuestion();
  } catch (e) {
    console.error(e);
    alert('Erreur de connexion Firebase : ' + e.message);
    document.getElementById('btn-play').disabled = false;
    document.getElementById('btn-play').textContent = 'JOUER';
  }
}

// ─────────────────────────────────────────────
// PAGE : JEU
// ─────────────────────────────────────────────
function renderQuestion() {
  clearInterval(G.timerInterval);
  G.answered = false;
  G.timeLeft = TIMER_SECONDS;

  const q = G.questions[G.currentIdx];
  if (!q) { endGame(); return; }

  // Counter
  document.getElementById('q-counter').textContent =
    `Q ${G.currentIdx + 1}/${G.questions.length}`;
  document.getElementById('score-display').textContent = `Score : ${G.score}`;
  document.getElementById('xp-display').textContent   = `XP : ${G.xp}`;

  // Lives
  renderLives();

  // Combo
  const comboEl = document.getElementById('combo-display');
  if (G.combo >= 3) {
    comboEl.textContent = `🔥 COMBO ×${G.comboMultiplier}`;
    comboEl.classList.remove('hidden');
  } else {
    comboEl.classList.add('hidden');
  }

  // Category label
  const color = getCategoryColor(q.category);
  const catEl = document.getElementById('question-category-label');
  catEl.textContent = q.category;
  catEl.style.color = color;

  // Image
  const imgEl = document.getElementById('question-image');
  if (q.image) {
    imgEl.src = q.image;
    imgEl.classList.remove('hidden');
  } else {
    imgEl.classList.add('hidden');
  }

  // Question text
  document.getElementById('question-text').textContent = q.question;

  // Options
  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';
  const options = Array.isArray(q.options) ? q.options : [];

  options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.dataset.index = idx;
    btn.innerHTML = `
      <span class="option-letter">${OPTION_LETTERS[idx]}</span>
      <span>${opt}</span>
    `;
    btn.addEventListener('click', () => selectAnswer(idx, btn));
    grid.appendChild(btn);
  });

  // Jokers UI
  document.getElementById('joker-half').disabled = G.jokers.half;
  document.getElementById('joker-time').disabled = G.jokers.time;
  document.getElementById('joker-skip').disabled = G.jokers.skip;

  // Timer
  updateTimerRing(TIMER_SECONDS);
  startTimer();
}

function renderLives() {
  const el = document.getElementById('lives-display');
  el.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const span = document.createElement('span');
    span.textContent = i < G.lives ? '❤️' : '🖤';
    el.appendChild(span);
  }
}

function startTimer() {
  const ring = document.getElementById('timer-ring');
  const timerWrap = document.querySelector('.timer-wrap');
  updateTimerRing(G.timeLeft);

  G.timerInterval = setInterval(() => {
    G.timeLeft--;
    document.getElementById('timer-text').textContent = G.timeLeft;
    updateTimerRing(G.timeLeft);

    if (G.timeLeft <= 5) {
      timerWrap.classList.add('timer-warn');
      playTick();
    } else {
      timerWrap.classList.remove('timer-warn');
    }

    if (G.timeLeft <= 0) {
      clearInterval(G.timerInterval);
      timerWrap.classList.remove('timer-warn');
      if (!G.answered) handleTimeout();
    }
  }, 1000);
}

function updateTimerRing(t) {
  const ring = document.getElementById('timer-ring');
  const offset = TIMER_CIRC * (1 - t / TIMER_SECONDS);
  ring.style.strokeDashoffset = Math.max(0, offset);
  document.getElementById('timer-text').textContent = t;
}

function selectAnswer(optIdx, btn) {
  if (G.answered) return;
  G.answered = true;
  clearInterval(G.timerInterval);
  document.querySelector('.timer-wrap').classList.remove('timer-warn');

  const q = G.questions[G.currentIdx];
  const options = q.options || [];
  const correctLetter = (q.answer || '').toUpperCase().trim();
  const correctIdx    = OPTION_LETTERS.indexOf(correctLetter);
  const isCorrect     = optIdx === correctIdx;

  // Disable all buttons
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);

  if (isCorrect) {
    btn.classList.add('correct');
    handleCorrect();
  } else {
    btn.classList.add('wrong');
    const correctBtn = document.querySelector(`.option-btn[data-index="${correctIdx}"]`);
    if (correctBtn) correctBtn.classList.add('correct');
    handleWrong();
  }

  // Update category stats
  if (G.categoryStats[q.category]) {
    G.categoryStats[q.category].total++;
    if (isCorrect) G.categoryStats[q.category].correct++;
  }

  // Show feedback after short delay
  setTimeout(() => showFeedback(isCorrect, q.explanation || ''), 600);
}

function handleCorrect() {
  const speedBonus = G.timeLeft > 10 ? 50 : G.timeLeft >= 5 ? 25 : 0;
  G.combo++;
  G.comboMultiplier = G.combo >= 5 ? 3 : G.combo >= 3 ? 2 : 1;
  const xpEarned = (100 + speedBonus) * G.comboMultiplier;

  G.score += 100 + speedBonus;
  G.xp    += xpEarned;
  G.correct++;

  playCorrect();
  confetti({ particleCount: 80, spread: 65, origin: { y: 0.6 }, colors: ['#7c3aed','#ec4899','#10b981','#f59e0b'] });
}

function handleWrong() {
  G.lives--;
  G.combo = 0;
  G.comboMultiplier = 1;
  G.wrong++;
  playWrong();
}

function handleTimeout() {
  G.answered = true;
  G.lives--;
  G.combo = 0;
  G.comboMultiplier = 1;
  G.wrong++;

  const q = G.questions[G.currentIdx];
  const correctLetter = (q.answer || '').toUpperCase().trim();
  const correctIdx    = OPTION_LETTERS.indexOf(correctLetter);
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
  const correctBtn = document.querySelector(`.option-btn[data-index="${correctIdx}"]`);
  if (correctBtn) correctBtn.classList.add('correct');

  if (G.categoryStats[q.category]) {
    G.categoryStats[q.category].total++;
  }

  playWrong();
  setTimeout(() => showFeedback(false, q.explanation || '', true), 400);
}

function showFeedback(isCorrect, expl, timeout = false) {
  document.getElementById('feedback-icon').textContent = isCorrect ? '✅' : '❌';
  document.getElementById('feedback-msg').textContent  = isCorrect
    ? `+${G.combo >= 3 ? '(COMBO!) ' : ''}Bonne réponse !`
    : timeout ? 'Temps écoulé !' : 'Mauvaise réponse…';
  document.getElementById('feedback-expl').textContent = expl;
  document.getElementById('feedback-overlay').classList.remove('hidden');

  if (G.lives <= 0) {
    document.querySelector('#feedback-overlay button').textContent = 'VOIR MES RÉSULTATS';
    document.querySelector('#feedback-overlay button').onclick = endGame;
  } else {
    document.querySelector('#feedback-overlay button').textContent = 'SUIVANT';
    document.querySelector('#feedback-overlay button').onclick = nextQuestion;
  }
}

function nextQuestion() {
  document.getElementById('feedback-overlay').classList.add('hidden');
  G.currentIdx++;

  if (G.currentIdx >= G.questions.length || G.lives <= 0) {
    endGame();
  } else {
    renderQuestion();
  }
}

function useJoker(type) {
  if (G.answered) return;

  if (type === 'half' && !G.jokers.half) {
    G.jokers.half = true;
    document.getElementById('joker-half').disabled = true;
    applyHalfJoker();

  } else if (type === 'time' && !G.jokers.time) {
    G.jokers.time = true;
    document.getElementById('joker-time').disabled = true;
    G.timeLeft = Math.min(G.timeLeft + 10, TIMER_SECONDS);
    updateTimerRing(G.timeLeft);

  } else if (type === 'skip' && !G.jokers.skip) {
    G.jokers.skip = true;
    document.getElementById('joker-skip').disabled = true;
    clearInterval(G.timerInterval);
    document.querySelector('.timer-wrap').classList.remove('timer-warn');
    G.answered = true;
    G.currentIdx++;
    document.getElementById('feedback-overlay').classList.add('hidden');
    if (G.currentIdx >= G.questions.length) endGame();
    else renderQuestion();
  }
}

function applyHalfJoker() {
  const q = G.questions[G.currentIdx];
  const correctLetter = (q.answer || '').toUpperCase().trim();
  const correctIdx    = OPTION_LETTERS.indexOf(correctLetter);
  const wrongIdxs     = [0, 1, 2, 3].filter(i => i !== correctIdx);
  const toEliminate   = shuffle(wrongIdxs).slice(0, 2);

  toEliminate.forEach(idx => {
    const btn = document.querySelector(`.option-btn[data-index="${idx}"]`);
    if (btn) { btn.classList.add('eliminated'); btn.disabled = true; }
  });
}

// ─────────────────────────────────────────────
// FIN DE JEU
// ─────────────────────────────────────────────
function endGame() {
  clearInterval(G.timerInterval);
  G.totalTime = Math.round((Date.now() - G.gameStartTime) / 1000);
  G.badges = calcBadges(G.categoryStats);
  document.getElementById('feedback-overlay').classList.add('hidden');
  buildResultsPage();
  showPage('page-results');
  saveScore();
}

function buildResultsPage() {
  const level = getLevel(G.xp);
  document.getElementById('results-level-banner').textContent = `🏆 ${level.name}`;
  document.getElementById('res-score').textContent   = G.score;
  document.getElementById('res-xp').textContent      = `${G.xp} XP`;
  document.getElementById('res-correct').textContent = G.correct;
  document.getElementById('res-wrong').textContent   = G.wrong;

  const badgesEl = document.getElementById('results-badges');
  badgesEl.innerHTML = '';
  if (G.badges.length === 0) {
    badgesEl.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem">Aucun badge gagné cette fois — continue tes efforts !</p>';
  } else {
    G.badges.forEach(b => {
      const chip = document.createElement('div');
      chip.className = 'badge-chip';
      chip.innerHTML = `<span class="badge-icon">🏅</span>${b}`;
      badgesEl.appendChild(chip);
    });
  }
}

async function saveScore() {
  if (G.savedToFirestore) return;
  G.savedToFirestore = true;
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = 'Enregistrement en cours…';
  statusEl.style.color = 'var(--text-muted)';

  try {
    await db.collection('scores').add({
      name:      G.playerName,
      score:     G.score,
      xp:        G.xp,
      level:     getLevel(G.xp).name,
      correct:   G.correct,
      wrong:     G.wrong,
      combo:     G.combo,
      time:      G.totalTime,
      categories: G.selectedCategories,
      badges:    G.badges,
      date:      formatDate(new Date()),
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    statusEl.textContent = '✅ Score enregistré !';
    statusEl.style.color = 'var(--green)';
  } catch (e) {
    statusEl.textContent = '⚠️ Erreur lors de l\'enregistrement : ' + e.message;
    statusEl.style.color = 'var(--red)';
  }
}

// ─────────────────────────────────────────────
// PAGE : CERTIFICAT
// ─────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (!page) return;
  page.classList.add('active');
  window.scrollTo(0, 0);

  if (id === 'page-certificate') buildCertificate();
  if (id === 'page-leaderboard') loadLeaderboard();
  if (id === 'page-champions')   loadChampions();
  if (id === 'page-admin' && sessionStorage.getItem('yth_admin') === '1') {
    // already handled
  }
}

function buildCertificate() {
  const level = getLevel(G.xp);
  document.getElementById('cert-name').textContent    = G.playerName;
  document.getElementById('cert-score').textContent   = G.score;
  document.getElementById('cert-xp').textContent      = G.xp + ' XP';
  document.getElementById('cert-level').textContent   = level.name;
  document.getElementById('cert-date').textContent    = formatDate(new Date());

  // Categories
  document.getElementById('cert-categories').textContent =
    'Catégories : ' + G.selectedCategories.join(' · ');

  // Badges
  const badgesEl = document.getElementById('cert-badges');
  badgesEl.innerHTML = '';
  G.badges.forEach(b => {
    const span = document.createElement('span');
    span.className = 'cert-badge';
    span.textContent = b;
    badgesEl.appendChild(span);
  });

  // QR Code
  const qrEl = document.getElementById('cert-qr');
  qrEl.innerHTML = '';
  try {
    new QRCode(qrEl, {
      text: JSON.stringify({ name: G.playerName, score: G.score, xp: G.xp, level: level.name }),
      width: 100, height: 100,
      colorDark: '#000000', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (e) { qrEl.textContent = '(QR indisponible)'; }
}

async function downloadPDF() {
  const btn = document.querySelector('.cert-actions .btn-primary');
  btn.textContent = 'Génération…'; btn.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const card = document.getElementById('certificate-card');
    const canvas = await html2canvas(card, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    let w = pw, h = pw / ratio;
    if (h > ph) { h = ph; w = ph * ratio; }
    pdf.addImage(imgData, 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
    pdf.save(`certificat-yth-${G.playerName.replace(/\s+/g, '_')}.pdf`);
  } catch (e) {
    alert('Erreur lors de la génération du PDF : ' + e.message);
  } finally {
    btn.textContent = 'Télécharger PDF'; btn.disabled = false;
  }
}

// ─────────────────────────────────────────────
// PAGE : CLASSEMENT
// ─────────────────────────────────────────────
async function loadLeaderboard() {
  showPage('page-leaderboard');
  const container = document.getElementById('leaderboard-table');
  container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem">Chargement…</p>';

  try {
    const snap = await db.collection('scores').orderBy('xp', 'desc').limit(20).get();
    if (snap.empty) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem">Aucun score enregistré.</p>'; return; }

    const table = document.createElement('table');
    table.className = 'lb-table';
    table.innerHTML = `
      <thead><tr>
        <th>#</th><th>Nom</th><th>XP</th><th>Score</th><th>Niveau</th><th>Badges</th><th>Date</th>
      </tr></thead>
      <tbody id="lb-body"></tbody>
    `;
    container.innerHTML = '';
    container.appendChild(table);

    const tbody = table.querySelector('#lb-body');
    snap.docs.forEach((doc, i) => {
      const d = doc.data();
      const rankClass = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : 'rank-num';
      const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="${rankClass}">${rankEmoji}</td>
        <td><strong>${esc(d.name || '—')}</strong></td>
        <td style="color:var(--amber);font-weight:700">${d.xp || 0}</td>
        <td>${d.score || 0}</td>
        <td class="lb-level">${esc(d.level || '—')}</td>
        <td>${(d.badges || []).length}</td>
        <td style="color:var(--text-muted);font-size:.8rem">${esc(d.date || '—')}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    container.innerHTML = `<p style="color:var(--red);text-align:center;padding:2rem">Erreur : ${e.message}</p>`;
  }
}

// ─────────────────────────────────────────────
// PAGE : CHAMPIONS
// ─────────────────────────────────────────────
async function loadChampions() {
  showPage('page-champions');
  const grid = document.getElementById('champions-grid');
  grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem;grid-column:1/-1">Chargement…</p>';

  try {
    const snap = await db.collection('scores').orderBy('xp', 'desc').limit(200).get();
    const scores = snap.docs.map(d => d.data());

    // General champion
    const generalChamp = scores[0] || null;

    // Category champions: find highest XP player who played that category
    const champData = [
      { title: 'Champion Général', cat: null, color: '#fbbf24' },
      ...CATEGORIES.map(c => ({ title: `Champion ${c.name}`, cat: c.name, color: c.color }))
    ];

    grid.innerHTML = '';

    champData.forEach(def => {
      let champ = null;
      if (def.cat === null) {
        champ = generalChamp;
      } else {
        champ = scores.find(s => (s.categories || []).includes(def.cat)) || null;
      }

      const card = document.createElement('div');
      card.className = 'champion-card';
      card.style.setProperty('--cat-color', def.color);

      if (champ) {
        card.innerHTML = `
          <div class="champ-title">&#127942; ${def.cat ? 'Champion' : 'Champion Général'}</div>
          <div class="champ-cat">${def.cat || 'Toutes catégories'}</div>
          <div class="champ-name">${esc(champ.name)}</div>
          <div class="champ-xp">${champ.xp || 0} XP</div>
          <div class="champ-level">${esc(champ.level || '')}</div>
        `;
      } else {
        card.innerHTML = `
          <div class="champ-title">${def.cat ? 'Champion' : 'Champion Général'}</div>
          <div class="champ-cat">${def.cat || 'Toutes catégories'}</div>
          <div class="champ-empty">Pas encore de champion</div>
        `;
      }
      grid.appendChild(card);
    });
  } catch (e) {
    grid.innerHTML = `<p style="color:var(--red);text-align:center;padding:2rem;grid-column:1/-1">Erreur : ${e.message}</p>`;
  }
}

// ─────────────────────────────────────────────
// PAGE : ADMIN
// ─────────────────────────────────────────────
function adminLogin() {
  const pwd = document.getElementById('admin-password').value;
  const err = document.getElementById('admin-auth-error');
  if (pwd !== PASSWORD) { err.textContent = 'Mot de passe incorrect.'; return; }
  err.textContent = '';
  document.getElementById('admin-auth-wall').style.display = 'none';
  document.getElementById('admin-panel').classList.remove('hidden');
  loadAdminQuestions();
}

function switchTab(id) {
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.remove('hidden');
  const idx = ['tab-list','tab-add','tab-import'].indexOf(id);
  document.querySelectorAll('.admin-tab')[idx].classList.add('active');

  if (id === 'tab-list') loadAdminQuestions();
}

async function loadAdminQuestions() {
  const list = document.getElementById('admin-questions-list');
  list.innerHTML = '<p style="color:var(--text-muted)">Chargement…</p>';

  try {
    const snap = await db.collection('questions').orderBy('category').get();
    allAdminQuestions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAdminList(allAdminQuestions);
  } catch (e) {
    list.innerHTML = `<p style="color:var(--red)">Erreur : ${e.message}</p>`;
  }
}

function renderAdminList(questions) {
  const list = document.getElementById('admin-questions-list');
  if (!questions.length) { list.innerHTML = '<p style="color:var(--text-muted)">Aucune question trouvée.</p>'; return; }

  list.innerHTML = '';
  questions.forEach(q => {
    const row = document.createElement('div');
    row.className = 'admin-q-row';
    const statusClass = q.active ? 'status-active' : 'status-inactive';
    const statusLabel = q.active ? 'Active' : 'Inactive';
    const toggleLabel = q.active ? 'Désactiver' : 'Activer';
    const toggleClass = q.active ? 'toggle-on' : 'toggle-off';

    row.innerHTML = `
      <div class="admin-q-body">
        <div class="admin-q-text">${esc(q.question)}</div>
        <div class="admin-q-meta">
          <span><span class="status-badge ${statusClass}">${statusLabel}</span></span>
          <span>📁 ${esc(q.category)}</span>
          <span>⚡ ${esc(q.difficulty || '—')}</span>
          <span>✅ Rép. : ${esc(q.answer || '—')}</span>
        </div>
      </div>
      <div class="admin-q-actions">
        <button onclick="editQuestion('${q.id}')">Modifier</button>
        <button class="${toggleClass}" onclick="toggleQuestion('${q.id}', ${!q.active})">${toggleLabel}</button>
        <button class="del" onclick="deleteQuestion('${q.id}')">Suppr.</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function filterAdminQuestions() {
  const search  = document.getElementById('admin-search').value.toLowerCase();
  const catFilt = document.getElementById('admin-filter-cat').value;
  const filtered = allAdminQuestions.filter(q => {
    const matchCat  = !catFilt || q.category === catFilt;
    const matchText = !search  || (q.question || '').toLowerCase().includes(search);
    return matchCat && matchText;
  });
  renderAdminList(filtered);
}

function editQuestion(id) {
  const q = allAdminQuestions.find(x => x.id === id);
  if (!q) return;

  switchTab('tab-add');
  document.getElementById('form-title').textContent = 'Modifier la question';
  document.getElementById('edit-id').value          = id;
  document.getElementById('f-question').value       = q.question   || '';
  document.getElementById('f-opt-a').value          = (q.options || [])[0] || '';
  document.getElementById('f-opt-b').value          = (q.options || [])[1] || '';
  document.getElementById('f-opt-c').value          = (q.options || [])[2] || '';
  document.getElementById('f-opt-d').value          = (q.options || [])[3] || '';
  document.getElementById('f-answer').value         = q.answer      || '';
  document.getElementById('f-category').value       = q.category    || '';
  document.getElementById('f-difficulty').value     = q.difficulty  || 'facile';
  document.getElementById('f-explanation').value    = q.explanation || '';
  document.getElementById('f-image').value          = q.image       || '';
  document.getElementById('f-active').checked       = q.active !== false;
}

async function saveQuestion() {
  const id         = document.getElementById('edit-id').value;
  const statusEl   = document.getElementById('form-status');
  const questionTxt = document.getElementById('f-question').value.trim();
  const optA = document.getElementById('f-opt-a').value.trim();
  const optB = document.getElementById('f-opt-b').value.trim();
  const optC = document.getElementById('f-opt-c').value.trim();
  const optD = document.getElementById('f-opt-d').value.trim();
  const answer   = document.getElementById('f-answer').value;
  const category = document.getElementById('f-category').value;

  if (!questionTxt || !optA || !optB || !optC || !optD || !answer || !category) {
    statusEl.textContent = '⚠️ Tous les champs obligatoires doivent être remplis.';
    statusEl.style.color = 'var(--red)';
    return;
  }

  const data = {
    question:    questionTxt,
    options:     [optA, optB, optC, optD],
    answer,
    category,
    difficulty:  document.getElementById('f-difficulty').value,
    explanation: document.getElementById('f-explanation').value.trim(),
    image:       document.getElementById('f-image').value.trim(),
    active:      document.getElementById('f-active').checked
  };

  statusEl.textContent = 'Enregistrement…'; statusEl.style.color = 'var(--text-muted)';

  try {
    if (id) {
      await db.collection('questions').doc(id).update(data);
      statusEl.textContent = '✅ Question mise à jour !';
    } else {
      await db.collection('questions').add(data);
      statusEl.textContent = '✅ Question ajoutée !';
    }
    statusEl.style.color = 'var(--green)';
    resetForm();
    setTimeout(() => { switchTab('tab-list'); }, 1000);
  } catch (e) {
    statusEl.textContent = '❌ Erreur : ' + e.message;
    statusEl.style.color = 'var(--red)';
  }
}

function resetForm() {
  document.getElementById('form-title').textContent = 'Ajouter une question';
  document.getElementById('edit-id').value          = '';
  ['f-question','f-opt-a','f-opt-b','f-opt-c','f-opt-d','f-explanation','f-image'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-answer').value     = '';
  document.getElementById('f-category').value   = '';
  document.getElementById('f-difficulty').value = 'facile';
  document.getElementById('f-active').checked   = true;
  document.getElementById('form-status').textContent = '';
}

async function toggleQuestion(id, newActive) {
  try {
    await db.collection('questions').doc(id).update({ active: newActive });
    loadAdminQuestions();
  } catch (e) { alert('Erreur : ' + e.message); }
}

async function deleteQuestion(id) {
  if (!confirm('Supprimer cette question ? Cette action est irréversible.')) return;
  try {
    await db.collection('questions').doc(id).delete();
    loadAdminQuestions();
  } catch (e) { alert('Erreur : ' + e.message); }
}

async function importQuestions() {
  const statusEl = document.getElementById('import-status');
  const raw = document.getElementById('import-json').value.trim();
  if (!raw) { statusEl.textContent = '⚠️ Collez votre JSON ci-dessus.'; statusEl.style.color = 'var(--red)'; return; }

  let questions;
  try { questions = JSON.parse(raw); }
  catch (e) { statusEl.textContent = '❌ JSON invalide : ' + e.message; statusEl.style.color = 'var(--red)'; return; }

  if (!Array.isArray(questions)) { statusEl.textContent = '❌ Le JSON doit être un tableau.'; statusEl.style.color = 'var(--red)'; return; }

  statusEl.textContent = `Import de ${questions.length} questions…`; statusEl.style.color = 'var(--text-muted)';

  try {
    const batch = db.batch();
    questions.forEach(q => {
      const ref = db.collection('questions').doc();
      batch.set(ref, {
        question:    q.question    || '',
        options:     q.options     || [],
        answer:      q.answer      || '',
        category:    q.category    || '',
        difficulty:  q.difficulty  || 'moyen',
        explanation: q.explanation || '',
        image:       q.image       || '',
        active:      q.active !== false
      });
    });
    await batch.commit();
    statusEl.textContent = `✅ ${questions.length} questions importées !`;
    statusEl.style.color = 'var(--green)';
    document.getElementById('import-json').value = '';
    loadAdminQuestions();
  } catch (e) {
    statusEl.textContent = '❌ Erreur : ' + e.message;
    statusEl.style.color = 'var(--red)';
  }
}

async function exportQuestions() {
  try {
    const snap = await db.collection('questions').get();
    const data = snap.docs.map(d => {
      const q = d.data();
      return { question: q.question, options: q.options, answer: q.answer,
               category: q.category, difficulty: q.difficulty,
               explanation: q.explanation, image: q.image, active: q.active };
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'questions-yth.json'; a.click();
    URL.revokeObjectURL(url);
  } catch (e) { alert('Erreur : ' + e.message); }
}

// ─────────────────────────────────────────────
// UTILITAIRE SÉCURITÉ
// ─────────────────────────────────────────────
function esc(str) {
  if (typeof str !== 'string') return String(str || '');
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function closeModal() { document.getElementById('edit-modal').classList.add('hidden'); }

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
(function init() {
  // Populate admin categories filter
  const sel = document.getElementById('admin-filter-cat');
  CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = cat.name;
    sel.appendChild(opt);
  });

  // If coming back to admin via sessionStorage
  if (sessionStorage.getItem('yth_admin') === '1' &&
      document.getElementById('page-admin').classList.contains('active')) {
    // keep auth wall visible
  }
})();
