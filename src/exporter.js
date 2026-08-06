/**
 * CSV Exporter Module with UTF-8 BOM support for Excel
 */

/**
 * Downloads a single variable's STL decomposition result as CSV
 * 
 * @param {string[]} timestamps 
 * @param {object} stlResult - { observed, trend, seasonal, residual }
 * @param {string} varName 
 */
export function exportSingleVariableCSV(timestamps, stlResult, varName) {
  const headers = ['日付', `${varName}_元データ`, `${varName}_トレンド`, `${varName}_周期変動`, `${varName}_残差`].join(',');
  const rows = [headers];

  const { observed, trend, seasonal, residual } = stlResult;

  for (let i = 0; i < timestamps.length; i++) {
    const row = [
      formatCSVField(timestamps[i]),
      observed[i] !== undefined ? observed[i] : '',
      trend[i] !== undefined ? trend[i] : '',
      seasonal[i] !== undefined ? seasonal[i] : '',
      residual[i] !== undefined ? residual[i] : ''
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
    headerCols.push(`${varName}_元データ`, `${varName}_トレンド`, `${varName}_周期変動`, `${varName}_残差`);
  });
  const rows = [headerCols.join(',')];

  for (let i = 0; i < timestamps.length; i++) {
    const rowCols = [formatCSVField(timestamps[i])];
    varNames.forEach(varName => {
      const res = allDecompositions[varName];
      rowCols.push(
        res.observed[i] !== undefined ? res.observed[i] : '',
        res.trend[i] !== undefined ? res.trend[i] : '',
        res.seasonal[i] !== undefined ? res.seasonal[i] : '',
        res.residual[i] !== undefined ? res.residual[i] : ''
      );
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
  return filename.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]/g, '_');
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
