/**
 * Data Parsing utilities for Excel, CSV, and Copy-Pasted text
 */

/**
 * Parses raw text from copy-paste (TSV or CSV)
 * @param {string} text 
 * @returns {Array<Object>} Parsed row objects
 */
export function parsePastedText(text) {
  if (!text || !text.trim()) return [];

  const lines = text.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('ヘッダー行と少なくとも1行のデータが必要です。');
  }

  // Detect delimiter (Tab or Comma or Semicolon)
  const firstLine = lines[0];
  let delimiter = '\t';
  if (firstLine.includes('\t')) {
    delimiter = '\t';
  } else if (firstLine.includes(',')) {
    delimiter = ',';
  } else if (firstLine.includes(';')) {
    delimiter = ';';
  }

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((header, colIdx) => {
      let val = values[colIdx] !== undefined ? values[colIdx] : '';
      row[header] = val;
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Automatically decodes ArrayBuffer of CSV into text, supporting UTF-8 and Shift_JIS (CP932)
 * @param {ArrayBuffer} buffer 
 * @returns {string} Decoded text
 */
export function decodeCsvBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  // Check UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }
  // Try UTF-8 with fatal: true to detect invalid sequences
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(bytes);
  } catch (e) {
    // If UTF-8 fails, fallback to Shift_JIS (common in Japanese Excel exports)
    try {
      const sjisDecoder = new TextDecoder('shift-jis');
      return sjisDecoder.decode(bytes);
    } catch (e2) {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

/**
 * Parses Excel or CSV ArrayBuffer/File object using SheetJS
 * @param {ArrayBuffer|string} data 
 * @param {boolean} [isText=false]
 * @returns {Array<Object>} Parsed row objects
 */
export function parseFileBuffer(data, isText = false) {
  const readType = isText ? 'string' : 'array';
  const workbook = XLSX.read(data, { type: readType, cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON row objects
  const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return rawData;
}

/**
 * Inspects rows to detect time column and available numeric columns
 * @param {Array<Object>} rows 
 * @returns {{ timeCol: string, valueCols: string[] }}
 */
export function detectColumns(rows) {
  if (!rows || rows.length === 0) {
    return { timeCol: '', valueCols: [] };
  }

  const sampleRow = rows[0];
  const keys = Object.keys(sampleRow);

  const timeKeywords = ['date', 'time', 'datetime', '日付', '日時', '時間', '年月', '月', '年', 'day', 'timestamp'];
  let timeCol = '';

  // 1. Try keyword matching for time column
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    if (timeKeywords.some(kw => lowerKey.includes(kw))) {
      timeCol = key;
      break;
    }
  }

  // 2. If no time keyword found, find column with date-like values or string values
  if (!timeCol) {
    for (const key of keys) {
      const sampleVal = String(rows[0][key]);
      if (sampleVal instanceof Date || !isNaN(Date.parse(sampleVal))) {
        timeCol = key;
        break;
      }
    }
  }

  // Fallback to first column if still not found
  if (!timeCol && keys.length > 0) {
    timeCol = keys[0];
  }

  // Detect numeric columns
  const valueCols = [];
  for (const key of keys) {
    if (key === timeCol) continue;
    // Check if at least half of the non-empty rows are valid numbers (sample up to 100 non-empty values)
    let validCount = 0;
    let totalCount = 0;
    for (let i = 0; i < rows.length && totalCount < 100; i++) {
      const val = rows[i][key];
      if (val !== '' && val !== null && val !== undefined) {
        totalCount++;
        const cleanedStr = String(val).replace(/,/g, '').trim();
        const num = Number(cleanedStr);
        if (!isNaN(num) && cleanedStr !== '') {
          validCount++;
        }
      }
    }
    if (totalCount > 0 && validCount / totalCount >= 0.5) {
      valueCols.push(key);
    }
  }

  // If no numeric column detected, offer all non-time columns
  if (valueCols.length === 0) {
    keys.filter(k => k !== timeCol).forEach(k => valueCols.push(k));
  }

  return { timeCol, valueCols };
}

/**
 * Detects periodicity (seasonal period) using Autocorrelation Function (ACF)
 * Uses both 1st-differenced and raw series to prevent trend domination from masking periodic peaks.
 * @param {number[]} values 
 * @param {string[]} [timestamps]
 * @returns {number} Estimated period (defaults to 12 if undetermined)
 */
export function detectPeriodicity(values, timestamps = []) {
  const n = values.length;
  if (n < 6) return 12; // Default for very short series

  // Helper to calculate ACF and locate dominant local maxima
  function getAcfPeaks(series) {
    const m = series.length;
    if (m < 6) return [];
    const mean = series.reduce((a, b) => a + b, 0) / m;
    let variance = 0;
    for (let i = 0; i < m; i++) {
      variance += (series[i] - mean) * (series[i] - mean);
    }
    if (variance < 1e-12) return [];

    const maxLag = Math.min(Math.floor(m / 2), 365);
    const acf = new Array(maxLag + 1).fill(0);
    for (let k = 1; k <= maxLag; k++) {
      let num = 0;
      for (let i = 0; i < m - k; i++) {
        num += (series[i] - mean) * (series[i + k] - mean);
      }
      acf[k] = num / variance;
    }

    const peaks = [];
    for (let k = 2; k < maxLag - 1; k++) {
      if (acf[k] > acf[k - 1] && acf[k] > acf[k + 1] && acf[k] > 0.15) {
        peaks.push({ lag: k, corr: acf[k] });
      }
    }
    peaks.sort((a, b) => b.corr - a.corr);
    return peaks;
  }

  // 1. Calculate ACF on differenced series to eliminate linear and polynomial trends
  const diffValues = [];
  for (let i = 1; i < n; i++) {
    diffValues.push(values[i] - values[i - 1]);
  }
  const diffPeaks = getAcfPeaks(diffValues);
  const rawPeaks = getAcfPeaks(values);

  // If differenced series found a strong peak (corr > 0.2), prefer it
  if (diffPeaks.length > 0 && diffPeaks[0].corr > 0.2) {
    return diffPeaks[0].lag;
  }
  if (rawPeaks.length > 0 && rawPeaks[0].corr > 0.2) {
    return rawPeaks[0].lag;
  }
  if (diffPeaks.length > 0) {
    return diffPeaks[0].lag;
  }
  if (rawPeaks.length > 0) {
    return rawPeaks[0].lag;
  }

  // Fallback heuristic based on timestamps if available
  if (timestamps.length >= 2) {
    const p1 = parseDateSafe(timestamps[0]);
    const p2 = parseDateSafe(timestamps[1]);
    if (p1 && p2) {
      const diffMs = Math.abs(p2.date.getTime() - p1.date.getTime());
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays >= 25 && diffDays <= 32) return 12; // Monthly
      if (diffDays >= 6 && diffDays <= 8) return 52;   // Weekly
      if (diffDays >= 0.8 && diffDays <= 1.2) return 7; // Daily (Week seasonality)
      if (diffDays >= 80 && diffDays <= 100) return 4; // Quarterly
    }
  }

  return 12; // Default fallback
}

/**
 * Parses timestamp string into local Date and identifies format structure
 */
function parseDateSafe(t) {
  if (typeof t !== 'string') return null;
  const s = t.trim();
  const mMonth = s.match(/^(\d{4})([\/\-])(\d{1,2})$/);
  if (mMonth) {
    return {
      date: new Date(parseInt(mMonth[1]), parseInt(mMonth[3]) - 1, 1),
      type: 'month',
      sep: mMonth[2]
    };
  }
  const mDay = s.match(/^(\d{4})([\/\-])(\d{1,2})([\/\-])(\d{1,2})/);
  if (mDay) {
    return {
      date: new Date(parseInt(mDay[1]), parseInt(mDay[3]) - 1, parseInt(mDay[5])),
      type: 'day',
      sep: mDay[2]
    };
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return { date: d, type: 'generic', sep: '/' };
  }
  return null;
}

/**
 * Formats a date by applying steps based on detected date format type (preserving original format)
 */
function formatInterpolatedDate(baseParsed, stepIndex, stepMs) {
  const { date, type, sep } = baseParsed;
  if (type === 'month') {
    const newD = new Date(date.getFullYear(), date.getMonth() + stepIndex, 1);
    const y = newD.getFullYear();
    const m = String(newD.getMonth() + 1).padStart(2, '0');
    return `${y}${sep}${m}`;
  } else if (type === 'day') {
    const newD = new Date(date.getFullYear(), date.getMonth(), date.getDate() + stepIndex);
    const y = newD.getFullYear();
    const m = String(newD.getMonth() + 1).padStart(2, '0');
    const d = String(newD.getDate()).padStart(2, '0');
    return `${y}${sep}${m}${sep}${d}`;
  } else {
    const newD = new Date(date.getTime() + stepIndex * stepMs);
    const y = newD.getFullYear();
    const m = String(newD.getMonth() + 1).padStart(2, '0');
    const d = String(newD.getDate()).padStart(2, '0');
    return `${y}${sep}${m}${sep}${d}`;
  }
}

/**
 * Interpolates missing dates and linear values in a time series
 * @param {string[]} timestamps 
 * @param {number[]} values 
 * @param {boolean} [enable=true] 
 * @returns {{ timestamps: string[], values: number[], interpolatedCount: number }}
 */
export function interpolateMissingSeries(timestamps, values, enable = true) {
  if (!enable || timestamps.length < 2) {
    return { timestamps: [...timestamps], values: [...values], interpolatedCount: 0 };
  }

  // Parse dates safely in local time
  const parsedDates = timestamps.map(t => parseDateSafe(t));
  const isValidDate = parsedDates.every(d => d !== null && !isNaN(d.date.getTime()));

  if (!isValidDate) {
    return { timestamps: [...timestamps], values: [...values], interpolatedCount: 0 };
  }

  // Calculate median time difference in milliseconds
  const diffs = [];
  for (let i = 1; i < parsedDates.length; i++) {
    const diff = parsedDates[i].date.getTime() - parsedDates[i - 1].date.getTime();
    if (diff > 0) diffs.push(diff);
  }

  if (diffs.length === 0) {
    return { timestamps: [...timestamps], values: [...values], interpolatedCount: 0 };
  }

  diffs.sort((a, b) => a - b);
  // Pick lower median to ensure minimal step size is used even with small sample sizes
  const medianDiff = diffs[Math.floor((diffs.length - 1) / 2)];

  // Threshold to detect gaps (e.g. > 1.5 * medianDiff)
  const gapThreshold = medianDiff * 1.5;

  const newTimestamps = [];
  const newValues = [];
  let interpolatedCount = 0;

  for (let i = 0; i < timestamps.length - 1; i++) {
    const currentParsed = parsedDates[i];
    const nextParsed = parsedDates[i + 1];
    const val1 = values[i];
    const val2 = values[i + 1];

    newTimestamps.push(timestamps[i]);
    newValues.push(val1);

    const timeGap = nextParsed.date.getTime() - currentParsed.date.getTime();

    if (timeGap > gapThreshold) {
      const steps = Math.round(timeGap / medianDiff);
      const stepMs = timeGap / steps;

      for (let s = 1; s < steps; s++) {
        const dateStr = formatInterpolatedDate(currentParsed, s, stepMs);
        const interpolatedVal = val1 + (val2 - val1) * (s / steps);

        newTimestamps.push(dateStr);
        newValues.push(interpolatedVal);
        interpolatedCount++;
      }
    }
  }

  // Add last element
  newTimestamps.push(timestamps[timestamps.length - 1]);
  newValues.push(values[values.length - 1]);

  return {
    timestamps: newTimestamps,
    values: newValues,
    interpolatedCount
  };
}

/**
 * Extracts and cleans time-series data for a selected target column
 * @param {Array<Object>} rows 
 * @param {string} timeCol 
 * @param {string} valueCol 
 * @returns {{ timestamps: string[], values: number[] }}
 */
export function extractTimeSeries(rows, timeCol, valueCol) {
  const timestamps = [];
  const values = [];

  rows.forEach(row => {
    let rawTime = row[timeCol];
    let timeStr = '';
    if (rawTime instanceof Date) {
      // Use local calendar year/month/date to avoid UTC timezone day-shifting (e.g. in JST)
      const y = rawTime.getFullYear();
      const m = String(rawTime.getMonth() + 1).padStart(2, '0');
      const d = String(rawTime.getDate()).padStart(2, '0');
      const hours = rawTime.getHours();
      const minutes = rawTime.getMinutes();
      if (hours !== 0 || minutes !== 0) {
        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');
        timeStr = `${y}/${m}/${d} ${hh}:${mm}`;
      } else {
        timeStr = `${y}/${m}/${d}`;
      }
    } else if (rawTime !== undefined && rawTime !== null) {
      timeStr = String(rawTime).trim();
    }

    const rawVal = row[valueCol];
    if (rawVal === '' || rawVal === null || rawVal === undefined) return;
    const cleanedStr = String(rawVal).replace(/,/g, '').trim();
    if (cleanedStr === '') return;
    const val = Number(cleanedStr);

    if (timeStr && !isNaN(val)) {
      timestamps.push(timeStr);
      values.push(val);
    }
  });

  return { timestamps, values };
}
