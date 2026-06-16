const STATE_KEY = 'pas_v147_state';
const LEGACY_STATE_KEYS = ['pas_v146_state', 'pas_v145_state', 'pas_v144_state', 'pas_v143_state'];
const DB_NAME = 'pas_v147_local_gifs';
const DB_STORE = 'gifs';
const REMOTE_GIF_CACHE = 'pas_v147_legacy_gifs';

let data;
let state;
let currentWorkout;
let currentExerciseIndex = 0;
let timerHandle = null;
let timerRemaining = 90;
let deferredInstallPrompt = null;
const DEFAULT_SPOTIFY_URL = 'https://open.spotify.com/';

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
  renderGifLibraryStatus();
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
    let raw = localStorage.getItem(STATE_KEY);
    if (!raw) {
      for (const key of LEGACY_STATE_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    const saved = JSON.parse(raw) || {};
    const merged = {
      ...fallback,
      ...saved,
      profile: { ...fallback.profile, ...(saved.profile || {}) },
      measures: Array.isArray(saved.measures) ? saved.measures : [],
      performances: saved.performances || {},
      gifLibrary: saved.gifLibrary || null
    };
    if (!data.sequence.includes(merged.nextWorkoutId)) merged.nextWorkoutId = data.sequence[0] || 'A';
    if (merged.lastDone && !data.sequence.includes(merged.lastDone)) merged.lastDone = null;
    localStorage.setItem(STATE_KEY, JSON.stringify(merged));
    return merged;
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
  const safe = idx >= 0 ? idx : 0;
  return data.sequence[(safe + 1) % data.sequence.length];
}

function prevId(id) {
  const idx = sequenceIndex(id);
  const safe = idx >= 0 ? idx : 0;
  return data.sequence[(safe - 1 + data.sequence.length) % data.sequence.length];
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
  renderGifLibraryStatus();
}

function bindEvents() {
  $('tabWorkout').addEventListener('click', () => showTab('workout'));
  $('tabMeasures').addEventListener('click', () => showTab('measures'));
  $('spotifyBtn')?.addEventListener('click', openSpotify);

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
  $('cacheWorkoutGifsBtn')?.addEventListener('click', connectGifFolder);
  $('cacheAllGifsBtn')?.addEventListener('click', () => $('gifFolderInput')?.click());
  $('gifFolderInput')?.addEventListener('change', importGifFolderInput);
  $('cacheExerciseGifBtn')?.addEventListener('click', () => $('gifInput')?.click());
  $('downloadExerciseGifBtn')?.addEventListener('click', connectGifFolder);
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
  vibrate(80);
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
      placeholder.textContent = 'GIF local não carregou';
      placeholder.classList.remove('hidden');
    };
    placeholder.textContent = 'Carregando GIF local…';
    img.src = url;
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
    $('gifSuggestion').textContent = `GIF local salvo neste aparelho. Arquivo esperado: ${ex.gifFile || ex.gifSuggestion || 'não definido'}.`;
    updateGifCacheStatus(ex, 'local');
    return;
  }

  placeholder.textContent = 'GIF local não conectado';
  $('gifSuggestion').textContent = ex.gifFile
    ? `Arquivo esperado: ${ex.gifFile}. Use “Conectar pasta de GIFs” uma vez para importar automaticamente.`
    : 'Sem GIF esperado para este exercício. Pode importar manualmente.';
  updateGifCacheStatus(ex, 'none');
}

function gifUrlForExercise(ex) {
  if (!ex) return '';
  if (ex.gifDriveId) return driveViewUrl(ex.gifDriveId);
  if (ex.gifUrl) return ex.gifUrl;
  if (ex.gifLocal) return encodeURI(ex.gifLocal);
  return '';
}

function driveViewUrl(id) {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`;
}

function driveDownloadUrl(id) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}

function fileNameFromPath(path) {
  return String(path || '').split('/').pop() || path;
}

function gifCacheRequest(url) {
  const absolute = new URL(url, location.href);
  if (absolute.origin === location.origin) {
    return new Request(absolute.href, { cache: 'force-cache' });
  }
  return new Request(absolute.href, { mode: 'no-cors', cache: 'force-cache' });
}

async function cacheGifForExercise(ex, updateStatus = false) {
  const url = gifUrlForExercise(ex);
  if (!url || !('caches' in window)) {
    if (updateStatus) setGifCacheStatus('Cache não disponível para este GIF.');
    return false;
  }
  if (!navigator.onLine) {
    if (updateStatus) setGifCacheStatus('Sem conexão. Abra online para guardar este GIF no app.');
    return false;
  }
  try {
    if (updateStatus) setGifCacheStatus('Baixando do Drive para o cache do app…');
    const cache = await caches.open(REMOTE_GIF_CACHE);
    const req = gifCacheRequest(url);
    const cached = await cache.match(req);
    if (cached) {
      if (updateStatus) setGifCacheStatus('GIF já está guardado no cache do app.');
      return true;
    }
    const response = await fetch(req);
    await cache.put(req, response.clone());
    if (updateStatus) setGifCacheStatus('GIF guardado no cache do app.');
    return true;
  } catch (_) {
    if (updateStatus) setGifCacheStatus('Não consegui guardar no cache. Use “Baixar .gif no celular” como plano B.');
    return false;
  }
}

async function preloadGifsForWorkout(workoutId, showStatus = false) {
  if (!('caches' in window)) {
    if (showStatus && $('cacheStatus')) $('cacheStatus').textContent = 'Cache não disponível neste navegador.';
    return 0;
  }
  if (!navigator.onLine) {
    if (showStatus && $('cacheStatus')) $('cacheStatus').textContent = 'Sem conexão. Abra online uma vez para guardar os GIFs.';
    return 0;
  }
  const workout = getWorkout(workoutId);
  if (!workout?.exercises?.length) return 0;
  let ok = 0;
  for (let i = 0; i < workout.exercises.length; i++) {
    if (showStatus && $('cacheStatus')) $('cacheStatus').textContent = `Guardando GIFs do Treino ${workoutId}: ${i + 1}/${workout.exercises.length}…`;
    const done = await cacheGifForExercise(workout.exercises[i]);
    if (done) ok++;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  if (showStatus && $('cacheStatus')) $('cacheStatus').textContent = `Treino ${workoutId}: ${ok}/${workout.exercises.length} GIFs guardados no app.`;
  return ok;
}

function uniqueGifExercises() {
  const byUrl = new Map();
  data.workouts.forEach(workout => {
    workout.exercises.forEach(ex => {
      const url = gifUrlForExercise(ex);
      if (url && !byUrl.has(url)) byUrl.set(url, ex);
    });
  });
  return [...byUrl.values()];
}

async function preloadNextWorkoutGifs() {
  const id = state.nextWorkoutId;
  await preloadGifsForWorkout(id, true);
  vibrate(90);
}

async function preloadAllGifs() {
  const status = $('cacheStatus');
  if (!('caches' in window)) {
    if (status) status.textContent = 'Cache não disponível neste navegador.';
    return;
  }
  if (!navigator.onLine) {
    if (status) status.textContent = 'Sem conexão. Abra online uma vez para pré-carregar.';
    return;
  }

  const exercises = uniqueGifExercises();
  let ok = 0;
  if (status) status.textContent = `Guardando GIFs 0/${exercises.length}…`;

  for (let i = 0; i < exercises.length; i++) {
    const done = await cacheGifForExercise(exercises[i]);
    if (done) ok++;
    if (status) status.textContent = `Guardando GIFs ${i + 1}/${exercises.length}…`;
    await new Promise(resolve => setTimeout(resolve, 80));
  }

  if (status) status.textContent = `GIFs guardados no app: ${ok}/${exercises.length}.`;
  vibrate(90);
}

async function cacheCurrentExerciseGif() {
  if (!currentWorkout) return;
  const ex = currentExercise();
  const done = await cacheGifForExercise(ex, true);
  if (done) vibrate(80);
}

async function downloadCurrentExerciseGif() {
  if (!currentWorkout) return;
  const ex = currentExercise();
  const record = await getGif(ex.id);

  if (record?.blob) {
    const url = URL.createObjectURL(record.blob);
    triggerDownload(url, safeGifName(ex));
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
    return;
  }

  if (ex.gifDriveId) {
    window.open(driveDownloadUrl(ex.gifDriveId), '_blank', 'noopener,noreferrer');
    setGifCacheStatus('Download aberto. O Android deve salvar em Downloads; o app usa o cache próprio para mostrar offline.');
    return;
  }

  const url = gifUrlForExercise(ex);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    setGifCacheStatus('GIF aberto em nova aba para salvar manualmente.');
    return;
  }

  setGifCacheStatus('Este exercício não tem GIF automático para baixar.');
}

function triggerDownload(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function safeGifName(ex) {
  const base = (ex.name || ex.id || 'gif')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'exercicio'}.gif`;
}

async function isGifCached(ex) {
  const url = gifUrlForExercise(ex);
  if (!url || !('caches' in window)) return false;
  try {
    const cache = await caches.open(REMOTE_GIF_CACHE);
    return Boolean(await cache.match(gifCacheRequest(url)));
  } catch (_) {
    return false;
  }
}

async function updateGifCacheStatus(ex, mode) {
  if (!$('gifCacheStatus')) return;
  if (mode === 'local' || mode === 'manual') return setGifCacheStatus('GIF salvo localmente neste aparelho.');
  if (mode === 'none') return setGifCacheStatus(ex?.gifFile ? `Aguardando importação de ${ex.gifFile}.` : 'Sem GIF automático para este exercício.');
  setGifCacheStatus('GIF local ainda não verificado.');
}

function setGifCacheStatus(message) {
  if ($('gifCacheStatus')) $('gifCacheStatus').textContent = message;
}

function openSpotify() {
  const url = state?.spotifyUrl || DEFAULT_SPOTIFY_URL;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function renderGifLibraryStatus() {
  const status = $('cacheStatus');
  if (!status) return;
  const lib = state?.gifLibrary;
  if (!lib) {
    status.textContent = 'Pasta ainda não conectada. Extraia os GIFs no celular e toque em “Conectar pasta de GIFs”.';
    return;
  }
  status.textContent = `GIFs locais importados: ${lib.matches || 0}/${lib.expected || 0}. Última atualização: ${formatDateTime(lib.importedAt)}.`;
}

async function connectGifFolder() {
  const status = $('cacheStatus');
  try {
    if ('storage' in navigator && navigator.storage.persist) {
      navigator.storage.persist().catch(() => null);
    }

    if ('showDirectoryPicker' in window) {
      if (status) status.textContent = 'Abrindo seletor de pasta…';
      const dir = await window.showDirectoryPicker({ mode: 'read' });
      const files = [];
      await collectGifFilesFromDirectory(dir, files);
      await importGifFiles(files, 'pasta local');
      return;
    }

    $('gifFolderInput')?.click();
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (status) status.textContent = 'Seleção cancelada. Nenhum GIF foi alterado.';
      return;
    }
    if (status) status.textContent = 'Não consegui abrir a pasta. Use “Selecionar GIFs manualmente”.';
  }
}

async function collectGifFilesFromDirectory(directoryHandle, files) {
  for await (const entry of directoryHandle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      if (isGifFile(file)) files.push(file);
    } else if (entry.kind === 'directory') {
      await collectGifFilesFromDirectory(entry, files);
    }
  }
}

async function importGifFolderInput(event) {
  const files = Array.from(event.target.files || []).filter(isGifFile);
  await importGifFiles(files, 'arquivos selecionados');
  event.target.value = '';
}

function isGifFile(file) {
  return file && (file.type === 'image/gif' || /\.gif$/i.test(file.name));
}

async function importGifFiles(files, sourceLabel = 'pasta local') {
  const status = $('cacheStatus');
  const exercises = allExercises();
  const expected = exercises.filter(ex => ex.gifFile).length;

  if (!files.length) {
    if (status) status.textContent = 'Nenhum GIF encontrado na seleção.';
    return;
  }

  const fileMap = new Map();
  files.forEach(file => {
    const key = slug(file.name.replace(/\.[^.]+$/, ''));
    if (!fileMap.has(key)) fileMap.set(key, file);
  });

  let matches = 0;
  const missing = [];

  for (const ex of exercises) {
    const file = findMatchingGifFile(ex, fileMap);
    if (file) {
      await putGif(ex.id, file);
      matches++;
      if (status) status.textContent = `Importando GIFs locais: ${matches}/${expected}…`;
      await new Promise(resolve => setTimeout(resolve, 10));
    } else if (ex.gifFile) {
      missing.push(ex.gifFile);
    }
  }

  state.gifLibrary = {
    source: sourceLabel,
    importedAt: new Date().toISOString(),
    filesSeen: files.length,
    matches,
    expected,
    missing: [...new Set(missing)].slice(0, 30)
  };
  saveState();
  renderGifLibraryStatus();

  if (currentWorkout) await loadGifForExercise(currentExercise());
  vibrate(120);
}

function allExercises() {
  return data.workouts.flatMap(workout => workout.exercises || []);
}

function findMatchingGifFile(ex, fileMap) {
  const candidates = gifCandidateSlugs(ex);
  for (const key of candidates) {
    if (fileMap.has(key)) return fileMap.get(key);
  }
  return null;
}

function gifCandidateSlugs(ex) {
  const values = [ex.gifFile, ex.name, ...(ex.gifAliases || [])].filter(Boolean);
  return [...new Set(values.map(value => slug(String(value).replace(/\.[^.]+$/, ''))))];
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch (_) {
    return value;
  }
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
    version: '14.7',
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
  a.download = 'personal-academia-smart-v14.7-dados.json';
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
