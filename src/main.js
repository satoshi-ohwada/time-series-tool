/**
 * Main application integration logic
 */
import { parsePastedText, parseFileBuffer, decodeCsvBuffer, detectColumns, extractTimeSeries, detectPeriodicity, interpolateMissingSeries } from './parser.js';
import { stlDecompose } from './stl.js';
import { detectTrendChangePoints } from './changePoint.js';
import { calculateResidualCusum } from './cusum.js';
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
  model: 'auto', // 'auto' | 'additive' | 'multiplicative'
  seasonalMode: 'periodic', // 'periodic' | 'flexible'
  viewMode: 'overlay',
  mainMode: 'graph', // 'graph' | 'result' | 'table'
  customTitle: '',
  bgMode: 'dark', // 'dark' | 'white' | 'transparent'
  enableInterpolation: true,
  showChangePoints: true,
  showCusumAlerts: false,
  cpSensitivity: 'medium', // 'low' | 'medium' | 'high'
  cusumSensitivity: 'medium', // 'low' | 'medium' | 'high'
  decompositions: {}, // Map of varName -> { observed, trend, seasonal, residual }
  analytics: {}, // Map of varName -> { changePoints, cusumResult }
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
const cpSensitivitySelect = document.getElementById('cpSensitivitySelect');
const cusumSensitivitySelect = document.getElementById('cusumSensitivitySelect');
const showChangePointsCheck = document.getElementById('showChangePointsCheck');
const showCusumAlertsCheck = document.getElementById('showCusumAlertsCheck');
const bgColorSelect = document.getElementById('bgColorSelect');
const downloadImageBtn = document.getElementById('downloadImageBtn');

const statsCard = document.getElementById('statsCard');

// Event Listeners Setup
function initEventListeners() {
  // Input Method Tabs
  tabFileBtn.addEventListener('click', () => switchInputTab('file'));
  tabPasteBtn.addEventListener('click', () => switchInputTab('paste'));

  // Prevent accidental drop outside dropzone causing browser navigation
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

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

  // Analytics Toggles & Settings
  if (showChangePointsCheck) {
    showChangePointsCheck.addEventListener('change', (e) => {
      state.showChangePoints = e.target.checked;
      updateChartDisplay();
    });
  }

  if (showCusumAlertsCheck) {
    showCusumAlertsCheck.addEventListener('change', (e) => {
      state.showCusumAlerts = e.target.checked;
      updateChartDisplay();
    });
  }

  if (cpSensitivitySelect) {
    cpSensitivitySelect.addEventListener('change', (e) => {
      state.cpSensitivity = e.target.value;
      runAnalyticsForAllVars();
      updateChartDisplay();
      updateResultTableDisplay();
      updateSummaryStats();
    });
  }

  if (cusumSensitivitySelect) {
    cusumSensitivitySelect.addEventListener('change', (e) => {
      state.cusumSensitivity = e.target.value;
      runAnalyticsForAllVars();
      updateChartDisplay();
      updateResultTableDisplay();
      updateSummaryStats();
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
    let rows;
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const arrayBuffer = await file.arrayBuffer();

    if (isCsv) {
      // Decode with automatic UTF-8 / Shift_JIS detection
      const text = decodeCsvBuffer(arrayBuffer);
      rows = parseFileBuffer(text, true);
      // Fallback to text parser if SheetJS returned empty
      if (!rows || rows.length === 0) {
        rows = parsePastedText(text);
      }
    } else {
      rows = parseFileBuffer(arrayBuffer, false);
    }
    processParsedRows(rows);
  } catch (err) {
    console.error('File parsing error:', err);
    alert(`ファイルの読み込みに失敗しました: ${err.message}`);
  } finally {
    // Reset file input so that selecting the same file again triggers change event
    if (fileInput) fileInput.value = '';
  }
}

function handlePasteData() {
  try {
    const text = pasteTextarea.value;
    const rows = parsePastedText(text);
    processParsedRows(rows);
  } catch (err) {
    alert(`直接入力データの解析に失敗しました: ${err.message}`);
  }
}

function loadDemoData() {
  // Classic Time Series Dataset: UK Seatbelts (Driver and Passenger Casualties)
  // Monthly totals of car drivers and passengers killed or seriously injured in Great Britain (Jan 1969 - Dec 1984 full dataset)
  // A standard dataset often used for multivariate time series analysis.
  
  const seatbeltsData = [
    {"年月":"1969/01","運転手":1687,"前部座席":867,"後部座席":269},{"年月":"1969/02","運転手":1508,"前部座席":825,"後部座席":265},{"年月":"1969/03","運転手":1507,"前部座席":806,"後部座席":319},{"年月":"1969/04","運転手":1385,"前部座席":814,"後部座席":407},{"年月":"1969/05","運転手":1632,"前部座席":991,"後部座席":454},{"年月":"1969/06","運転手":1511,"前部座席":945,"後部座席":427},{"年月":"1969/07","運転手":1559,"前部座席":1004,"後部座席":522},{"年月":"1969/08","運転手":1630,"前部座席":1091,"後部座席":536},{"年月":"1969/09","運転手":1579,"前部座席":958,"後部座席":405},{"年月":"1969/10","運転手":1653,"前部座席":850,"後部座席":437},{"年月":"1969/11","運転手":2152,"前部座席":1109,"後部座席":434},{"年月":"1969/12","運転手":2148,"前部座席":1113,"後部座席":437},
    {"年月":"1970/01","運転手":1752,"前部座席":925,"後部座席":316},{"年月":"1970/02","運転手":1765,"前部座席":903,"後部座席":311},{"年月":"1970/03","運転手":1717,"前部座席":1006,"後部座席":351},{"年月":"1970/04","運転手":1558,"前部座席":892,"後部座席":362},{"年月":"1970/05","運転手":1575,"前部座席":990,"後部座席":486},{"年月":"1970/06","運転手":1520,"前部座席":866,"後部座席":429},{"年月":"1970/07","運転手":1805,"前部座席":1095,"後部座席":551},{"年月":"1970/08","運転手":1800,"前部座席":1204,"後部座席":646},{"年月":"1970/09","運転手":1719,"前部座席":1029,"後部座席":456},{"年月":"1970/10","運転手":2008,"前部座席":1147,"後部座席":475},{"年月":"1970/11","運転手":2242,"前部座席":1171,"後部座席":456},{"年月":"1970/12","運転手":2478,"前部座席":1299,"後部座席":468},
    {"年月":"1971/01","運転手":2030,"前部座席":944,"後部座席":356},{"年月":"1971/02","運転手":1655,"前部座席":874,"後部座席":271},{"年月":"1971/03","運転手":1693,"前部座席":840,"後部座席":354},{"年月":"1971/04","運転手":1623,"前部座席":893,"後部座席":427},{"年月":"1971/05","運転手":1805,"前部座席":1007,"後部座席":465},{"年月":"1971/06","運転手":1746,"前部座席":973,"後部座席":440},{"年月":"1971/07","運転手":1795,"前部座席":1097,"後部座席":539},{"年月":"1971/08","運転手":1926,"前部座席":1194,"後部座席":646},{"年月":"1971/09","運転手":1619,"前部座席":988,"後部座席":457},{"年月":"1971/10","運転手":1992,"前部座席":1077,"後部座席":446},{"年月":"1971/11","運転手":2233,"前部座席":1045,"後部座席":402},{"年月":"1971/12","運転手":2192,"前部座席":1115,"後部座席":441},
    {"年月":"1972/01","運転手":2080,"前部座席":1005,"後部座席":359},{"年月":"1972/02","運転手":1768,"前部座席":857,"後部座席":334},{"年月":"1972/03","運転手":1835,"前部座席":879,"後部座席":312},{"年月":"1972/04","運転手":1569,"前部座席":887,"後部座席":427},{"年月":"1972/05","運転手":1976,"前部座席":1075,"後部座席":434},{"年月":"1972/06","運転手":1853,"前部座席":1121,"後部座席":486},{"年月":"1972/07","運転手":1965,"前部座席":1190,"後部座席":569},{"年月":"1972/08","運転手":1689,"前部座席":1058,"後部座席":523},{"年月":"1972/09","運転手":1778,"前部座席":939,"後部座席":418},{"年月":"1972/10","運転手":1976,"前部座席":1074,"後部座席":452},{"年月":"1972/11","運転手":2397,"前部座席":1089,"後部座席":462},{"年月":"1972/12","運転手":2654,"前部座席":1208,"後部座席":497},
    {"年月":"1973/01","運転手":2107,"前部座席":988,"後部座席":411},{"年月":"1973/02","運転手":1623,"前部座席":768,"後部座席":316},{"年月":"1973/03","運転手":1824,"前部座席":855,"後部座席":368},{"年月":"1973/04","運転手":1649,"前部座席":810,"後部座席":406},{"年月":"1973/05","運転手":1833,"前部座席":888,"後部座席":438},{"年月":"1973/06","運転手":1842,"前部座席":954,"後部座席":465},{"年月":"1973/07","運転手":1947,"前部座席":1094,"後部座席":583},{"年月":"1973/08","運転手":1928,"前部座席":1041,"後部座席":637},{"年月":"1973/09","運転手":1827,"前部座席":925,"後部座席":469},{"年月":"1973/10","運転手":2045,"前部座席":1066,"後部座席":468},{"年月":"1973/11","運転手":2381,"前部座席":1164,"後部座席":517},{"年月":"1973/12","運転手":2402,"前部座席":1107,"後部座席":426},
    {"年月":"1974/01","運転手":1758,"前部座席":816,"後部座席":260},{"年月":"1974/02","運転手":1416,"前部座席":674,"後部座席":219},{"年月":"1974/03","運転手":1463,"前部座席":691,"後部座席":251},{"年月":"1974/04","運転手":1555,"前部座席":739,"後部座席":320},{"年月":"1974/05","運転手":1698,"前部座席":860,"後部座席":369},{"年月":"1974/06","運転手":1598,"前部座席":829,"後部座席":365},{"年月":"1974/07","運転手":1792,"前部座席":944,"後部座席":448},{"年月":"1974/08","運転手":1861,"前部座席":1070,"後部座席":566},{"年月":"1974/09","運転手":1622,"前部座席":841,"後部座席":354},{"年月":"1974/10","運転手":1864,"前部座席":962,"後部座席":391},{"年月":"1974/11","運転手":2170,"前部座席":1044,"後部座席":432},{"年月":"1974/12","運転手":2236,"前部座席":969,"後部座席":358},
    {"年月":"1975/01","運転手":1715,"前部座席":810,"後部座席":266},{"年月":"1975/02","運転手":1475,"前部座席":714,"後部座席":236},{"年月":"1975/03","運転手":1689,"前部座席":751,"後部座席":295},{"年月":"1975/04","運転手":1438,"前部座席":697,"後部座席":349},{"年月":"1975/05","運転手":1637,"前部座席":834,"後部座席":343},{"年月":"1975/06","運転手":1550,"前部座席":833,"後部座席":381},{"年月":"1975/07","運転手":1636,"前部座席":878,"後部座席":463},{"年月":"1975/08","運転手":1616,"前部座席":1011,"後部座席":594},{"年月":"1975/09","運転手":1454,"前部座席":734,"後部座席":326},{"年月":"1975/10","運転手":1839,"前部座席":892,"後部座席":384},{"年月":"1975/11","運転手":1987,"前部座席":992,"後部座席":392},{"年月":"1975/12","運転手":2169,"前部座席":985,"後部座席":387},
    {"年月":"1976/01","運転手":1748,"前部座席":829,"後部座席":247},{"年月":"1976/02","運転手":1491,"前部座席":671,"後部座席":264},{"年月":"1976/03","運転手":1353,"前部座席":694,"後部座席":242},{"年月":"1976/04","運転手":1503,"前部座席":711,"後部座席":376},{"年月":"1976/05","運転手":1503,"前部座席":765,"後部座席":314},{"年月":"1976/06","運転手":1524,"前部座席":777,"後部座席":395},{"年月":"1976/07","運転手":1780,"前部座席":925,"後部座席":497},{"年月":"1976/08","運転手":1680,"前部座席":962,"後部座席":571},{"年月":"1976/09","運転手":1534,"前部座席":798,"後部座席":326},{"年月":"1976/10","運転手":1807,"前部座席":856,"後部座席":331},{"年月":"1976/11","運転手":1975,"前部座席":969,"後部座席":413},{"年月":"1976/12","運転手":2056,"前部座席":923,"後部座席":375},
    {"年月":"1977/01","運転手":1607,"前部座席":741,"後部座席":260},{"年月":"1977/02","運転手":1470,"前部座席":652,"後部座席":226},{"年月":"1977/03","運転手":1475,"前部座席":677,"後部座席":260},{"年月":"1977/04","運転手":1454,"前部座席":658,"後部座席":373},{"年月":"1977/05","運転手":1495,"前部座席":743,"後部座席":335},{"年月":"1977/06","運転手":1440,"前部座席":689,"後部座席":322},{"年月":"1977/07","運転手":1553,"前部座席":810,"後部座席":441},{"年月":"1977/08","運転手":1538,"前部座席":860,"後部座席":495},{"年月":"1977/09","運転手":1472,"前部座席":739,"後部座席":329},{"年月":"1977/10","運転手":1758,"前部座席":813,"後部座席":324},{"年月":"1977/11","運転手":1861,"前部座席":906,"後部座席":349},{"年月":"1977/12","運転手":1934,"前部座席":909,"後部座席":323},
    {"年月":"1978/01","運転手":1602,"前部座席":746,"後部座席":266},{"年月":"1978/02","運転手":1353,"前部座席":594,"後部座席":242},{"年月":"1978/03","運転手":1458,"前部座席":714,"後部座席":287},{"年月":"1978/04","運転手":1425,"前部座席":679,"後部座席":293},{"年月":"1978/05","運転手":1551,"前部座席":798,"後部座席":371},{"年月":"1978/06","運転手":1492,"前部座席":710,"後部座席":367},{"年月":"1978/07","運転手":1598,"前部座席":817,"後部座席":456},{"年月":"1978/08","運転手":1608,"前部座席":936,"後部座席":546},{"年月":"1978/09","運転手":1592,"前部座席":768,"後部座席":350},{"年月":"1978/10","運転手":1943,"前部座席":913,"後部座席":378},{"年月":"1978/11","運転手":2174,"前部座席":1070,"後部座席":406},{"年月":"1978/12","運転手":1987,"前部座席":951,"後部座席":426},
    {"年月":"1979/01","運転手":1537,"前部座席":740,"後部座席":247},{"年月":"1979/02","運転手":1227,"前部座席":582,"後部座席":216},{"年月":"1979/03","運転手":1438,"前部座席":674,"後部座席":287},{"年月":"1979/04","運転手":1423,"前部座席":702,"後部座席":360},{"年月":"1979/05","運転手":1545,"前部座席":802,"後部座席":349},{"年月":"1979/06","運転手":1554,"前部座席":773,"後部座席":388},{"年月":"1979/07","運転手":1524,"前部座席":834,"後部座席":463},{"年月":"1979/08","運転手":1517,"前部座席":841,"後部座席":500},{"年月":"1979/09","運転手":1440,"前部座席":728,"後部座席":360},{"年月":"1979/10","運転手":1861,"前部座席":839,"後部座席":395},{"年月":"1979/11","運転手":1827,"前部座席":925,"後部座席":413},{"年月":"1979/12","運転手":1839,"前部座席":860,"後部座席":376},
    {"年月":"1980/01","運転手":1463,"前部座席":689,"後部座席":260},{"年月":"1980/02","運転手":1353,"前部座席":621,"後部座席":251},{"年月":"1980/03","運転手":1385,"前部座席":636,"後部座席":297},{"年月":"1980/04","運転手":1347,"前部座席":636,"後部座席":324},{"年月":"1980/05","運転手":1517,"前部座席":722,"後部座席":325},{"年月":"1980/06","運転手":1416,"前部座席":738,"後部座席":345},{"年月":"1980/07","運転手":1454,"前部座席":750,"後部座席":397},{"年月":"1980/08","運転手":1503,"前部座席":841,"後部座席":499},{"年月":"1980/09","運転手":1382,"前部座席":674,"後部座席":343},{"年月":"1980/10","運転手":1653,"前部座席":807,"後部座席":343},{"年月":"1980/11","運転手":1818,"前部座席":859,"後部座席":369},{"年月":"1980/12","運転手":1732,"前部座席":816,"後部座席":331},
    {"年月":"1981/01","運転手":1480,"前部座席":702,"後部座席":271},{"年月":"1981/02","運転手":1313,"前部座席":587,"後部座席":236},{"年月":"1981/03","運転手":1266,"前部座席":619,"後部座席":251},{"年月":"1981/04","運転手":1326,"前部座席":649,"後部座席":338},{"年月":"1981/05","運転手":1454,"前部座席":724,"後部座席":344},{"年月":"1981/06","運転手":1347,"前部座席":701,"後部座席":331},{"年月":"1981/07","運転手":1483,"前部座席":798,"後部座席":422},{"年月":"1981/08","運転手":1472,"前部座席":859,"後部座席":471},{"年月":"1981/09","運転手":1406,"前部座席":714,"後部座席":304},{"年月":"1981/10","運転手":1598,"前部座席":816,"後部座席":313},{"年月":"1981/11","運転手":1818,"前部座席":883,"後部座席":344},{"年月":"1981/12","運転手":1616,"前部座席":750,"後部座席":295},
    {"年月":"1982/01","運転手":1438,"前部座席":652,"後部座席":266},{"年月":"1982/02","運転手":1335,"前部座席":610,"後部座席":242},{"年月":"1982/03","運転手":1425,"前部座席":674,"後部座席":251},{"年月":"1982/04","運転手":1369,"前部座席":635,"後部座席":344},{"年月":"1982/05","運転手":1555,"前部座席":724,"後部座席":376},{"年月":"1982/06","運転手":1472,"前部座席":702,"後部座席":395},{"年月":"1982/07","運転手":1581,"前部座席":829,"後部座席":463},{"年月":"1982/08","運転手":1475,"前部座席":860,"後部座席":529},{"年月":"1982/09","運転手":1454,"前部座席":741,"後部座席":369},{"年月":"1982/10","運転手":1748,"前部座席":850,"後部座席":381},{"年月":"1982/11","運転手":1987,"前部座席":954,"後部座席":454},{"年月":"1982/12","運転手":1934,"前部座席":913,"後部座席":406},
    {"年月":"1983/01","運転手":1057,"前部座席":500,"後部座席":264},{"年月":"1983/02","運転手":973,"前部座席":452,"後部座席":203},{"年月":"1983/03","運転手":1029,"前部座席":471,"後部座席":219},{"年月":"1983/04","運転手":1041,"前部座席":486,"後部座席":271},{"年月":"1983/05","運転手":1159,"前部座席":565,"後部座席":343},{"年月":"1983/06","運転手":1189,"前部座席":522,"後部座席":320},{"年月":"1983/07","運転手":1153,"前部座席":563,"後部座席":376},{"年月":"1983/08","運転手":1197,"前部座席":621,"後部座席":448},{"年月":"1983/09","運転手":1164,"前部座席":507,"後部座席":354},{"年月":"1983/10","運転手":1227,"前部座席":536,"後部座席":349},{"年月":"1983/11","運転手":1440,"前部座席":652,"後部座席":369},{"年月":"1983/12","運転手":1353,"前部座席":587,"後部座席":343},
    {"年月":"1984/01","運転手":1154,"前部座席":522,"後部座席":260},{"年月":"1984/02","運転手":1036,"前部座席":452,"後部座席":226},{"年月":"1984/03","運転手":1095,"前部座席":486,"後部座席":251},{"年月":"1984/04","運転手":1207,"前部座席":511,"後部座席":314},{"年月":"1984/05","運転手":1164,"前部座席":500,"後部座席":325},{"年月":"1984/06","運転手":1197,"前部座席":511,"後部座席":381},{"年月":"1984/07","運転手":1227,"前部座席":536,"後部座席":376},{"年月":"1984/08","運転手":1266,"前部座席":649,"後部座席":441},{"年月":"1984/09","運転手":1159,"前部座席":536,"後部座席":335},{"年月":"1984/10","運転手":1313,"前部座席":536,"後部座席":331},{"年月":"1984/11","運転手":1347,"前部座席":619,"後部座席":338},{"年月":"1984/12","運転手":1470,"前部座席":636,"後部座席":373}
  ];

  processParsedRows(seatbeltsData);
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
  state.analytics = {};

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
      const result = getBestStlDecompose(interpV, {
        period: state.period,
        modelMode: state.model,
        seasonalWindow: state.seasonalMode === 'periodic' ? 'periodic' : 7
      });
      state.decompositions[varName] = result;
      runAnalyticsForVar(varName);
    }
  });

  updateChartDisplay();
  updateResultTableDisplay();
  updateSummaryStats();
}

function runAnalyticsForVar(varName) {
  const res = state.decompositions[varName];
  if (!res || !state.timestamps.length) return;

  const changePoints = detectTrendChangePoints(state.timestamps, res.trend, {
    period: state.period,
    sensitivity: state.cpSensitivity
  });

  const isMultiplicative = res._autoDetected === 'multiplicative' || state.model === 'multiplicative';
  const cusumResult = calculateResidualCusum(state.timestamps, res.residual, {
    sensitivity: state.cusumSensitivity,
    multiplicative: isMultiplicative
  });

  state.analytics[varName] = {
    changePoints,
    cusumResult
  };
}

function runAnalyticsForAllVars() {
  Object.keys(state.decompositions).forEach(varName => {
    runAnalyticsForVar(varName);
  });
}

function getBestStlDecompose(values, options) {
  if (options.modelMode !== 'auto') {
    return stlDecompose(values, {
      period: options.period,
      multiplicative: options.modelMode === 'multiplicative',
      seasonalWindow: options.seasonalWindow
    });
  }

  // Try Additive
  const resAdd = stlDecompose(values, {
    period: options.period,
    multiplicative: false,
    seasonalWindow: options.seasonalWindow
  });
  
  // Try Multiplicative
  const resMul = stlDecompose(values, {
    period: options.period,
    multiplicative: true,
    seasonalWindow: options.seasonalWindow
  });

  // Calculate Mean Absolute Error (MAE) for both models to pick the best fit
  let maeAdd = 0, maeMul = 0;
  const n = values.length;
  for (let i = 0; i < n; i++) {
    const fittedAdd = resAdd.trend[i] + resAdd.seasonal[i];
    maeAdd += Math.abs(values[i] - fittedAdd);

    const fittedMul = resMul.trend[i] * resMul.seasonal[i];
    maeMul += Math.abs(values[i] - fittedMul);
  }
  maeAdd /= n;
  maeMul /= n;

  if (maeMul < maeAdd) {
    resMul._autoDetected = 'multiplicative';
    return resMul;
  } else {
    resAdd._autoDetected = 'additive';
    return resAdd;
  }
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

  const result = getBestStlDecompose(values, {
    period: state.period,
    modelMode: state.model,
    seasonalWindow: state.seasonalMode === 'periodic' ? 'periodic' : 7
  });

  state.decompositions[state.selectedVar] = result;
  runAnalyticsForVar(state.selectedVar);

  updateChartDisplay();
  updateResultTableDisplay();
  updateSummaryStats();
}

function updateChartDisplay() {
  const currentResult = state.decompositions[state.selectedVar];
  if (!currentResult || !state.timestamps.length) return;

  const currentAnalytics = state.analytics[state.selectedVar] || { changePoints: [], cusumResult: null };

  renderChart(
    'chartContainer',
    state.timestamps,
    currentResult,
    state.viewMode,
    state.selectedVar,
    state.customTitle,
    state.bgMode,
    {
      showChangePoints: state.showChangePoints,
      showCusumAlerts: state.showCusumAlerts,
      changePoints: currentAnalytics.changePoints || [],
      cusumResult: currentAnalytics.cusumResult || null
    }
  );
}

function updateResultTableDisplay() {
  const res = state.decompositions[state.selectedVar];
  const currentAnalytics = state.analytics[state.selectedVar] || {};
  renderResultTable(
    'resultTableContainer',
    state.timestamps,
    res,
    state.selectedVar,
    state.decompositions,
    currentAnalytics
  );
}

function updateSummaryStats() {
  const res = state.decompositions[state.selectedVar];
  if (!res) return;

  const count = res.observed.length;
  
  // 元データの統計量
  const obsSorted = [...res.observed].sort((a, b) => a - b);
  const obsMin = obsSorted[0];
  const obsMax = obsSorted[count - 1];
  const mean = (res.observed.reduce((a, b) => a + b, 0) / count).toFixed(1);
  const median = count % 2 === 0 
    ? ((obsSorted[count/2 - 1] + obsSorted[count/2]) / 2).toFixed(1)
    : obsSorted[Math.floor(count/2)].toFixed(1);

  // STL成分の統計量
  const trendMax = Math.max(...res.trend);
  const trendMin = Math.min(...res.trend);
  const trendRange = trendMax - trendMin;

  const seasonalMax = Math.max(...res.seasonal);
  const seasonalMin = Math.min(...res.seasonal);
  const seasonalRange = seasonalMax - seasonalMin;

  const resMean = res.residual.reduce((a, b) => a + b, 0) / count;
  const resVariance = res.residual.reduce((a, b) => a + Math.pow(b - resMean, 2), 0) / (count > 1 ? count - 1 : 1);
  const resSD = Math.sqrt(resVariance);

  // DOM更新 (元データ)
  document.getElementById('statCount').textContent = `${count} 件`;
  document.getElementById('statMean').textContent = Number(mean).toLocaleString();
  document.getElementById('statMedian').textContent = Number(median).toLocaleString();
  document.getElementById('statMax').textContent = Number(obsMax.toFixed(1)).toLocaleString();
  document.getElementById('statMin').textContent = Number(obsMin.toFixed(1)).toLocaleString();

  // DOM更新 (STL成分)
  document.getElementById('statTrendRange').textContent = Number(trendRange.toFixed(1)).toLocaleString();
  document.getElementById('statSeasonalRange').textContent = Number(seasonalRange.toFixed(1)).toLocaleString();
  document.getElementById('statResidualSD').textContent = Number(resSD.toFixed(2)).toLocaleString();

  // 分析コメントの生成
  const totalVar = trendRange + seasonalRange + (resSD * 4);
  const trendRatio = trendRange / totalVar;
  const seasonalRatio = seasonalRange / totalVar;

  let comment = `<strong>【分析のヒント】</strong><br><br>`;
  
  if (state.model === 'auto' && res._autoDetected) {
    const modelName = res._autoDetected === 'multiplicative' ? '乗法モデル' : '加法モデル';
    comment += `<strong>▪ 自動判定モデル: ${modelName}</strong><br>加法モデルと乗法モデルの両方を計算し、より残差が小さく綺麗に分解できた <strong>${modelName}</strong> を自動選択しました。<br><br>`;
  }

  // トレンドの解説
  const trendDiff = res.trend[count - 1] - res.trend[0];
  const trendDir = trendDiff > 0 ? '上昇' : '下降';
  comment += `<strong>▪ トレンド（長期的な傾向）</strong><br>期間全体を通じて概ね <strong>${Math.abs(trendDiff).toFixed(1)} ${trendDir}</strong> しており、期間内の最大変動幅は ${trendRange.toFixed(1)} です。<br><br>`;

  // 周期変動の解説
  comment += `<strong>▪ 周期変動（季節性）</strong><br>設定した周期に従い、最大で <strong>${seasonalRange.toFixed(1)}</strong> の幅でデータが規則的に上下に振れています。<br><br>`;

  // 影響度の比較と総合評価
  if (trendRatio > seasonalRatio * 1.5) {
    comment += `<strong>▪ 総合評価</strong><br>周期的な振れ幅よりも長期トレンドの変動幅の方が大きく、全体としては<strong>「トレンド（${trendDir}傾向）の影響」をより強く受けている</strong>データと言えます。<br><br>`;
  } else if (seasonalRatio > trendRatio * 1.5) {
    comment += `<strong>▪ 総合評価</strong><br>長期的なトレンドの変化よりも周期的な振れ幅の方が大きく、全体としては<strong>「強い周期変動（季節性）の影響」をより強く受けている</strong>データと言えます。<br><br>`;
  } else {
    comment += `<strong>▪ 総合評価</strong><br>トレンドの変動幅と周期変動の振れ幅が同程度であり、<strong>「長期的な傾向」と「周期的な波」の双方が同程度の影響を与え合って</strong>構成されています。<br><br>`;
  }

  // 残差の評価
  const obsRange = obsMax - obsMin;
  if ((resSD * 4) / obsRange > 0.4) {
    comment += `<strong>▪ 残差の評価:</strong> 残差（不規則変動）のばらつきが比較的大きいため、異常値やノイズなど突発的な要因の影響も強く含まれています。<br>`;
  } else {
    comment += `<strong>▪ 残差の評価:</strong> 残差（不規則変動）は比較的小さく、データの大半はトレンドと周期性の2つで綺麗に説明できています。<br>`;
  }

  // 変化点とCUSUMの診断サマリ
  const currentAnalytics = state.analytics[state.selectedVar];
  if (currentAnalytics) {
    // トレンド変化点サマリ
    if (currentAnalytics.changePoints && currentAnalytics.changePoints.length > 0) {
      comment += `<br><strong>▪ トレンドの主な変化点 (${currentAnalytics.changePoints.length}箇所検出)</strong><br>`;
      currentAnalytics.changePoints.forEach(cp => {
        comment += `・<strong>${cp.timestamp}</strong>: 📍 ${cp.label}（${cp.description}）<br>`;
      });
    }

    // CUSUM診断サマリ
    if (currentAnalytics.cusumResult) {
      const { cusumResult } = currentAnalytics;
      comment += `<br><strong>▪ 残差のCUSUM診断 (累積和法: 管理限界 ±${cusumResult.h.toFixed(1)})</strong><br>`;
      if (cusumResult.hasAnomaly && cusumResult.anomalies.length > 0) {
        comment += `⚠️ <strong>管理限界超過（持続的なシフト）を検知しました:</strong><br>`;
        cusumResult.anomalies.forEach(anom => {
          comment += `・${anom.description}<br>`;
        });
        comment += `※ 一時的なノイズではなく、一定期間にわたる平均水準の偏り（構造変化や外生要因）を示唆しています。<br>`;
      } else {
        comment += `✅ <strong>安定（管理限界内）:</strong> 残差は特定方向への偏り（ドリフト）がなく、平均0の定常的なランダムノイズとして良好に推移しています。<br>`;
      }
    }
  }

  document.getElementById('analysisComment').innerHTML = comment;
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
