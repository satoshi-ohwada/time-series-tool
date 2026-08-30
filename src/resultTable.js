/**
 * STL Decomposition Result Table Viewer module
 */
import { exportSingleVariableCSV, exportAllVariablesCSV } from './exporter.js';

/**
 * Render STL decomposition calculation results as an interactive table
 * 
 * @param {string} containerId - Container element ID
 * @param {string[]} timestamps - Array of timestamp strings
 * @param {object} stlResult - { observed, trend, seasonal, residual }
 * @param {string} varName - Selected variable name
 * @param {Object<string, object>} [allDecompositions] - All variables decompositions map
 * @param {object} [analyticsOptions] - { changePoints, cusumResult }
 */
export function renderResultTable(containerId, timestamps, stlResult, varName, allDecompositions = {}, analyticsOptions = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!stlResult || !timestamps || timestamps.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>計算結果がありません。データを読み込んでSTL分解を実行してください。</p></div>';
    return;
  }

  const { observed, trend, seasonal, residual } = stlResult;
  const hasMultipleVars = Object.keys(allDecompositions).length > 1;

  const { changePoints = [], cusumResult = null } = analyticsOptions;

  // Build quick lookup maps for change points and cusum anomalies
  const cpMap = new Map();
  if (changePoints) {
    for (const cp of changePoints) {
      cpMap.set(cp.index, cp);
    }
  }

  const hasCusumAnomalies = cusumResult && cusumResult.anomalyIndices;

  let html = `
    <div class="result-table-toolbar">
      <div class="result-info">
        <span class="result-tag">対象変数: <strong>${escapeHtml(varName)}</strong></span>
        <span class="result-count">全 <strong>${timestamps.length}</strong> 行の計算結果</span>
      </div>
      <div class="result-export-group">
        <button id="downloadResultTableCsvBtn" class="btn btn-sm btn-primary">📥 選択中変数のCSVを出力</button>
        ${hasMultipleVars ? '<button id="downloadAllVarsCsvBtn" class="btn btn-sm btn-outline">📦 全変数をまとめたCSVを出力</button>' : ''}
      </div>
    </div>
    <div class="table-scroll-wrapper">
      <table class="data-table result-data-table">
        <thead>
          <tr>
            <th class="row-num-col">#</th>
            <th>日時 (Time)</th>
            <th>元データ (Observed)</th>
            <th>トレンド (Trend)</th>
            <th>周期変動 (Seasonal)</th>
            <th>残差 (Residual)</th>
            <th>診断 (変化点 / 異常)</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (let i = 0; i < timestamps.length; i++) {
    const obs = observed[i] !== undefined ? observed[i].toLocaleString(undefined, { maximumFractionDigits: 4 }) : '';
    const trd = trend[i] !== undefined ? trend[i].toLocaleString(undefined, { maximumFractionDigits: 4 }) : '';
    const sea = seasonal[i] !== undefined ? seasonal[i].toLocaleString(undefined, { maximumFractionDigits: 4 }) : '';
    const res = residual[i] !== undefined ? residual[i].toLocaleString(undefined, { maximumFractionDigits: 4 }) : '';

    const cp = cpMap.get(i);
    const isCusumAlert = hasCusumAnomalies && cusumResult.anomalyIndices[i];

    let diagHtml = '';
    if (cp) {
      diagHtml += `<span class="badge-diag badge-cp" title="${escapeHtml(cp.description)}">📍 ${escapeHtml(cp.label)}</span> `;
    }
    if (isCusumAlert) {
      diagHtml += `<span class="badge-diag badge-cusum" title="残差がCUSUM管理限界を超過">⚠️ CUSUM異常</span>`;
    }
    if (!diagHtml) {
      diagHtml = '<span class="text-sub">-</span>';
    }

    html += `
      <tr class="${cp ? 'row-has-cp' : ''} ${isCusumAlert ? 'row-has-cusum' : ''}">
        <td class="row-num-col">${i + 1}</td>
        <td><strong>${escapeHtml(timestamps[i])}</strong></td>
        <td class="num-cell val-observed">${obs}</td>
        <td class="num-cell val-trend">${trd}</td>
        <td class="num-cell val-seasonal">${sea}</td>
        <td class="num-cell val-residual">${res}</td>
        <td>${diagHtml}</td>
      </tr>
    `;
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;

  // Add CSV Download Event Listeners
  const downloadBtn = container.querySelector('#downloadResultTableCsvBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      exportSingleVariableCSV(timestamps, stlResult, varName, analyticsOptions);
    });
  }

  const downloadAllBtn = container.querySelector('#downloadAllVarsCsvBtn');
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', () => {
      exportAllVariablesCSV(timestamps, allDecompositions);
    });
  }
}

function escapeHtml(str) {
  return String(str !== undefined && str !== null ? str : '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
