'use strict';

/*
 * ThermoSys - Simulador de enfriamiento de equipos informáticos
 * Modelo: dT/dt = -k(T - Ta)
 * Persistencia: IndexedDB (base local del navegador).
 */

const $ = (selector) => document.querySelector(selector);
const DB_NAME = 'ThermoSysDB';
const DB_VERSION = 1;
const STORE_NAME = 'pruebas';

let db = null;
let latestRun = null;
let temperatureChart = null;
let errorChart = null;

const form = $('#simulationForm');
const saveButton = $('#saveButton');
const validationMessage = $('#validationMessage');
const toastElement = $('#appToast');
const toast = window.bootstrap ? new bootstrap.Toast(toastElement, { delay: 3500 }) : null;

function showToast(message) {
  $('#toastMessage').textContent = message;
  if (toast) toast.show();
  else alert(message);
}

function numberFrom(id) {
  return Number($(id).value);
}

function readParameters() {
  return {
    t0: numberFrom('#t0'),
    ta: numberFrom('#ta'),
    k: numberFrom('#k'),
    duration: numberFrom('#duration'),
    h: numberFrom('#step'),
    target: numberFrom('#target'),
    name: $('#testName').value.trim()
  };
}

function validateParameters(p) {
  const checks = [
    [Number.isFinite(p.t0) && p.t0 >= -50 && p.t0 <= 200, 'La temperatura inicial debe estar entre -50 y 200 °C.'],
    [Number.isFinite(p.ta) && p.ta >= -50 && p.ta <= 60, 'La temperatura ambiente debe estar entre -50 y 60 °C.'],
    [p.t0 >= p.ta, 'La temperatura inicial T₀ debe ser mayor o igual que la temperatura ambiente Tₐ.'],
    [Number.isFinite(p.k) && p.k > 0 && p.k <= 2, 'La constante k debe ser positiva y no superar 2 min⁻¹.'],
    [Number.isFinite(p.duration) && p.duration > 0 && p.duration <= 10000, 'La duración debe ser mayor que cero y no superar 10 000 minutos.'],
    [Number.isFinite(p.h) && p.h > 0 && p.h <= 1000, 'El tamaño de paso h debe ser positivo y no superar 1 000 minutos.'],
    [p.h <= p.duration, 'El tamaño de paso h no puede ser mayor que la duración de la simulación.'],
    [Number.isFinite(p.target) && p.target >= p.ta && p.target <= p.t0, 'La temperatura objetivo debe estar entre Tₐ y T₀.'],
    [Math.ceil(p.duration / (p.h / 2)) <= 20000, 'El número de pasos es demasiado grande. Aumenta h o reduce la duración.']
  ];
  const failed = checks.find(([valid]) => !valid);
  return failed ? failed[1] : '';
}

function f(_t, temperature, p) {
  return -p.k * (temperature - p.ta);
}

function exactSolution(t, p) {
  return p.ta + (p.t0 - p.ta) * Math.exp(-p.k * t);
}

function buildTimes(duration, h) {
  const times = [0];
  let t = 0;
  const tolerance = 1e-10;
  while (t < duration - tolerance) {
    const step = Math.min(h, duration - t);
    t = Math.min(duration, t + step);
    times.push(t);
  }
  return times;
}

function solveHeun(p, h) {
  const times = buildTimes(p.duration, h);
  const values = [p.t0];
  for (let i = 0; i < times.length - 1; i++) {
    const t = times[i];
    const step = times[i + 1] - t;
    const y = values[i];
    const k1 = f(t, y, p);
    const predictor = y + step * k1;
    const k2 = f(t + step, predictor, p);
    values.push(y + (step / 2) * (k1 + k2));
  }
  return { times, values };
}

function solveRK4(p, h) {
  const times = buildTimes(p.duration, h);
  const values = [p.t0];
  for (let i = 0; i < times.length - 1; i++) {
    const t = times[i];
    const step = times[i + 1] - t;
    const y = values[i];
    const k1 = f(t, y, p);
    const k2 = f(t + step / 2, y + step * k1 / 2, p);
    const k3 = f(t + step / 2, y + step * k2 / 2, p);
    const k4 = f(t + step, y + step * k3, p);
    values.push(y + (step / 6) * (k1 + 2 * k2 + 2 * k3 + k4));
  }
  return { times, values };
}

function errorValues(exact, approximation) {
  const absolute = Math.abs(exact - approximation);
  const relative = Math.abs(exact) > 1e-12 ? (absolute / Math.abs(exact)) * 100 : null;
  return { absolute, relative };
}

function makeRun(p, h) {
  const heun = solveHeun(p, h);
  const rk4 = solveRK4(p, h);
  const rows = heun.times.map((t, i) => {
    const exact = exactSolution(t, p);
    const heunError = errorValues(exact, heun.values[i]);
    const rk4Error = errorValues(exact, rk4.values[i]);
    return {
      n: i, t, exact, heun: heun.values[i], rk4: rk4.values[i],
      heunAbs: heunError.absolute, rk4Abs: rk4Error.absolute,
      heunRel: heunError.relative, rk4Rel: rk4Error.relative
    };
  });
  return { h, times: heun.times, heun, rk4, rows };
}

function findTargetTime(p) {
  if (p.target === p.t0) return 0;
  if (p.target === p.ta) return Infinity;
  const ratio = (p.target - p.ta) / (p.t0 - p.ta);
  return -Math.log(ratio) / p.k;
}

function format(value, digits = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'No definido';
  if (!Number.isFinite(value)) return 'No se alcanza';
  return Number(value).toLocaleString('es-BO', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function renderSummary(p, runH, runHalf) {
  const finalExact = exactSolution(p.duration, p);
  const heunErrH = runH.rows.at(-1).heunAbs;
  const rk4ErrH = runH.rows.at(-1).rk4Abs;
  const best = rk4ErrH <= heunErrH ? 'RK4' : 'Heun';
  const targetTime = findTargetTime(p);
  const targetText = Number.isFinite(targetTime)
    ? (targetTime <= p.duration ? `${format(targetTime, 3)} minutos (dentro del intervalo)` : `${format(targetTime, 3)} minutos (después del intervalo)`)
    : 'No se alcanza en tiempo finito si el objetivo es exactamente la temperatura ambiente.';
  $('#summaryCards').innerHTML = `
    <div class="col-sm-6 col-xl-3"><div class="metric-card"><span>Temperatura inicial</span><strong>${format(p.t0, 2)} °C</strong><small>En t = 0</small></div></div>
    <div class="col-sm-6 col-xl-3"><div class="metric-card"><span>Temperatura final exacta</span><strong>${format(finalExact, 3)} °C</strong><small>En ${format(p.duration, 2)} min</small></div></div>
    <div class="col-sm-6 col-xl-3"><div class="metric-card"><span>Tiempo hasta objetivo</span><strong>${format(targetTime, 2)}</strong><small>minutos teóricos</small></div></div>
    <div class="col-sm-6 col-xl-3"><div class="metric-card"><span>Menor error final (h)</span><strong>${best}</strong><small>${format(Math.min(heunErrH, rk4ErrH), 8)} °C</small></div></div>`;
  $('#targetResult').textContent = `Tiempo teórico para alcanzar ${format(p.target, 2)} °C: ${targetText}`;
  $('#resultStatus').textContent = `Ensayo: ${p.name || 'Sin nombre'} · Duración: ${format(p.duration, 2)} min · Paso principal h = ${format(p.h, 4)} min y paso secundario h/2 = ${format(p.h / 2, 4)} min.`;
}

function renderInterpretation(p, runH, runHalf) {
  const final = runH.rows.at(-1);
  const half = runHalf.rows.at(-1);
  const hBest = final.rk4Abs <= final.heunAbs ? 'RK4' : 'Heun';
  const halfBest = half.rk4Abs <= half.heunAbs ? 'RK4' : 'Heun';
  const heunImproved = half.heunAbs <= final.heunAbs;
  const rkImproved = half.rk4Abs <= final.rk4Abs;
  const lines = [
    `La temperatura desciende desde ${format(p.t0, 2)} °C y se aproxima a la temperatura ambiente de ${format(p.ta, 2)} °C. Al finalizar ${format(p.duration, 2)} minutos, la solución analítica obtiene ${format(final.exact, 4)} °C.`,
    `Con el paso h = ${format(p.h, 4)}, el menor error absoluto final corresponde a ${hBest}. Al reducir el paso a h/2, el menor error corresponde a ${halfBest}.`,
    `Al comparar h con h/2, el error de Heun ${heunImproved ? 'disminuye o se mantiene' : 'no disminuye en este ensayo'} y el de RK4 ${rkImproved ? 'disminuye o se mantiene' : 'no disminuye en este ensayo'}.`,
    `La temperatura objetivo es ${format(p.target, 2)} °C. El tiempo teórico se calcula a partir de la solución analítica; debe interpretarse dentro de los supuestos del modelo.`
  ];
  $('#interpretation').innerHTML = lines.map(x => `<p class="mb-2">${escapeHtml(x)}</p>`).join('');
}

function renderIterationTable(run) {
  $('#iterationTable').innerHTML = run.rows.map(r => `
    <tr>
      <td>${r.n}</td><td>${format(r.t, 4)}</td><td>${format(r.exact, 6)}</td>
      <td>${format(r.heun, 6)}</td><td>${format(r.rk4, 6)}</td>
      <td>${format(r.heunAbs, 8)}</td><td>${format(r.rk4Abs, 8)}</td>
    </tr>`).join('');
}

function renderStepComparison(p, runH, runHalf) {
  const records = [
    { label: 'h', method: 'Heun', value: runH.rows.at(-1).heun, exact: runH.rows.at(-1).exact },
    { label: 'h', method: 'RK4', value: runH.rows.at(-1).rk4, exact: runH.rows.at(-1).exact },
    { label: 'h/2', method: 'Heun', value: runHalf.rows.at(-1).heun, exact: runHalf.rows.at(-1).exact },
    { label: 'h/2', method: 'RK4', value: runHalf.rows.at(-1).rk4, exact: runHalf.rows.at(-1).exact }
  ];
  $('#stepComparison').innerHTML = records.map(r => {
    const e = errorValues(r.exact, r.value);
    return `<tr><td>${r.label} (${format(r.label === 'h' ? p.h : p.h / 2, 4)} min)</td><td><strong>${r.method}</strong></td><td>${format(r.value, 8)}</td><td>${format(e.absolute, 10)}</td><td>${e.relative === null ? 'No definido' : format(e.relative, 8) + ' %'}</td></tr>`;
  }).join('');
}

function destroyCharts() {
  if (temperatureChart) temperatureChart.destroy();
  if (errorChart) errorChart.destroy();
}

function renderCharts(p, runH, runHalf) {
  if (typeof Chart === 'undefined') {
    showToast('No se pudo cargar Chart.js. Verifica tu conexión a Internet.');
    return;
  }
  destroyCharts();
  const exactData = runH.rows.map(r => ({ x: r.t, y: r.exact }));
  const heunData = runH.rows.map(r => ({ x: r.t, y: r.heun }));
  const rkData = runH.rows.map(r => ({ x: r.t, y: r.rk4 }));
  temperatureChart = new Chart($('#temperatureChart'), {
    type: 'line',
    data: { datasets: [
      { label: 'Solución analítica', data: exactData, borderColor: '#172b4d', backgroundColor: '#172b4d', borderWidth: 3, pointRadius: 0, tension: .12 },
      { label: 'Heun (h)', data: heunData, borderColor: '#2864dc', backgroundColor: '#2864dc', borderWidth: 2, pointRadius: 2, tension: 0 },
      { label: 'RK4 (h)', data: rkData, borderColor: '#16a6a0', backgroundColor: '#16a6a0', borderWidth: 2, pointRadius: 2, tension: 0 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 18 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${format(c.parsed.y, 5)} °C` } } },
      scales: { x: { type: 'linear', title: { display: true, text: 'Tiempo (min)' }, ticks: { maxTicksLimit: 10 } }, y: { title: { display: true, text: 'Temperatura (°C)' } } }
    }
  });
  const endH = runH.rows.at(-1), endHalf = runHalf.rows.at(-1);
  errorChart = new Chart($('#errorChart'), {
    type: 'bar',
    data: {
      labels: ['Heun (h)', 'RK4 (h)', 'Heun (h/2)', 'RK4 (h/2)'],
      datasets: [{ label: 'Error absoluto final (°C)', data: [endH.heunAbs, endH.rk4Abs, endHalf.heunAbs, endHalf.rk4Abs], backgroundColor: ['#7ea5ef', '#55c6bd', '#7ea5ef', '#55c6bd'], borderRadius: 7 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `Error: ${format(c.parsed.y, 10)} °C` } } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Error absoluto (°C)' } } } }
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function runSimulation(parameters = null, notify = true) {
  const p = parameters || readParameters();
  const error = validateParameters(p);
  if (error) {
    validationMessage.textContent = error;
    validationMessage.classList.remove('d-none');
    return false;
  }
  validationMessage.classList.add('d-none');
  const runH = makeRun(p, p.h);
  const runHalf = makeRun(p, p.h / 2);
  latestRun = { parameters: { ...p }, runH, runHalf, createdAt: new Date().toISOString() };
  renderSummary(p, runH, runHalf);
  renderInterpretation(p, runH, runHalf);
  renderIterationTable(runH);
  renderStepComparison(p, runH, runHalf);
  renderCharts(p, runH, runHalf);
  saveButton.disabled = false;
  $('#downloadCsv').disabled = false;
  if (notify) showToast('Simulación ejecutada correctamente.');
  return true;
}

/* ------------------------- IndexedDB ------------------------- */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Este navegador no admite IndexedDB.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('fecha', 'fecha', { unique: false });
      }
    };
    request.onsuccess = event => resolve(event.target.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la base de datos.'));
  });
}

function databaseTransaction(mode, action) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('La base de datos no está disponible.'));
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let request;
    try { request = action(store); }
    catch (error) { reject(error); return; }
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    }
  });
}

async function saveExperiment() {
  if (!latestRun) return;
  const p = latestRun.parameters;
  const record = {
    nombre: p.name || `Ensayo ${new Date().toLocaleString('es-BO')}`,
    fecha: new Date().toISOString(),
    parametros: { t0: p.t0, ta: p.ta, k: p.k, duration: p.duration, h: p.h, target: p.target },
    resultado: {
      finalExacta: latestRun.runH.rows.at(-1).exact,
      finalHeun: latestRun.runH.rows.at(-1).heun,
      finalRK4: latestRun.runH.rows.at(-1).rk4,
      errorHeun: latestRun.runH.rows.at(-1).heunAbs,
      errorRK4: latestRun.runH.rows.at(-1).rk4Abs
    }
  };
  try {
    await databaseTransaction('readwrite', store => store.add(record));
    await refreshHistory();
    showToast('Ensayo guardado en la base de datos local.');
  } catch (error) {
    showToast(`No se pudo guardar el ensayo: ${error.message}`);
  }
}

async function getAllExperiments() {
  return databaseTransaction('readonly', store => store.getAll());
}

async function refreshHistory() {
  if (!db) return;
  try {
    const records = await getAllExperiments();
    records.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    $('#historyCount').textContent = `${records.length} ${records.length === 1 ? 'registro almacenado' : 'registros almacenados'}`;
    if (!records.length) {
      $('#historyTable').innerHTML = '<tr><td colspan="6" class="empty-row">Todavía no hay ensayos guardados.</td></tr>';
      return;
    }
    $('#historyTable').innerHTML = records.map(record => {
      const p = record.parametros;
      const date = new Date(record.fecha).toLocaleString('es-BO');
      return `<tr>
        <td><strong>${escapeHtml(record.nombre)}</strong><br><small class="text-secondary">ID: ${record.id}</small></td>
        <td>${escapeHtml(date)}</td>
        <td>${format(p.t0, 2)} / ${format(p.ta, 2)}</td>
        <td>${format(p.k, 5)}</td>
        <td>${format(p.duration, 2)} / ${format(p.h, 3)}</td>
        <td class="d-flex gap-1">
          <button class="btn btn-sm btn-outline-primary" data-action="load" data-id="${record.id}" title="Recuperar ensayo"><i class="bi bi-arrow-counterclockwise"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${record.id}" title="Eliminar ensayo"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (error) {
    $('#historyTable').innerHTML = `<tr><td colspan="6" class="empty-row">Error al consultar la base de datos: ${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadExperiment(id) {
  try {
    const record = await databaseTransaction('readonly', store => store.get(Number(id)));
    if (!record) return showToast('No se encontró el ensayo solicitado.');
    const p = record.parametros;
    $('#t0').value = p.t0;
    $('#ta').value = p.ta;
    $('#k').value = p.k;
    $('#duration').value = p.duration;
    $('#step').value = p.h;
    $('#target').value = p.target;
    $('#testName').value = record.nombre;
    runSimulation(readParameters(), false);
    document.querySelector('#simulador').scrollIntoView({ behavior: 'smooth' });
    showToast(`Ensayo "${record.nombre}" recuperado. Puedes modificarlo y volver a ejecutarlo.`);
  } catch (error) {
    showToast(`No se pudo recuperar el ensayo: ${error.message}`);
  }
}

async function deleteExperiment(id) {
  if (!confirm('¿Deseas eliminar este ensayo de la base de datos?')) return;
  try {
    await databaseTransaction('readwrite', store => store.delete(Number(id)));
    await refreshHistory();
    showToast('Ensayo eliminado.');
  } catch (error) {
    showToast(`No se pudo eliminar: ${error.message}`);
  }
}

async function clearDatabase() {
  const records = await getAllExperiments();
  if (!records.length) return showToast('La base de datos ya está vacía.');
  if (!confirm(`Se eliminarán ${records.length} ensayos. Esta acción no se puede deshacer. ¿Continuar?`)) return;
  await databaseTransaction('readwrite', store => store.clear());
  await refreshHistory();
  showToast('Se eliminaron todos los ensayos.');
}

async function exportDatabase() {
  try {
    const records = await getAllExperiments();
    const payload = { database: DB_NAME, exportedAt: new Date().toISOString(), records };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thermosys-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Respaldo JSON generado.');
  } catch (error) {
    showToast(`No se pudo exportar: ${error.message}`);
  }
}

async function importDatabase(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.records)) throw new Error('El archivo no tiene el formato de respaldo ThermoSys.');
    let imported = 0;
    for (const item of parsed.records) {
      if (!item || !item.parametros || !item.fecha || !item.nombre) continue;
      const clean = { nombre: String(item.nombre).slice(0, 100), fecha: item.fecha, parametros: item.parametros, resultado: item.resultado || {} };
      delete clean.id;
      await databaseTransaction('readwrite', store => store.add(clean));
      imported++;
    }
    await refreshHistory();
    showToast(`Importación finalizada: ${imported} ensayo(s) agregado(s).`);
  } catch (error) {
    showToast(`No se pudo importar el archivo: ${error.message}`);
  } finally {
    $('#importDatabase').value = '';
  }
}

function downloadCsv() {
  if (!latestRun) return;
  const header = ['Iteracion', 'Tiempo_min', 'Analitica_C', 'Heun_C', 'RK4_C', 'Error_abs_Heun_C', 'Error_abs_RK4_C', 'Error_rel_Heun_pct', 'Error_rel_RK4_pct'];
  const rows = latestRun.runH.rows.map(r => [r.n, r.t, r.exact, r.heun, r.rk4, r.heunAbs, r.rk4Abs, r.heunRel ?? '', r.rk4Rel ?? '']);
  const csv = [header, ...rows].map(row => row.join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resultados-enfriamiento.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------- Eventos ------------------------- */
form.addEventListener('submit', event => {
  event.preventDefault();
  runSimulation();
});
saveButton.addEventListener('click', saveExperiment);
$('#resetButton').addEventListener('click', () => {
  form.reset();
  $('#t0').value = 75; $('#ta').value = 22; $('#k').value = 0.035;
  $('#duration').value = 120; $('#step').value = 10; $('#target').value = 30;
  validationMessage.classList.add('d-none');
  showToast('Se restauraron los valores de ejemplo. Ejecuta una nueva simulación.');
});
$('#historyTable').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === 'load') loadExperiment(id);
  if (button.dataset.action === 'delete') deleteExperiment(id);
});
$('#clearDatabase').addEventListener('click', () => clearDatabase().catch(e => showToast(e.message)));
$('#exportDatabase').addEventListener('click', exportDatabase);
$('#importDatabase').addEventListener('change', event => {
  const file = event.target.files[0];
  if (file) importDatabase(file);
});
$('#downloadCsv').addEventListener('click', downloadCsv);

async function initialize() {
  try {
    db = await openDatabase();
    $('#dbStatus').classList.remove('error');
    $('#dbStatus').innerHTML = '<span></span> Base de datos lista';
    await refreshHistory();
  } catch (error) {
    $('#dbStatus').classList.add('error');
    $('#dbStatus').innerHTML = '<span></span> No disponible';
    $('#historyTable').innerHTML = `<tr><td colspan="6" class="empty-row">${escapeHtml(error.message)}. Prueba con un navegador moderno y abre la página mediante Live Server.</td></tr>`;
    saveButton.disabled = true;
    showToast('La base local no pudo inicializarse. Revisa el navegador y el origen de la página.');
  }
  runSimulation(readParameters(), false);
}

initialize();
