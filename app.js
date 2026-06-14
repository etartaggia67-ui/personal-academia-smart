'use strict';

const APP_KEY = 'PERSONAL_ACADEMIA_SMART_V14_STATE';
const DB_NAME = 'personal_academia_smart_assets_v1';
const STORE = 'assets';
let plan = null;
let timer = null;
let remain = 0;
let toastTimer = null;

let state = {
  version: 'V14.1-PWA',
  dayIndex: 0,
  lastRestDate: '',
  quick: { energy: 'normal', back: 'ok' },
  form: {
    spotifyUrl: 'https://open.spotify.com/search/treino%20academia%20energia',
    defaultRest: '90',
    feedbackMode: 'vibra_som',
    defaultWeight: '78'
  },
  workoutProgress: {},
  exerciseMetaById: {},
  exerciseNameOverride: {},
  measures: [],
  workoutLog: [],
  assetManifest: [],
  updatedAt: null
};

function $(id){ return document.getElementById(id); }
function norm(v){ return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
function todayKey(){ return new Date().toISOString().slice(0,10); }
function isWednesday(){ return new Date().getDay() === 3; }
function pendingMachines(){ return new Set((plan && plan.pendingMachines) || ['', 'A conferir', '23', '53', '60', '67']); }
function isMachinePending(value){ return pendingMachines().has(String(value || '').trim()); }
function workouts(){ return plan ? plan.workouts : []; }
function currentWorkout(){ const list = workouts(); return list[((state.dayIndex || 0) % list.length + list.length) % list.length] || null; }
function workoutKey(){ const w = currentWorkout(); return 'wk_' + (w ? w.code : 'x') + '_' + (state.dayIndex || 0); }
function currentWorkoutProgress(){ const key = workoutKey(); if(!state.workoutProgress[key]) state.workoutProgress[key] = {}; return state.workoutProgress[key]; }
function progressFor(ex){ const p = currentWorkoutProgress(); if(!p[ex.id]) p[ex.id] = { done:false, set:1 }; return p[ex.id]; }
function metaFor(ex){ if(!state.exerciseMetaById) state.exerciseMetaById = {}; if(!state.exerciseMetaById[ex.id]) state.exerciseMetaById[ex.id] = { load:'', machine: ex.machine || '' }; if(!state.exerciseMetaById[ex.id].machine) state.exerciseMetaById[ex.id].machine = ex.machine || ''; return state.exerciseMetaById[ex.id]; }
function displayName(ex){ return state.exerciseNameOverride && state.exerciseNameOverride[ex.id] ? state.exerciseNameOverride[ex.id] : ex.name; }
function groupClass(g){ const n = norm(g); if(n.includes('braco')) return 'g-bracos'; if(n.includes('perna')) return 'g-pernas'; if(n.includes('core')) return 'g-core'; return 'g-tronco'; }

function show(name, el){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-' + name).classList.add('active');
  document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active');
  if(name === 'treino') renderExercises();
}

function tapButton(btn, workingText, action){
  const old = btn && btn.innerHTML;
  if(btn){ btn.classList.add('pressed'); btn.disabled = true; if(workingText) btn.innerHTML = workingText; }
  tactile();
  setTimeout(() => {
    try { if(typeof action === 'function') action(); }
    catch(e){ toast('Erro: ' + e.message, true); setSaveStatus('Erro: ' + e.message, true); }
    finally { setTimeout(() => { if(btn){ btn.classList.remove('pressed'); btn.disabled = false; if(old) btn.innerHTML = old; } }, 180); }
  }, 80);
}

function tactile(){
  try{
    const mode = (state.form && state.form.feedbackMode) || 'vibra_som';
    if(mode !== 'visual' && navigator.vibrate) navigator.vibrate(45);
    if(mode === 'vibra_som') beep(110, 740, .12);
  }catch(e){}
}
function beep(ms=140, freq=720, vol=.12){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = freq; gain.gain.value = vol;
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, ms);
  }catch(e){}
}
function toast(msg, bad=false){
  const el = $('toast');
  el.textContent = msg;
  el.style.borderColor = bad ? 'rgba(255,98,112,.55)' : 'rgba(17,215,196,.35)';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
function setSaveStatus(text, bad=false){ const el = $('saveStatus'); if(el){ el.textContent = text; el.style.color = bad ? '#ffb0b8' : '#c4d7dc'; } }

async function init(){
  registerSW();
  loadLocal();
  try{
    const [workoutData, assetData] = await Promise.all([
      fetch('data/workouts.json', { cache:'no-cache' }).then(r => r.json()),
      fetch('assets/manifest.json', { cache:'no-cache' }).then(r => r.json()).catch(() => ({assets:[]}))
    ]);
    plan = workoutData;
    state.assetManifest = Array.isArray(assetData.assets) ? assetData.assets : [];
  }catch(e){
    toast('Erro ao carregar plano local: ' + e.message, true);
    plan = { workouts:[], machineCatalog:{}, pendingMachines:['', 'A conferir'] };
  }
  await afterLoad();
}

function registerSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

function loadLocal(){
  try{
    const raw = localStorage.getItem(APP_KEY);
    if(raw) state = mergeState(state, JSON.parse(raw));
  }catch(e){ setSaveStatus('Erro ao carregar local: ' + e.message, true); }
}
function saveAll(show=false){
  state.updatedAt = new Date().toISOString();
  state.version = 'V14.1-PWA';
  localStorage.setItem(APP_KEY, JSON.stringify(state));
  if(show) setSaveStatus('Salvo localmente: ' + new Date().toLocaleTimeString('pt-BR'));
}
function mergeState(base, incoming){
  const merged = Object.assign({}, base, incoming || {});
  merged.quick = Object.assign({}, base.quick, incoming && incoming.quick ? incoming.quick : {});
  merged.form = Object.assign({}, base.form, incoming && incoming.form ? incoming.form : {});
  merged.workoutProgress = Object.assign({}, base.workoutProgress, incoming && incoming.workoutProgress ? incoming.workoutProgress : {});
  merged.exerciseMetaById = Object.assign({}, base.exerciseMetaById, incoming && incoming.exerciseMetaById ? incoming.exerciseMetaById : {});
  merged.exerciseNameOverride = Object.assign({}, base.exerciseNameOverride, incoming && incoming.exerciseNameOverride ? incoming.exerciseNameOverride : {});
  if(!Array.isArray(merged.measures)) merged.measures = [];
  if(!Array.isArray(merged.workoutLog)) merged.workoutLog = [];
  if(!Array.isArray(merged.assetManifest)) merged.assetManifest = [];
  return merged;
}

async function afterLoad(){
  if(!$('medData').value) $('medData').value = new Date().toISOString().slice(0,10);
  setConfigForm();
  await renderAssetStatus();
  renderMachineMap();
  renderMeasures();
  renderPanel();
  renderExercises();
  bindEvents();
  setSaveStatus('Modo PWA local. Dados salvos no celular.');
}

let eventsBound = false;
function bindEvents(){
  if(eventsBound) return; eventsBound = true;
  document.querySelectorAll('.navbtn').forEach(btn => btn.addEventListener('click', () => show(btn.dataset.screen, btn)));
  $('btnStartWorkout').addEventListener('click', e => tapButton(e.currentTarget, 'Abrindo...', () => show('treino', document.querySelector('[data-screen="treino"]'))));
  $('btnSkipWorkout').addEventListener('click', e => tapButton(e.currentTarget, 'Pulando...', skipWorkout));
  $('btnRestDay').addEventListener('click', e => tapButton(e.currentTarget, 'Registrando...', restToday));
  $('btnFinishWorkout').addEventListener('click', e => tapButton(e.currentTarget, 'Finalizando...', finishWorkout));
  $('energySelect').addEventListener('change', () => { state.quick.energy = $('energySelect').value; saveAll(true); renderPanel(); });
  $('backSelect').addEventListener('change', () => { state.quick.back = $('backSelect').value; saveAll(true); renderPanel(); });
  $('btnAddMeasure').addEventListener('click', e => tapButton(e.currentTarget, 'Salvando...', addMeasure));
  $('btnSaveConfig').addEventListener('click', e => tapButton(e.currentTarget, 'Salvando...', () => { state.form = readConfigForm(); applySpotify(false); saveAll(true); toast('Configuração salva.'); }));
  $('assetImport').addEventListener('change', importAssets);
  const exerciseAssetInput = $('exerciseAssetImport');
  if(exerciseAssetInput) exerciseAssetInput.addEventListener('change', importExerciseAsset);
  $('btnClearAssets').addEventListener('click', e => tapButton(e.currentTarget, 'Limpando...', clearAssets));
  $('btnExport').addEventListener('click', e => tapButton(e.currentTarget, 'Exportando...', exportBackup));
  $('btnExportTop').addEventListener('click', e => tapButton(e.currentTarget, '⇩', exportBackup));
  $('importBackupFile').addEventListener('change', importBackup);
  $('importBackupFileTop').addEventListener('change', importBackup);
  $('btnClearLocal').addEventListener('click', e => tapButton(e.currentTarget, 'Apagando...', clearLocalData));
}

function renderPanel(){
  const w = currentWorkout();
  if(!w){ $('nextWorkoutTitle').textContent = 'Plano não carregado'; return; }
  $('energySelect').value = state.quick.energy || 'normal';
  $('backSelect').value = state.quick.back || 'ok';
  const rest = isWednesday();
  $('nextWorkoutTitle').textContent = rest ? 'Descanso padrão' : w.name;
  $('nextWorkoutFocus').textContent = rest ? 'Quarta-feira é descanso padrão. Você ainda pode iniciar o treino, se quiser.' : w.focus;
  $('exerciseCountPill').textContent = (w.list || []).length + ' exercícios';
  const caution = state.quick.back !== 'ok' || state.quick.energy === 'baixa';
  const metrics = [
    ['Treino atual', w.code],
    ['Energia', labelQuick('energy', state.quick.energy)],
    ['Lombar', labelQuick('back', state.quick.back)],
    ['Status', caution ? 'Modo cautela' : 'Pronto']
  ];
  $('quickSummary').innerHTML = metrics.map(([a,b]) => `<div class="metric"><span>${a}</span><b>${b}</b></div>`).join('');
  $('panelStatus').textContent = caution ? 'Treino liberado com cautela. Reduza carga se precisar.' : 'Pronto para treinar.';
}
function labelQuick(type, val){
  const map = { energy:{baixa:'Baixa',normal:'Normal',boa:'Boa'}, back:{ok:'Ok',sensivel:'Sensível',ruim:'Ruim'} };
  return (map[type] && map[type][val]) || val || '--';
}
function skipWorkout(){
  state.dayIndex = (state.dayIndex || 0) + 1;
  saveAll(true); renderPanel(); renderExercises(); toast('Próximo treino carregado.');
}
function restToday(){
  state.lastRestDate = todayKey();
  state.workoutLog.unshift({ date:new Date().toISOString(), workout:'Descanso hoje', code:'DESC' });
  saveAll(true); renderPanel(); toast('Descanso registrado.');
}

function renderWorkoutHeader(){
  const w = currentWorkout(); if(!w) return '';
  return `<h2>Treino ${w.code}</h2><p class="lead">${w.focus}</p>
  <div class="muscleGroups"><div class="mg bracos">💪 Braços</div><div class="mg tronco">♜ Tronco</div><div class="mg core">◎ Core</div><div class="mg pernas">🦵 Pernas</div></div>
  <div class="notice"><b>Esteira:</b> 5–8 min leve antes para aquecer no frio; cardio principal depois das máquinas.</div>`;
}
function renderExercises(){
  const w = currentWorkout();
  if(!w){ $('workoutHeader').innerHTML = '<h2>Plano não carregado</h2>'; $('exerciseList').innerHTML=''; return; }
  $('workoutHeader').innerHTML = renderWorkoutHeader();
  const html = w.list.map((ex, idx) => renderExercise(ex, idx)).join('');
  $('exerciseList').innerHTML = html;
  bindExerciseInputs();
  updateInlineTimer();
}
function renderExercise(ex, idx){
  const p = progressFor(ex);
  const m = metaFor(ex);
  const current = !p.done && firstOpenExerciseId() === ex.id;
  const machineVal = m.machine || ex.machine || '';
  const machinePending = isMachinePending(machineVal);
  const asset = findBestAssetSync(ex);
  const imageHtml = asset ? `<div class="assetWrap"><img class="assetImage" src="${asset.src}" alt="${escapeHtml(ex.name)}"><div class="assetBadge">${asset.direct?'GIF vinculado':'GIF associado'}</div></div>` : `<div class="assetMissing"><b>GIF pendente</b><br>Importe direto neste exercício ou use arquivo com nome parecido:<br>${escapeHtml(ex.keywords.slice(0,3).join(' / '))}<button type="button" class="miniAssetBtn" onclick="directImportAsset('${ex.id}')">📁 Importar GIF deste exercício</button></div>`;
  const assetControls = `<div class="assetControls"><button type="button" class="miniAssetBtn" onclick="directImportAsset('${ex.id}')">${asset?'Trocar GIF':'Importar GIF'}</button>${asset && asset.direct ? `<button type="button" class="miniAssetBtn dangerMini" onclick="removeExerciseAsset('${ex.id}')">Remover</button>` : ''}</div>`;
  const muscles = ex.muscles || [];
  const muscleBars = muscles.map((mu, i) => `<div class="muscleBar"><div class="barHead"><span>${escapeHtml(mu)}</span><b>${i===0?'principal':'apoio'}</b></div><div class="heat"><span style="width:${i===0?100:65}%"></span></div></div>`).join('');
  return `<article class="exercise ${current?'current':''} ${p.done?'done':''}" data-exid="${ex.id}">
    <div class="exTop"><div class="topTags"><span class="groupTag ${groupClass(ex.group)}">${escapeHtml(ex.group)}</span><span class="seriesTag">Série ${p.set}/${ex.sets}</span></div><div class="timerMini"><div class="label">Descanso</div><div id="inlineTimerTxt_${ex.id}" class="time">00</div></div></div>
    <div class="exName">${escapeHtml(displayName(ex))}</div>
    <div class="small">${escapeHtml(ex.type)} • Máquina preferencial: ${escapeHtml(ex.machine)} • Alternativa: ${escapeHtml(ex.alt)}</div>
    <div class="visualGrid"><div class="visualPanel"><div class="visualTitle">Movimento</div>${imageHtml}${assetControls}</div><div class="visualPanel"><div class="visualTitle">Músculos</div><div class="muscleBars">${muscleBars}</div></div></div>
    <div class="muscleList">${muscles.map((mu,i)=>`<span class="muscleChip ${i===0?'main':'sec'}">${escapeHtml(mu)}</span>`).join('')}</div>
    <div class="small">Reps: ${escapeHtml(ex.reps)} • descanso sugerido: ${ex.rest}s</div>
    <div class="cueBox">${escapeHtml(ex.cue)}</div>
    <div class="exFields"><div><label>Máquina nº</label><input class="exInput ${machinePending?'pending':''}" data-exid="${ex.id}" data-field="machine" value="${escapeAttr(machineVal)}"><div class="inputHint ${machinePending?'badText':''}">${machinePending?'Número pendente/a confirmar':'Padrão Tarumã: '+escapeHtml(ex.machine)}</div></div><div><label>Carga/Peso</label><input class="exInput" data-exid="${ex.id}" data-field="load" value="${escapeAttr(m.load || '')}" placeholder="Ex: 30 kg"></div></div>
    <div class="progress"><span style="width:${Math.min(100,((p.set-1)/ex.sets)*100)}%"></span></div>
    <div class="exBtns"><button type="button" class="primary" onclick="completeSet('${ex.id}')">Concluir série</button><button type="button" class="secondary" onclick="swapExercise('${ex.id}')">Trocar</button><button type="button" class="secondary" onclick="finishExercise('${ex.id}')">Concluir</button></div>
  </article>`;
}
function escapeHtml(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(v){ return escapeHtml(v).replace(/`/g,'&#96;'); }
function firstOpenExerciseId(){ const w = currentWorkout(); if(!w) return null; const item = w.list.find(ex => !progressFor(ex).done); return item ? item.id : null; }
function bindExerciseInputs(){
  document.querySelectorAll('.exInput').forEach(input => {
    input.addEventListener('input', () => {
      const exid = input.dataset.exid, field = input.dataset.field;
      const ex = findExercise(exid); if(!ex) return;
      const meta = metaFor(ex); meta[field] = input.value;
      if(field === 'machine') input.classList.toggle('pending', isMachinePending(input.value));
      saveAll(false);
    });
    input.addEventListener('blur', () => saveAll(true));
  });
}
function findExercise(exid){ for(const w of workouts()){ const found = w.list.find(e => e.id === exid); if(found) return found; } return null; }
function completeSet(exid){ const ex = findExercise(exid); if(!ex) return; const p = progressFor(ex); tactile(); if(p.set >= ex.sets){ p.done = true; stopTimer(); toast('Exercício concluído.'); } else { p.set++; startRest(ex.rest, ex.id); toast('Série registrada. Descanso iniciado.'); } saveAll(false); renderExercises(); }
function finishExercise(exid){ const ex = findExercise(exid); if(!ex) return; tactile(); progressFor(ex).done = true; if(state.activeRestExercise === exid) stopTimer(); saveAll(false); renderExercises(); toast('Exercício concluído.'); }
function swapExercise(exid){ const ex = findExercise(exid); if(!ex) return; tactile(); state.exerciseNameOverride[exid] = state.exerciseNameOverride[exid] ? null : ex.alt; saveAll(false); renderExercises(); toast('Exercício alternado.'); }
function finishWorkout(){ const w = currentWorkout(); if(!w) return; state.workoutLog.unshift({date:new Date().toISOString(), workout:w.name, dayIndex:state.dayIndex, code:w.code}); state.dayIndex = (state.dayIndex || 0) + 1; stopTimer(); saveAll(true); renderPanel(); renderExercises(); show('painel', document.querySelector('[data-screen="painel"]')); toast('Treino finalizado. Próximo treino carregado.'); }

function startRest(sec, exid){ stopTimer(false); remain = sec; state.activeRestExercise = exid; updateInlineTimer(); timer = setInterval(() => { remain--; updateInlineTimer(); if(remain > 0 && remain <= 10){ try{ if(navigator.vibrate) navigator.vibrate(35); beep(70,980,.12); }catch(e){} } if(remain <= 0){ try{ if(navigator.vibrate) navigator.vibrate([90,60,140]); beep(240,1100,.18); }catch(e){} stopTimer(); toast('Descanso encerrado. Próxima série.'); } }, 1000); }
function updateInlineTimer(){ document.querySelectorAll('[id^="inlineTimerTxt_"]').forEach(el => el.textContent = '00'); if(!state.activeRestExercise || remain <= 0) return; const el = $('inlineTimerTxt_' + state.activeRestExercise); if(el) el.textContent = String(Math.max(0, remain)).padStart(2,'0'); }
function stopTimer(clear=true){ if(timer) clearInterval(timer); timer = null; if(clear){ state.activeRestExercise = null; remain = 0; updateInlineTimer(); } }

let importedAssetIndex = [];
let pendingExerciseAssetId = null;
function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath:'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbPutAsset(name, blob){ const db = await openDB(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put({ name, normalizedName:norm(name), blob, type:blob.type, savedAt:new Date().toISOString() }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function dbGetAllAssets(){ const db = await openDB(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE,'readonly'); const req = tx.objectStore(STORE).getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error); }); }
async function dbClearAssets(){ const db = await openDB(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE,'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function dbDeleteAsset(name){ const db = await openDB(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE,'readwrite'); tx.objectStore(STORE).delete(name); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
async function importAssets(ev){ const files = Array.from(ev.target.files || []); if(!files.length) return; let count = 0; for(const f of files){ if(!f.type.startsWith('image/')) continue; await dbPutAsset(f.name, f); count++; } ev.target.value = ''; await renderAssetStatus(); renderExercises(); toast(`${count} asset(s) importado(s).`); }
function directImportAsset(exid){
  const ex = findExercise(exid);
  if(!ex){ toast('Exercício não encontrado.', true); return; }
  pendingExerciseAssetId = exid;
  tactile();
  const input = $('exerciseAssetImport');
  if(!input){ toast('Seletor de GIF não encontrado.', true); return; }
  input.value = '';
  input.click();
}
async function importExerciseAsset(ev){
  const file = ev.target.files && ev.target.files[0];
  const exid = pendingExerciseAssetId;
  ev.target.value = '';
  pendingExerciseAssetId = null;
  if(!file || !exid) return;
  if(!file.type.startsWith('image/')){ toast('Escolha GIF, WebP, PNG ou JPG.', true); return; }
  const ex = findExercise(exid);
  if(!ex){ toast('Exercício não encontrado.', true); return; }
  const key = 'exercise:' + exid;
  const recordBlob = file.slice(0, file.size, file.type || 'application/octet-stream');
  recordBlob.name = file.name;
  await dbPutExerciseAsset(key, file, exid);
  await renderAssetStatus();
  renderExercises();
  toast('GIF vinculado a: ' + ex.name);
}
async function dbPutExerciseAsset(key, file, exid){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put({ name:key, displayName:file.name, normalizedName:norm(file.name), exerciseId:exid, blob:file, type:file.type, savedAt:new Date().toISOString(), direct:true });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function removeExerciseAsset(exid){
  const ex = findExercise(exid);
  if(!ex) return;
  if(!confirm('Remover GIF vinculado a este exercício?')) return;
  await dbDeleteAsset('exercise:' + exid);
  await renderAssetStatus();
  renderExercises();
  toast('GIF removido deste exercício.');
}
async function clearAssets(){ if(!confirm('Remover GIFs/imagens importados deste celular?')) return; await dbClearAssets(); await renderAssetStatus(); renderExercises(); toast('GIFs importados removidos.'); }
async function renderAssetStatus(){ importedAssetIndex = await dbGetAllAssets().catch(() => []); const totalManifest = (state.assetManifest || []).length; const directCount = importedAssetIndex.filter(a => a.direct || a.exerciseId).length; const batchCount = importedAssetIndex.length - directCount; const el = $('assetStatus'); if(el) el.textContent = `${directCount} vinculado(s) direto • ${batchCount} importado(s) por nome • ${totalManifest} listado(s) no pacote.`; }
function matchScore(asset, ex){ const n = asset.normalizedName || norm(asset.displayName || asset.name || asset.path); let score = 0; (ex.keywords || []).forEach(k => { const nk = norm(k); if(n.includes(nk)) score += 5; nk.split(' ').forEach(part => { if(part.length > 3 && n.includes(part)) score += 1; }); }); norm(ex.name).split(' ').forEach(part => { if(part.length > 4 && n.includes(part)) score += 1; }); return score; }
function findBestAssetSync(ex){
  const direct = importedAssetIndex.find(a => a.exerciseId === ex.id || a.name === ('exercise:' + ex.id));
  if(direct && direct.blob){ return { name:direct.displayName || direct.name, src:URL.createObjectURL(direct.blob), direct:true }; }
  let best = null, bestScore = 0;
  importedAssetIndex.filter(a => !a.exerciseId && !String(a.name || '').startsWith('exercise:')).forEach(a => { const s = matchScore(a, ex); if(s > bestScore){ best = a; bestScore = s; } });
  if(best && bestScore > 0){ return { name:best.displayName || best.name, src:URL.createObjectURL(best.blob), direct:false }; }
  (state.assetManifest || []).forEach(a => { const s = matchScore(a, ex); if(s > bestScore){ best = a; bestScore = s; } });
  if(best && best.path && bestScore > 0){ return { name:best.name || best.path, src:best.path, direct:false }; }
  return null;
}

function readConfigForm(){ return { spotifyUrl:$('spotifyUrl').value || 'https://open.spotify.com/search/treino%20academia%20energia', defaultRest:$('defaultRest').value || '90', feedbackMode:$('feedbackMode').value || 'vibra_som', defaultWeight:$('defaultWeight').value || '78' }; }
function setConfigForm(){ const f = state.form || {}; $('spotifyUrl').value = f.spotifyUrl || 'https://open.spotify.com/search/treino%20academia%20energia'; $('defaultRest').value = f.defaultRest || '90'; $('feedbackMode').value = f.feedbackMode || 'vibra_som'; $('defaultWeight').value = f.defaultWeight || '78'; applySpotify(false); }
function applySpotify(save=true){ $('spotifyBtn').href = (state.form && state.form.spotifyUrl) || 'https://open.spotify.com/search/treino%20academia%20energia'; if(save) saveAll(true); }
function renderMachineMap(){ const cat = (plan && plan.machineCatalog) || {}; const rows = Object.keys(cat).sort((a,b) => a.localeCompare(b, undefined, { numeric:true })).map(k => `<div class="mapLine"><span>${k}</span><b>${escapeHtml(cat[k])}</b></div>`).join(''); $('machineMap').innerHTML = rows + '<div class="mapLine"><span style="color:#ff98a2">A conferir</span><b>Panturrilha, 23, 53, 60, 67 ou campo vazio</b></div>'; }

function addMeasure(){ const m = { data:$('medData').value || new Date().toISOString().slice(0,10), peso:$('medPeso').value, cintura:$('cintura').value, quadril:$('quadril').value, abdomen:$('abdomen').value, panturrilha:$('panturrilha').value }; state.measures.unshift(m); renderMeasures(); saveAll(true); toast('Medida salva.'); }
function renderMeasures(){ if(!state.measures || !state.measures.length){ $('measureTable').innerHTML = '<p class="lead">Sem medidas cadastradas.</p>'; return; } $('measureTable').innerHTML = '<div style="overflow:auto"><table><tr><th>Data</th><th>Peso</th><th>Cintura</th><th>Quadril</th><th>Abd.</th><th>Panturrilha</th></tr>' + state.measures.map(m => `<tr><td>${escapeHtml(m.data||'')}</td><td>${escapeHtml(m.peso||'')}</td><td>${escapeHtml(m.cintura||'')}</td><td>${escapeHtml(m.quadril||'')}</td><td>${escapeHtml(m.abdomen||'')}</td><td>${escapeHtml(m.panturrilha||'')}</td></tr>`).join('') + '</table></div>'; }
function exportBackup(){ saveAll(false); const blob = new Blob([JSON.stringify(state,null,2)], { type:'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'personal-academia-smart-v14-1-backup.json'; a.click(); URL.revokeObjectURL(a.href); toast('Backup exportado.'); }
function importBackup(ev){ const f = ev.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = () => { try{ state = mergeState(state, JSON.parse(r.result)); localStorage.setItem(APP_KEY, JSON.stringify(state)); afterLoad(); toast('Backup importado.'); }catch(e){ toast('Arquivo inválido: ' + e.message, true); } }; r.readAsText(f); ev.target.value = ''; }
function clearLocalData(){ if(!confirm('Apagar dados locais deste navegador?')) return; localStorage.removeItem(APP_KEY); toast('Dados locais apagados.'); setTimeout(() => location.reload(), 600); }

init();
