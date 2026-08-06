/**
 * Main application integration logic
 */
import { parsePastedText, parseFileBuffer, detectColumns, extractTimeSeries, detectPeriodicity, interpolateMissingSeries } from './parser.js';
import { stlDecompose } from './stl.js';
import { renderChart, downloadChartImage } from './chart.js';
import { exportSingleVariableCSV, exportAllVariablesCSV } from './exporter.js';
import { renderTableEditor } from './tableEditor.js';
import { renderResultTable } from './resultTable.js';

const state = {
  rawRows: [],
  timeCol: '',
  valueCols: [],
  selectedVar: '',
  period: 12,
  model: 'additive', // 'additive' | 'multiplicative'
  seasonalMode: 'periodic', // 'periodic' | 'flexible'
  viewMode: 'overlay',
  mainMode: 'graph', // 'graph' | 'result' | 'table'
  customTitle: '',
  bgMode: 'dark', // 'dark' | 'white' | 'transparent'
  enableInterpolation: true,
  decompositions: {}, // Map of varName -> { observed, trend, seasonal, residual }
  timestamps: []
};

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const pasteZone = document.getElementById('pasteZone');
const pasteTextarea = document.getElementById('pasteTextarea');
const applyPasteBtn = document.getElementById('applyPasteBtn');
const tabFileBtn = document.getElementById('tabFileBtn');
const tabPasteBtn = document.getElementById('tabPasteBtn');
const loadDemoBtn = document.getElementById('loadDemoBtn');

const showGraphModeBtn = document.getElementById('showGraphModeBtn');
const showResultModeBtn = document.getElementById('showResultModeBtn');
const showTableModeBtn = document.getElementById('showTableModeBtn');
const graphControlsBar = document.getElementById('graphControlsBar');
const chartWrapper = document.getElementById('chartWrapper');
const resultTableContainer = document.getElementById('resultTableContainer');
const tableEditorContainer = document.getElementById('tableEditorContainer');

const configCard = document.getElementById('configCard');
const customTitleInput = document.getElementById('customTitleInput');
const timeColSelect = document.getElementById('timeColSelect');
const valueColSelect = document.getElementById('valueColSelect');
const periodInput = document.getElementById('periodInput');
const periodPresetSelect = document.getElementById('periodPresetSelect');
const autoDetectPeriodBtn = document.getElementById('autoDetectPeriodBtn');
const periodDetectBadge = document.getElementById('periodDetectBadge');
const autoInterpolateCheck = document.getElementById('autoInterpolateCheck');
const interpolationNotice = document.getElementById('interpolationNotice');
const modelSelect = document.getElementById('modelSelect');
const seasonalModeSelect = document.getElementById('seasonalModeSelect');
const bgColorSelect = document.getElementById('bgColorSelect');
const downloadImageBtn = document.getElementById('downloadImageBtn');

const statsCard = document.getElementById('statsCard');

// Event Listeners Setup
function initEventListeners() {
  // Input Method Tabs
  tabFileBtn.addEventListener('click', () => switchInputTab('file'));
  tabPasteBtn.addEventListener('click', () => switchInputTab('paste'));

  // File Upload & Drag & Drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  // Paste Action
  applyPasteBtn.addEventListener('click', handlePasteData);

  // Demo Data
  loadDemoBtn.addEventListener('click', loadDemoData);

  // Main Mode Switcher (Graph vs Result vs Table)
  showGraphModeBtn.addEventListener('click', () => switchMainMode('graph'));
  showResultModeBtn.addEventListener('click', () => switchMainMode('result'));
  showTableModeBtn.addEventListener('click', () => switchMainMode('table'));

  // Custom Title
  customTitleInput.addEventListener('input', (e) => {
    state.customTitle = e.target.value;
    updateChartDisplay();
  });

  // Background Mode
  bgColorSelect.addEventListener('change', (e) => {
    state.bgMode = e.target.value;
    updateChartDisplay();
  });

  // Download Chart Image (PNG)
  downloadImageBtn.addEventListener('click', () => {
    const filename = state.customTitle.trim() ? `${state.customTitle.trim()}.png` : `stl_${state.selectedVar}_chart.png`;
    downloadChartImage('chartContainer', filename);
  });

  // Column Selectors Change
  timeColSelect.addEventListener('change', (e) => {
    state.timeCol = e.target.value;
    runDecompositionForSelectedVar();
  });
  valueColSelect.addEventListener('change', (e) => {
    state.selectedVar = e.target.value;
    runDecompositionForSelectedVar();
  });

  // Period Settings & Auto Detect
  periodInput.addEventListener('change', (e) => {
    state.period = Math.max(1, parseInt(e.target.value) || 12);
    runDecompositionForSelectedVar();
  });
  periodPresetSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      periodInput.value = e.target.value;
      state.period = parseInt(e.target.value);
      runDecompositionForSelectedVar();
    }
  });

  autoDetectPeriodBtn.addEventListener('click', () => {
    if (!state.selectedVar || !state.rawRows.length) return;
    const { timestamps, values } = extractTimeSeries(state.rawRows, state.timeCol, state.selectedVar);
    const autoPeriod = detectPeriodicity(values, timestamps);
    state.period = autoPeriod;
    periodInput.value = autoPeriod;
    periodDetectBadge.textContent = `✨ 自動判定結果: 推奨周期 = ${autoPeriod}`;
    runDecompositionForSelectedVar();
  });

  autoInterpolateCheck.addEventListener('change', (e) => {
    state.enableInterpolation = e.target.checked;
    runDecompositionForAllVars();
  });
  modelSelect.addEventListener('change', (e) => {
    state.model = e.target.value;
    runDecompositionForSelectedVar();
  });
  if (seasonalModeSelect) {
    seasonalModeSelect.addEventListener('change', (e) => {
      state.seasonalMode = e.target.value;
      runDecompositionForSelectedVar();
    });
  }

  // View Mode Select
  const viewModeSelect = document.getElementById('viewModeSelect');
  if (viewModeSelect) {
    viewModeSelect.addEventListener('change', (e) => {
      state.viewMode = e.target.value;
      updateChartDisplay();
    });
  }
}

function switchInputTab(type) {
  if (type === 'file') {
    tabFileBtn.classList.add('active');
    tabPasteBtn.classList.remove('active');
    dropZone.classList.remove('hidden');
    pasteZone.classList.add('hidden');
  } else {
    tabPasteBtn.classList.add('active');
    tabFileBtn.classList.remove('active');
    pasteZone.classList.remove('hidden');
    dropZone.classList.add('hidden');
  }
}

async function handleFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const rows = parseFileBuffer(arrayBuffer);
    processParsedRows(rows);
  } catch (err) {
    alert(`ファイルの読み込みに失敗しました: ${err.message}`);
  }
}

function handlePasteData() {
  try {
    const text = pasteTextarea.value;
    const rows = parsePastedText(text);
    processParsedRows(rows);
  } catch (err) {
    alert(`コピー＆ペーストデータの解析に失敗しました: ${err.message}`);
  }
}

function loadDemoData() {
  // Generate 48 months (4 years) of realistic monthly sales data with wavy trend and seasonality
  const rows = [];
  const startDate = new Date('2021-01-01');
  const baseSales = 1200;
  // Seasonal factors for 12 months (e.g. Summer & Year-end peak)
  const seasonalFactors = [-150, -120, -30, 40, 90, 180, 260, 210, 60, 20, 160, 350];

  for (let i = 0; i < 48; i++) {
    const dateStr = `${startDate.getFullYear()}/${String(startDate.getMonth() + 1).padStart(2, '0')}/01`;
    
    // Undulating wave trend (smooth rise and fall over 4 years)
    const wavyComponent = 350 * Math.sin((i / 48) * Math.PI * 3.5);
    const trend = Math.round(baseSales + wavyComponent + i * 15);

    const season = seasonalFactors[i % 12];
    const noise = Math.floor((Math.random() - 0.5) * 60);

    const sales = Math.max(100, Math.round(trend + season + noise));
    const customers = Math.max(10, Math.round((sales / 15) + (Math.random() - 0.5) * 12));

    rows.push({
      '年月': dateStr,
      '売上金額(千円)': sales,
      '来店客数(人)': customers
    });

    startDate.setMonth(startDate.getMonth() + 1);
  }

  processParsedRows(rows);
}

function switchMainMode(mode) {
  state.mainMode = mode;

  showGraphModeBtn.classList.remove('active');
  showResultModeBtn.classList.remove('active');
  showTableModeBtn.classList.remove('active');

  graphControlsBar.classList.add('hidden');
  chartWrapper.classList.add('hidden');
  resultTableContainer.classList.add('hidden');
  tableEditorContainer.classList.add('hidden');

  if (mode === 'graph') {
    showGraphModeBtn.classList.add('active');
    graphControlsBar.classList.remove('hidden');
    chartWrapper.classList.remove('hidden');
    updateChartDisplay();
  } else if (mode === 'result') {
    showResultModeBtn.classList.add('active');
    resultTableContainer.classList.remove('hidden');
    updateResultTableDisplay();
  } else if (mode === 'table') {
    showTableModeBtn.classList.add('active');
    tableEditorContainer.classList.remove('hidden');
    updateTableEditorDisplay();
  }
}

function updateResultTableDisplay() {
  const currentResult = state.decompositions[state.selectedVar];
  renderResultTable(
    'resultTableContainer',
    state.timestamps,
    currentResult,
    state.selectedVar,
    state.decompositions
  );
}

function updateTableEditorDisplay() {
  if (state.rawRows && state.rawRows.length > 0) {
    renderTableEditor('tableEditorContainer', state.rawRows, (updatedRows) => {
      state.rawRows = updatedRows;
      const detected = detectColumns(updatedRows);
      state.timeCol = detected.timeCol;
      state.valueCols = detected.valueCols;
      runDecompositionForAllVars();
    });
  }
}

function processParsedRows(rows) {
  if (!rows || rows.length === 0) {
    alert('有効なデータ行が見つかりませんでした。');
    return;
  }

  state.rawRows = rows;
  const detected = detectColumns(rows);
  state.timeCol = detected.timeCol;
  state.valueCols = detected.valueCols;

  if (!state.timeCol || state.valueCols.length === 0) {
    alert('時間軸または数値の変数列を正しく検出できませんでした。');
    return;
  }

  state.selectedVar = state.valueCols[0];

  // Auto detect period
  const firstData = extractTimeSeries(rows, state.timeCol, state.selectedVar);
  const autoPeriod = detectPeriodicity(firstData.values, firstData.timestamps);
  state.period = autoPeriod;
  periodInput.value = autoPeriod;
  periodDetectBadge.textContent = `✨ 自動判定結果: 推奨周期 = ${autoPeriod}`;

  // Populate Select Controls
  populateSelects();

  // Enable Controls
  configCard.classList.remove('disabled');
  statsCard.classList.remove('hidden');

  // Run decomposition for all variables
  runDecompositionForAllVars();
  updateTableEditorDisplay();
}

function populateSelects() {
  const allKeys = Object.keys(state.rawRows[0]);

  timeColSelect.innerHTML = '';
  allKeys.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key;
    if (key === state.timeCol) opt.selected = true;
    timeColSelect.appendChild(opt);
  });

  valueColSelect.innerHTML = '';
  state.valueCols.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key;
    if (key === state.selectedVar) opt.selected = true;
    valueColSelect.appendChild(opt);
  });
}

function runDecompositionForAllVars() {
  state.decompositions = {};

  // Extract raw time-series for target column 1 to interpolate timestamps
  const rawExtract = extractTimeSeries(state.rawRows, state.timeCol, state.valueCols[0]);
  const interpolatedBase = interpolateMissingSeries(rawExtract.timestamps, rawExtract.values, state.enableInterpolation);
  state.timestamps = interpolatedBase.timestamps;

  if (interpolatedBase.interpolatedCount > 0) {
    interpolationNotice.textContent = `※ ${interpolatedBase.interpolatedCount} 件の欠損日時を線形補間しました`;
    interpolationNotice.classList.remove('hidden');
  } else {
    interpolationNotice.classList.add('hidden');
  }

  state.valueCols.forEach(varName => {
    const { timestamps: rawT, values: rawV } = extractTimeSeries(state.rawRows, state.timeCol, varName);
    const { values: interpV } = interpolateMissingSeries(rawT, rawV, state.enableInterpolation);

    if (interpV.length > 0) {
      const result = stlDecompose(interpV, {
        period: state.period,
        multiplicative: state.model === 'multiplicative',
        seasonalWindow: state.seasonalMode === 'periodic' ? 'periodic' : 7
      });
      state.decompositions[varName] = result;
    }
  });

  updateChartDisplay();
  updateResultTableDisplay();
  updateSummaryStats();
}

function runDecompositionForSelectedVar() {
  if (!state.selectedVar || !state.rawRows.length) return;

  const { timestamps: rawT, values: rawV } = extractTimeSeries(state.rawRows, state.timeCol, state.selectedVar);
  const { timestamps, values, interpolatedCount } = interpolateMissingSeries(rawT, rawV, state.enableInterpolation);
  state.timestamps = timestamps;

  if (interpolatedCount > 0) {
    interpolationNotice.textContent = `※ ${interpolatedCount} 件の欠損日時を線形補間しました`;
    interpolationNotice.classList.remove('hidden');
  } else {
    interpolationNotice.classList.add('hidden');
  }

  const result = stlDecompose(values, {
    period: state.period,
    multiplicative: state.model === 'multiplicative',
    seasonalWindow: state.seasonalMode === 'periodic' ? 'periodic' : 7
  });

  state.decompositions[state.selectedVar] = result;

  updateChartDisplay();
  updateResultTableDisplay();
  updateSummaryStats();
}

function updateChartDisplay() {
  const currentResult = state.decompositions[state.selectedVar];
  if (!currentResult || !state.timestamps.length) return;

  renderChart(
    'chartContainer',
    state.timestamps,
    currentResult,
    state.viewMode,
    state.selectedVar,
    state.customTitle,
    state.bgMode
  );
}

function updateSummaryStats() {
  const res = state.decompositions[state.selectedVar];
  if (!res) return;

  const count = res.observed.length;
  const mean = (res.observed.reduce((a, b) => a + b, 0) / count).toFixed(1);

  const trendMax = Math.max(...res.trend);
  const trendMin = Math.min(...res.trend);
  const trendRange = (trendMax - trendMin).toFixed(1);

  const seasonalMax = Math.max(...res.seasonal);
  const seasonalMin = Math.min(...res.seasonal);
  const seasonalRange = (seasonalMax - seasonalMin).toFixed(1);

  const resMean = res.residual.reduce((a, b) => a + b, 0) / count;
  const resVariance = res.residual.reduce((a, b) => a + Math.pow(b - resMean, 2), 0) / count;
  const resSD = Math.sqrt(resVariance).toFixed(2);

  document.getElementById('statCount').textContent = `${count} 件`;
  document.getElementById('statMean').textContent = Number(mean).toLocaleString();
  document.getElementById('statTrendRange').textContent = Number(trendRange).toLocaleString();
  document.getElementById('statSeasonalRange').textContent = Number(seasonalRange).toLocaleString();
  document.getElementById('statResidualSD').textContent = Number(resSD).toLocaleString();
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();

  // Auto resize Plotly chart on window resize
  window.addEventListener('resize', () => {
    const container = document.getElementById('chartContainer');
    if (container && window.Plotly) {
      window.Plotly.Plots.resize(container);
    }
  });
});
