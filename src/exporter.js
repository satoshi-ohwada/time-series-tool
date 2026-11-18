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
 * @param {object} [groupOptions] - { groupCol, selectedGroup }
 */
export function exportSingleVariableCSV(timestamps, stlResult, varName, analyticsOptions = {}, groupOptions = {}) {
  const { changePoints = [], cusumResult = null } = analyticsOptions;
  const { groupCol = '', selectedGroup = '' } = groupOptions;
  const cpMap = new Map();
  if (changePoints) {
    for (const cp of changePoints) cpMap.set(cp.index, cp.label);
  }

  const hasCusum = cusumResult && cusumResult.anomalyIndices;
  const hasGroup = !!(groupCol && selectedGroup);

  const headerCols = [formatCSVField('日付')];
  if (hasGroup) {
    headerCols.push(formatCSVField(groupCol || '系列'));
  }
  headerCols.push(
    formatCSVField(`${varName}_元データ`),
    formatCSVField(`${varName}_トレンド`),
    formatCSVField(`${varName}_周期変動`),
    formatCSVField(`${varName}_周期調整済`),
    formatCSVField(`${varName}_残差`),
    formatCSVField(`${varName}_トレンド変化点`),
    formatCSVField(`${varName}_CUSUM異常フラグ`)
  );

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

    const rowCols = [formatCSVField(timestamps[i])];
    if (hasGroup) {
      rowCols.push(formatCSVField(selectedGroup));
    }
    rowCols.push(
      observed[i] !== undefined ? observed[i] : '',
      trend[i] !== undefined ? trend[i] : '',
      seasonal[i] !== undefined ? seasonal[i] : '',
      adjusted && adjusted[i] !== undefined ? adjusted[i] : '',
      residual[i] !== undefined ? residual[i] : '',
      formatCSVField(cpLabel),
      cusumFlag
    );
    rows.push(rowCols.join(','));
  }

  const csvContent = '\uFEFF' + rows.join('\r\n');
  const groupPart = hasGroup ? `${sanitizeFilename(selectedGroup)}_` : '';
  triggerDownload(csvContent, `stl_result_${groupPart}${sanitizeFilename(varName)}.csv`);
}

/**
 * Downloads all variables' STL decomposition results as a unified CSV
 * 
 * @param {string[]} timestamps - Fallback timestamps
 * @param {Object<string, object>} allDecompositions - Map of varName to stlResult
 * @param {string[]} [orderedVarNames] - Optional list of variables in desired order
 * @param {object} [groupOptions] - { groupCol, selectedGroup }
 */
export function exportAllVariablesCSV(timestamps, allDecompositions, orderedVarNames = null, groupOptions = {}) {
  const { groupCol = '', selectedGroup = '' } = groupOptions;
  const hasGroup = !!(groupCol && selectedGroup);
  const varNames = (orderedVarNames && orderedVarNames.length > 0)
    ? orderedVarNames.filter(v => allDecompositions[v])
    : Object.keys(allDecompositions);
  if (varNames.length === 0) return;

  // Build a complete unified timeline across ALL variables so no month is dropped
  const unifiedTimeSet = new Set();
  if (timestamps && Array.isArray(timestamps)) {
    timestamps.forEach(t => unifiedTimeSet.add(t));
  }
  varNames.forEach(varName => {
    const res = allDecompositions[varName];
    if (res && res.timestamps && Array.isArray(res.timestamps)) {
      res.timestamps.forEach(t => unifiedTimeSet.add(t));
    }
  });

  const fullTimeline = Array.from(unifiedTimeSet);
  fullTimeline.sort((a, b) => {
    const da = Date.parse(a);
    const db = Date.parse(b);
    if (!isNaN(da) && !isNaN(db)) return da - db;
    return a.localeCompare(b);
  });

  const headerCols = [formatCSVField('日付')];
  if (hasGroup) {
    headerCols.push(formatCSVField(groupCol || '系列'));
  }
  varNames.forEach(varName => {
    headerCols.push(
      formatCSVField(`${varName}_元データ`),
      formatCSVField(`${varName}_トレンド`),
      formatCSVField(`${varName}_周期変動`),
      formatCSVField(`${varName}_周期調整済`),
      formatCSVField(`${varName}_残差`)
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

  for (let i = 0; i < fullTimeline.length; i++) {
    const tStr = fullTimeline[i];
    const rowCols = [formatCSVField(tStr)];
    if (hasGroup) {
      rowCols.push(formatCSVField(selectedGroup));
    }
    varNames.forEach(varName => {
      const res = allDecompositions[varName];
      const idxMap = varIndexMaps.get(varName);
      const idx = idxMap ? idxMap.get(tStr) : undefined;

      if (idx !== undefined && res && res.observed && res.observed[idx] !== undefined) {
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
  const groupPart = hasGroup ? `_${sanitizeFilename(selectedGroup)}` : '';
  triggerDownload(csvContent, `stl_results_all_variables${groupPart}.csv`);
}

function formatCSVField(field) {
  let str = String(field !== undefined && field !== null ? field : '');

  // Guard against CSV Formula Injection (DDE / execution in Excel / Calc)
  // If string starts with =, @, tab, newline, or (+ / - not forming a purely valid number)
  if (typeof field !== 'number') {
    const trimmed = str.trimStart();
    if (trimmed.length > 0) {
      const firstChar = trimmed[0];
      if (
        firstChar === '=' ||
        firstChar === '@' ||
        firstChar === '\t' ||
        firstChar === '\r' ||
        ((firstChar === '+' || firstChar === '-') && isNaN(Number(trimmed)))
      ) {
        str = "'" + str;
      }
    }
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sanitizeFilename(filename) {
  return String(filename || '').replace(/[/\\?%*:|"<>=\x00-\x1f]/g, '_').replace(/^\.+/, '');
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
