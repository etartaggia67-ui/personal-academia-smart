const STATE_KEY = 'pas_v142_state';
const DB_NAME = 'pas_v142_gifs';
const DB_STORE = 'gifs';
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
  renderHome();
}

function loadState() {
  const fallback = { nextWorkoutId: 'A', lastDone: null, restDays: [], completed: [] };
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(STATE_KEY)) || {}) };
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
  $('exerciseMeta').textContent = `${ex.sets} séries · ${ex.reps} · descanso ${ex.rest || 90}s · ${ex.group}`;
  $('exerciseMachine').textContent = ex.machine;
  $('gifSuggestion').textContent = `GIF sugerido: ${ex.gifSuggestion || 'não definido'}`;
  $('alternativesList').innerHTML = (ex.alternatives || []).map(a => `<li>${a}</li>`).join('');
  resetTimer(ex.rest || 90);
  await loadGifForExercise(ex.id);
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
      vibrate();
    }
  }, 1000);
}

function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
}

function renderTimer() {
  const s = Math.max(0, timerRemaining);
  $('timerDisplay').textContent = `00:${String(s).padStart(2, '0')}`;
}

function vibrate() {
  if ('vibrate' in navigator) navigator.vibrate([180, 80, 180]);
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

async function loadGifForExercise(exerciseId) {
  const record = await getGif(exerciseId);
  const img = $('exerciseGif');
  const placeholder = $('gifPlaceholder');
  if (!record?.blob) {
    img.classList.add('hidden');
    img.removeAttribute('src');
    placeholder.classList.remove('hidden');
    return;
  }
  const url = URL.createObjectURL(record.blob);
  img.onload = () => URL.revokeObjectURL(url);
  img.src = url;
  img.classList.remove('hidden');
  placeholder.classList.add('hidden');
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
