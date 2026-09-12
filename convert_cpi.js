const fs = require('fs');
const path = require('path');
const XLSX = require('./lib/xlsx.full.min.js');

const excelPath = path.resolve(__dirname, 'a00117.xlsx');
const wb = XLSX.read(fs.readFileSync(excelPath), { type: 'buffer' });

// 1. Get series from 目次
const tocSheet = wb.Sheets['目次'];
const tocData = XLSX.utils.sheet_to_json(tocSheet, { header: 1 });

const seriesList = [];
for (let i = 3; i < tocData.length; i++) {
  const row = tocData[i];
  if (row && row[0] && row[1]) {
    seriesList.push({ sheetName: String(row[0]).trim(), name: String(row[1]).trim() });
  }
}
console.log(`Loaded ${seriesList.length} series from TOC.`);

// 2. Determine timeline from '総合'
const sheet0 = wb.Sheets[seriesList[0].sheetName];
const d0 = XLSX.utils.sheet_to_json(sheet0, { header: 1 });
const yearRow = d0[9];

const yearCols = [];
for (let c = 9; c < yearRow.length; c++) {
  const val = yearRow[c];
  if (val && String(val).includes('年')) {
    const y = parseInt(String(val).replace('年', ''), 10);
    yearCols.push({ col: c, year: y });
  }
}

const timePoints = [];
for (const yc of yearCols) {
  for (let m = 1; m <= 12; m++) {
    const rowIdx = 9 + m;
    const cellVal = d0[rowIdx]?.[yc.col];
    if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '' && String(cellVal).trim() !== '-') {
      const monthStr = String(m).padStart(2, '0');
      timePoints.push({
        year: yc.year,
        month: m,
        label: `${yc.year}/${monthStr}`,
        col: yc.col,
        rowIdx: rowIdx
      });
    }
  }
}

console.log(`Timeline: ${timePoints.length} points (${timePoints[0].label} to ${timePoints[timePoints.length - 1].label})`);

// 3. Extract all data
const allSeriesData = new Map();
for (const s of seriesList) {
  const ws = wb.Sheets[s.sheetName];
  if (!ws) continue;
  const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const values = [];
  for (const tp of timePoints) {
    let raw = sheetData[tp.rowIdx]?.[tp.col];
    if (raw !== undefined && raw !== null) {
      const str = String(raw).trim();
      const num = Number(str.replace(/,/g, ''));
      if (!isNaN(num) && str !== '' && str !== '-' && str !== '*') {
        values.push(num);
      } else {
        values.push('');
      }
    } else {
      values.push('');
    }
  }
  allSeriesData.set(s.name, values);
}

// 4. Generate CSV string helper (with BOM for Excel compatibility)
function generateCsv(seriesNames) {
  const header = ['年月', ...seriesNames].map(col => `"${col.replace(/"/g, '""')}"`).join(',');
  const lines = [header];

  for (let t = 0; t < timePoints.length; t++) {
    const row = [timePoints[t].label];
    for (const name of seriesNames) {
      const val = allSeriesData.get(name)?.[t];
      row.push(val !== undefined ? val : '');
    }
    lines.push(row.join(','));
  }

  // UTF-8 with BOM
  return '\uFEFF' + lines.join('\r\n');
}

// 5. Output 1: All 78 series
const allNames = seriesList.map(s => s.name);
const fullCsv = generateCsv(allNames);
fs.writeFileSync(path.resolve(__dirname, 'cpi_aomori_2025base.csv'), fullCsv, 'utf8');
console.log(`Saved cpi_aomori_2025base.csv (${allNames.length} series)`);

// 6. Output 2: Major series (総合, 10大費目, コアCPI, コアコアCPI, エネルギー)
const majorNames = [
  '総合',
  '生鮮食品を除く総合',
  '生鮮食品及びエネルギーを除く総合',
  'エネルギー',
  '食料',
  '住居',
  '光熱・水道',
  '家具・家事用品',
  '被服及び履物',
  '保健医療',
  '交通・通信',
  '教育',
  '教養娯楽',
  '諸雑費'
].filter(name => allSeriesData.has(name));

const majorCsv = generateCsv(majorNames);
fs.writeFileSync(path.resolve(__dirname, 'cpi_aomori_2025base_major.csv'), majorCsv, 'utf8');
console.log(`Saved cpi_aomori_2025base_major.csv (${majorNames.length} series)`);
