/**
 * CSV Exporter Module with UTF-8 BOM support for Excel
 */

/**
 * Downloads a single variable's STL decomposition result as CSV
 * 
 * @param {string[]} timestamps 
 * @param {object} stlResult - { observed, trend, seasonal, residual }
 * @param {string} varName 
 * @param {object} [analyticsOptions] - { changePoints, cusumResult }
 */
export function exportSingleVariableCSV(timestamps, stlResult, varName, analyticsOptions = {}) {
  const { changePoints = [], cusumResult = null } = analyticsOptions;
  const cpMap = new Map();
  if (changePoints) {
    for (const cp of changePoints) cpMap.set(cp.index, cp.label);
  }

  const hasCusum = cusumResult && cusumResult.anomalyIndices;

  const headerCols = [
    '日付',
    `${varName}_元データ`,
    `${varName}_トレンド`,
    `${varName}_周期変動`,
    `${varName}_周期調整済`,
    `${varName}_残差`,
    `${varName}_トレンド変化点`,
    `${varName}_CUSUM異常フラグ`
  ];

  const rows = [headerCols.join(',')];
  const { observed, trend, seasonal, residual } = stlResult;
  let adjusted = stlResult.adjusted;
  const isMultiplicative = !!(stlResult.isMultiplicative || stlResult._autoDetected === 'multiplicative' ||
    (seasonal && seasonal.length > 0 && Math.abs((seasonal.reduce((a, b) => a + b, 0) / seasonal.length) - 1.0) < 0.3));
  if (!adjusted && observed && seasonal) {
    adjusted = observed.map((obs, i) => (isMultiplicative && seasonal[i] !== 0 ? obs / seasonal[i] : obs - seasonal[i]));
  }

  for (let i = 0; i < timestamps.length; i++) {
    const cpLabel = cpMap.get(i) || '';
    const cusumFlag = hasCusum && cusumResult.anomalyIndices[i] ? '1' : '0';

    const row = [
      formatCSVField(timestamps[i]),
      observed[i] !== undefined ? observed[i] : '',
      trend[i] !== undefined ? trend[i] : '',
      seasonal[i] !== undefined ? seasonal[i] : '',
      adjusted && adjusted[i] !== undefined ? adjusted[i] : '',
      residual[i] !== undefined ? residual[i] : '',
      formatCSVField(cpLabel),
      cusumFlag
    ].join(',');
    rows.push(row);
  }

  const csvContent = '\uFEFF' + rows.join('\r\n');
  triggerDownload(csvContent, `stl_result_${sanitizeFilename(varName)}.csv`);
}

/**
 * Downloads all variables' STL decomposition results as a unified CSV
 * 
 * @param {string[]} timestamps 
 * @param {Object<string, object>} allDecompositions - Map of varName to stlResult
 */
export function exportAllVariablesCSV(timestamps, allDecompositions) {
  const varNames = Object.keys(allDecompositions);
  if (varNames.length === 0) return;

  const headerCols = ['日付'];
  varNames.forEach(varName => {
    headerCols.push(
      `${varName}_元データ`,
      `${varName}_トレンド`,
      `${varName}_周期変動`,
      `${varName}_周期調整済`,
      `${varName}_残差`
    );
  });
  const rows = [headerCols.join(',')];

  // Pre-build index maps for variables with their own timestamps
  const varIndexMaps = new Map();
  varNames.forEach(varName => {
    const res = allDecompositions[varName];
    if (res && res.timestamps && Array.isArray(res.timestamps)) {
      const map = new Map();
      res.timestamps.forEach((t, idx) => map.set(t, idx));
      varIndexMaps.set(varName, map);
    }
  });

  for (let i = 0; i < timestamps.length; i++) {
    const tStr = timestamps[i];
    const rowCols = [formatCSVField(tStr)];
    varNames.forEach(varName => {
      const res = allDecompositions[varName];
      const idxMap = varIndexMaps.get(varName);
      const idx = idxMap ? idxMap.get(tStr) : i;

        const isMul = !!(res.isMultiplicative || res._autoDetected === 'multiplicative');
        const adj = res.adjusted ? res.adjusted[idx] : (res.observed[idx] !== undefined && res.seasonal[idx] !== undefined ? (isMul && res.seasonal[idx] !== 0 ? res.observed[idx] / res.seasonal[idx] : res.observed[idx] - res.seasonal[idx]) : '');
        rowCols.push(
          res.observed[idx] !== undefined ? res.observed[idx] : '',
          res.trend[idx] !== undefined ? res.trend[idx] : '',
          res.seasonal[idx] !== undefined ? res.seasonal[idx] : '',
          adj !== undefined ? adj : '',
          res.residual[idx] !== undefined ? res.residual[idx] : ''
        );
      } else {
        rowCols.push('', '', '', '', '');
      }
    });
    rows.push(rowCols.join(','));
  }

  const csvContent = '\uFEFF' + rows.join('\r\n');
  triggerDownload(csvContent, `stl_results_all_variables.csv`);
}

function formatCSVField(field) {
  const str = String(field !== undefined && field !== null ? field : '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sanitizeFilename(filename) {
  return filename.replace(/[/\\?%*:|"<>]/g, '_');
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
