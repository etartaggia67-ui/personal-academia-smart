const STATE_KEY = 'pas_v144_state';
const DB_NAME = 'pas_v144_gifs';
const DB_STORE = 'gifs';
const REMOTE_GIF_CACHE = 'pas_v144_remote_gifs';

let data;
let state;
let currentWorkout;
let currentExerciseIndex = 0;
let timerHandle = null;
let timerRemaining = 90;
let deferredInstallPrompt = null;

const $ = (id) => document.getElementById(id);

init();

async function init() {
  registerServiceWorker();
  bindInstallPrompt();
  data = await fetch('data/workouts.json', { cache: 'no-store' }).then(r => r.json());
  state = loadState();
  bindEvents();
  setToday();
  renderHome();
  renderMeasures();
  scheduleInitialGifCache();
}

function defaultState() {
  return {
    nextWorkoutId: 'A',
    lastDone: null,
    restDays: [],
    completed: [],
    performances: {},
    profile: {
      heightCm: data?.defaultProfile?.heightCm || 168,
      idealGoalKg: data?.defaultProfile?.idealGoalKg || 70,
      realGoalKg: data?.defaultProfile?.realGoalKg || 75
    },
    measures: []
  };
}

function loadState() {
  const fallback = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY)) || {};
    return {
      ...fallback,
      ...saved,
      profile: { ...fallback.profile, ...(saved.profile || {}) },
      measures: Array.isArray(saved.measures) ? saved.measures : [],
      performances: saved.performances || {}
    };
  } catch (_) {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function getWorkout(id) {
  return data.workouts.find(w => w.id === id) || data.workouts[0];
}

function sequenceIndex(id) {
  return data.sequence.indexOf(id);
}

function nextId(id) {
  const idx = sequenceIndex(id);
  return data.sequence[(idx + 1) % data.sequence.length];
}

function prevId(id) {
  const idx = sequenceIndex(id);
  return data.sequence[(idx - 1 + data.sequence.length) % data.sequence.length];
}

function setNextWorkout(id) {
  state.nextWorkoutId = id;
  saveState();
  renderHome();
}

function renderHome() {
  const workout = getWorkout(state.nextWorkoutId);
  $('nextWorkoutTitle').textContent = `${workout.id} — ${workout.title}`;
  $('nextWorkoutSubtitle').textContent = workout.subtitle;
  $('lastDone').textContent = state.lastDone ? `Treino ${state.lastDone}` : 'Nenhum';
  $('sequencePills').innerHTML = data.sequence.map(id => `<span class="pill ${id === state.nextWorkoutId ? 'active' : ''}">${id}</span>`).join('');
}

function bindEvents() {
  $('tabWorkout').addEventListener('click', () => showTab('workout'));
  $('tabMeasures').addEventListener('click', () => showTab('measures'));

  $('startBtn').addEventListener('click', () => startWorkout(state.nextWorkoutId));
  $('nextBtn').addEventListener('click', () => setNextWorkout(nextId(state.nextWorkoutId)));
  $('prevBtn').addEventListener('click', () => setNextWorkout(prevId(state.nextWorkoutId)));
  $('restBtn').addEventListener('click', registerRestDay);
  $('closeRestBtn').addEventListener('click', () => $('restPanel').classList.add('hidden'));
  $('closeWorkoutBtn').addEventListener('click', closeWorkout);
  $('exercisePrevBtn').addEventListener('click', () => moveExercise(-1));
  $('exerciseNextBtn').addEventListener('click', () => moveExercise(1));
  $('exerciseSkipBtn').addEventListener('click', () => moveExercise(1));
  $('finishWorkoutBtn').addEventListener('click', finishWorkout);
  $('gifInput').addEventListener('change', importGif);
  $('removeGifBtn').addEventListener('click', removeCurrentGif);
  $('timerStartBtn').addEventListener('click', () => startTimer(timerRemaining || currentExercise().rest || 90));
  $('timer45Btn').addEventListener('click', () => startTimer(45));
  $('timerResetBtn').addEventListener('click', () => resetTimer(currentExercise().rest || 90));
  $('resetBtn').addEventListener('click', resetSequence);
  $('savePerformanceBtn').addEventListener('click', savePerformance);
  $('clearPerformanceBtn').addEventListener('click', clearPerformance);

  $('measureForm').addEventListener('submit', saveMeasure);
  $('clearMeasureFormBtn').addEventListener('click', clearMeasureForm);
  $('clearMeasuresBtn').addEventListener('click', clearMeasures);
  $('exportMeasuresBtn').addEventListener('click', exportMeasures);
}

function showTab(tab) {
  const workout = tab === 'workout';
  $('workoutTabPanel').classList.toggle('hidden', !workout);
  $('measuresTabPanel').classList.toggle('hidden', workout);
  $('tabWorkout').classList.toggle('active', workout);
  $('tabMeasures').classList.toggle('active', !workout);
  if (!workout) renderMeasures();
}

function startWorkout(id) {
  currentWorkout = getWorkout(id);
  currentExerciseIndex = 0;
  $('workoutPanel').classList.remove('hidden');
  $('restPanel').classList.add('hidden');
  $('workoutId').textContent = `Treino ${currentWorkout.id}`;
  $('workoutTitle').textContent = currentWorkout.title;
  $('workoutSubtitle').textContent = currentWorkout.subtitle;
  renderExercise();
  preloadGifsForWorkout(id);
  preloadGifsForWorkout(nextId(id));
  $('workoutPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeWorkout() {
  stopTimer();
  $('workoutPanel').classList.add('hidden');
}

function currentExercise() {
  return currentWorkout.exercises[currentExerciseIndex];
}

async function renderExercise() {
  const ex = currentExercise();
  $('exerciseProgress').textContent = `Exercício ${currentExerciseIndex + 1}/${currentWorkout.exercises.length}`;
  $('exerciseName').textContent = ex.name;
  $('exerciseMeta').textContent = `${ex.sets} séries · ${ex.reps} · ${ex.group}`;
  $('exerciseMachine').textContent = ex.machine;
  $('exerciseAttention').textContent = ex.attention || 'Execute com controle, amplitude confortável e técnica estável.';
  $('alternativesList').innerHTML = (ex.alternatives || []).map(a => `<li>${a}</li>`).join('');
  loadPerformance(ex.id);
  resetTimer(ex.rest || 90);
  await loadGifForExercise(ex);
  cacheGifForExercise(ex);
}

function moveExercise(delta) {
  const next = currentExerciseIndex + delta;
  if (next < 0) return;
  if (next >= currentWorkout.exercises.length) return;
  currentExerciseIndex = next;
  renderExercise();
}

function finishWorkout() {
  const doneId = currentWorkout.id;
  state.lastDone = doneId;
  state.nextWorkoutId = nextId(doneId);
  state.completed.push({ workoutId: doneId, at: new Date().toISOString() });
  saveState();
  closeWorkout();
  renderHome();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function registerRestDay() {
  state.restDays.push({ at: new Date().toISOString(), keptWorkoutId: state.nextWorkoutId });
  saveState();
  $('restPanel').classList.remove('hidden');
  $('workoutPanel').classList.add('hidden');
}

function resetSequence() {
  if (!confirm('Resetar sequência para o Treino A?')) return;
  state.nextWorkoutId = 'A';
  state.lastDone = null;
  saveState();
  renderHome();
}

function loadPerformance(exerciseId) {
  const p = state.performances?.[exerciseId] || {};
  $('loadInput').value = p.load ?? '';
  $('repsInput').value = p.reps ?? '';
  $('exerciseNoteInput').value = p.note ?? '';
}

function savePerformance() {
  const ex = currentExercise();
  state.performances[ex.id] = {
    load: $('loadInput').value.trim(),
    reps: $('repsInput').value.trim(),
    note: $('exerciseNoteInput').value.trim(),
    updatedAt: new Date().toISOString()
  };
  saveState();
  vibrate(80);
}

function clearPerformance() {
  const ex = currentExercise();
  delete state.performances[ex.id];
  saveState();
  loadPerformance(ex.id);
}

function resetTimer(seconds) {
  stopTimer();
  timerRemaining = seconds;
  renderTimer();
}

function startTimer(seconds) {
  stopTimer();
  timerRemaining = seconds;
  renderTimer();
  timerHandle = setInterval(() => {
    timerRemaining -= 1;
    renderTimer();
    if (timerRemaining <= 0) {
      stopTimer();
      vibrate([180, 80, 180]);
    }
  }, 1000);
}

function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
}

function renderTimer() {
  $('timerDisplay').textContent = formatSeconds(Math.max(0, timerRemaining));
}

function formatSeconds(total) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function vibrate(pattern = 120) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

async function importGif(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  await putGif(currentExercise().id, file);
  await loadGifForExercise(currentExercise().id);
  event.target.value = '';
}

async function removeCurrentGif() {
  await deleteGif(currentExercise().id);
  await loadGifForExercise(currentExercise().id);
}

async function loadGifForExercise(exerciseOrId) {
  const ex = typeof exerciseOrId === 'object' ? exerciseOrId : currentExercise();
  const exerciseId = typeof exerciseOrId === 'string' ? exerciseOrId : ex.id;
  const record = await getGif(exerciseId);
  const img = $('exerciseGif');
  const placeholder = $('gifPlaceholder');
  const autoUrl = gifUrlForExercise(ex);

  img.onload = null;
  img.onerror = null;
  img.classList.add('hidden');
  img.removeAttribute('src');
  placeholder.classList.remove('hidden');

  if (record?.blob) {
    const url = URL.createObjectURL(record.blob);
    img.onload = () => URL.revokeObjectURL(url);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      img.classList.add('hidden');
      placeholder.textContent = 'GIF manual não carregou';
      placeholder.classList.remove('hidden');
    };
    placeholder.textContent = 'Carregando GIF manual…';
    img.src = url;
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
    $('gifSuggestion').textContent = `GIF manual salvo neste aparelho. Sugestão original: ${ex.gifFile || ex.gifSuggestion || 'não definida'}.`;
    return;
  }

  if (autoUrl) {
    placeholder.textContent = 'Carregando GIF automático…';
    img.onload = () => {
      placeholder.classList.add('hidden');
      img.classList.remove('hidden');
    };
    img.onerror = () => {
      img.classList.add('hidden');
      img.removeAttribute('src');
      placeholder.textContent = 'GIF automático não carregou. Use “Trocar GIF manualmente”.';
      placeholder.classList.remove('hidden');
    };
    img.src = autoUrl;
    img.classList.remove('hidden');
    $('gifSuggestion').textContent = `GIF automático: ${ex.gifFile || ex.gifSuggestion}. Cache inicial será feito quando houver conexão.`;
    return;
  }

  placeholder.textContent = 'GIF pendente';
  $('gifSuggestion').textContent = ex.gifSuggestion && !String(ex.gifSuggestion).toLowerCase().includes('sem gif')
    ? `Sugestão: ${ex.gifSuggestion}`
    : 'Sem GIF automático para este exercício. Pode importar manualmente quando quiser.';
}

function gifUrlForExercise(ex) {
  if (!ex) return '';
  if (ex.gifUrl) return ex.gifUrl;
  if (ex.gifDriveId) return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(ex.gifDriveId)}`;
  return '';
}

function gifCacheRequest(url) {
  return new Request(url, { mode: 'no-cors', cache: 'force-cache' });
}

async function cacheGifForExercise(ex) {
  const url = gifUrlForExercise(ex);
  if (!url || !('caches' in window) || !navigator.onLine) return false;
  try {
    const cache = await caches.open(REMOTE_GIF_CACHE);
    const req = gifCacheRequest(url);
    const cached = await cache.match(req);
    if (cached) return true;
    const response = await fetch(req);
    await cache.put(req, response.clone());
    return true;
  } catch (_) {
    return false;
  }
}

async function preloadGifsForWorkout(workoutId) {
  if (!('caches' in window) || !navigator.onLine) return;
  const workout = getWorkout(workoutId);
  if (!workout?.exercises?.length) return;
  for (const ex of workout.exercises) {
    await cacheGifForExercise(ex);
  }
}

function scheduleInitialGifCache() {
  window.setTimeout(() => {
    preloadGifsForWorkout(state.nextWorkoutId);
  }, 1200);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putGif(id, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put({ id, blob, updatedAt: new Date().toISOString() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getGif(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteGif(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function setToday() {
  const today = new Date().toISOString().slice(0, 10);
  $('measureDate').value = today;
}

function getNumber(id) {
  const value = $(id).value;
  if (value === '' || value == null) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function setProfileInputs() {
  $('heightCm').value = state.profile.heightCm ?? '';
  $('realGoalKg').value = state.profile.realGoalKg ?? '';
  $('idealGoalKg').value = state.profile.idealGoalKg ?? '';
}

function clearMeasureForm() {
  $('measureWeight').value = '';
  ['waistCm','abdomenCm','hipCm','chestCm','bicepsRelaxedCm','bicepsFlexedCm','forearmCm','thighCm','calfCm','measureNotes'].forEach(id => $(id).value = '');
  setToday();
  setProfileInputs();
}

function saveMeasure(event) {
  event.preventDefault();
  const weight = getNumber('measureWeight');
  if (!weight) return alert('Informe o peso atual.');

  state.profile.heightCm = getNumber('heightCm') || state.profile.heightCm;
  state.profile.realGoalKg = getNumber('realGoalKg') || state.profile.realGoalKg;
  state.profile.idealGoalKg = getNumber('idealGoalKg') || state.profile.idealGoalKg;

  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date: $('measureDate').value || new Date().toISOString().slice(0, 10),
    weightKg: weight,
    waistCm: getNumber('waistCm'),
    abdomenCm: getNumber('abdomenCm'),
    hipCm: getNumber('hipCm'),
    chestCm: getNumber('chestCm'),
    bicepsRelaxedCm: getNumber('bicepsRelaxedCm'),
    bicepsFlexedCm: getNumber('bicepsFlexedCm'),
    forearmCm: getNumber('forearmCm'),
    thighCm: getNumber('thighCm'),
    calfCm: getNumber('calfCm'),
    notes: $('measureNotes').value.trim(),
    createdAt: new Date().toISOString()
  };

  state.measures.push(entry);
  state.measures.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  saveState();
  clearMeasureForm();
  renderMeasures();
  vibrate(80);
}

function latestMeasure() {
  return [...state.measures].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

function firstMeasure() {
  return [...state.measures].sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
}

function calcBmi(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

function bmiLabel(bmi) {
  if (!bmi) return '—';
  if (bmi < 18.5) return 'baixo';
  if (bmi < 25) return 'adequado';
  if (bmi < 30) return 'sobrepeso';
  return 'obesidade';
}

function kgText(value) {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '-' : '+';
  return `${sign}${Math.abs(value).toFixed(1)} kg`;
}

function renderMeasures() {
  setProfileInputs();
  const latest = latestMeasure();
  const first = firstMeasure();
  const height = state.profile.heightCm;
  const realGoal = state.profile.realGoalKg;
  const idealGoal = state.profile.idealGoalKg;

  if (!latest) {
    $('measureHeadline').textContent = 'Sem registro ainda';
    $('measureSubtitle').textContent = 'Registre o primeiro peso para calcular IMC, metas e evolução.';
    $('bmiValue').textContent = '—';
    $('realGoalInfo').textContent = realGoal ? `${realGoal} kg` : '—';
    $('idealGoalInfo').textContent = idealGoal ? `${idealGoal} kg` : '—';
    $('realProgressLabel').textContent = '—';
    $('realProgressBar').style.width = '0%';
    renderMeasureHistory();
    return;
  }

  const bmi = calcBmi(latest.weightKg, height);
  const delta = first && first.id !== latest.id ? latest.weightKg - first.weightKg : 0;
  const toReal = latest.weightKg - realGoal;
  const toIdeal = latest.weightKg - idealGoal;

  $('measureHeadline').textContent = `${latest.weightKg.toFixed(1)} kg · ${formatDate(latest.date)}`;
  $('measureSubtitle').textContent = `Evolução desde o primeiro registro: ${delta === 0 ? 'sem variação ainda' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg`}.`;
  $('bmiValue').textContent = bmi ? `${bmi.toFixed(1)} · ${bmiLabel(bmi)}` : '—';
  $('realGoalInfo').textContent = realGoal ? `${kgText(toReal)} até ${realGoal} kg` : '—';
  $('idealGoalInfo').textContent = idealGoal ? `${kgText(toIdeal)} até ${idealGoal} kg` : '—';

  const start = first?.weightKg || latest.weightKg;
  const totalToLose = Math.max(0.1, start - realGoal);
  const lost = Math.max(0, start - latest.weightKg);
  const progress = Math.max(0, Math.min(100, (lost / totalToLose) * 100));
  $('realProgressLabel').textContent = `${progress.toFixed(0)}%`;
  $('realProgressBar').style.width = `${progress}%`;
  renderMeasureHistory();
}

function renderMeasureHistory() {
  const box = $('measureHistory');
  if (!state.measures.length) {
    box.className = 'history empty';
    box.textContent = 'Nenhuma medida registrada.';
    return;
  }
  box.className = 'history';
  const ordered = [...state.measures].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12);
  box.innerHTML = ordered.map(m => {
    const bmi = calcBmi(m.weightKg, state.profile.heightCm);
    const metrics = [
      ['Peso', `${m.weightKg.toFixed(1)} kg`],
      ['IMC', bmi ? bmi.toFixed(1) : '—'],
      ['Cintura', valueCm(m.waistCm)],
      ['Abdômen', valueCm(m.abdomenCm)],
      ['Quadril', valueCm(m.hipCm)],
      ['Coxa', valueCm(m.thighCm)]
    ];
    return `
      <article class="history-item">
        <div class="history-top"><strong>${formatDate(m.date)}</strong><span class="badge">${m.weightKg.toFixed(1)} kg</span></div>
        <div class="history-grid">${metrics.map(([k,v]) => `<span>${k}: <strong>${v}</strong></span>`).join('')}</div>
        ${m.notes ? `<p class="muted">${escapeHtml(m.notes)}</p>` : ''}
      </article>
    `;
  }).join('');
}

function valueCm(value) {
  return value ? `${Number(value).toFixed(1)} cm` : '—';
}

function formatDate(date) {
  if (!date) return '—';
  const [y, m, d] = String(date).split('-');
  return y && m && d ? `${d}/${m}/${y}` : date;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function clearMeasures() {
  if (!state.measures.length) return;
  if (!confirm('Apagar todo o histórico de medidas?')) return;
  state.measures = [];
  saveState();
  renderMeasures();
}

function exportMeasures() {
  const payload = {
    app: 'Personal Academia Smart',
    version: '14.4',
    exportedAt: new Date().toISOString(),
    profile: state.profile,
    measures: state.measures,
    completed: state.completed,
    performances: state.performances
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'personal-academia-smart-v14.4-dados.json';
  a.click();
  URL.revokeObjectURL(url);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js'));
  }
}

function bindInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $('installBtn').classList.remove('hidden');
  });
  $('installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('installBtn').classList.add('hidden');
  });
}
